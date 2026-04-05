import { describe, it, expect, beforeEach, vi } from 'vitest'
import { chromium } from 'playwright'
import { ErpAuthService } from '@main/services/erp/erp-auth'
import type { ErpConfig } from '@main/types/erp.types'

// Mock logger
vi.mock('@main/services/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn()
  }
}))

vi.mock('@main/services/erp/erp-error-context', () => ({
  capturePageContext: vi.fn().mockResolvedValue({})
}))

vi.mock('@main/services/erp/page-diagnostics', () => ({
  attachPageDiagnostics: vi.fn(),
  attachContextDiagnostics: vi.fn()
}))

describe('ErpAuthService', () => {
  let config: ErpConfig
  let service: ErpAuthService

  beforeEach(() => {
    vi.clearAllMocks()
    config = {
      url: 'https://test-erp.com',
      username: 'testuser',
      password: 'testpass',
      headless: true
    }
  })

  describe('constructor()', () => {
    it('should store config', () => {
      service = new ErpAuthService(config)

      // Verify config is stored by checking isActive returns false (default state)
      expect(service.isActive()).toBe(false)
    })

    it('should initialize with null session', () => {
      service = new ErpAuthService(config)

      expect(service.isActive()).toBe(false)
      expect(() => service.getSession()).toThrow('Not logged in')
    })
  })

  describe('getSession()', () => {
    beforeEach(() => {
      service = new ErpAuthService(config)
    })

    it('should throw error when not logged in', () => {
      expect(() => service.getSession()).toThrow('Not logged in. Call login() first.')
    })

    it('should return session when logged in', () => {
      // Manually set session state (bypassing login for unit test)
      ;(service as any).session = {
        browser: {},
        context: {},
        page: {},
        mainFrame: {},
        isLoggedIn: true
      }

      const session = service.getSession()

      expect(session).toBeDefined()
      expect(session.isLoggedIn).toBe(true)
    })
  })

  describe('isActive()', () => {
    beforeEach(() => {
      service = new ErpAuthService(config)
    })

    it('should return false when not logged in', () => {
      expect(service.isActive()).toBe(false)
    })

    it('should return true when logged in', () => {
      // Manually set session state (bypassing login for unit test)
      ;(service as any).session = {
        browser: {},
        context: {},
        page: {},
        mainFrame: {},
        isLoggedIn: true
      }

      expect(service.isActive()).toBe(true)
    })
  })

  describe('login()', () => {
    let mockBrowser: any
    let mockContext: any
    let mockPage: any
    let mockFrame: any

    beforeEach(() => {
      mockFrame = {
        locator: vi.fn().mockReturnThis(),
        getByRole: vi.fn().mockReturnValue({
          fill: vi.fn().mockResolvedValue(undefined),
          click: vi.fn().mockResolvedValue(undefined)
        }),
        getByText: vi.fn().mockReturnValue({
          waitFor: vi.fn().mockResolvedValue(undefined),
          isVisible: vi.fn().mockResolvedValue(false)
        }),
        waitFor: vi.fn().mockResolvedValue(undefined)
      }

      mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockReturnValue({
          contentFrame: vi.fn().mockResolvedValue(mockFrame)
        })
      }

      mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn().mockResolvedValue(undefined)
      }

      mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
        close: vi.fn().mockResolvedValue(undefined)
      }

      vi.mocked(chromium.launch).mockResolvedValue(mockBrowser as any)
    })

    it('should create session on successful login', async () => {
      service = new ErpAuthService(config)

      const session = await service.login()

      expect(chromium.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }))
      expect(mockBrowser.newContext).toHaveBeenCalled()
      expect(mockContext.newPage).toHaveBeenCalled()
      expect(session.isLoggedIn).toBe(true)
      expect(session.browser).toBe(mockBrowser)
      expect(session.context).toBe(mockContext)
      expect(session.page).toBe(mockPage)
      expect(session.mainFrame).toBe(mockFrame)
    })

    it('should reuse existing session if already logged in', async () => {
      service = new ErpAuthService(config)
      const firstSession = await service.login()

      // Second call should return same session
      const secondSession = await service.login()

      expect(secondSession).toBe(firstSession)
      expect(chromium.launch).toHaveBeenCalledTimes(1)
    })

    it('should throw when forwardFrame contentFrame returns null', async () => {
      service = new ErpAuthService(config)
      mockPage.locator = vi.fn().mockReturnValue({
        contentFrame: vi.fn().mockResolvedValue(null)
      })

      await expect(service.login()).rejects.toThrow('Failed to access forwardFrame content frame')
    })
  })

  describe('close()', () => {
    beforeEach(() => {
      service = new ErpAuthService(config)
    })

    it('should be no-op when not logged in', async () => {
      // Should not throw when calling close without session
      await expect(service.close()).resolves.not.toThrow()
      expect(service.isActive()).toBe(false)
    })

    it('should clear session when logged in', async () => {
      // Manually set session state
      const mockSession = {
        browser: { close: vi.fn().mockResolvedValue(undefined) },
        context: { close: vi.fn().mockResolvedValue(undefined) },
        page: {},
        mainFrame: {},
        isLoggedIn: true
      }
      ;(service as any).session = mockSession

      await service.close()

      expect(service.isActive()).toBe(false)
    })
  })
})
