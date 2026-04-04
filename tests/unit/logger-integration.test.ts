/**
 * Logger Integration Tests - RequestContext Integration
 * Verifies RequestContext is properly integrated with Logger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { getLogDir } from '../../src/main/services/logger/shared'

describe('Logger RequestContext Integration', () => {
  it('should export run from request-context', async () => {
    const { run } = await import('../../src/main/services/logger/index')
    expect(run).toBeDefined()
    expect(typeof run).toBe('function')
  })

  it('should export getRequestId from request-context', async () => {
    const { getRequestId } = await import('../../src/main/services/logger/index')
    expect(getRequestId).toBeDefined()
    expect(typeof getRequestId).toBe('function')
  })

  it('should export getContext from request-context', async () => {
    const { getContext } = await import('../../src/main/services/logger/index')
    expect(getContext).toBeDefined()
    expect(typeof getContext).toBe('function')
  })

  it('should export withContext from request-context', async () => {
    const { withContext } = await import('../../src/main/services/logger/index')
    expect(withContext).toBeDefined()
    expect(typeof withContext).toBe('function')
  })

  it('should export withRequestContext wrapper', async () => {
    const { withRequestContext } = await import('../../src/main/services/logger/index')
    expect(withRequestContext).toBeDefined()
    expect(typeof withRequestContext).toBe('function')
  })

  it('should export createLogger', async () => {
    const { createLogger } = await import('../../src/main/services/logger/index')
    expect(createLogger).toBeDefined()
    expect(typeof createLogger).toBe('function')
  })

  it('should have all exports available from LoggerContext type', async () => {
    const loggerModule = await import('../../src/main/services/logger/index')
    expect(loggerModule.run).toBeDefined()
    expect(loggerModule.getRequestId).toBeDefined()
    expect(loggerModule.getContext).toBeDefined()
    expect(loggerModule.withContext).toBeDefined()
    expect(loggerModule.withRequestContext).toBeDefined()
    expect(loggerModule.createLogger).toBeDefined()
  })
})

describe('cleanupOldScreenshots', () => {
  let unlinkSyncSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should delete PNG files older than retention period', async () => {
    const { cleanupOldScreenshots } = await import('../../src/main/services/logger/shared')
    const screenshotDir = path.join(getLogDir(), 'screenshots')

    const now = Date.now()
    const oldTime = now - 20 * 24 * 60 * 60 * 1000 // 20 days ago
    const recentTime = now - 5 * 24 * 60 * 60 * 1000 // 5 days ago

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('screenshots')) return true
      return false
    })

    vi.spyOn(fs, 'readdirSync').mockReturnValue(['err_old.png', 'err_recent.png'] as any)

    vi.spyOn(fs, 'statSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('err_old')) {
        return { mtimeMs: oldTime } as any
      }
      return { mtimeMs: recentTime } as any
    })

    unlinkSyncSpy = vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)

    cleanupOldScreenshots(14)

    // Only the old file should be deleted
    expect(unlinkSyncSpy).toHaveBeenCalledTimes(1)
    expect(unlinkSyncSpy).toHaveBeenCalledWith(path.join(screenshotDir, 'err_old.png'))
  })

  it('should not delete anything if screenshots directory does not exist', async () => {
    const { cleanupOldScreenshots } = await import('../../src/main/services/logger/shared')

    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const readdirSyncSpy = vi.spyOn(fs, 'readdirSync')

    cleanupOldScreenshots(14)

    expect(readdirSyncSpy).not.toHaveBeenCalled()
  })

  it('should skip non-PNG files', async () => {
    const { cleanupOldScreenshots } = await import('../../src/main/services/logger/shared')
    const screenshotDir = path.join(getLogDir(), 'screenshots')

    const now = Date.now()
    const oldTime = now - 20 * 24 * 60 * 60 * 1000

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('screenshots')) return true
      return false
    })

    vi.spyOn(fs, 'readdirSync').mockReturnValue(['notes.txt', 'data.json', 'err_old.png'] as any)

    vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: oldTime } as any)
    unlinkSyncSpy = vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)

    cleanupOldScreenshots(14)

    // Only the .png file should be deleted
    expect(unlinkSyncSpy).toHaveBeenCalledTimes(1)
    expect(unlinkSyncSpy).toHaveBeenCalledWith(path.join(screenshotDir, 'err_old.png'))
  })
})
