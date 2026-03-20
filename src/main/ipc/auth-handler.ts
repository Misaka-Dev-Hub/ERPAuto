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
import { SessionManager } from '../services/user/session-manager'
import { createLogger } from '../services/logger'
import { logAudit } from '../services/logger/audit-logger'
import type { UserInfo } from '../types/user.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { ValidationError } from '../types/errors'
import { withErrorHandling, type IpcResult } from './index'
import { UpdateService } from '../services/update/update-service'

const log = createLogger('AuthHandler')

/**
 * Login request
 */
export interface LoginRequest {
  username: string
  password: string
}

/**
 * Login response
 */
export interface LoginResponse {
  success: boolean
  userInfo?: UserInfo
  error?: string
}

/**
 * Silent login response
 */
export interface SilentLoginResponse {
  success: boolean
  userInfo?: UserInfo
  requiresUserSelection?: boolean // True if admin needs to select a user
  error?: string
}

/**
 * User selection response
 */
export interface UserSelectionResponse {
  success: boolean
  userInfo?: UserInfo
  error?: string
}

/**
 * Current user response
 */
export interface CurrentUserResponse {
  isAuthenticated: boolean
  userInfo?: UserInfo
}

/**
 * Register IPC handlers for user authentication
 */
export function registerAuthHandlers(): void {
  const sessionManager = SessionManager.getInstance()
  const updateService = UpdateService.getInstance()

  /**
   * Get computer name
   */
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_COMPUTER_NAME, async (): Promise<IpcResult<string>> => {
    return withErrorHandling(async () => {
      const os = await import('os')
      return os.hostname()
    }, 'auth:getComputerName')
  })

  /**
   * Silent login by computer name
   */
  ipcMain.handle(
    IPC_CHANNELS.AUTH_SILENT_LOGIN,
    async (): Promise<IpcResult<SilentLoginResponse>> => {
      return withErrorHandling(async () => {
        log.info('Attempting silent login')
        const success = await sessionManager.loginByComputerName()
        const userInfo = sessionManager.getUserInfo()

        if (success && userInfo) {
          await updateService.setUserContext(userInfo.userType)

          // Check if admin needs user selection
          const requiresUserSelection = userInfo.userType === 'Admin'

          log.info('Silent login successful', {
            username: userInfo.username,
            userType: userInfo.userType,
            requiresUserSelection
          })

          // Audit log: LOGIN success (non-blocking)
          const os = await import('os')
          logAudit('LOGIN', String(userInfo.id), {
            username: userInfo.username,
            computerName: os.hostname(),
            resource: 'ERP_SYSTEM',
            status: 'success',
            metadata: { loginType: 'silent', userType: userInfo.userType }
          }).catch((err) => log.warn('Failed to write audit log', { err }))

          return {
            success: true,
            userInfo,
            requiresUserSelection
          }
        }

        await updateService.setUserContext(null)
        throw new ValidationError('无感登录失败：未找到匹配用户', 'VAL_INVALID_INPUT')
      }, 'auth:silentLogin')
    }
  )

  /**
   * Login with username and password
   */
  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGIN,
    async (_event, request: LoginRequest): Promise<IpcResult<LoginResponse>> => {
      return withErrorHandling(async () => {
        const { username, password } = request

        if (!username || !password) {
          log.warn('Login attempt with missing credentials')
          throw new ValidationError('请输入用户名和密码', 'VAL_MISSING_REQUIRED')
        }

        log.info('Login attempt', { username })
        const success = await sessionManager.login(username, password)
        const userInfo = sessionManager.getUserInfo()

        if (success && userInfo) {
          log.info('Login successful', { username, userType: userInfo.userType })
          await updateService.setUserContext(userInfo.userType)

          // Audit log: LOGIN success (non-blocking)
          const os = await import('os')
          logAudit('LOGIN', String(userInfo.id), {
            username: userInfo.username,
            computerName: os.hostname(),
            resource: 'ERP_SYSTEM',
            status: 'success',
            metadata: { loginType: 'credentials', userType: userInfo.userType }
          }).catch((err) => log.warn('Failed to write audit log', { err }))

          return {
            success: true,
            userInfo
          }
        }

        // Audit log: LOGIN failure (non-blocking)
        const os = await import('os')
        logAudit('LOGIN', '0', {
          username,
          computerName: os.hostname(),
          resource: 'ERP_SYSTEM',
          status: 'failure',
          metadata: { loginType: 'credentials', reason: 'invalid_credentials' }
        }).catch((err) => log.warn('Failed to write audit log', { err }))

        log.warn('Login failed - invalid credentials', { username })
        await updateService.setUserContext(null)
        throw new ValidationError('用户名或密码错误', 'VAL_INVALID_INPUT')
      }, 'auth:login')
    }
  )

  /**
   * Logout
   */
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (): Promise<IpcResult<void>> => {
    return withErrorHandling(async () => {
      const userInfo = sessionManager.getUserInfo()
      log.info('User logout', { username: userInfo?.username })

      // Audit log: LOGOUT (non-blocking)
      if (userInfo) {
        const os = await import('os')
        logAudit('LOGOUT', String(userInfo.id), {
          username: userInfo.username,
          computerName: os.hostname(),
          resource: 'ERP_SYSTEM',
          status: 'success',
          metadata: { userType: userInfo.userType }
        }).catch((err) => log.warn('Failed to write audit log', { err }))
      }

      sessionManager.logout()
      await updateService.setUserContext(null)
    }, 'auth:logout')
  })

  /**
   * Get current user
   */
  ipcMain.handle(
    IPC_CHANNELS.AUTH_GET_CURRENT_USER,
    async (): Promise<IpcResult<CurrentUserResponse>> => {
      return withErrorHandling(async () => {
        const isAuthenticated = sessionManager.isAuthenticated()
        const userInfo = sessionManager.getUserInfo()
        return {
          isAuthenticated,
          userInfo: userInfo ?? undefined
        }
      }, 'auth:getCurrentUser')
    }
  )

  /**
   * Get all users (for admin user selection)
   */
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_ALL_USERS, async (): Promise<IpcResult<UserInfo[]>> => {
    return withErrorHandling(async () => {
      log.debug('Fetching all users for admin selection')
      return await sessionManager.getAllUsers()
    }, 'auth:getAllUsers')
  })

  /**
   * Switch user (admin only)
   */
  ipcMain.handle(
    IPC_CHANNELS.AUTH_SWITCH_USER,
    async (_event, userInfo: UserInfo): Promise<IpcResult<UserSelectionResponse>> => {
      return withErrorHandling(async () => {
        log.info('User switch attempt', { targetUser: userInfo.username })
        const success = sessionManager.switchUser(userInfo)

        if (success) {
          const newUser = sessionManager.getUserInfo()
          log.info('User switch successful', { newUsername: newUser?.username })
          await updateService.setUserContext(newUser?.userType ?? null)
          return {
            success: true,
            userInfo: newUser ?? undefined
          }
        }

        log.warn('User switch failed')
        throw new ValidationError('用户切换失败', 'VAL_INVALID_INPUT')
      }, 'auth:switchUser')
    }
  )

  /**
   * Check if current user is admin
   */
  ipcMain.handle(IPC_CHANNELS.AUTH_IS_ADMIN, async (): Promise<IpcResult<boolean>> => {
    return withErrorHandling(async () => sessionManager.isAdmin(), 'auth:isAdmin')
  })
}
