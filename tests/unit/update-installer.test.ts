import path from 'path'
import { describe, expect, it } from 'vitest'
import { UpdateInstaller } from '../../src/main/services/update/update-installer'

describe('UpdateInstaller', () => {
  it('builds downloaded package path under userData pending-update', () => {
    const installer = new UpdateInstaller()

    const result = installer.getDownloadPath({
      version: '1.2.3',
      channel: 'stable'
    })

    expect(result).toContain(path.join('logs', 'pending-update'))
    expect(result).toContain('stable-1.2.3.exe')
  })

  it('returns null when downloaded package does not exist', async () => {
    const installer = new UpdateInstaller()

    const result = await installer.getValidDownloadedRelease({
      version: '9.9.9',
      channel: 'preview',
      artifactKey: 'preview/9.9.9.exe',
      sha256: 'missing',
      size: 1,
      publishedAt: '2026-03-21T10:00:00Z',
      changelogKey: 'preview/9.9.9.md'
    })

    expect(result).toBeNull()
  })
})
