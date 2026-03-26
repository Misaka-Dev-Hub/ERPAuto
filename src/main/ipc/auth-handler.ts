/**
 * IPC handlers for User Authentication
 *
 * Provides APIs for the renderer process to:
 * - Login with username and password
 * - Silent login by computer name
 * - Logout
 * - Get current user info
 * - Get all users (for admin user selection)
 * - Switch user (admin only)
 */

import { ipcMain } from 'electron'
import type { UserInfo } from '../types/user.types'
import type {
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  SilentLoginResponse,
  UserSelectionResponse
} from '../types/auth-ipc.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { withErrorHandling, type IpcResult } from './index'
import { AuthApplicationService } from '../services/auth/auth-application-service'

/**
 * Register IPC handlers for user authentication
 */
export function registerAuthHandlers(): void {
  const authService = new AuthApplicationService()

  ipcMain.handle(IPC_CHANNELS.AUTH_GET_COMPUTER_NAME, async (): Promise<IpcResult<string>> => {
    return withErrorHandling(async () => authService.getComputerName(), 'auth:getComputerName')
  })

  ipcMain.handle(
    IPC_CHANNELS.AUTH_SILENT_LOGIN,
    async (): Promise<IpcResult<SilentLoginResponse>> => {
      return withErrorHandling(async () => authService.silentLogin(), 'auth:silentLogin')
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGIN,
    async (_event, request: LoginRequest): Promise<IpcResult<LoginResponse>> => {
      return withErrorHandling(
        async () => authService.login(request.username, request.password),
        'auth:login'
      )
    }
  )

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (): Promise<IpcResult<void>> => {
    return withErrorHandling(async () => authService.logout(), 'auth:logout')
  })

  ipcMain.handle(
    IPC_CHANNELS.AUTH_GET_CURRENT_USER,
    async (): Promise<IpcResult<CurrentUserResponse>> => {
      return withErrorHandling(async () => authService.getCurrentUser(), 'auth:getCurrentUser')
    }
  )

  ipcMain.handle(IPC_CHANNELS.AUTH_GET_ALL_USERS, async (): Promise<IpcResult<UserInfo[]>> => {
    return withErrorHandling(async () => authService.getAllUsers(), 'auth:getAllUsers')
  })

  ipcMain.handle(
    IPC_CHANNELS.AUTH_SWITCH_USER,
    async (_event, userInfo: UserInfo): Promise<IpcResult<UserSelectionResponse>> => {
      return withErrorHandling(async () => authService.switchUser(userInfo), 'auth:switchUser')
    }
  )

  ipcMain.handle(IPC_CHANNELS.AUTH_IS_ADMIN, async (): Promise<IpcResult<boolean>> => {
    return withErrorHandling(async () => authService.isAdmin(), 'auth:isAdmin')
  })
}
