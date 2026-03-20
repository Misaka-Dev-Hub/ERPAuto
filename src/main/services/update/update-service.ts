import { BrowserWindow, app } from 'electron'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { ConfigManager } from '../config/config-manager'
import { createLogger } from '../logger'
import { IPC_CHANNELS } from '../../../shared/ipc-channels'
import type { UpdateConfig } from '../../types/config.schema'
import type { UserType } from '../../types/user.types'
import type {
  DownloadReleaseRequest,
  DownloadedRelease,
  ReleaseChannel,
  UpdateCatalog,
  UpdateDialogCatalog,
  UpdateRelease,
  UpdateStatus
} from '../../types/update.types'
import {
  compareVersions,
  limitCatalogHistory,
  normalizeReleases,
  resolveAdminDecision,
  resolveUserDecision
} from './update-utils'

const log = createLogger('UpdateService')

function appendPortableLaunchLog(logPath: string, message: string, meta?: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    const timestamp = new Date().toISOString()
    const suffix = meta ? ` ${JSON.stringify(meta)}` : ''
    fs.appendFileSync(logPath, `${timestamp} ${message}${suffix}\n`, 'utf-8')
  } catch {
    // Best-effort debug log only.
  }
}

function getCurrentAppVersion(): string {
  return typeof app.getVersion === 'function' ? app.getVersion() : '0.0.0'
}

function getCurrentChannel(): ReleaseChannel {
  return typeof __APP_CHANNEL__ !== 'undefined' ? __APP_CHANNEL__ : 'stable'
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as {
    name?: string
    Code?: string
    code?: string
    message?: string
  }

  return (
    candidate.name === 'NoSuchKey' ||
    candidate.Code === 'NoSuchKey' ||
    candidate.code === 'NoSuchKey' ||
    candidate.message?.includes('The specified key does not exist') === true
  )
}

function getSupportState(config: UpdateConfig | null): {
  supported: boolean
  reason?: string
} {
  if (process.platform !== 'win32') {
    return { supported: false, reason: '当前仅支持 Windows 自动更新' }
  }

  if (app.isPackaged) {
    return { supported: true }
  }

  if (config?.allowDevMode) {
    return { supported: true, reason: '开发模式调试已启用更新检查' }
  }

  return { supported: false, reason: '开发模式默认禁用自动更新检查' }
}

const DEFAULT_STATUS: UpdateStatus = {
  enabled: false,
  supported: false,
  phase: 'idle',
  currentVersion: getCurrentAppVersion(),
  currentChannel: getCurrentChannel(),
  currentUserType: null
}

class UpdateStorageClient {
  private client: S3Client
  private bucket: string

  constructor(config: UpdateConfig) {
    this.bucket = config.bucket
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey
      },
      forcePathStyle: true
    })
  }

  async readText(key: string): Promise<string> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    )

    const chunks: Buffer[] = []
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks).toString('utf-8')
  }

  async downloadToFile(key: string, destination: string): Promise<void> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    )

    await fs.promises.mkdir(path.dirname(destination), { recursive: true })
    const output = fs.createWriteStream(destination)
    const body = response.Body as NodeJS.ReadableStream

    await new Promise<void>((resolve, reject) => {
      body.on('error', reject)
      output.on('error', reject)
      output.on('finish', resolve)
      body.pipe(output)
    })
  }
}

export class UpdateService {
  private static instance: UpdateService | null = null

  private config: UpdateConfig | null = null
  private storageClient: UpdateStorageClient | null = null
  private status: UpdateStatus = { ...DEFAULT_STATUS }
  private catalog: UpdateCatalog = { stable: [], preview: [] }
  private changelogCache = new Map<string, string>()
  private intervalHandle: NodeJS.Timeout | null = null
  private initialized = false

  public static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService()
    }

    return UpdateService.instance
  }

  public initialize(): void {
    if (this.initialized) {
      return
    }

    this.config = ConfigManager.getInstance().getConfig().update ?? null
    const supportState = getSupportState(this.config)
    const enabled = Boolean(this.config?.enabled && supportState.supported)

    this.status = {
      ...this.status,
      enabled,
      supported: supportState.supported,
      message: supportState.reason
    }

    if (enabled && this.config) {
      this.storageClient = new UpdateStorageClient(this.config)
    }

    log.info('Update service initialized', {
      enabled,
      supported: supportState.supported,
      currentVersion: this.status.currentVersion,
      currentChannel: this.status.currentChannel
    })

    this.initialized = true
  }

  public getStatus(): UpdateStatus {
    return { ...this.status }
  }

  public getCatalog(): UpdateDialogCatalog {
    const currentUserType = this.status.currentUserType
    if (!this.status.enabled || !currentUserType || currentUserType === 'Guest') {
      return { mode: 'disabled' }
    }

    if (currentUserType === 'User') {
      return {
        mode: 'user',
        recommendedRelease: this.status.recommendedRelease
      }
    }

    return {
      mode: 'admin',
      recommendedRelease: this.status.recommendedRelease,
      channels: limitCatalogHistory(
        this.catalog,
        this.config?.maxAdminHistoryPerChannel ?? 10
      )
    }
  }

  public async getChangelog(release: DownloadReleaseRequest): Promise<string> {
    this.ensureInitialized()
    if (!this.status.enabled || !this.storageClient) {
      throw new Error('自动更新不可用')
    }

    const cacheKey = `${release.channel}:${release.version}`
    const cached = this.changelogCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const markdown = await this.storageClient.readText(release.changelogKey)
    this.changelogCache.set(cacheKey, markdown)
    return markdown
  }

  public async setUserContext(userType: UserType | null): Promise<void> {
    this.ensureInitialized()
    this.status.currentUserType = userType

    if (!this.status.enabled || !userType || userType === 'Guest') {
      this.clearPolling()
      this.catalog = { stable: [], preview: [] }
      this.publishStatus({
        phase: 'idle',
        currentUserType: userType,
        recommendedRelease: undefined,
        latestVersion: undefined,
        latestChannel: undefined,
        downloadedRelease: undefined,
        progress: undefined,
        adminHasAnyRelease: false,
        error: undefined,
        message: this.status.supported ? undefined : this.status.message
      })
      return
    }

    await this.checkForUpdates()
    this.startPolling()
  }

  public async checkForUpdates(): Promise<UpdateStatus> {
    this.ensureInitialized()
    if (!this.status.enabled || !this.storageClient || !this.config) {
      return this.getStatus()
    }

    this.publishStatus({
      phase: 'checking',
      error: undefined,
      message: '正在检查更新...'
    })

    try {
      const currentUserType = this.status.currentUserType
      this.catalog = {
        stable: await this.fetchChannelIndex('stable'),
        preview: currentUserType === 'Admin' ? await this.fetchChannelIndex('preview') : []
      }

      if (currentUserType === 'User') {
        await this.processUserCatalog()
      } else if (currentUserType === 'Admin') {
        this.processAdminCatalog()
      } else {
        this.publishStatus({
          phase: 'idle',
          message: undefined,
          error: undefined
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '检查更新失败'
      log.error('Failed to check for updates', { error: message })
      this.publishStatus({
        phase: 'error',
        error: message,
        message: '检查更新失败'
      })
    }

    return this.getStatus()
  }

  public async downloadRelease(request: DownloadReleaseRequest): Promise<UpdateStatus> {
    this.ensureInitialized()
    if (!this.status.enabled || !this.storageClient) {
      throw new Error('自动更新不可用')
    }

    this.publishStatus({
      phase: 'downloading',
      progress: 0,
      latestVersion: request.version,
      latestChannel: request.channel,
      recommendedRelease: request,
      message: `正在下载 ${request.channel} ${request.version}...`,
      error: undefined
    })

    const downloadPath = this.getDownloadPath(request)
    await this.storageClient.downloadToFile(request.artifactKey, downloadPath)
    const hash = await this.calculateSha256(downloadPath)

    if (hash.toLowerCase() !== request.sha256.toLowerCase()) {
      await fs.promises.rm(downloadPath, { force: true })
      throw new Error('更新包校验失败，文件哈希不匹配')
    }

    this.publishStatus({
      phase: 'downloaded',
      progress: 100,
      downloadedRelease: {
        version: request.version,
        channel: request.channel,
        localPath: downloadPath
      },
      latestVersion: request.version,
      latestChannel: request.channel,
      message: `已下载 ${request.channel} ${request.version}`
    })

    return this.getStatus()
  }

  public async installDownloadedRelease(): Promise<void> {
    this.ensureInitialized()

    const downloaded = this.status.downloadedRelease
    if (!this.status.enabled || !downloaded) {
      throw new Error('没有可安装的更新包')
    }

    const updaterSourcePath = this.resolveUpdaterBinaryPath()
    const updaterPath = await this.prepareUpdaterBinary(updaterSourcePath)
    const targetExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
    const logPath = path.join(app.getPath('userData'), 'updates', 'portable-update.log')
    const launchLogPath = path.join(app.getPath('userData'), 'updates', 'portable-launch.log')
    const appArgs = process.argv.slice(1)
    const argsBase64 =
      appArgs.length > 0 ? Buffer.from(appArgs.join('\0'), 'utf-8').toString('base64') : ''

    const spawnArgs = [
      '--targetExe',
      targetExe,
      '--downloadedExe',
      downloaded.localPath,
      '--parentPid',
      String(process.pid),
      '--logPath',
      logPath
    ]

    if (argsBase64) {
      spawnArgs.push('--argsBase64', argsBase64)
    }

    this.publishStatus({
      phase: 'installing',
      latestVersion: downloaded.version,
      latestChannel: downloaded.channel,
      message: `正在安装 ${downloaded.version}...`,
      error: undefined
    })

    appendPortableLaunchLog(launchLogPath, 'Preparing portable updater launch', {
      updaterSourcePath,
      updaterPath,
      targetExe,
      downloadedExe: downloaded.localPath,
      parentPid: process.pid,
      logPath,
      appArgs,
      updaterExists: fs.existsSync(updaterPath),
      spawnArgs
    })

    const child = spawn(updaterPath, spawnArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })

    appendPortableLaunchLog(launchLogPath, 'Spawn returned for portable updater', {
      childPid: child.pid ?? null
    })

    child.on('error', (error) => {
      appendPortableLaunchLog(launchLogPath, 'Portable updater executable spawn error', {
        error: error instanceof Error ? error.message : String(error)
      })
      log.error('Failed to launch portable updater executable', {
        error: error instanceof Error ? error.message : String(error)
      })
    })

    child.once('spawn', () => {
      appendPortableLaunchLog(launchLogPath, 'Portable updater executable spawned', {
        childPid: child.pid ?? null
      })
    })

    child.unref()
    app.quit()
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize()
    }
  }

  private publishStatus(next: Partial<UpdateStatus>): void {
    this.status = {
      ...this.status,
      ...next
    }

    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(IPC_CHANNELS.UPDATE_STATUS_CHANGED, this.status)
    })
  }

  private async fetchChannelIndex(channel: ReleaseChannel): Promise<UpdateRelease[]> {
    if (!this.storageClient || !this.config) {
      return []
    }

    const key = `${this.config.basePrefix}/${channel}/index.json`

    try {
      const raw = await this.storageClient.readText(key)
      const parsed = JSON.parse(raw) as unknown
      return normalizeReleases(parsed, channel)
    } catch (error) {
      if (isMissingObjectError(error)) {
        log.warn('Update channel index not found, treating as empty', { channel, key })
        return []
      }

      throw error
    }
  }

  private async processUserCatalog(): Promise<void> {
    const decision = resolveUserDecision({
      currentVersion: this.status.currentVersion,
      currentChannel: this.status.currentChannel,
      catalog: this.catalog
    })

    if (!decision.recommendedRelease || !decision.shouldOffer) {
      this.publishStatus({
        phase: 'idle',
        recommendedRelease: undefined,
        latestVersion: undefined,
        latestChannel: undefined,
        downloadedRelease: undefined,
        progress: undefined,
        adminHasAnyRelease: false,
        error: undefined,
        message: undefined
      })
      return
    }

    const recommended = decision.recommendedRelease
    this.publishStatus({
      phase: 'available',
      recommendedRelease: recommended,
      latestVersion: recommended.version,
      latestChannel: recommended.channel,
      adminHasAnyRelease: false,
      message:
        this.status.currentChannel === 'preview'
          ? `当前为预览版，可切换回稳定版 ${recommended.version}`
          : `发现稳定版 ${recommended.version}`
    })

    const existing = await this.getValidDownloadedRelease(recommended)
    if (existing) {
      this.publishStatus({
        phase: 'downloaded',
        progress: 100,
        downloadedRelease: {
          version: existing.version,
          channel: existing.channel,
          localPath: existing.localPath
        },
        message:
          this.status.currentChannel === 'preview'
            ? `稳定版 ${recommended.version} 已准备安装`
            : `发现稳定版 ${recommended.version}`
      })
      return
    }

    try {
      await this.downloadRelease(recommended)
    } catch (error) {
      const message = error instanceof Error ? error.message : '下载更新失败'
      this.publishStatus({
        phase: 'error',
        error: message,
        message
      })
    }
  }

  private processAdminCatalog(): void {
    const decision = resolveAdminDecision({
      currentVersion: this.status.currentVersion,
      currentChannel: this.status.currentChannel,
      catalog: this.catalog,
      maxHistoryPerChannel: this.config?.maxAdminHistoryPerChannel ?? 10
    })

    const hasHigherVersion = [...this.catalog.stable, ...this.catalog.preview].some(
      (release) => compareVersions(release.version, this.status.currentVersion) > 0
    )
    const hasCrossChannelOption = [...this.catalog.stable, ...this.catalog.preview].some(
      (release) => release.channel !== this.status.currentChannel
    )
    const shouldOffer = hasHigherVersion || hasCrossChannelOption

    this.publishStatus({
      phase: shouldOffer ? 'available' : 'idle',
      recommendedRelease: decision.recommendedRelease,
      latestVersion: decision.recommendedRelease?.version,
      latestChannel: decision.recommendedRelease?.channel,
      adminHasAnyRelease: shouldOffer,
      downloadedRelease: undefined,
      progress: undefined,
      error: undefined,
      message: shouldOffer ? '发现可用版本' : undefined
    })
  }

  private startPolling(): void {
    this.clearPolling()
    if (!this.config) {
      return
    }

    this.intervalHandle = setInterval(() => {
      this.checkForUpdates().catch((error) => {
        log.warn('Periodic update check failed', {
          error: error instanceof Error ? error.message : String(error)
        })
      })
    }, this.config.checkIntervalMinutes * 60 * 1000)
  }

  private clearPolling(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  private async getValidDownloadedRelease(
    release: UpdateRelease
  ): Promise<DownloadedRelease | null> {
    const downloadPath = this.getDownloadPath(release)
    if (!fs.existsSync(downloadPath)) {
      return null
    }

    const hash = await this.calculateSha256(downloadPath)
    if (hash.toLowerCase() !== release.sha256.toLowerCase()) {
      await fs.promises.rm(downloadPath, { force: true })
      return null
    }

    return {
      ...release,
      localPath: downloadPath
    }
  }

  private getDownloadPath(release: UpdateRelease): string {
    return path.join(app.getPath('userData'), 'pending-update', `${release.channel}-${release.version}.exe`)
  }

  private async calculateSha256(filePath: string): Promise<string> {
    const hash = createHash('sha256')
    const input = fs.createReadStream(filePath)

    await new Promise<void>((resolve, reject) => {
      input.on('data', (chunk) => hash.update(chunk))
      input.on('error', reject)
      input.on('end', resolve)
    })

    return hash.digest('hex')
  }

  private resolveUpdaterBinaryPath(): string {
    const packagedPath = path.join(process.resourcesPath, 'portable-updater.exe')
    const devPath = path.resolve(process.cwd(), 'build', 'bin', 'portable-updater.exe')

    if (fs.existsSync(packagedPath)) {
      return packagedPath
    }

    if (fs.existsSync(devPath)) {
      return devPath
    }

    throw new Error('未找到便携版更新器')
  }

  private async prepareUpdaterBinary(sourcePath: string): Promise<string> {
    const updatesDir = path.join(app.getPath('userData'), 'updates')
    const stagedPath = path.join(updatesDir, 'portable-updater.exe')

    await fs.promises.mkdir(updatesDir, { recursive: true })
    await fs.promises.copyFile(sourcePath, stagedPath)

    return stagedPath
  }
}
