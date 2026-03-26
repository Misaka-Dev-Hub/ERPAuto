import { describe, expect, it, vi } from 'vitest'
import { UpdateCatalogService } from '../../src/main/services/update/update-catalog-service'
import type { UpdateConfig } from '../../src/main/types/config.schema'
import type { UpdateCatalog, UpdateRelease, UpdateStatus } from '../../src/main/types/update.types'

const config: UpdateConfig = {
  enabled: true,
  allowDevMode: false,
  endpoint: 'http://localhost:9000',
  accessKey: 'key',
  secretKey: 'secret',
  bucket: 'bucket',
  region: 'us-east-1',
  basePrefix: 'updates/win-portable',
  checkIntervalMinutes: 30,
  maxAdminHistoryPerChannel: 2
}

function createRelease(
  version: string,
  channel: 'stable' | 'preview',
  overrides: Partial<UpdateRelease> = {}
): UpdateRelease {
  return {
    version,
    channel,
    artifactKey: `${channel}/${version}.exe`,
    sha256: `${channel}-${version}-sha`,
    size: 1,
    publishedAt: '2026-03-21T10:00:00Z',
    changelogKey: `${channel}/${version}.md`,
    ...overrides
  }
}

function createStatus(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    enabled: true,
    supported: true,
    phase: 'idle',
    currentVersion: '1.0.0',
    currentChannel: 'stable',
    currentUserType: 'User',
    ...overrides
  }
}

describe('UpdateCatalogService', () => {
  it('returns disabled dialog catalog when updates are unavailable', () => {
    const storageClient = { readText: vi.fn() }
    const installer = { getValidDownloadedRelease: vi.fn() }
    const service = new UpdateCatalogService(config, storageClient as never, installer as never)

    const result = service.getDialogCatalog(
      createStatus({ enabled: false, currentUserType: null }),
      { stable: [], preview: [] }
    )

    expect(result).toEqual({ mode: 'disabled' })
  })

  it('loads stable and preview catalogs for admin users', async () => {
    const storageClient = {
      readText: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ releases: [createRelease('1.1.0', 'stable')] }))
        .mockResolvedValueOnce(JSON.stringify({ releases: [createRelease('1.2.0', 'preview')] }))
    }
    const installer = { getValidDownloadedRelease: vi.fn() }
    const service = new UpdateCatalogService(config, storageClient as never, installer as never)

    const result = await service.loadCatalog('Admin')

    expect(storageClient.readText).toHaveBeenCalledTimes(2)
    expect(result.stable[0]?.version).toBe('1.1.0')
    expect(result.preview[0]?.version).toBe('1.2.0')
  })

  it('marks user update as downloaded when a verified package already exists', async () => {
    const recommended = createRelease('1.1.0', 'stable')
    const storageClient = { readText: vi.fn() }
    const installer = {
      getValidDownloadedRelease: vi.fn().mockResolvedValue({
        ...recommended,
        localPath: 'D:/downloads/stable-1.1.0.exe'
      })
    }
    const service = new UpdateCatalogService(config, storageClient as never, installer as never)

    const result = await service.resolveUserStatus(createStatus(), {
      stable: [recommended],
      preview: []
    })

    expect(result.phase).toBe('downloaded')
    expect(result.downloadedRelease?.localPath).toContain('stable-1.1.0.exe')
    expect(result.recommendedRelease?.version).toBe('1.1.0')
  })

  it('returns available admin status and trims catalog history', () => {
    const storageClient = { readText: vi.fn() }
    const installer = { getValidDownloadedRelease: vi.fn() }
    const service = new UpdateCatalogService(config, storageClient as never, installer as never)
    const catalog: UpdateCatalog = {
      stable: [
        createRelease('1.0.0', 'stable'),
        createRelease('1.1.0', 'stable'),
        createRelease('1.2.0', 'stable')
      ],
      preview: [
        createRelease('1.3.0', 'preview'),
        createRelease('1.4.0', 'preview'),
        createRelease('1.5.0', 'preview')
      ]
    }

    const adminStatus = service.resolveAdminStatus(
      createStatus({ currentUserType: 'Admin', currentVersion: '1.0.0' }),
      catalog
    )
    const dialogCatalog = service.getDialogCatalog(
      createStatus({
        currentUserType: 'Admin',
        currentVersion: '1.0.0',
        recommendedRelease: createRelease('1.5.0', 'preview')
      }),
      catalog
    )

    expect(adminStatus.phase).toBe('available')
    expect(adminStatus.recommendedRelease?.version).toBe('1.5.0')
    expect(dialogCatalog.mode).toBe('admin')
    expect(dialogCatalog.channels?.stable).toHaveLength(2)
    expect(dialogCatalog.channels?.preview).toHaveLength(2)
  })
})
