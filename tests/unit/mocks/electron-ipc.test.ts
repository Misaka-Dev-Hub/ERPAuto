/**
 * Tests for Electron and IPC Renderer mock factory functions
 *
 * These tests verify that the mock factory functions work correctly
 * and can be used in unit tests for Electron/IPC functionality
 */
import { describe, it, expect, vi } from 'vitest'
import type { MockIpcRenderer, MockElectron } from '../../mocks/types'
import { createMockElectron, createMockIpcRenderer } from '../../mocks'

describe('Electron & IPC Mock Factories', () => {
  describe('createMockIpcRenderer', () => {
    it('should create IPC renderer with default mocks', () => {
      const ipcRenderer = createMockIpcRenderer()

      expect(ipcRenderer.invoke).toBeDefined()
      expect(ipcRenderer.send).toBeDefined()
      expect(ipcRenderer.on).toBeDefined()
      expect(ipcRenderer.removeListener).toBeDefined()
    })

    it('should support invoke method with mocked response', async () => {
      const mockResponse = { success: true, data: 'test' }
      const ipcRenderer = createMockIpcRenderer({
        invoke: vi.fn().mockResolvedValue(mockResponse)
      })

      const result = await ipcRenderer.invoke('test:channel', 'arg1')

      expect(result).toEqual(mockResponse)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('test:channel', 'arg1')
    })

    it('should support send method', () => {
      const ipcRenderer = createMockIpcRenderer()

      ipcRenderer.send('test:channel', 'data')

      expect(ipcRenderer.send).toHaveBeenCalledWith('test:channel', 'data')
    })

    it('should support method chaining for on/removeListener', () => {
      const ipcRenderer = createMockIpcRenderer()
      const listener = () => {}

      const result = ipcRenderer.on('channel', listener)

      expect(result).toBe(ipcRenderer)
    })

    it('should accept overrides', async () => {
      const customInvoke = vi.fn().mockResolvedValue({ custom: true })
      const ipcRenderer = createMockIpcRenderer({
        invoke: customInvoke
      })

      await ipcRenderer.invoke('test')

      expect(customInvoke).toHaveBeenCalledWith('test')
    })
  })

  describe('createMockElectron', () => {
    it('should create Electron API with all modules', () => {
      const electron = createMockElectron()

      expect(electron.app).toBeDefined()
      expect(electron.ipcMain).toBeDefined()
      expect(electron.ipcRenderer).toBeDefined()
      expect(electron.dialog).toBeDefined()
      expect(electron.shell).toBeDefined()
      expect(electron.BrowserWindow).toBeDefined()
    })

    it('should provide app module with getVersion', () => {
      const electron = createMockElectron()

      const version = electron.app?.getVersion()

      expect(version).toBe('1.9.0-test')
    })

    it('should provide ipcRenderer with invoke support', async () => {
      const electron = createMockElectron()

      const result = await electron.ipcRenderer?.invoke('test:channel')

      expect(electron.ipcRenderer?.invoke).toHaveBeenCalled()
    })

    it('should accept ipcRenderer overrides', async () => {
      const mockResponse = { user: { id: 1, name: 'test' } }
      const electron = createMockElectron({
        ipcRenderer: createMockIpcRenderer({
          invoke: vi.fn().mockResolvedValue(mockResponse)
        })
      })

      const result = await electron.ipcRenderer?.invoke('user:getCurrent')

      expect(result).toEqual(mockResponse)
    })

    it('should accept app module overrides', () => {
      const electron = createMockElectron({
        app: {
          isPackaged: false,
          isReady: vi.fn().mockReturnValue(true),
          getPath: vi.fn(() => '/test'),
          getVersion: vi.fn(() => '2.0.0-custom'),
          getName: vi.fn(() => 'ERPAuto'),
          getAppPath: vi.fn(() => '/test'),
          on: vi.fn(),
          off: vi.fn(),
          once: vi.fn(),
          emit: vi.fn(),
          isDefaultProtocolClient: vi.fn(() => true),
          quit: vi.fn(),
          relaunch: vi.fn(),
          exit: vi.fn(),
          focus: vi.fn(),
          blur: vi.fn(),
          isQuitting: vi.fn(() => false),
          isAccessibilityEnabled: vi.fn(() => true),
          getApplicationNameForProtocol: vi.fn(() => null)
        }
      })

      const version = electron.app?.getVersion()

      expect(version).toBe('2.0.0-custom')
    })

    it('should support dialog mock', async () => {
      const electron = createMockElectron()

      await electron.dialog?.showMessageBox({})

      expect(electron.dialog?.showMessageBox).toHaveBeenCalled()
    })

    it('should support shell mock', async () => {
      const electron = createMockElectron()

      await electron.shell?.openExternal('https://example.com')

      expect(electron.shell?.openExternal).toHaveBeenCalledWith('https://example.com')
    })
  })
})
