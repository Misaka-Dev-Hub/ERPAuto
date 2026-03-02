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
import type { UserInfo } from '../types/user.types'

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

  /**
   * Get computer name
   */
  ipcMain.handle('auth:getComputerName', async (): Promise<string> => {
    const os = await import('os')
    return os.hostname()
  })

  /**
   * Silent login by computer name
   */
  ipcMain.handle('auth:silentLogin', async (): Promise<SilentLoginResponse> => {
    try {
      log.info('Attempting silent login')
      const success = await sessionManager.loginByComputerName()
      const userInfo = sessionManager.getUserInfo()

      if (success && userInfo) {
        // Check if admin needs user selection
        const requiresUserSelection = userInfo.userType === 'Admin'

        log.info('Silent login successful', {
          username: userInfo.username,
          userType: userInfo.userType,
          requiresUserSelection
        })

        return {
          success: true,
          userInfo,
          requiresUserSelection
        }
      }

      log.warn('Silent login failed - no matching user')
      return {
        success: false,
        requiresUserSelection: false
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('Silent login error', { error: message })
      return {
        success: false,
        error: `无感登录失败：${message}`
      }
    }
  })

  /**
   * Login with username and password
   */
  ipcMain.handle('auth:login', async (_event, request: LoginRequest): Promise<LoginResponse> => {
    try {
      const { username, password } = request

      if (!username || !password) {
        log.warn('Login attempt with missing credentials')
        return {
          success: false,
          error: '请输入用户名和密码'
        }
      }

      log.info('Login attempt', { username })
      const success = await sessionManager.login(username, password)
      const userInfo = sessionManager.getUserInfo()

      if (success && userInfo) {
        log.info('Login successful', { username, userType: userInfo.userType })
        return {
          success: true,
          userInfo
        }
      }

      log.warn('Login failed - invalid credentials', { username })
      return {
        success: false,
        error: '用户名或密码错误'
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('Login error', { error: message })
      return {
        success: false,
        error: `登录失败：${message}`
      }
    }
  })

  /**
   * Logout
   */
  ipcMain.handle('auth:logout', async (): Promise<void> => {
    const userInfo = sessionManager.getUserInfo()
    log.info('User logout', { username: userInfo?.username })
    sessionManager.logout()
  })

  /**
   * Get current user
   */
  ipcMain.handle('auth:getCurrentUser', async (): Promise<CurrentUserResponse> => {
    const isAuthenticated = sessionManager.isAuthenticated()
    const userInfo = sessionManager.getUserInfo()

    return {
      isAuthenticated,
      userInfo: userInfo ?? undefined
    }
  })

  /**
   * Get all users (for admin user selection)
   */
  ipcMain.handle('auth:getAllUsers', async (): Promise<UserInfo[]> => {
    log.debug('Fetching all users for admin selection')
    return await sessionManager.getAllUsers()
  })

  /**
   * Switch user (admin only)
   */
  ipcMain.handle(
    'auth:switchUser',
    async (_event, userInfo: UserInfo): Promise<UserSelectionResponse> => {
      try {
        log.info('User switch attempt', { targetUser: userInfo.username })
        const success = sessionManager.switchUser(userInfo)

        if (success) {
          const newUser = sessionManager.getUserInfo()
          log.info('User switch successful', { newUsername: newUser?.username })
          return {
            success: true,
            userInfo: newUser ?? undefined
          }
        }

        log.warn('User switch failed')
        return {
          success: false,
          error: '用户切换失败'
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('User switch error', { error: message })
        return {
          success: false,
          error: `用户切换失败：${message}`
        }
      }
    }
  )

  /**
   * Check if current user is admin
   */
  ipcMain.handle('auth:isAdmin', async (): Promise<boolean> => {
    return sessionManager.isAdmin()
  })
}
