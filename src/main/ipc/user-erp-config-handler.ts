/**
 * IPC handlers for User ERP Configuration
 *
 * Provides APIs for the renderer process to:
 * - Get current user's ERP credentials
 * - Update current user's ERP credentials
 * - Test ERP connection with provided credentials
 */

import { ipcMain } from 'electron'
import { UserErpConfigService, type ErpCredentials } from '../services/user/user-erp-config-service'
import { ErpAuthService } from '../services/erp/erp-auth'
import { ConfigManager } from '../services/config/config-manager'
import { createLogger } from '../services/logger'
import type { UserInfo } from '../types/user.types'

const log = createLogger('UserErpConfigHandler')

/**
 * ERP Credentials request (username and password only, URL is from config.yaml)
 */
export interface ErpCredentialsRequest {
  username: string
  password: string
}

/**
 * ERP Configuration response (includes URL from config.yaml)
 */
export interface ErpConfigResponse {
  success: boolean
  config?: {
    url: string
    username: string
    password: string
  }
  error?: string
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean
  message?: string
}

/**
 * Register IPC handlers for user ERP configuration
 */
export function registerUserErpConfigHandlers(): void {
  const erpConfigService = UserErpConfigService.getInstance()

  /**
   * Get current user's ERP credentials
   */
  ipcMain.handle('user-erp-config:getCurrent', async (): Promise<ErpConfigResponse> => {
    try {
      log.info('Fetching current user ERP credentials')
      const credentials = await erpConfigService.getCurrentUserErpConfig()

      if (!credentials) {
        return {
          success: false,
          error: '未找到 ERP 配置。请先配置 ERP 账号和密码。'
        }
      }

      // Get ERP URL from config.yaml (fixed for all users)
      const configManager = ConfigManager.getInstance()
      const globalConfig = configManager.getConfig()
      const erpUrl = globalConfig.erp.url

      return {
        success: true,
        config: {
          url: erpUrl,
          username: credentials.username,
          password: credentials.password
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('Get current user ERP credentials failed', { error: message })
      return {
        success: false,
        error: `获取 ERP 配置失败：${message}`
      }
    }
  })

  /**
   * Update current user's ERP credentials
   */
  ipcMain.handle(
    'user-erp-config:update',
    async (_event, credentials: ErpCredentialsRequest): Promise<ErpConfigResponse> => {
      try {
        log.info('Updating current user ERP credentials', {
          username: credentials.username
        })

        const success = await erpConfigService.updateCurrentUserErpConfig(credentials)

        if (success) {
          log.info('ERP credentials updated successfully')
          // Get ERP URL from config.yaml to return full config
          const configManager = ConfigManager.getInstance()
          const globalConfig = configManager.getConfig()
          const erpUrl = globalConfig.erp.url

          return {
            success: true,
            config: {
              url: erpUrl,
              username: credentials.username,
              password: credentials.password
            }
          }
        } else {
          log.error('Failed to update ERP credentials')
          return {
            success: false,
            error: '更新 ERP 配置失败'
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Update ERP credentials failed', { error: message })
        return {
          success: false,
          error: `更新 ERP 配置失败：${message}`
        }
      }
    }
  )

  /**
   * Test ERP connection with provided credentials
   */
  ipcMain.handle(
    'user-erp-config:testConnection',
    async (_event, credentials: ErpCredentialsRequest): Promise<ConnectionTestResult> => {
      try {
        log.info('Testing ERP connection', { username: credentials.username })

        if (!credentials.username || !credentials.password) {
          return {
            success: false,
            message: 'ERP 配置不完整，请确保用户名和密码都已填写'
          }
        }

        // Get ERP URL from config.yaml (fixed for all users)
        const configManager = ConfigManager.getInstance()
        const globalConfig = configManager.getConfig()
        const erpUrl = globalConfig.erp.url

        const authService = new ErpAuthService({
          url: erpUrl,
          username: credentials.username,
          password: credentials.password,
          headless: true
        })

        try {
          await authService.login()
          await authService.close()

          log.info('ERP connection test successful')
          return {
            success: true,
            message: 'ERP 连接测试成功'
          }
        } catch (error) {
          await authService.close().catch(() => {})
          throw error
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('ERP connection test failed', { error: message })
        return {
          success: false,
          message: `ERP 连接测试失败：${message}`
        }
      }
    }
  )

  /**
   * Get all users' ERP configurations (admin only)
   */
  ipcMain.handle(
    'user-erp-config:getAll',
    async (): Promise<
      Array<{
        username: string
        erpUrl: string
        erpUsername: string
      }>
    > => {
      try {
        log.info('Fetching all users ERP config')
        const configs = await erpConfigService.getAllUsersErpConfig()
        log.info('Retrieved ERP configs for all users', { count: configs.length })
        return configs
      } catch (error) {
        log.error('Get all users ERP config failed', { error })
        return []
      }
    }
  )
}
