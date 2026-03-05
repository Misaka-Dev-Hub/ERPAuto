/**
 * IPC handlers for User ERP Configuration
 *
 * Provides APIs for the renderer process to:
 * - Get current user's ERP configuration
 * - Update current user's ERP configuration
 * - Test ERP connection with provided credentials
 */

import { ipcMain } from 'electron'
import { UserErpConfigService } from '../services/user/user-erp-config-service'
import { ErpAuthService } from '../services/erp/erp-auth'
import { createLogger } from '../services/logger'
import type { UserInfo } from '../types/user.types'

const log = createLogger('UserErpConfigHandler')

/**
 * ERP Configuration request
 */
export interface ErpConfigRequest {
  url: string
  username: string
  password: string
}

/**
 * ERP Configuration response
 */
export interface ErpConfigResponse {
  success: boolean
  config?: ErpConfigRequest
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
   * Get current user's ERP configuration
   */
  ipcMain.handle('user-erp-config:getCurrent', async (): Promise<ErpConfigResponse> => {
    try {
      log.info('Fetching current user ERP config')
      const config = await erpConfigService.getCurrentUserErpConfig()

      if (!config) {
        return {
          success: false,
          error: '未找到 ERP 配置。请先配置 ERP 连接参数。'
        }
      }

      return {
        success: true,
        config: {
          url: config.url,
          username: config.username,
          password: config.password
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('Get current user ERP config failed', { error: message })
      return {
        success: false,
        error: `获取 ERP 配置失败：${message}`
      }
    }
  })

  /**
   * Update current user's ERP configuration
   */
  ipcMain.handle(
    'user-erp-config:update',
    async (_event, config: ErpConfigRequest): Promise<ErpConfigResponse> => {
      try {
        log.info('Updating current user ERP config', {
          url: config.url,
          username: config.username
        })

        const success = await erpConfigService.updateCurrentUserErpConfig(config)

        if (success) {
          log.info('ERP config updated successfully')
          return {
            success: true,
            config
          }
        } else {
          log.error('Failed to update ERP config')
          return {
            success: false,
            error: '更新 ERP 配置失败'
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Update ERP config failed', { error: message })
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
    async (_event, config: ErpConfigRequest): Promise<ConnectionTestResult> => {
      try {
        log.info('Testing ERP connection', { url: config.url, username: config.username })

        if (!config.url || !config.username || !config.password) {
          return {
            success: false,
            message: 'ERP 配置不完整，请确保 URL、用户名和密码都已填写'
          }
        }

        const authService = new ErpAuthService({
          url: config.url,
          username: config.username,
          password: config.password,
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
