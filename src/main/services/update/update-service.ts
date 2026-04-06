import * as fs from 'fs'
import { ConfigManager } from '../config/config-manager'
import { createLogger } from '../logger'
import { logAuditWithCurrentUser } from '../logger/audit-logger'
import { AuditAction, AuditStatus } from '../../types/audit.types'
import type { UpdateConfig } from '../../types/config.schema'
import type { UserType } from '../../types/user.types'
import type {
  DownloadReleaseRequest,
  UpdateCatalog,
  UpdateDialogCatalog,
  UpdateStatus
} from '../../types/update.types'
import { UpdateCatalogService } from './update-catalog-service'
import { UpdateInstaller } from './update-installer'
import { UpdateStorageClient } from './update-storage-client'
import { publishUpdateStatus } from './update-status-publisher'
import { DEFAULT_STATUS, getSupportState } from './update-support'

const log = createLogger('UpdateService')

export class UpdateService {
  private static instance: UpdateService | null = null

  private config: UpdateConfig | null = null
  private storageClient: UpdateStorageClient | null = null
  private catalogService: UpdateCatalogService | null = null
  private installer = new UpdateInstaller()
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
      this.catalogService = new UpdateCatalogService(
        this.config,
        this.storageClient,
        this.installer
      )
    }

    log.info('Update service initialized', {
      enabled,
      supported: supportState.supported,
      currentVersion: this.status.currentVersion,
      currentChannel: this.status.currentChannel,
      endpoint: this.config?.endpoint,
      bucket: this.config?.bucket,
      checkIntervalMinutes: this.config?.checkIntervalMinutes
    })

    this.initialized = true
  }

  public getStatus(): UpdateStatus {
    return { ...this.status }
  }

  public getCatalog(): UpdateDialogCatalog {
    if (!this.catalogService) {
      return { mode: 'disabled' }
    }

    return this.catalogService.getDialogCatalog(this.status, this.catalog)
  }

  public async getChangelog(release: DownloadReleaseRequest): Promise<string> {
    this.ensureInitialized()
    if (!this.status.enabled || !this.storageClient) {
      log.warn('Changelog request rejected - auto update disabled', {
        version: release.version,
        channel: release.channel
      })
      throw new Error('自动更新不可用')
    }

    const cacheKey = `${release.channel}:${release.version}`
    const cached = this.changelogCache.get(cacheKey)
    if (cached) {
      log.debug('Changelog returned from cache', {
        version: release.version,
        channel: release.channel
      })
      return cached
    }

    log.info('Fetching changelog from storage', {
      version: release.version,
      channel: release.channel,
      changelogKey: release.changelogKey
    })
    const markdown = await this.storageClient.readText(release.changelogKey)
    this.changelogCache.set(cacheKey, markdown)
    log.info('Changelog fetched successfully', {
      version: release.version,
      channel: release.channel,
      cacheSize: this.changelogCache.size
    })
    return markdown
  }

  public async setUserContext(userType: UserType | null): Promise<void> {
    this.ensureInitialized()
    this.status.currentUserType = userType

    if (!this.status.enabled || !userType) {
      log.info('Update service context cleared', {
        userType,
        reason: this.status.enabled ? 'user logged out' : 'auto-update disabled'
      })
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

    log.info('Update service user context set', {
      userType,
      enabled: this.status.enabled,
      currentVersion: this.status.currentVersion
    })

    // 启动异步更新检查，不阻塞登录流程
    void this.checkForUpdates().catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      log.warn('Async update check failed', {
        userType,
        error: message
      })
    })
    this.startPolling()
  }

  public async checkForUpdates(): Promise<UpdateStatus> {
    this.ensureInitialized()
    if (!this.status.enabled || !this.storageClient || !this.catalogService) {
      log.debug('Update check skipped - service not enabled or not initialized', {
        enabled: this.status.enabled,
        hasStorageClient: !!this.storageClient,
        hasCatalogService: !!this.catalogService
      })
      return this.getStatus()
    }

    this.publishStatus({
      phase: 'checking',
      error: undefined,
      message: '正在检查更新...'
    })

    try {
      const currentUserType = this.status.currentUserType
      log.info('Checking for updates', {
        userType: currentUserType,
        currentVersion: this.status.currentVersion,
        currentChannel: this.status.currentChannel
      })

      this.catalog = await this.catalogService.loadCatalog(currentUserType)

      if (currentUserType === 'User') {
        const nextStatus = await this.catalogService.resolveUserStatus(this.status, this.catalog)
        this.publishStatus(nextStatus)

        if (nextStatus.phase === 'available' && nextStatus.recommendedRelease) {
          const release = nextStatus.recommendedRelease
          log.info('Update available for user', {
            version: release.version,
            channel: release.channel
          })
          // 异步下载，不阻塞更新检查流程
          void this.downloadRelease(release).catch((error) => {
            const message = error instanceof Error ? error.message : '下载更新失败'
            log.warn('Async update download failed', {
              version: release.version,
              channel: release.channel,
              error: message
            })
            this.publishStatus({
              phase: 'error',
              error: message,
              message
            })
          })
        }
      } else if (currentUserType === 'Admin') {
        log.info('Update check completed for admin', {
          stableReleases: this.catalog.stable.length,
          previewReleases: this.catalog.preview.length
        })
        this.publishStatus(this.catalogService.resolveAdminStatus(this.status, this.catalog))
      } else {
        this.publishStatus({
          phase: 'idle',
          message: undefined,
          error: undefined
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '检查更新失败'
      log.error('Failed to check for updates', {
        userType: this.status.currentUserType,
        error: message
      })
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
      log.warn('Download request rejected - auto update disabled', {
        version: request.version,
        channel: request.channel
      })
      throw new Error('自动更新不可用')
    }

    log.info('Starting update download', {
      version: request.version,
      channel: request.channel,
      artifactKey: request.artifactKey
    })

    this.publishStatus({
      phase: 'downloading',
      progress: 0,
      latestVersion: request.version,
      latestChannel: request.channel,
      recommendedRelease: request,
      message: `正在下载 ${request.channel} ${request.version}...`,
      error: undefined
    })

    const downloadPath = this.installer.getDownloadPath(request)
    await this.storageClient.downloadToFile(request.artifactKey, downloadPath)
    const hash = await this.installer.calculateSha256(downloadPath)

    if (hash.toLowerCase() !== request.sha256.toLowerCase()) {
      log.error('Update package hash mismatch', {
        version: request.version,
        channel: request.channel,
        expectedHash: request.sha256.substring(0, 16),
        actualHash: hash.substring(0, 16)
      })
      await fs.promises.rm(downloadPath, { force: true })

      // Audit log: APP_UPDATE download hash mismatch
      logAuditWithCurrentUser(AuditAction.APP_UPDATE, 'UPDATE_PACKAGE', AuditStatus.FAILURE, {
        version: request.version,
        channel: request.channel,
        phase: 'download',
        error: 'Hash mismatch',
        expectedHash: request.sha256.substring(0, 16),
        actualHash: hash.substring(0, 16)
      })

      throw new Error('更新包校验失败，文件哈希不匹配')
    }

    log.info('Update download completed and verified', {
      version: request.version,
      channel: request.channel,
      downloadPath
    })

    // Audit log: APP_UPDATE download success
    logAuditWithCurrentUser(AuditAction.APP_UPDATE, 'UPDATE_PACKAGE', AuditStatus.SUCCESS, {
      version: request.version,
      channel: request.channel,
      phase: 'download'
    })

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
      log.warn('Install request rejected - no update package available', {
        enabled: this.status.enabled,
        hasDownloadedRelease: !!downloaded
      })
      throw new Error('没有可安装的更新包')
    }

    log.info('Installing update package', {
      version: downloaded.version,
      channel: downloaded.channel,
      localPath: downloaded.localPath
    })

    this.publishStatus({
      phase: 'installing',
      latestVersion: downloaded.version,
      latestChannel: downloaded.channel,
      message: `正在安装 ${downloaded.version}...`,
      error: undefined
    })

    try {
      await this.installer.installDownloadedRelease(downloaded)
      log.info('Update installation completed', {
        version: downloaded.version,
        channel: downloaded.channel
      })

      // Audit log: APP_UPDATE install success
      logAuditWithCurrentUser(AuditAction.APP_UPDATE, 'UPDATE_PACKAGE', AuditStatus.SUCCESS, {
        version: downloaded.version,
        channel: downloaded.channel,
        phase: 'install'
      })
    } catch (installError) {
      const msg = installError instanceof Error ? installError.message : String(installError)
      logAuditWithCurrentUser(AuditAction.APP_UPDATE, 'UPDATE_PACKAGE', AuditStatus.FAILURE, {
        version: downloaded.version,
        channel: downloaded.channel,
        phase: 'install',
        error: msg
      })
      throw installError
    }
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

    publishUpdateStatus(this.status)
  }
  private startPolling(): void {
    this.clearPolling()
    if (!this.config) {
      log.warn('Polling not started - no update configuration')
      return
    }

    log.info('Update polling started', {
      intervalMinutes: this.config.checkIntervalMinutes,
      endpoint: this.config.endpoint,
      bucket: this.config.bucket
    })

    this.intervalHandle = setInterval(
      () => {
        this.checkForUpdates().catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          log.warn('Periodic update check failed', {
            channel: this.status.currentChannel,
            error: message
          })
        })
      },
      this.config.checkIntervalMinutes * 60 * 1000
    )
  }

  private clearPolling(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }
}
