/**
 * Tests for ERP Error Context Capture with screenshot support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// Mock logger/shared before importing the module under test
vi.mock('../../../../src/main/services/logger/shared', () => ({
  getLogDir: vi.fn(() => '/tmp/test-logs')
}))

// Mock fs
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn()
  }
}))

import { capturePageContext } from '../../../../src/main/services/erp/erp-error-context'

function createMockPage(overrides: Record<string, unknown> = {}) {
  return {
    url: vi.fn(() => 'https://erp.example.com/page'),
    frames: vi.fn(() => [
      { name: () => 'main', url: () => 'https://erp.example.com/main' },
      { name: () => 'forwardFrame', url: () => 'https://erp.example.com/frame' }
    ]),
    isClosed: vi.fn(() => false),
    screenshot: vi.fn(() => Buffer.from('fake-png-data')),
    ...overrides
  } as any
}

describe('capturePageContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should capture screenshot and return screenshotPath on success', async () => {
    const page = createMockPage()

    const ctx = await capturePageContext(page, '#selector', 'login.username')

    expect(ctx.screenshotPath).toBeDefined()
    expect(ctx.screenshotPath).toContain('err_')
    expect(ctx.screenshotPath).toContain('.png')
    expect(ctx.screenshotPath).toContain('login_username')
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.png'),
      expect.any(Buffer)
    )
  })

  it('should return screenshotPath undefined when page is closed', async () => {
    const page = createMockPage({ isClosed: vi.fn(() => true) })

    const ctx = await capturePageContext(page)

    expect(ctx.screenshotPath).toBeUndefined()
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('should still return other fields when screenshot fails', async () => {
    const page = createMockPage({
      screenshot: vi.fn(() => {
        throw new Error('screenshot timeout')
      })
    })

    const ctx = await capturePageContext(page, '#target', 'test-step')

    // Other fields should still be populated
    expect(ctx.pageUrl).toBe('https://erp.example.com/page')
    expect(ctx.frameHierarchy).toHaveLength(2)
    expect(ctx.targetSelector).toBe('#target')
    expect(ctx.step).toBe('test-step')
    // Screenshot should be undefined due to failure
    expect(ctx.screenshotPath).toBeUndefined()
  })

  it('should sanitize special characters in step name for filename', async () => {
    const page = createMockPage()

    const ctx = await capturePageContext(page, undefined, 'login/user:test*step')

    expect(ctx.screenshotPath).toBeDefined()
    expect(ctx.screenshotPath).toContain('login_user_test_step')
  })

  it('should use "unknown" in filename when step is not provided', async () => {
    const page = createMockPage()

    const ctx = await capturePageContext(page)

    expect(ctx.screenshotPath).toBeDefined()
    expect(ctx.screenshotPath).toContain('unknown')
  })

  it('should truncate long step names to 40 characters', async () => {
    const page = createMockPage()
    const longStep = 'a'.repeat(80)

    const ctx = await capturePageContext(page, undefined, longStep)

    expect(ctx.screenshotPath).toBeDefined()
    const filename = path.basename(ctx.screenshotPath!)
    // Extract step portion: err_YYYYMMDD_HHmmss_<step>.png
    const stepPart = filename.replace(/^err_\d{8}_\d{6}_/, '').replace(/\.png$/, '')
    expect(stepPart.length).toBe(40)
  })

  it('should create screenshots directory if it does not exist', async () => {
    const page = createMockPage()

    await capturePageContext(page)

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('screenshots'), {
      recursive: true
    })
  })
})
