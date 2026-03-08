import { ipcMain, type WebContents } from 'electron'
import { ErpAuthService } from '../services/erp/erp-auth'
import { CleanerService } from '../services/erp/cleaner'
import { OrderNumberResolver } from '../services/erp/order-resolver'
import { MySqlService } from '../services/database/mysql'
import { SqlServerService } from '../services/database/sql-server'
import { ConfigManager } from '../services/config/config-manager'
import { ResultExporter } from '../services/excel/result-exporter'
import { CleanerReportGenerator } from '../services/report/cleaner-report-generator'
import { SessionManager } from '../services/user/session-manager'
import { createLogger } from '../services/logger'
import { logAudit } from '../services/logger/audit-logger'
import { withErrorHandling, type IpcResult } from './index'
import { ErpConnectionError, ValidationError, DatabaseQueryError } from '../types/errors'
import type {
  CleanerInput,
  CleanerResult,
  CleanerProgress,
  ExportResultItem,
  ExportResultResponse
} from '../types/cleaner.types'
import { UserErpConfigService } from '../services/user/user-erp-config-service'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

const log = createLogger('CleanerHandler')

function sendProgress(
  sender: WebContents,
  message: string,
  progress: number,
  extra?: Partial<CleanerProgress>
): void {
  try {
    const progressData: CleanerProgress = {
      message,
      progress,
      currentOrderIndex: extra?.currentOrderIndex ?? 0,
      totalOrders: extra?.totalOrders ?? 0,
      currentMaterialIndex: extra?.currentMaterialIndex ?? 0,
      totalMaterialsInOrder: extra?.totalMaterialsInOrder ?? 0,
      currentOrderNumber: extra?.currentOrderNumber,
      phase: extra?.phase ?? 'processing'
    }
    sender.send(IPC_CHANNELS.CLEANER_PROGRESS, progressData)
  } catch (error) {
    log.warn('Failed to send progress event', { error })
  }
}

async function getDatabaseService(): Promise<MySqlService | SqlServerService> {
  const configManager = ConfigManager.getInstance()
  const config = configManager.getConfig()
  const dbType = configManager.getDatabaseType()

  if (dbType === 'sqlserver') {
    const dbConfig = config.database.sqlserver
    const sqlServerService = new SqlServerService({
      server: dbConfig.server,
      port: dbConfig.port,
      user: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      options: {
        encrypt: false,
        trustServerCertificate: dbConfig.trustServerCertificate
      }
    })
    await sqlServerService.connect()
    return sqlServerService
  } else {
    const dbConfig = config.database.mysql
    const mysqlService = new MySqlService({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database
    })
    await mysqlService.connect()
    return mysqlService
  }
}

/**
 * Get ERP configuration for current user
 * URL is from config.yaml (fixed infrastructure)
 * Username and password are from user's database config
 */
async function getErpConfig(): Promise<{
  url: string
  username: string
  password: string
}> {
  // Get ERP URL from config.yaml (fixed for all users)
  const configManager = ConfigManager.getInstance()
  const globalConfig = configManager.getConfig()
  const erpUrl = globalConfig.erp.url

  // Get username and password from user's database config
  const erpConfigService = UserErpConfigService.getInstance()
  const userConfig = await erpConfigService.getCurrentUserErpConfig()

  if (!userConfig || !userConfig.username || !userConfig.password) {
    throw new ValidationError(
      'ERP 配置不完整。请在设置中配置 ERP 用户名和密码',
      'VAL_MISSING_REQUIRED'
    )
  }

  return {
    url: erpUrl,
    username: userConfig.username,
    password: userConfig.password
  }
}

export function registerCleanerHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CLEANER_RUN,
    async (event, input: CleanerInput): Promise<IpcResult<CleanerResult>> => {
      const sender = event.sender
      const startTime = Date.now()

      return withErrorHandling(async () => {
        let authService: ErpAuthService | null = null
        let dbService: MySqlService | SqlServerService | null = null

        try {
          // Get ERP configuration from database for current user
          log.info('Fetching ERP configuration from database...')
          const erpConfig = await getErpConfig()

          log.info('ERP config retrieved', {
            url: erpConfig.url ? 'configured' : 'EMPTY',
            username: erpConfig.username ? 'configured' : 'EMPTY'
          })

          const configManager = ConfigManager.getInstance()
          const dbType = configManager.getDatabaseType()
          log.info(
            `Connecting to ${dbType === 'sqlserver' ? 'SQL Server' : 'MySQL'} for order resolution...`
          )

          try {
            dbService = await getDatabaseService()
          } catch (error) {
            throw new DatabaseQueryError(
              '数据库连接失败',
              'DB_CONNECTION_FAILED',
              error instanceof Error ? error : undefined
            )
          }

          const resolver = new OrderNumberResolver(dbService)
          const mappings = await resolver.resolve(input.orderNumbers)

          const validOrderNumbers = resolver.getValidOrderNumbers(mappings)
          const warnings = resolver.getWarnings(mappings)

          if (warnings.length > 0) {
            log.warn('Resolution warnings', { warnings })
          }

          if (validOrderNumbers.length === 0) {
            throw new ValidationError(
              '没有有效的生产订单号可处理。请检查输入的格式或数据库连接。',
              'VAL_INVALID_INPUT'
            )
          }

          log.info('Resolved order numbers', { count: validOrderNumbers.length })

          authService = new ErpAuthService({
            url: erpConfig.url,
            username: erpConfig.username,
            password: erpConfig.password,
            headless: input.headless ?? true
          })

          log.info('Logging in to ERP...')
          try {
            await authService.login()
          } catch (error) {
            throw new ErpConnectionError(
              'ERP 登录失败',
              'ERP_LOGIN_FAILED',
              error instanceof Error ? error : undefined
            )
          }
          log.info('Login successful')

          // Send login complete progress
          const totalOrders = validOrderNumbers.length
          const loginProgress = (1 / (1 + totalOrders)) * 100
          sendProgress(sender, 'ERP 登录成功', loginProgress, {
            phase: 'login',
            currentOrderIndex: 0,
            totalOrders,
            currentMaterialIndex: 0,
            totalMaterialsInOrder: 0
          })

          const cleaner = new CleanerService(authService)

          const modifiedInput: CleanerInput = {
            ...input,
            orderNumbers: validOrderNumbers,
            onProgress: (message, progress, extra) => {
              sendProgress(sender, message, progress ?? 0, extra)
            }
          }

          log.info('Starting cleaning', { orderCount: validOrderNumbers.length })
          const result = await cleaner.clean(modifiedInput)

          if (warnings.length > 0) {
            result.errors = [...warnings, ...result.errors]
          }

          // Send completion progress
          sendProgress(sender, '清理完成', 100, {
            phase: 'complete',
            currentOrderIndex: totalOrders,
            totalOrders,
            currentMaterialIndex: 0,
            totalMaterialsInOrder: 0
          })

          log.info('Cleaning completed', {
            processedCount: result.ordersProcessed,
            errorCount: result.errors.length
          })

          // Audit log: CLEAN (non-blocking)
          const os = await import('os')
          const currentUser = SessionManager.getInstance().getUserInfo()
          if (currentUser) {
            const status: 'success' | 'failure' | 'partial' =
              result.errors.length > 0 && result.materialsDeleted > 0
                ? 'partial'
                : result.errors.length > 0
                  ? 'failure'
                  : 'success'
            logAudit('CLEAN', String(currentUser.id), {
              username: currentUser.username,
              computerName: os.hostname(),
              resource: 'MATERIAL_PLAN',
              status,
              metadata: {
                orderCount: validOrderNumbers.length,
                dryRun: input.dryRun ?? false,
                materialsDeleted: result.materialsDeleted,
                materialsSkipped: result.materialsSkipped,
                errorCount: result.errors.length
              }
            }).catch((err) => log.warn('Failed to write audit log', { err }))
          }

          // Generate report (silent, user unaware)
          try {
            const endTime = Date.now()
            const currentUser = SessionManager.getInstance().getUserInfo()
            const username = currentUser?.username ?? 'unknown'

            const reportGenerator = new CleanerReportGenerator()
            const reportPath = await reportGenerator.generateReport(result, {
              dryRun: input.dryRun ?? false,
              username,
              startTime,
              endTime
            })
            log.info('Report generated', { path: reportPath })
          } catch (reportError) {
            log.warn('Failed to generate report', {
              error: reportError instanceof Error ? reportError.message : String(reportError)
            })
          }

          return result
        } finally {
          if (authService) {
            try {
              await authService.close()
              log.debug('Browser closed')
            } catch (closeError) {
              log.warn('Error closing browser', {
                error: closeError instanceof Error ? closeError.message : String(closeError)
              })
            }
          }

          if (dbService) {
            try {
              await dbService.disconnect()
              log.debug('Database disconnected')
            } catch (closeError) {
              log.warn('Error disconnecting database', {
                error: closeError instanceof Error ? closeError.message : String(closeError)
              })
            }
          }
        }
      }, 'cleaner:run')
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CLEANER_EXPORT_RESULTS,
    async (_event, items: ExportResultItem[]): Promise<IpcResult<ExportResultResponse>> => {
      return withErrorHandling(async () => {
        log.info('Exporting validation results', { count: items.length })
        if (!items || items.length === 0) {
          throw new ValidationError('没有数据可导出', 'VAL_INVALID_INPUT')
        }
        const exporter = new ResultExporter()
        return await exporter.exportValidationResults(items)
      }, 'cleaner:exportResults')
    }
  )
}
