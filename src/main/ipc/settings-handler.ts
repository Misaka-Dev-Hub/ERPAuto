/**
 * Settings IPC Handler
 *
 * Provides IPC handlers for settings management:
 * - Get/set ERP credentials (stored in database per user)
 * - Reset to defaults (Admin only)
 * - Test database connection
 *
 * Note: ERP configuration is stored in database (dbo_BIPUsers table)
 * and managed per-user via UserErpConfigService.
 * Other settings (database, paths, etc.) are managed via config.yaml
 */

import { ipcMain } from 'electron'
import { ConfigManager } from '../services/config/config-manager'
import { SessionManager } from '../services/user/session-manager'
import { UserErpConfigService } from '../services/user/user-erp-config-service'
import { MySqlService } from '../services/database/mysql'
import { SqlServerService } from '../services/database/sql-server'
import { createLogger } from '../services/logger'
import type { UserType, ConnectionTestResult, SaveSettingsResult } from '../types/settings.types'

const log = createLogger('SettingsHandler')

/**
 * Register IPC handlers for settings management
 */
export function registerSettingsHandlers(): void {
  const configManager = ConfigManager.getInstance()
  const sessionManager = SessionManager.getInstance()
  const erpConfigService = UserErpConfigService.getInstance()

  /**
   * Get current user type
   */
  ipcMain.handle('settings:getUserType', async (): Promise<UserType> => {
    return (sessionManager.getUserType() as UserType) || 'Guest'
  })

  /**
   * Get ERP credentials for current user
   */
  ipcMain.handle('settings:getSettings', async (): Promise<any> => {
    try {
      // Get ERP credentials from database for current user
      const userErpConfig = await erpConfigService.getCurrentUserErpConfig()

      return {
        erp: {
          username: userErpConfig?.username || '',
          password: userErpConfig?.password || ''
        }
      }
    } catch (error) {
      log.error('Failed to get ERP credentials', { error })
      return { erp: { username: '', password: '' } }
    }
  })

  /**
   * Save ERP credentials for current user
   */
  ipcMain.handle(
    'settings:saveSettings',
    async (_event, settings: any): Promise<SaveSettingsResult> => {
      try {
        log.info('Saving ERP credentials')

        if (settings.erp) {
          // Update ERP credentials in database for current user
          const currentUser = sessionManager.getUserInfo()
          if (!currentUser) {
            return { success: false, error: '未找到当前用户' }
          }

          // Ensure undefined values are converted to empty strings
          const erpCredentials = {
            username: settings.erp.username || '',
            password: settings.erp.password || ''
          }

          await erpConfigService.updateCurrentUserErpConfig(erpCredentials)

          log.info('ERP credentials saved successfully')
        }

        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Error saving ERP credentials', { error: message })
        return { success: false, error: `保存配置失败：${message}` }
      }
    }
  )

  /**
   * Reset to default settings (Admin only)
   */
  ipcMain.handle('settings:resetDefaults', async (): Promise<SaveSettingsResult> => {
    try {
      const userType = sessionManager.getUserType()
      if (userType !== 'Admin') {
        log.warn('Non-admin user attempted to reset defaults', { userType })
        return { success: false, error: '只有管理员可以恢复默认设置' }
      }

      log.info('Resetting settings to defaults')
      const success = await configManager.resetToDefaults()
      if (success) {
        log.info('Settings reset to defaults successfully')
        return { success: true }
      } else {
        log.warn('Failed to reset settings to defaults')
        return { success: false, error: '恢复默认设置失败' }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('Error resetting settings', { error: message })
      return { success: false, error: `恢复默认设置失败：${message}` }
    }
  })

  /**
   * Test database connection
   */
  ipcMain.handle('settings:testDbConnection', async (): Promise<ConnectionTestResult> => {
    try {
      log.info('Testing database connection')
      const config = configManager.getConfig()
      const dbType = config.database.activeType

      if (dbType === 'mysql') {
        // Test MySQL connection
        const dbConfig = config.database.mysql
        if (!dbConfig.host || !dbConfig.database || !dbConfig.username) {
          log.warn('MySQL connection test failed - missing configuration')
          return {
            success: false,
            message: '请先配置 MySQL 主机、数据库名和用户名'
          }
        }

        const mysqlService = new MySqlService({
          host: dbConfig.host,
          port: dbConfig.port,
          user: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database
        })

        try {
          await mysqlService.connect()
          await mysqlService.disconnect()
          log.info('MySQL connection test successful')
          return {
            success: true,
            message: 'MySQL 数据库连接测试成功！'
          }
        } catch (connError) {
          const errorMessage = connError instanceof Error ? connError.message : '连接失败'
          log.error('MySQL connection failed', { error: errorMessage })
          return {
            success: false,
            message: `MySQL 数据库连接测试失败：${errorMessage}`
          }
        }
      } else {
        // Test SQL Server connection
        const dbConfig = config.database.sqlserver
        if (!dbConfig.server || !dbConfig.database || !dbConfig.username) {
          log.warn('SQL Server connection test failed - missing configuration')
          return {
            success: false,
            message: '请先配置 SQL Server 服务器、数据库名和用户名'
          }
        }

        const sqlServerService = new SqlServerService({
          server: dbConfig.server,
          port: dbConfig.port,
          user: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          options: {
            trustServerCertificate: dbConfig.trustServerCertificate
          }
        })

        try {
          await sqlServerService.connect()
          await sqlServerService.disconnect()
          log.info('SQL Server connection test successful')
          return {
            success: true,
            message: 'SQL Server 数据库连接测试成功！'
          }
        } catch (connError) {
          const errorMessage = connError instanceof Error ? connError.message : '连接失败'
          log.error('SQL Server connection failed', { error: errorMessage })
          return {
            success: false,
            message: `SQL Server 数据库连接测试失败：${errorMessage}`
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('Database connection test error', { error: message })
      return {
        success: false,
        message: `数据库连接测试失败：${message}`
      }
    }
  })
}
