import { createLogger } from '../logger'
import type { UpdateConfig } from '../../types/config.schema'
import type { UserType } from '../../types/user.types'
import type {
  UpdateCatalog,
  UpdateDialogCatalog,
  UpdateRelease,
  UpdateStatus
} from '../../types/update.types'
import type { UpdateInstaller } from './update-installer'
import type { UpdateStorageClient } from './update-storage-client'
import { isMissingObjectError } from './update-support'
import {
  compareVersions,
  limitCatalogHistory,
  normalizeReleases,
  resolveAdminDecision,
  resolveUserDecision
} from './update-utils'

const log = createLogger('UpdateCatalogService')

export class UpdateCatalogService {
  constructor(
    private readonly config: UpdateConfig,
    private readonly storageClient: UpdateStorageClient,
    private readonly installer: UpdateInstaller
  ) {}

  public getDialogCatalog(status: UpdateStatus, catalog: UpdateCatalog): UpdateDialogCatalog {
    const currentUserType = status.currentUserType
    if (!status.enabled || !currentUserType || currentUserType === 'Guest') {
      return { mode: 'disabled' }
    }

    if (currentUserType === 'User') {
      return {
        mode: 'user',
        recommendedRelease: status.recommendedRelease
      }
    }

    return {
      mode: 'admin',
      recommendedRelease: status.recommendedRelease,
      channels: limitCatalogHistory(catalog, this.config.maxAdminHistoryPerChannel ?? 10)
    }
  }

  public async loadCatalog(currentUserType: UserType | null): Promise<UpdateCatalog> {
    return {
      stable: await this.fetchChannelIndex('stable'),
      preview: currentUserType === 'Admin' ? await this.fetchChannelIndex('preview') : []
    }
  }

  public async resolveUserStatus(
    status: UpdateStatus,
    catalog: UpdateCatalog
  ): Promise<Partial<UpdateStatus>> {
    const decision = resolveUserDecision({
      currentVersion: status.currentVersion,
      currentChannel: status.currentChannel,
      catalog
    })

    if (!decision.recommendedRelease || !decision.shouldOffer) {
      return {
        phase: 'idle',
        recommendedRelease: undefined,
        latestVersion: undefined,
        latestChannel: undefined,
        downloadedRelease: undefined,
        progress: undefined,
        adminHasAnyRelease: false,
        error: undefined,
        message: undefined
      }
    }

    const recommended = decision.recommendedRelease
    const existing = await this.installer.getValidDownloadedRelease(recommended)

    if (existing) {
      return {
        phase: 'downloaded',
        recommendedRelease: recommended,
        latestVersion: recommended.version,
        latestChannel: recommended.channel,
        progress: 100,
        downloadedRelease: {
          version: existing.version,
          channel: existing.channel,
          localPath: existing.localPath
        },
        adminHasAnyRelease: false,
        error: undefined,
        message:
          status.currentChannel === 'preview'
            ? `稳定版 ${recommended.version} 已准备安装`
            : `发现稳定版 ${recommended.version}`
      }
    }

    return {
      phase: 'available',
      recommendedRelease: recommended,
      latestVersion: recommended.version,
      latestChannel: recommended.channel,
      downloadedRelease: undefined,
      progress: undefined,
      adminHasAnyRelease: false,
      error: undefined,
      message:
        status.currentChannel === 'preview'
          ? `当前为预览版，可切换回稳定版 ${recommended.version}`
          : `发现稳定版 ${recommended.version}`
    }
  }

  public resolveAdminStatus(status: UpdateStatus, catalog: UpdateCatalog): Partial<UpdateStatus> {
    const decision = resolveAdminDecision({
      currentVersion: status.currentVersion,
      currentChannel: status.currentChannel,
      catalog,
      maxHistoryPerChannel: this.config.maxAdminHistoryPerChannel ?? 10
    })

    const hasHigherVersion = [...catalog.stable, ...catalog.preview].some(
      (release) => compareVersions(release.version, status.currentVersion) > 0
    )
    const hasCrossChannelOption = [...catalog.stable, ...catalog.preview].some(
      (release) => release.channel !== status.currentChannel
    )
    const shouldOffer = hasHigherVersion || hasCrossChannelOption

    return {
      phase: shouldOffer ? 'available' : 'idle',
      recommendedRelease: decision.recommendedRelease,
      latestVersion: decision.recommendedRelease?.version,
      latestChannel: decision.recommendedRelease?.channel,
      adminHasAnyRelease: shouldOffer,
      downloadedRelease: undefined,
      progress: undefined,
      error: undefined,
      message: shouldOffer ? '发现可用版本' : undefined
    }
  }

  private async fetchChannelIndex(channel: 'stable' | 'preview'): Promise<UpdateRelease[]> {
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
}
