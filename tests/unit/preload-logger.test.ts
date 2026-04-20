import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcRendererMock = {
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}

vi.mock('../../src/preload/lib/ipc', () => ({
  ipcRenderer: ipcRendererMock
}))

describe('preload loggerApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcRendererMock.invoke.mockResolvedValue('info')
  })

  it('registers the level listener only once across repeated fetches', async () => {
    const { loggerApi } = await import('../../src/preload/api/logger')

    await loggerApi.fetchLevel()
    await loggerApi.fetchLevel()

    expect(ipcRendererMock.invoke).toHaveBeenCalledTimes(2)
    expect(ipcRendererMock.on).toHaveBeenCalledTimes(1)
  })

  it('removes the level listener only when it was registered', async () => {
    const { loggerApi } = await import('../../src/preload/api/logger')

    loggerApi.cleanup()
    expect(ipcRendererMock.removeListener).not.toHaveBeenCalled()

    await loggerApi.fetchLevel()
    loggerApi.cleanup()

    expect(ipcRendererMock.removeListener).toHaveBeenCalledTimes(1)
  })
})
