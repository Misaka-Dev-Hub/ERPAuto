import { ipcMain } from 'electron'
import { DataSource } from 'typeorm'
import { ErpAuthService } from '../services/erp/erp-auth'
import { CleanerService } from '../services/erp/cleaner'
import { OrderNumberResolver } from '../services/erp/order-resolver'
import { ProductionContractRepository } from '../services/database/repositories/ProductionContractRepository'
import { createLogger } from '../services/logger'
import { withErrorHandling, type IpcResult } from './index'
import { ErpConnectionError, ValidationError, DatabaseQueryError } from '../types/errors'
import { initializeDataSource } from '../services/database/data-source'
import type { CleanerInput, CleanerResult } from '../types/cleaner.types'

const log = createLogger('CleanerHandler')

/**
 * Register IPC handlers for cleaner service
 */
export function registerCleanerHandlers(): void {
  ipcMain.handle(
    'cleaner:run',
    async (_event, input: CleanerInput): Promise<IpcResult<CleanerResult>> => {
      return withErrorHandling(async () => {
        let authService: ErpAuthService | null = null
        let dataSource: DataSource | null = null

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
          log.info('Connecting to database for order resolution...')
          dataSource = await initializeDataSource()

          const repository = new ProductionContractRepository()
          const resolver = new OrderNumberResolver(repository)
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

          // Create cleaner service and run cleaning with resolved order numbers
          const cleaner = new CleanerService(authService)

          const modifiedInput: CleanerInput = {
            ...input,
            orderNumbers: validOrderNumbers,
            onProgress: input.onProgress
          }

          log.info('Starting cleaning', { orderCount: validOrderNumbers.length })
          const result = await cleaner.clean(modifiedInput)

          // Add warnings to result errors if any
          if (warnings.length > 0) {
            result.errors = [...warnings, ...result.errors]
          }

          log.info('Cleaning completed', {
            processedCount: result.ordersProcessed,
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

          // Clean up: disconnect database
          if (dataSource && dataSource.isInitialized) {
            try {
              await dataSource.destroy()
              log.debug('DataSource disconnected')
            } catch (closeError) {
              log.warn('Error disconnecting DataSource', {
                error: closeError instanceof Error ? closeError.message : String(closeError)
              })
            }
          }
        }
      }, 'cleaner:run')
    }
  )
}
