/**
 * Tests for Page Diagnostics module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted() runs before vi.mock() factories, even though both are hoisted.
const mockLog = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn()
}))

vi.mock('../../../../src/main/services/logger', () => ({
  createLogger: () => mockLog
}))

import {
  attachPageDiagnostics,
  attachContextDiagnostics
} from '../../../../src/main/services/erp/page-diagnostics'

describe('page-diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('attachPageDiagnostics', () => {
    it('should log console warning messages', () => {
      const listeners: Record<string, ((...args: any[]) => any)[]> = {}
      const page = {
        on: vi.fn((event: string, handler: (...args: any[]) => any) => {
          if (!listeners[event]) listeners[event] = []
          listeners[event].push(handler)
        }),
        url: vi.fn(() => 'https://erp.example.com/page')
      } as any

      attachPageDiagnostics(page)

      const consoleHandlers = listeners['console'] ?? []
      expect(consoleHandlers).toHaveLength(1)

      consoleHandlers[0]({
        type: () => 'warning',
        text: () => 'Something suspicious',
        location: () => ({ url: 'app.js', lineNumber: 42 })
      })

      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining('Browser warning'),
        expect.objectContaining({
          pageUrl: 'https://erp.example.com/page',
          consoleType: 'warning'
        })
      )
    })

    it('should log console error messages', () => {
      const listeners: Record<string, ((...args: any[]) => any)[]> = {}
      const page = {
        on: vi.fn((event: string, handler: (...args: any[]) => any) => {
          if (!listeners[event]) listeners[event] = []
          listeners[event].push(handler)
        }),
        url: vi.fn(() => 'https://erp.example.com/page')
      } as any

      attachPageDiagnostics(page)

      const consoleHandlers = listeners['console'] ?? []
      consoleHandlers[0]({
        type: () => 'error',
        text: () => 'Uncaught TypeError',
        location: () => ({ url: 'vendor.js', lineNumber: 100 })
      })

      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining('Browser error'),
        expect.objectContaining({
          consoleType: 'error'
        })
      )
    })

    it('should NOT log console info messages', () => {
      const listeners: Record<string, ((...args: any[]) => any)[]> = {}
      const page = {
        on: vi.fn((event: string, handler: (...args: any[]) => any) => {
          if (!listeners[event]) listeners[event] = []
          listeners[event].push(handler)
        }),
        url: vi.fn(() => 'https://erp.example.com/page')
      } as any

      attachPageDiagnostics(page)

      const consoleHandlers = listeners['console'] ?? []
      consoleHandlers[0]({
        type: () => 'info',
        text: () => 'XHR loaded',
        location: () => ({ url: 'app.js', lineNumber: 10 })
      })

      expect(mockLog.error).not.toHaveBeenCalled()
    })

    it('should NOT log console log messages', () => {
      const listeners: Record<string, ((...args: any[]) => any)[]> = {}
      const page = {
        on: vi.fn((event: string, handler: (...args: any[]) => any) => {
          if (!listeners[event]) listeners[event] = []
          listeners[event].push(handler)
        }),
        url: vi.fn(() => 'https://erp.example.com/page')
      } as any

      attachPageDiagnostics(page)

      const consoleHandlers = listeners['console'] ?? []
      consoleHandlers[0]({
        type: () => 'log',
        text: () => 'debug output',
        location: () => null
      })

      expect(mockLog.error).not.toHaveBeenCalled()
    })

    it('should log pageerror events', () => {
      const listeners: Record<string, ((...args: any[]) => any)[]> = {}
      const page = {
        on: vi.fn((event: string, handler: (...args: any[]) => any) => {
          if (!listeners[event]) listeners[event] = []
          listeners[event].push(handler)
        }),
        url: vi.fn(() => 'https://erp.example.com/page')
      } as any

      attachPageDiagnostics(page)

      const pageErrorHandlers = listeners['pageerror'] ?? []
      expect(pageErrorHandlers).toHaveLength(1)

      pageErrorHandlers[0](new Error('Script error on page'))

      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining('Browser pageerror'),
        expect.objectContaining({
          pageUrl: 'https://erp.example.com/page',
          error: 'Script error on page'
        })
      )
    })
  })

  describe('attachContextDiagnostics', () => {
    it('should auto-attach diagnostics to new pages in the context', () => {
      const contextListeners: Record<string, ((...args: any[]) => any)[]> = {}
      const context = {
        on: vi.fn((event: string, handler: (...args: any[]) => any) => {
          if (!contextListeners[event]) contextListeners[event] = []
          contextListeners[event].push(handler)
        })
      } as any

      attachContextDiagnostics(context)

      const pageHandlers = contextListeners['page'] ?? []
      expect(pageHandlers).toHaveLength(1)

      const newPage = {
        on: vi.fn(),
        url: vi.fn(() => 'https://erp.example.com/popup')
      } as any

      pageHandlers[0](newPage)

      expect(newPage.on).toHaveBeenCalledWith('console', expect.any(Function))
      expect(newPage.on).toHaveBeenCalledWith('pageerror', expect.any(Function))
    })
  })
})
