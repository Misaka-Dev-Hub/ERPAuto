import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ErpBrowserManager } from '../../../../src/main/services/erp/ErpBrowserManager'
import { chromium } from 'playwright'

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
    connect: vi.fn()
  }
}))

// Mock logger
vi.mock('../../../../src/main/services/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

describe('ErpBrowserManager', () => {
  let mockBrowser: any
  let mockContext: any
  let mockPage: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Create fresh mocks for each test to preserve isConnected state
    mockBrowser = {
      isConnected: vi.fn().mockReturnValue(true),
      newContext: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    }

    mockContext = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn()
    }

    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    }

    vi.mocked(chromium.launch).mockResolvedValue(mockBrowser)
    mockBrowser.newContext.mockResolvedValue(mockContext)
    mockContext.newPage.mockResolvedValue(mockPage)
  })

  describe('launch()', () => {
    it('should launch browser with config', async () => {
      const manager = new ErpBrowserManager({ headless: false })
      const browser = await manager.launch()

      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: false
        })
      )
      expect(browser).toBeDefined()
    })

    it('should return existing browser if running', async () => {
      const manager = new ErpBrowserManager()

      // First launch creates session
      const firstBrowser = await manager.launch()

      // Force save session (this simulates what initialize() would do)
      manager['session'] = {
        browser: firstBrowser,
        context: mockContext,
        page: mockPage
      }

      // Second launch should return existing browser
      const secondBrowser = await manager.launch()

      expect(firstBrowser).toBe(secondBrowser)
      expect(chromium.launch).toHaveBeenCalledTimes(1)
    })

    it.each([true, false])('should launch with headless=%s', async (headless) => {
      const manager = new ErpBrowserManager({ headless })
      await manager.launch()
      expect(chromium.launch).toHaveBeenCalledWith(expect.objectContaining({ headless }))
    })
  })

  describe('initialize()', () => {
    it('should create browser, context, and page in one call', async () => {
      const manager = new ErpBrowserManager({ headless: true })
      const session = await manager.initialize()

      expect(session.browser).toBe(mockBrowser)
      expect(session.context).toBe(mockContext)
      expect(session.page).toBe(mockPage)
      expect(chromium.launch).toHaveBeenCalledTimes(1)
      expect(mockBrowser.newContext).toHaveBeenCalledTimes(1)
      expect(mockContext.newPage).toHaveBeenCalledTimes(1)
    })

    it('should return existing session on repeated calls', async () => {
      const manager = new ErpBrowserManager()
      const first = await manager.initialize()
      const second = await manager.initialize()

      expect(first).toBe(second)
      expect(chromium.launch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getSession()', () => {
    it('should return null when no session', () => {
      const manager = new ErpBrowserManager()
      expect(manager.getSession()).toBeNull()
    })

    it('should return session after initialize', async () => {
      const manager = new ErpBrowserManager()
      const initSession = await manager.initialize()
      const session = manager.getSession()

      expect(session).toBe(initSession)
    })
  })

  describe('isRunning()', () => {
    it('should return false when no session', () => {
      const manager = new ErpBrowserManager()
      expect(manager.isRunning()).toBe(false)
    })

    it('should return true when browser is connected', async () => {
      const manager = new ErpBrowserManager()
      await manager.initialize()
      expect(manager.isRunning()).toBe(true)
    })

    it('should return false when browser is disconnected', async () => {
      const manager = new ErpBrowserManager()
      await manager.initialize()
      mockBrowser.isConnected.mockReturnValue(false)
      expect(manager.isRunning()).toBe(false)
    })
  })

  describe('navigate()', () => {
    it('should call page.goto and waitForLoadState', async () => {
      const manager = new ErpBrowserManager()
      await manager.initialize()
      await manager.navigate('https://example.com')

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ timeout: 30000 })
      )
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith(
        'domcontentloaded',
        expect.objectContaining({ timeout: 10000 })
      )
    })

    it('should throw when no session', async () => {
      const manager = new ErpBrowserManager()
      await expect(manager.navigate('https://example.com')).rejects.toThrow('No page available')
    })
  })

  describe('createContext()', () => {
    it('should create browser context', async () => {
      const manager = new ErpBrowserManager()
      const context = await manager.createContext()

      expect(context).toBeDefined()
      expect(mockBrowser.newContext).toHaveBeenCalled()
    })

    it('should use provided browser', async () => {
      const manager = new ErpBrowserManager()
      const customBrowser = {
        ...mockBrowser,
        newContext: vi.fn().mockResolvedValue(mockContext)
      }
      await manager.createContext(customBrowser as any)

      expect(customBrowser.newContext).toHaveBeenCalled()
    })

    it('should launch browser if not provided', async () => {
      const manager = new ErpBrowserManager()
      await manager.createContext()

      expect(chromium.launch).toHaveBeenCalled()
    })
  })

  describe('createPage()', () => {
    it('should create page in context', async () => {
      const manager = new ErpBrowserManager()
      await manager.launch()
      const page = await manager.createPage()

      expect(page).toBeDefined()
      expect(mockContext.newPage).toHaveBeenCalled()
    })
  })

  describe('close()', () => {
    it('should close all browser resources', async () => {
      const manager = new ErpBrowserManager()
      await manager.launch()
      const context = await manager.createContext()
      const page = await manager.createPage()

      // Manually set session since our mocks don't persist internal state
      manager['session'] = {
        browser: mockBrowser,
        context,
        page
      }

      await manager.close()

      expect(mockContext.close).toHaveBeenCalled()
      expect(mockBrowser.close).toHaveBeenCalled()
    })

    it('should be no-op if no session', async () => {
      const manager = new ErpBrowserManager()
      await manager.close()

      expect(mockContext.close).not.toHaveBeenCalled()
      expect(mockBrowser.close).not.toHaveBeenCalled()
    })

    it('should close browser even if context.close fails', async () => {
      const manager = new ErpBrowserManager()
      await manager.initialize()
      mockContext.close.mockRejectedValue(new Error('Context close error'))

      await manager.close()

      expect(mockBrowser.close).toHaveBeenCalled()
      expect(manager.getSession()).toBeNull()
    })
  })
})
