import { ipcMain } from 'electron'
import { ConfigManager } from '../services/config/config-manager'
import { SessionManager } from '../services/user/session-manager'
import { UserErpConfigService } from '../services/user/user-erp-config-service'
import { MySqlService } from '../services/database/mysql'
import { SqlServerService } from '../services/database/sql-server'
import { createLogger } from '../services/logger'
import { logAudit } from '../services/logger/audit-logger'
import type { UserType, ConnectionTestResult, SaveSettingsResult } from '../types/settings.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { ValidationError } from '../types/errors'
import { withErrorHandling, type IpcResult } from './index'
import type { CleanerConfig } from '../types/config.schema'

const log = createLogger('SettingsHandler')

type ErpSettingsPayload = {
  erp?: {
    username?: string
    password?: string
  }
}

export function registerSettingsHandlers(): void {
  const configManager = ConfigManager.getInstance()
  const sessionManager = SessionManager.getInstance()
  const erpConfigService = UserErpConfigService.getInstance()

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_USER_TYPE, async (): Promise<IpcResult<UserType>> => {
    return withErrorHandling(async () => {
      const userType = sessionManager.getUserType()
      if (!userType) {
        throw new ValidationError('未找到用户类型', 'VAL_INVALID_INPUT')
      }
      return userType as UserType
    }, 'settings:getUserType')
  })

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_SETTINGS,
    async (): Promise<IpcResult<{ erp: { username: string; password: string } }>> => {
      return withErrorHandling(async () => {
        const userErpConfig = await erpConfigService.getCurrentUserErpConfig()
        return {
          erp: {
            username: userErpConfig?.username || '',
            password: userErpConfig?.password || ''
          }
        }
      }, 'settings:getSettings')
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE_SETTINGS,
    async (_event, settings: ErpSettingsPayload): Promise<IpcResult<SaveSettingsResult>> => {
      return withErrorHandling(async () => {
        if (settings.erp) {
          const currentUser = sessionManager.getUserInfo()
          if (!currentUser) {
            throw new ValidationError('未找到当前用户', 'VAL_INVALID_INPUT')
          }

          await erpConfigService.updateCurrentUserErpConfig({
            username: settings.erp.username || '',
            password: settings.erp.password || ''
          })

          // Audit log: SETTINGS_CHANGE (non-blocking)
          const os = await import('os')
          logAudit('SETTINGS_CHANGE', String(currentUser.id), {
            username: currentUser.username,
            computerName: os.hostname(),
            resource: 'ERP_CONFIG',
            status: 'success',
            metadata: { changeType: 'erp_credentials', usernameChanged: !!settings.erp.username }
          }).catch((err) => log.warn('Failed to write audit log', { err }))
        }

        return { success: true }
      }, 'settings:saveSettings')
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RESET_DEFAULTS,
    async (): Promise<IpcResult<SaveSettingsResult>> => {
      return withErrorHandling(async () => {
        const userType = sessionManager.getUserType()
        if (userType !== 'Admin') {
          throw new ValidationError('只有管理员可以恢复默认设置', 'VAL_INVALID_INPUT')
        }

        const success = await configManager.resetToDefaults()
        if (!success) {
          throw new ValidationError('恢复默认设置失败', 'VAL_INVALID_INPUT')
        }

        return { success: true }
      }, 'settings:resetDefaults')
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_TEST_DB_CONNECTION,
    async (): Promise<IpcResult<ConnectionTestResult>> => {
      return withErrorHandling(async () => {
        log.info('Testing database connection')
        const config = configManager.getConfig()
        const dbType = config.database.activeType

        if (dbType === 'mysql') {
          const dbConfig = config.database.mysql
          if (!dbConfig.host || !dbConfig.database || !dbConfig.username) {
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
            return {
              success: true,
              message: 'MySQL 数据库连接测试成功！'
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : '连接失败'
            return {
              success: false,
              message: `MySQL 数据库连接测试失败：${message}`
            }
          }
        }

        const dbConfig = config.database.sqlserver
        if (!dbConfig.server || !dbConfig.database || !dbConfig.username) {
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
          return {
            success: true,
            message: 'SQL Server 数据库连接测试成功！'
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '连接失败'
          return {
            success: false,
            message: `SQL Server 数据库连接测试失败：${message}`
          }
        }
      }, 'settings:testDbConnection')
    }
  )

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_CLEANER, async (): Promise<IpcResult<CleanerConfig>> => {
    return withErrorHandling(async () => {
      const configManager = ConfigManager.getInstance()
      const config = configManager.getConfig()
      return config.cleaner
    }, 'config:getCleaner')
  })

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_UPDATE_CLEANER,
    async (_event, updates: Partial<CleanerConfig>): Promise<IpcResult<CleanerConfig>> => {
      return withErrorHandling(async () => {
        const configManager = ConfigManager.getInstance()
        const result = await configManager.updateConfig({ cleaner: updates as CleanerConfig })
        if (!result.success) {
          throw new Error(result.error)
        }
        return configManager.getConfig().cleaner
      }, 'config:updateCleaner')
    }
  )
}
