import { autoUpdater, UpdateInfo, ProgressInfo, CancellationToken } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import { createLogger } from '../logger'
import { ConfigManager } from '../config/config-manager'
import { ChannelManager } from './channel-manager'

const log = createLogger('AutoUpdaterService')

export interface UpdaterStatus {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  progress?: ProgressInfo
  error?: string
  channel: 'stable' | 'beta'
}

export class AutoUpdaterService {
  private static instance: AutoUpdaterService
  private channelManager: ChannelManager
  private currentStatus: UpdaterStatus = { status: 'idle', channel: 'stable' }
  private currentUsername: string | null = null
  private currentUserType: string | null = null
  private cancellationToken?: CancellationToken

  private constructor() {
    this.channelManager = ChannelManager.getInstance()
    this.setupAutoUpdater()
  }

  public static getInstance(): AutoUpdaterService {
    if (!AutoUpdaterService.instance) {
      AutoUpdaterService.instance = new AutoUpdaterService()
    }
    return AutoUpdaterService.instance
  }

  private get mainWindow(): BrowserWindow | null {
    const windows = BrowserWindow.getAllWindows()
    return windows.length > 0 ? windows[0] : null
  }

  private broadcastEvent(channel: string, payload?: any): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(channel, payload)
    }
  }

  private setupAutoUpdater(): void {
    autoUpdater.autoDownload = false // Manage download manually based on config
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...')
      this.currentStatus.status = 'checking'
      this.broadcastEvent('update:checking', { channel: this.currentStatus.channel })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      log.info('Update available:', info.version)
      this.currentStatus.status = 'available'
      this.currentStatus.version = info.version
      this.broadcastEvent('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        channel: this.currentStatus.channel
      })

      // Auto download if configured
      const config = ConfigManager.getInstance().getConfig().updater
      if (config?.autoDownload) {
        log.info('Auto download is enabled. Starting download...')
        this.downloadUpdate()
      }
    })

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      log.info('Update not available. Current version is latest.', { version: info.version })
      this.currentStatus.status = 'idle'
      this.broadcastEvent('update:not-available', {
        message: `Currently on the latest version (${app.getVersion()}).`
      })
    })

    autoUpdater.on('error', (err) => {
      log.error('AutoUpdater Error:', { error: err.message || err.toString() })
      this.currentStatus.status = 'error'
      this.currentStatus.error = err.message || err.toString()
      this.broadcastEvent('update:error', { error: this.currentStatus.error })
    })

    autoUpdater.on('download-progress', (progressObj: ProgressInfo) => {
      this.currentStatus.status = 'downloading'
      this.currentStatus.progress = progressObj
      this.broadcastEvent('update:download-progress', progressObj)
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      log.info('Update downloaded:', info.version)
      this.currentStatus.status = 'downloaded'
      this.broadcastEvent('update:downloaded', { version: info.version })
    })
  }

  private configureFeedURL(channel: 'stable' | 'beta'): void {
    const config = ConfigManager.getInstance().getConfig().updater
    if (!config?.S3 || !config.enabled) {
      log.warn('Updater config is disabled or S3 config is missing')
      return
    }

    const s3Config = config.S3
    const channelConfig = config.channels[channel]

    if (!channelConfig || !channelConfig.enabled) {
      log.warn(`Channel ${channel} is disabled or not found in config.`)
      return
    }

    // configure S3 provider for electron-updater
    const providerOptions = {
      provider: 's3',
      endpoint: s3Config.endpoint,
      bucket: s3Config.bucket,
      region: s3Config.region,
      path: channelConfig.path,
      channel: channel
    }

    // Note: In a real S3 integration, electron-updater will need AWS credentials
    // typically read from process.env or provided here. For MinIO we may just use URL.
    if (s3Config.accessKey && s3Config.secretKey) {
      process.env.AWS_ACCESS_KEY_ID = s3Config.accessKey
      process.env.AWS_SECRET_ACCESS_KEY = s3Config.secretKey
    }

    autoUpdater.setFeedURL(providerOptions as any)
    autoUpdater.channel = channel
    this.currentStatus.channel = channel
    log.info(`Updater feed URL configured for channel: ${channel}`)
  }

  public setUserContext(username: string, userType: string): void {
    this.currentUsername = username
    this.currentUserType = userType

    const config = ConfigManager.getInstance().getConfig().updater
    if (!config) return

    // Load user preference
    const defaultChannelForAdmin = config.defaultChannelForAdmin as 'stable' | 'beta'
    const defaultChannel = userType === 'Admin' ? defaultChannelForAdmin : 'stable'

    const preference = this.channelManager.getUserChannelPreference(username, defaultChannel)

    // Validate access
    const targetChannel = this.channelManager.canAccessChannel(userType, preference.channel)
      ? preference.channel
      : 'stable'

    this.configureFeedURL(targetChannel)

    if (config.checkOnStartup) {
      // Delay check slightly so UI has time to attach listeners
      setTimeout(() => this.checkForUpdates(), 3000)
    }
  }

  public async checkForUpdates(): Promise<void> {
    const config = ConfigManager.getInstance().getConfig().updater
    if (!config || !config.enabled) {
      log.warn('Updater is disabled in config')
      return
    }

    try {
      log.info('Manually checking for updates...')
      await autoUpdater.checkForUpdates()
    } catch (error: any) {
      log.error('Failed to check for updates', { error: error.message })
      this.currentStatus.status = 'error'
      this.currentStatus.error = error.message
      this.broadcastEvent('update:error', { error: error.message })
      throw error
    }
  }

  public async downloadUpdate(): Promise<void> {
    if (this.currentStatus.status !== 'available') {
      log.warn('Cannot download update because status is not "available"', {
        status: this.currentStatus.status
      })
      return
    }

    try {
      log.info('Starting manual download...')
      this.cancellationToken = new CancellationToken()
      // For minio/s3, if autoDownload was false, we must call downloadUpdate
      await autoUpdater.downloadUpdate(this.cancellationToken)
    } catch (error: any) {
      log.error('Failed to start download', { error: error.message })
      this.currentStatus.status = 'error'
      this.currentStatus.error = error.message
      this.broadcastEvent('update:error', { error: error.message })
      throw error
    }
  }

  public cancelDownload(): void {
    if (this.cancellationToken) {
      log.info('Download cancelled by user using CancellationToken')
      this.cancellationToken.cancel()
      this.cancellationToken = undefined
    } else {
      log.info('Download cancelled by user (simulated, no token)')
    }

    this.currentStatus.status = 'idle'
    this.currentStatus.progress = undefined
    this.broadcastEvent('update:not-available', { message: 'Download cancelled' }) // Resets UI state safely
  }

  public installUpdate(): void {
    if (this.currentStatus.status === 'downloaded') {
      log.info('Quitting and installing update...')
      autoUpdater.quitAndInstall(true, true)
    } else {
      log.warn('Cannot install update. Status is not "downloaded".', {
        status: this.currentStatus.status
      })
    }
  }

  public getStatus(): UpdaterStatus {
    return this.currentStatus
  }

  public getChannelInfo() {
    if (!this.currentUserType) return { channel: 'stable', available: ['stable'] }
    return {
      channel: this.currentStatus.channel,
      available: this.channelManager.getAvailableChannels(this.currentUserType)
    }
  }

  public async switchChannel(channel: 'stable' | 'beta'): Promise<void> {
    if (!this.currentUsername || !this.currentUserType) {
      throw new Error('User context not set')
    }

    if (!this.channelManager.canAccessChannel(this.currentUserType, channel)) {
      throw new Error(`User does not have access to channel: ${channel}`)
    }

    log.info(`Switching channel to ${channel}`)
    this.channelManager.setUserChannelPreference(this.currentUsername, channel)
    this.configureFeedURL(channel)
    this.broadcastEvent('update:channel-changed', { channel })

    // Automatically check for updates on the new channel
    await this.checkForUpdates()
  }
}
