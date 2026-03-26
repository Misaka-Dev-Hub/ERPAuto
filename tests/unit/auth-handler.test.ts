import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../src/shared/ipc-channels'

const handleMock = vi.fn()
const withErrorHandlingMock = vi.fn(async (handler: () => Promise<unknown>) => {
  const data = await handler()
  return { success: true, data }
})

const serviceMethods = {
  getComputerName: vi.fn(async () => 'TEST-PC'),
  silentLogin: vi.fn(async () => ({ success: true })),
  login: vi.fn(async (username: string) => ({ success: true, username })),
  logout: vi.fn(async () => undefined),
  getCurrentUser: vi.fn(async () => ({ success: true })),
  getAllUsers: vi.fn(async () => []),
  switchUser: vi.fn(async (user: unknown) => ({ success: true, user })),
  isAdmin: vi.fn(async () => true)
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock
  }
}))

vi.mock('../../src/main/ipc/index', () => ({
  withErrorHandling: withErrorHandlingMock
}))

vi.mock('../../src/main/services/auth/auth-application-service', () => ({
  AuthApplicationService: class {
    getComputerName = serviceMethods.getComputerName
    silentLogin = serviceMethods.silentLogin
    login = serviceMethods.login
    logout = serviceMethods.logout
    getCurrentUser = serviceMethods.getCurrentUser
    getAllUsers = serviceMethods.getAllUsers
    switchUser = serviceMethods.switchUser
    isAdmin = serviceMethods.isAdmin
  }
}))

describe('registerAuthHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers auth IPC handlers and delegates login requests', async () => {
    const { registerAuthHandlers } = await import('../../src/main/ipc/auth-handler')

    registerAuthHandlers()

    expect(handleMock).toHaveBeenCalledWith(IPC_CHANNELS.AUTH_LOGIN, expect.any(Function))
    expect(handleMock).toHaveBeenCalledWith(IPC_CHANNELS.AUTH_SILENT_LOGIN, expect.any(Function))
    expect(handleMock).toHaveBeenCalledTimes(8)

    const loginHandler = handleMock.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.AUTH_LOGIN
    )?.[1]

    const result = await loginHandler?.({}, { username: 'alice', password: 'secret' })

    expect(serviceMethods.login).toHaveBeenCalledWith('alice', 'secret')
    expect(withErrorHandlingMock).toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      data: { success: true, username: 'alice' }
    })
  })

  it('delegates switch user requests through the service layer', async () => {
    const { registerAuthHandlers } = await import('../../src/main/ipc/auth-handler')
    const userInfo = { id: 1, username: 'admin' }

    registerAuthHandlers()

    const switchUserHandler = handleMock.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.AUTH_SWITCH_USER
    )?.[1]

    await switchUserHandler?.({}, userInfo)

    expect(serviceMethods.switchUser).toHaveBeenCalledWith(userInfo)
  })
})
