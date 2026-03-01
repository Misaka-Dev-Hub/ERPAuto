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
import type {
  SettingsData,
  UserType,
  ConnectionTestResult,
  SaveSettingsResult
} from '../types/settings.types'

/**
 * Filter settings by user type
 * Admin users get all settings, User users get limited settings
 */
function filterSettingsByUserType(
  settings: SettingsData,
  userType: UserType
): SettingsData {
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
        const success = await configManager.saveAllSettings(settings)
        if (success) {
          return { success: true }
        } else {
          return { success: false, error: '保存设置失败' }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: `保存设置失败：${message}` }
      }
    }
  )

  /**
   * Reset to default settings (Admin only)
   */
  ipcMain.handle(
    'settings:resetDefaults',
    async (): Promise<SaveSettingsResult> => {
      try {
        const userType = sessionManager.getUserType()
        if (userType !== 'Admin') {
          return { success: false, error: '只有管理员可以恢复默认设置' }
        }

        configManager.resetToDefaults()
        const success = await configManager.save()
        if (success) {
          return { success: true }
        } else {
          return { success: false, error: '恢复默认设置失败' }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: `恢复默认设置失败：${message}` }
      }
    }
  )

  /**
   * Test ERP connection
   */
  ipcMain.handle(
    'settings:testErpConnection',
    async (): Promise<ConnectionTestResult> => {
      try {
        const settings = configManager.getAllSettings()
        const erpConfig = settings.erp

        if (!erpConfig.url || !erpConfig.username || !erpConfig.password) {
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
          return {
            success: true,
            message: 'ERP 连接测试成功！'
          }
        } catch (loginError) {
          const errorMessage = loginError instanceof Error ? loginError.message : '登录失败'
          return {
            success: false,
            message: `ERP 连接测试失败：${errorMessage}`
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return {
          success: false,
          message: `ERP 连接测试失败：${message}`
        }
      }
    }
  )

  /**
   * Test database connection
   */
  ipcMain.handle(
    'settings:testDbConnection',
    async (): Promise<ConnectionTestResult> => {
      try {
        const settings = configManager.getAllSettings()
        const dbConfig = settings.database

        if (dbConfig.dbType === 'mysql') {
          // Test MySQL connection
          if (!dbConfig.mysqlHost || !dbConfig.database || !dbConfig.username) {
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
            return {
              success: true,
              message: 'MySQL 数据库连接测试成功！'
            }
          } catch (connError) {
            const errorMessage = connError instanceof Error ? connError.message : '连接失败'
            return {
              success: false,
              message: `MySQL 数据库连接测试失败：${errorMessage}`
            }
          }
        } else {
          // Test SQL Server connection
          if (!dbConfig.server || !dbConfig.database || !dbConfig.username) {
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
            return {
              success: true,
              message: 'SQL Server 数据库连接测试成功！'
            }
          } catch (connError) {
            const errorMessage = connError instanceof Error ? connError.message : '连接失败'
            return {
              success: false,
              message: `SQL Server 数据库连接测试失败：${errorMessage}`
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return {
          success: false,
          message: `数据库连接测试失败：${message}`
        }
      }
    }
  )
}
