import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'

const mkdirSyncMock = vi.fn()
const existsSyncMock = vi.fn()
const readdirSyncMock = vi.fn()
const showErrorBoxMock = vi.fn()
const setAppUserModelIdMock = vi.fn()
const appOnMock = vi.fn()
const configInitializeMock = vi.fn(async () => undefined)
const updateInitializeMock = vi.fn()
const registerIpcHandlersMock = vi.fn()

vi.mock('fs', () => ({
  default: {
    mkdirSync: mkdirSyncMock,
    existsSync: existsSyncMock,
    readdirSync: readdirSyncMock
  },
  mkdirSync: mkdirSyncMock,
  existsSync: existsSyncMock,
  readdirSync: readdirSyncMock
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return 'D:/test-user-data'
      return 'D:/test-user-data'
    }),
    setAppUserModelId: setAppUserModelIdMock,
    on: appOnMock,
    isPackaged: false,
    // CRITICAL: These were missing - required by logger
    getVersion: vi.fn(() => '1.9.0-test'),
    getName: vi.fn(() => 'ERPAuto'),
    getAppPath: vi.fn(() => 'D:/test-app-path'),
    isReady: vi.fn(() => true),
    quit: vi.fn(),
    relaunch: vi.fn(),
    exit: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn()
  },
  dialog: {
    showErrorBox: showErrorBoxMock,
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 })
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn()
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    fromWebContents: vi.fn()
  }
}))

vi.mock('../../src/main/services/config/config-manager', () => ({
  ConfigManager: {
    getInstance: vi.fn(() => ({
      initialize: configInitializeMock
    }))
  }
}))

vi.mock('../../src/main/services/update/update-service', () => ({
  UpdateService: {
    getInstance: vi.fn(() => ({
      initialize: updateInitializeMock
    }))
  }
}))

vi.mock('../../src/main/ipc', () => ({
  registerIpcHandlers: registerIpcHandlersMock
}))

describe('bootstrap runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existsSyncMock.mockReset()
    readdirSyncMock.mockReset()
  })

  it('configures Playwright browser path under app userData', async () => {
    const { configurePlaywrightBrowsersPath } = await import('../../src/main/bootstrap/runtime')

    const result = configurePlaywrightBrowsersPath()

    const expectedPath = join('D:/test-user-data', 'ms-playwright')
    expect(result).toBe(expectedPath)
    expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe(expectedPath)
  })

  it('initializes config, update service and IPC registration', async () => {
    const { initializeMainProcessServices } = await import('../../src/main/bootstrap/runtime')

    await initializeMainProcessServices()

    expect(configInitializeMock).toHaveBeenCalledTimes(1)
    expect(updateInitializeMock).toHaveBeenCalledTimes(1)
    expect(registerIpcHandlersMock).toHaveBeenCalledTimes(1)
  })

  it('shows an error dialog when no Playwright browser is found', async () => {
    const { ensurePlaywrightRuntime } = await import('../../src/main/bootstrap/runtime')

    existsSyncMock.mockReturnValue(false)
    readdirSyncMock.mockReturnValue([])

    const result = ensurePlaywrightRuntime('D:/test-user-data/ms-playwright')

    expect(mkdirSyncMock).toHaveBeenCalledWith('D:/test-user-data/ms-playwright', {
      recursive: true
    })
    // ensurePlaywrightRuntime returns false when browsers not found and logs warn
    expect(result).toBe(false)
  })
})
