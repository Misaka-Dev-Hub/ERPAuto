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
    getPath: vi.fn(() => 'D:/userData'),
    setAppUserModelId: setAppUserModelIdMock,
    on: appOnMock,
    isPackaged: false
  },
  dialog: {
    showErrorBox: showErrorBoxMock
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

    const expectedPath = join('D:/userData', 'ms-playwright')
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

    ensurePlaywrightRuntime('D:/userData/ms-playwright')

    expect(mkdirSyncMock).toHaveBeenCalledWith('D:/userData/ms-playwright', { recursive: true })
    expect(showErrorBoxMock).toHaveBeenCalledTimes(1)
  })
})
