import { beforeAll, afterAll, vi } from 'vitest'
import path from 'path'

// ============================================
// Complete Electron Mock for Unit Tests
// ============================================
vi.mock('electron', () => {
  const mockApp = {
    // Basic properties
    isPackaged: false,
    isReady: vi.fn().mockReturnValue(true),

    // Path management - support multiple path types
    getPath: vi.fn((name: string) => {
      const paths: Record<string, string> = {
        userData: path.join(process.cwd(), 'test-user-data'),
        logs: path.join(process.cwd(), 'test-logs'),
        temp: path.join(process.cwd(), 'test-temp'),
        appData: path.join(process.cwd(), 'test-app-data'),
        desktop: path.join(process.cwd(), 'test-desktop'),
        documents: path.join(process.cwd(), 'test-documents'),
        downloads: path.join(process.cwd(), 'test-downloads')
      }
      return paths[name] || process.cwd()
    }),

    // Application info - CRITICAL: These were missing
    getVersion: vi.fn(() => '1.9.0-test'),
    getName: vi.fn(() => 'ERPAuto'),
    getAppPath: vi.fn(() => path.join(process.cwd(), 'test-app-path')),

    // Event handling
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),

    // Protocol
    isDefaultProtocolClient: vi.fn(() => true),

    // Lifecycle
    quit: vi.fn(),
    relaunch: vi.fn(),
    exit: vi.fn(),

    // Focus
    focus: vi.fn(),
    blur: vi.fn(),

    // Other
    isQuitting: vi.fn(() => false),
    isAccessibilityEnabled: vi.fn(() => true),
    getApplicationNameForProtocol: vi.fn(() => null)
  }

  return {
    // Electron app module
    app: mockApp,

    // IPC Main - for IPC handler tests
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeHandler: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn()
    },

    // Dialog - for error box tests
    dialog: {
      showErrorBox: vi.fn(),
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: true }),
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: true })
    },

    // BrowserWindow - for renderer tests
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
      fromWebContents: vi.fn(() => null),
      fromId: vi.fn(() => null),
      getFocusedWindow: vi.fn(() => null)
    },

    // Shell - for external operations
    shell: {
      openPath: vi.fn().mockResolvedValue(''),
      openExternal: vi.fn().mockResolvedValue(undefined),
      showItemInFolder: vi.fn(),
      trashItem: vi.fn()
    },

    // ContextBridge - for preload tests
    contextBridge: {
      exposeInMainWorld: vi.fn()
    },

    // WebContents - for window management
    WebContents: {
      fromId: vi.fn(() => null)
    }
  }
})

beforeAll(async () => {
  // Global test setup
  console.log('Test suite starting...')
})

afterAll(async () => {
  // Global test teardown
  console.log('Test suite completed.')
})
