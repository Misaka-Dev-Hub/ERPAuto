import { ipcMain } from 'electron'
import { ErpAuthService } from '../services/erp/erp-auth'
import { ExtractorService } from '../services/erp/extractor'
import { OrderNumberResolver } from '../services/erp/order-resolver'
import { MySqlService } from '../services/database/mysql'
import { createLogger } from '../services/logger'
import { withErrorHandling, type IpcResult } from './index'
import { ErpConnectionError, ValidationError, DatabaseQueryError } from '../types/errors'
import type { ExtractorInput, ExtractorResult } from '../types/extractor.types'

const log = createLogger('ExtractorHandler')

/**
 * Register IPC handlers for extractor service
 */
export function registerExtractorHandlers(): void {
  ipcMain.handle(
    'extractor:run',
    async (_event, input: ExtractorInput): Promise<IpcResult<ExtractorResult>> => {
      return withErrorHandling(async () => {
        let authService: ErpAuthService | null = null
        let mysqlService: MySqlService | null = null

        try {
          // Check environment variables
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

          // Resolve order numbers (convert productionIDs to 生产订单号)
          const mysqlConfig = {
            host: process.env.DB_MYSQL_HOST || 'localhost',
            port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
            user: process.env.DB_USERNAME || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || ''
          }

          log.info('Connecting to MySQL for order resolution...')
          mysqlService = new MySqlService(mysqlConfig)

          try {
            await mysqlService.connect()
          } catch (error) {
            throw new DatabaseQueryError(
              'MySQL 连接失败',
              'DB_CONNECTION_FAILED',
              error instanceof Error ? error : undefined
            )
          }

          const resolver = new OrderNumberResolver(mysqlService)
          const mappings = await resolver.resolve(input.orderNumbers)

          // Get valid order numbers and warnings
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

          // Create auth service and login
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

          // Create extractor service and run extraction with resolved order numbers
          const extractor = new ExtractorService(authService)
          log.info('Starting extraction', { orderCount: validOrderNumbers.length })

          const modifiedInput: ExtractorInput = {
            ...input,
            orderNumbers: validOrderNumbers
          }

          const result = await extractor.extract(modifiedInput)

          // Add warnings to result errors if any
          if (warnings.length > 0) {
            result.errors = [...warnings, ...result.errors]
          }

          log.info('Extraction completed', {
            rowCount: result.recordCount,
            errorCount: result.errors.length
          })

          return result
        } finally {
          // Clean up: close browser
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

          // Clean up: disconnect MySQL
          if (mysqlService) {
            try {
              await mysqlService.disconnect()
              log.debug('MySQL disconnected')
            } catch (closeError) {
              log.warn('Error disconnecting MySQL', {
                error: closeError instanceof Error ? closeError.message : String(closeError)
              })
            }
          }
        }
      }, 'extractor:run')
    }
  )
}
