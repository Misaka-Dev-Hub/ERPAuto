import { ipcMain } from 'electron'
import { ErpAuthService } from '../services/erp/erp-auth'
import { CleanerService } from '../services/erp/cleaner'
import { OrderNumberResolver } from '../services/erp/order-resolver'
import { MySqlService } from '../services/database/mysql'
import { SqlServerService } from '../services/database/sql-server'
import { ResultExporter } from '../services/excel/result-exporter'
import { createLogger } from '../services/logger'
import { withErrorHandling, type IpcResult } from './index'
import { ErpConnectionError, ValidationError, DatabaseQueryError } from '../types/errors'
import type {
  CleanerInput,
  CleanerResult,
  ExportResultItem,
  ExportResultResponse
} from '../types/cleaner.types'

const log = createLogger('CleanerHandler')

async function getDatabaseService(): Promise<MySqlService | SqlServerService> {
  const dbType = process.env.DB_TYPE?.toLowerCase()

  if (dbType === 'sqlserver' || dbType === 'mssql') {
    const sqlServerService = new SqlServerService({
      server: process.env.DB_SERVER || 'localhost',
      port: parseInt(process.env.DB_SQLSERVER_PORT || '1433', 10),
      user: process.env.DB_USERNAME || 'sa',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || '',
      options: {
        encrypt: process.env.DB_TRUST_SERVER_CERTIFICATE === 'yes',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'yes'
      }
    })
    await sqlServerService.connect()
    return sqlServerService
  } else {
    const mysqlService = new MySqlService({
      host: process.env.DB_MYSQL_HOST || 'localhost',
      port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || ''
    })
    await mysqlService.connect()
    return mysqlService
  }
}

export function registerCleanerHandlers(): void {
  ipcMain.handle(
    'cleaner:run',
    async (_event, input: CleanerInput): Promise<IpcResult<CleanerResult>> => {
      return withErrorHandling(async () => {
        let authService: ErpAuthService | null = null
        let dbService: MySqlService | SqlServerService | null = null

        try {
          const erpUrl = process.env.ERP_URL || ''
          const erpUsername = process.env.ERP_USERNAME || ''
          const erpPassword = process.env.ERP_PASSWORD || ''

          log.info('Config check', {
            url: erpUrl ? 'configured' : 'EMPTY',
            username: erpUsername ? 'configured' : 'EMPTY'
          })

          if (!erpUrl || !erpUsername || !erpPassword) {
            throw new ValidationError(
              'ERP 配置不完整。请检查 .env 文件中的 ERP_URL, ERP_USERNAME, ERP_PASSWORD',
              'VAL_MISSING_REQUIRED'
            )
          }

          const dbType = process.env.DB_TYPE?.toLowerCase()
          log.info(
            `Connecting to ${dbType === 'sqlserver' || dbType === 'mssql' ? 'SQL Server' : 'MySQL'} for order resolution...`
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
            url: erpUrl,
            username: erpUsername,
            password: erpPassword,
            headless: true
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

          const cleaner = new CleanerService(authService)

          const modifiedInput: CleanerInput = {
            ...input,
            orderNumbers: validOrderNumbers,
            onProgress: input.onProgress
          }

          log.info('Starting cleaning', { orderCount: validOrderNumbers.length })
          const result = await cleaner.clean(modifiedInput)

          if (warnings.length > 0) {
            result.errors = [...warnings, ...result.errors]
          }

          log.info('Cleaning completed', {
            processedCount: result.ordersProcessed,
            errorCount: result.errors.length
          })

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
    'cleaner:exportResults',
    async (_event, items: ExportResultItem[]): Promise<ExportResultResponse> => {
      try {
        log.info('Exporting validation results', { count: items.length })

        if (!items || items.length === 0) {
          return {
            success: false,
            error: '没有数据可导出'
          }
        }

        const exporter = new ResultExporter()
        const result = await exporter.exportValidationResults(items)

        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        log.error('Export handler failed', { error: errorMessage })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )
}
