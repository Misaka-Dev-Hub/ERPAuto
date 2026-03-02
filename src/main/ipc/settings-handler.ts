/**
 * Settings IPC Handler
 *
 * Provides IPC handlers for settings management:
 * - Get/set settings
 * - Reset to defaults
 * - Test ERP connection
 * - Test database connection
 */

import { ipcMain } from 'electron'
import { ConfigManager } from '../services/config/config-manager'
import { SessionManager } from '../services/user/session-manager'
import { ErpAuthService } from '../services/erp/erp-auth'
import { MySqlService } from '../services/database/mysql'
import { SqlServerService } from '../services/database/sql-server'
import { createLogger } from '../services/logger'
import type {
  SettingsData,
  UserType,
  ConnectionTestResult,
  SaveSettingsResult
} from '../types/settings.types'

const log = createLogger('SettingsHandler')

/**
 * Filter settings by user type
 * Admin users get all settings, User users get limited settings
 */
function filterSettingsByUserType(settings: SettingsData, userType: UserType): SettingsData {
  if (userType === 'Admin') {
    return settings // Return all settings for Admin
  }

  // User users get limited settings
  return {
    erp: {
      username: settings.erp.username,
      password: settings.erp.password,
      headless: settings.erp.headless,
      url: settings.erp.url,
      ignoreHttpsErrors: settings.erp.ignoreHttpsErrors,
      autoCloseBrowser: settings.erp.autoCloseBrowser
    },
    paths: settings.paths,
    execution: settings.execution,
    // Include minimal required fields for other sections
    database: settings.database,
    extraction: settings.extraction,
    validation: settings.validation,
    ui: settings.ui
  }
}

/**
 * Register IPC handlers for settings management
 */
export function registerSettingsHandlers(): void {
  const configManager = ConfigManager.getInstance()
  const sessionManager = SessionManager.getInstance()

  /**
   * Get current user type
   */
  ipcMain.handle('settings:getUserType', async (): Promise<UserType> => {
    return (sessionManager.getUserType() as UserType) || 'Guest'
  })

  /**
   * Get settings (filtered by user type)
   */
  ipcMain.handle('settings:getSettings', async (): Promise<SettingsData> => {
    const userType = (sessionManager.getUserType() as UserType) || 'Guest'
    log.debug('Getting settings', { userType })
    const settings = configManager.getAllSettings()
    return filterSettingsByUserType(settings, userType)
  })

  /**
   * Save settings
   */
  ipcMain.handle(
    'settings:saveSettings',
    async (_event, settings: SettingsData): Promise<SaveSettingsResult> => {
      try {
        log.info('Saving settings')
        const success = await configManager.saveAllSettings(settings)
        if (success) {
          log.info('Settings saved successfully')
          return { success: true }
        } else {
          log.warn('Failed to save settings')
          return { success: false, error: '保存设置失败' }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Error saving settings', { error: message })
        return { success: false, error: `保存设置失败：${message}` }
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
      configManager.resetToDefaults()
      const success = await configManager.save()
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
   * Test ERP connection
   */
  ipcMain.handle('settings:testErpConnection', async (): Promise<ConnectionTestResult> => {
    try {
      log.info('Testing ERP connection')
      const settings = configManager.getAllSettings()
      const erpConfig = settings.erp

      if (!erpConfig.url || !erpConfig.username || !erpConfig.password) {
        log.warn('ERP connection test failed - missing configuration')
        return {
          success: false,
          message: '请先配置 ERP URL、用户名和密码'
        }
      }

      // Create ERP auth service and try to login
      const erpAuthService = new ErpAuthService(erpConfig)

      try {
        await erpAuthService.login()
        // Login successful, close browser
        await erpAuthService.close()
        log.info('ERP connection test successful')
        return {
          success: true,
          message: 'ERP 连接测试成功！'
        }
      } catch (loginError) {
        const errorMessage = loginError instanceof Error ? loginError.message : '登录失败'
        log.error('ERP login failed', { error: errorMessage })
        return {
          success: false,
          message: `ERP 连接测试失败：${errorMessage}`
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('ERP connection test error', { error: message })
      return {
        success: false,
        message: `ERP 连接测试失败：${message}`
      }
    }
  })

  /**
   * Test database connection
   */
  ipcMain.handle('settings:testDbConnection', async (): Promise<ConnectionTestResult> => {
    try {
      log.info('Testing database connection')
      const settings = configManager.getAllSettings()
      const dbConfig = settings.database

      if (dbConfig.dbType === 'mysql') {
        // Test MySQL connection
        if (!dbConfig.mysqlHost || !dbConfig.database || !dbConfig.username) {
          log.warn('MySQL connection test failed - missing configuration')
          return {
            success: false,
            message: '请先配置 MySQL 主机、数据库名和用户名'
          }
        }

        const mysqlService = new MySqlService({
          host: dbConfig.mysqlHost,
          port: dbConfig.mysqlPort,
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
        if (!dbConfig.server || !dbConfig.database || !dbConfig.username) {
          log.warn('SQL Server connection test failed - missing configuration')
          return {
            success: false,
            message: '请先配置 SQL Server 服务器、数据库名和用户名'
          }
        }

        const sqlServerService = new SqlServerService({
          server: dbConfig.server,
          port: 1433, // Default SQL Server port
          user: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          options: {
            trustServerCertificate: true
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
