import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  normalizeReleases,
  pickLatestRelease,
  resolveAdminDecision,
  resolveUserDecision
} from '../../src/main/services/update/update-utils'
import type { UpdateCatalog } from '../../src/main/types/update.types'

describe('update-utils', () => {
  it('compares semver-like numeric versions correctly', () => {
    expect(compareVersions('1.3.1', '1.3.1')).toBe(0)
    expect(compareVersions('1.3.2', '1.3.1')).toBe(1)
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.2.0', '1.3.0')).toBe(-1)
  })

  it('pads missing version segments with zero', () => {
    expect(compareVersions('1.3', '1.3.0')).toBe(0)
    expect(compareVersions('1.3.1', '1.3')).toBe(1)
  })

  it('normalizes channel indexes and drops invalid entries', () => {
    const releases = normalizeReleases(
      {
        releases: [
          {
            version: '1.3.2',
            artifactKey: 'stable/1.3.2.exe',
            sha256: 'abc',
            size: 123,
            publishedAt: '2026-03-20T10:00:00Z',
            changelogKey: 'stable/1.3.2.md'
          },
          {
            version: '1.3.1',
            artifactKey: '',
            sha256: 'missing',
            size: 12,
            publishedAt: '2026-03-19T10:00:00Z',
            changelogKey: 'stable/1.3.1.md'
          }
        ]
      },
      'stable'
    )

    expect(releases).toHaveLength(1)
    expect(releases[0].channel).toBe('stable')
    expect(releases[0].version).toBe('1.3.2')
  })

  it('keeps higher version newer even if its publishedAt is older', () => {
    const latest = pickLatestRelease([
      {
        version: '1.3.1',
        channel: 'stable',
        artifactKey: 'stable/1.3.1.exe',
        sha256: 'a',
        size: 1,
        publishedAt: '2026-03-20T11:00:00Z',
        changelogKey: 'stable/1.3.1.md'
      },
      {
        version: '1.3.2',
        channel: 'stable',
        artifactKey: 'stable/1.3.2.exe',
        sha256: 'b',
        size: 1,
        publishedAt: '2026-03-20T10:00:00Z',
        changelogKey: 'stable/1.3.2.md'
      }
    ])

    expect(latest?.version).toBe('1.3.2')
  })

  it('forces User on preview back to latest stable', () => {
    const catalog: UpdateCatalog = {
      stable: [
        {
          version: '1.3.2',
          channel: 'stable',
          artifactKey: 'stable/1.3.2.exe',
          sha256: 'a',
          size: 1,
          publishedAt: '2026-03-20T10:00:00Z',
          changelogKey: 'stable/1.3.2.md'
        }
      ],
      preview: [
        {
          version: '1.4.0',
          channel: 'preview',
          artifactKey: 'preview/1.4.0.exe',
          sha256: 'b',
          size: 1,
          publishedAt: '2026-03-20T11:00:00Z',
          changelogKey: 'preview/1.4.0.md'
        }
      ]
    }

    const decision = resolveUserDecision({
      currentVersion: '1.4.0',
      currentChannel: 'preview',
      catalog
    })

    expect(decision.shouldOffer).toBe(true)
    expect(decision.recommendedRelease?.channel).toBe('stable')
    expect(decision.recommendedRelease?.version).toBe('1.3.2')
  })

  it('treats stable version mismatch as update for User', () => {
    const catalog: UpdateCatalog = {
      stable: [
        {
          version: '1.3.2',
          channel: 'stable',
          artifactKey: 'stable/1.3.2.exe',
          sha256: 'a',
          size: 1,
          publishedAt: '2026-03-20T10:00:00Z',
          changelogKey: 'stable/1.3.2.md'
        }
      ],
      preview: []
    }

    const decision = resolveUserDecision({
      currentVersion: '1.3.1',
      currentChannel: 'stable',
      catalog
    })

    expect(decision.shouldOffer).toBe(true)
    expect(decision.recommendedRelease?.version).toBe('1.3.2')
  })

  it('recommends the highest newer version for Admin', () => {
    const catalog: UpdateCatalog = {
      stable: [
        {
          version: '1.3.2',
          channel: 'stable',
          artifactKey: 'stable/1.3.2.exe',
          sha256: 'a',
          size: 1,
          publishedAt: '2026-03-20T10:00:00Z',
          changelogKey: 'stable/1.3.2.md'
        }
      ],
      preview: [
        {
          version: '1.4.0',
          channel: 'preview',
          artifactKey: 'preview/1.4.0.exe',
          sha256: 'b',
          size: 1,
          publishedAt: '2026-03-20T09:00:00Z',
          changelogKey: 'preview/1.4.0.md'
        }
      ]
    }

    const decision = resolveAdminDecision({
      currentVersion: '1.3.1',
      currentChannel: 'stable',
      catalog,
      maxHistoryPerChannel: 10
    })

    expect(decision.mode).toBe('admin')
    expect(decision.recommendedRelease?.channel).toBe('preview')
    expect(decision.recommendedRelease?.version).toBe('1.4.0')
    expect(decision.channels?.preview).toHaveLength(1)
  })

  it('still exposes a cross-channel choice for Admin when no newer version exists', () => {
    const catalog: UpdateCatalog = {
      stable: [
        {
          version: '1.4.0',
          channel: 'stable',
          artifactKey: 'stable/1.4.0.exe',
          sha256: 'a',
          size: 1,
          publishedAt: '2026-03-20T10:00:00Z',
          changelogKey: 'stable/1.4.0.md'
        }
      ],
      preview: [
        {
          version: '1.4.0',
          channel: 'preview',
          artifactKey: 'preview/1.4.0.exe',
          sha256: 'b',
          size: 1,
          publishedAt: '2026-03-20T09:00:00Z',
          changelogKey: 'preview/1.4.0.md'
        }
      ]
    }

    const decision = resolveAdminDecision({
      currentVersion: '1.4.0',
      currentChannel: 'stable',
      catalog,
      maxHistoryPerChannel: 10
    })

    expect(decision.recommendedRelease?.channel).toBe('preview')
    expect(decision.recommendedRelease?.version).toBe('1.4.0')
  })
})
