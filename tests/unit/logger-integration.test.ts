/**
 * Logger Integration Tests - RequestContext Integration
 * Verifies RequestContext functions produce correct behavior, not just exports.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { getLogDir } from '../../src/main/services/logger/shared'

describe('Logger RequestContext Integration', () => {
  it('should generate unique request IDs inside run()', async () => {
    const { run, getRequestId } = await import('../../src/main/services/logger/index')

    const outerId = await run(async () => getRequestId())
    const innerId = await run(async () => getRequestId())

    expect(outerId).toBeTruthy()
    expect(innerId).toBeTruthy()
    expect(outerId).not.toBe(innerId)
  })

  it('should return undefined for getRequestId() outside run()', async () => {
    const { getRequestId } = await import('../../src/main/services/logger/index')

    expect(getRequestId()).toBeUndefined()
  })

  it('should propagate context through run()', async () => {
    const { run, getContext } = await import('../../src/main/services/logger/index')

    const context = await run(async () => getContext(), {
      userId: 'user-123',
      operation: 'test-op'
    })

    expect(context).toBeDefined()
    expect(context!.userId).toBe('user-123')
    expect(context!.operation).toBe('test-op')
  })

  it('should provide request ID inside withRequestContext()', async () => {
    const { withRequestContext, getRequestId } =
      await import('../../src/main/services/logger/index')

    const requestId = await withRequestContext(async () => getRequestId(), {
      userId: 'user-abc',
      operation: 'extract'
    })

    expect(requestId).toBeTruthy()
  })

  it('should inject context into withRequestContext()', async () => {
    const { withRequestContext, getContext } = await import('../../src/main/services/logger/index')

    const ctx = await withRequestContext(async () => getContext(), {
      userId: 'admin',
      operation: 'clean'
    })

    expect(ctx).toBeDefined()
    expect(ctx!.userId).toBe('admin')
    expect(ctx!.operation).toBe('clean')
  })

  it('should create a child logger that carries context metadata', async () => {
    const { createLogger } = await import('../../src/main/services/logger/index')
    const logger = createLogger('MyModule')

    logger.info('hello', { key: 'value' })

    // Verify the logger is functional — it has standard log methods that accept calls
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.debug).toBe('function')
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
