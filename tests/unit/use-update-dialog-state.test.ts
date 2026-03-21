import { describe, expect, it } from 'vitest'
import type { UpdateDialogCatalog, UpdateRelease } from '../../src/main/types/update.types'
import {
  getInitialSelectedRelease,
  releaseKey
} from '../../src/renderer/src/hooks/useUpdateDialogState'

const stableRelease: UpdateRelease = {
  version: '1.4.1',
  channel: 'stable',
  artifactKey: 'stable-141.exe',
  sha256: 'stable-hash',
  size: 100,
  publishedAt: '2026-03-21T10:00:00.000Z',
  changelogKey: 'stable-141.md',
  notesSummary: 'stable summary'
}

const previewRelease: UpdateRelease = {
  version: '1.5.0-preview.1',
  channel: 'preview',
  artifactKey: 'preview-150.exe',
  sha256: 'preview-hash',
  size: 100,
  publishedAt: '2026-03-22T10:00:00.000Z',
  changelogKey: 'preview-150.md',
  notesSummary: 'preview summary'
}

describe('useUpdateDialogState helpers', () => {
  it('builds stable release keys', () => {
    expect(releaseKey(stableRelease)).toBe('stable:1.4.1')
  })

  it('returns undefined for disabled catalog', () => {
    const catalog: UpdateDialogCatalog = { mode: 'disabled' }
    expect(getInitialSelectedRelease(catalog)).toBeUndefined()
  })

  it('prefers recommended user release', () => {
    const catalog: UpdateDialogCatalog = {
      mode: 'user',
      recommendedRelease: stableRelease
    }

    expect(getInitialSelectedRelease(catalog)).toEqual(stableRelease)
  })

  it('prefers recommended admin release before channel fallbacks', () => {
    const catalog: UpdateDialogCatalog = {
      mode: 'admin',
      recommendedRelease: previewRelease,
      channels: {
        stable: [stableRelease],
        preview: [previewRelease]
      }
    }

    expect(getInitialSelectedRelease(catalog)).toEqual(previewRelease)
  })

  it('falls back to stable then preview when admin recommendation is absent', () => {
    const stableCatalog: UpdateDialogCatalog = {
      mode: 'admin',
      channels: {
        stable: [stableRelease],
        preview: [previewRelease]
      }
    }
    const previewCatalog: UpdateDialogCatalog = {
      mode: 'admin',
      channels: {
        stable: [],
        preview: [previewRelease]
      }
    }

    expect(getInitialSelectedRelease(stableCatalog)).toEqual(stableRelease)
    expect(getInitialSelectedRelease(previewCatalog)).toEqual(previewRelease)
  })
})
