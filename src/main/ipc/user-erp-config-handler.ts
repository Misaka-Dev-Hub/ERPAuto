import { ipcMain } from 'electron'
import { UserErpConfigService } from '../services/user/user-erp-config-service'
import { ErpAuthService } from '../services/erp/erp-auth'
import { ConfigManager } from '../services/config/config-manager'
import { createLogger } from '../services/logger'
import { SessionManager } from '../services/user/session-manager'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { ValidationError } from '../types/errors'
import { withErrorHandling, type IpcResult } from './index'

const log = createLogger('UserErpConfigHandler')

export interface ErpCredentialsRequest {
  username: string
  password: string
}

export interface ErpConfigResponse {
  success: boolean
  config?: {
    url: string
    username: string
    password: string
  }
  error?: string
}

export interface ConnectionTestResult {
  success: boolean
  message?: string
}

export function registerUserErpConfigHandlers(): void {
  const erpConfigService = UserErpConfigService.getInstance()
  const sessionManager = SessionManager.getInstance()

  ipcMain.handle(
    IPC_CHANNELS.USER_ERP_CONFIG_GET_CURRENT,
    async (): Promise<IpcResult<ErpConfigResponse>> => {
      return withErrorHandling(async () => {
        log.info('Fetching current user ERP credentials')
        const credentials = await erpConfigService.getCurrentUserErpConfig()

        if (!credentials) {
          throw new ValidationError('未找到 ERP 配置。请先配置 ERP 账号和密码。', 'VAL_INVALID_INPUT')
        }

        const configManager = ConfigManager.getInstance()
        const globalConfig = configManager.getConfig()

        return {
          success: true,
          config: {
            url: globalConfig.erp.url,
            username: credentials.username,
            password: credentials.password
          }
        }
      }, 'user-erp-config:getCurrent')
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.USER_ERP_CONFIG_UPDATE,
    async (_event, credentials: ErpCredentialsRequest): Promise<IpcResult<ErpConfigResponse>> => {
      return withErrorHandling(async () => {
        const updated = await erpConfigService.updateCurrentUserErpConfig(credentials)
        if (!updated) {
          throw new ValidationError('更新 ERP 配置失败', 'VAL_INVALID_INPUT')
        }

        const configManager = ConfigManager.getInstance()
        const globalConfig = configManager.getConfig()

        return {
          success: true,
          config: {
            url: globalConfig.erp.url,
            username: credentials.username,
            password: credentials.password
          }
        }
      }, 'user-erp-config:update')
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.USER_ERP_CONFIG_TEST_CONNECTION,
    async (_event, credentials: ErpCredentialsRequest): Promise<IpcResult<ConnectionTestResult>> => {
      return withErrorHandling(async () => {
        if (!credentials.username || !credentials.password) {
          throw new ValidationError(
            'ERP 配置不完整，请确保用户名和密码都已填写',
            'VAL_MISSING_REQUIRED'
          )
        }

        const configManager = ConfigManager.getInstance()
        const globalConfig = configManager.getConfig()
        const authService = new ErpAuthService({
          url: globalConfig.erp.url,
          username: credentials.username,
          password: credentials.password,
          headless: true
        })

        try {
          await authService.login()
          return {
            success: true,
            message: 'ERP 连接测试成功'
          }
        } finally {
          await authService.close().catch(() => {})
        }
      }, 'user-erp-config:testConnection')
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.USER_ERP_CONFIG_GET_ALL,
    async (): Promise<
      IpcResult<
        Array<{
          username: string
          erpUrl: string
          erpUsername: string
        }>
      >
    > => {
      return withErrorHandling(async () => {
        if (!sessionManager.isAdmin()) {
          throw new ValidationError('只有管理员可以查看全部用户 ERP 配置', 'VAL_INVALID_INPUT')
        }

        const configs = await erpConfigService.getAllUsersErpConfig()
        return configs
      }, 'user-erp-config:getAll')
    }
  )
}

