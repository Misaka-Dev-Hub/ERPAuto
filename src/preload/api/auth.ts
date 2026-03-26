import type { LoginRequest } from '../../main/types/auth-ipc.types'
import type { UserInfo } from '../../main/types/user.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { invokeIpc } from '../lib/ipc'

export const authApi = {
  getComputerName: () => invokeIpc(IPC_CHANNELS.AUTH_GET_COMPUTER_NAME),
  silentLogin: () => invokeIpc(IPC_CHANNELS.AUTH_SILENT_LOGIN),
  login: (request: LoginRequest) => invokeIpc(IPC_CHANNELS.AUTH_LOGIN, request),
  logout: () => invokeIpc(IPC_CHANNELS.AUTH_LOGOUT),
  getCurrentUser: () => invokeIpc(IPC_CHANNELS.AUTH_GET_CURRENT_USER),
  getAllUsers: () => invokeIpc(IPC_CHANNELS.AUTH_GET_ALL_USERS),
  switchUser: (userInfo: UserInfo) => invokeIpc(IPC_CHANNELS.AUTH_SWITCH_USER, userInfo),
  isAdmin: () => invokeIpc(IPC_CHANNELS.AUTH_IS_ADMIN)
} as const
