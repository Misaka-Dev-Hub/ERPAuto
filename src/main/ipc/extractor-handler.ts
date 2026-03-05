import { ipcMain, webContents } from 'electron'
import { ErpAuthService } from '../services/erp/erp-auth'
import { ExtractorService } from '../services/erp/extractor'
import { OrderNumberResolver } from '../services/erp/order-resolver'
import { create, type IDatabaseService } from '../services/database'
import { createLogger } from '../services/logger'
import { withErrorHandling, type IpcResult } from './index'
import { ErpConnectionError, ValidationError, DatabaseQueryError } from '../types/errors'
import type { ExtractorInput, ExtractorResult, ExtractionProgress } from '../types/extractor.types'
import { UserErpConfigService } from '../services/user/user-erp-config-service'

const log = createLogger('ExtractorHandler')

function sendProgress(
  windowId: number,
  message: string,
  progress: number,
  extra?: Partial<ExtractionProgress>
): void {
  try {
    const progressData = { message, progress, ...extra }
    webContents.getAllWebContents().forEach((wc) => {
      wc.send('extractor:progress', progressData)
    })
  } catch (error) {
    log.warn('Failed to send progress event', { error })
  }
}

function sendLog(windowId: number, level: string, message: string): void {
  try {
    webContents.getAllWebContents().forEach((wc) => {
      wc.send('extractor:log', { level, message })
    })
  } catch (error) {
    log.warn('Failed to send log event', { error })
  }
}

/**
 * Get ERP configuration for current user
 */
async function getErpConfig(): Promise<{
  url: string
  username: string
  password: string
}> {
  const erpConfigService = UserErpConfigService.getInstance()
  const config = await erpConfigService.getCurrentUserErpConfig()

  if (!config || !config.url || !config.username || !config.password) {
    throw new ValidationError(
      'ERP 配置不完整。请在设置中配置 ERP URL、用户名和密码',
      'VAL_MISSING_REQUIRED'
    )
  }

  return config
}

/**
 * Register IPC handlers for extractor service
 */
export function registerExtractorHandlers(): void {
  ipcMain.handle(
    'extractor:run',
    async (event, input: ExtractorInput): Promise<IpcResult<ExtractorResult>> => {
      const windowId = event.sender.id

      return withErrorHandling(async () => {
        let authService: ErpAuthService | null = null
        let dbService: IDatabaseService | null = null
        let erpConfigService: UserErpConfigService | null = null

        try {
          // Get ERP configuration from database for current user
          log.info('Fetching ERP configuration from database...')
          const erpConfig = await getErpConfig()

          log.info('ERP config retrieved', {
            url: erpConfig.url ? 'configured' : 'EMPTY',
            username: erpConfig.username ? 'configured' : 'EMPTY'
          })

          // Create database service using factory
          log.info('Connecting to database for order resolution...')
          sendProgress(windowId, '连接数据库...', 3.33, {
            phase: 'login',
            subProgress: { step: '连接数据库', current: 1, total: 3 }
          })
          sendLog(windowId, 'system', '正在连接数据库...')

          try {
            dbService = await create()
          } catch (error) {
            throw new DatabaseQueryError(
              '数据库连接失败',
              'DB_CONNECTION_FAILED',
              error instanceof Error ? error : undefined
            )
          }

          // Resolve order numbers (convert productionIDs to 生产订单号)
          sendProgress(windowId, '解析订单号...', 6.67, {
            phase: 'login',
            subProgress: { step: '解析订单号', current: 2, total: 3 }
          })
          sendLog(windowId, 'info', '正在解析订单号...')

          const resolver = new OrderNumberResolver(dbService)
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
          sendLog(windowId, 'info', `已解析 ${validOrderNumbers.length} 个有效订单号`)

          // Create auth service and login
          authService = new ErpAuthService({
            url: erpConfig.url,
            username: erpConfig.username,
            password: erpConfig.password,
            headless: true
          })

          sendProgress(windowId, '登录 ERP 系统...', 9.99, {
            phase: 'login',
            subProgress: { step: '登录 ERP 系统', current: 3, total: 3 }
          })
          sendLog(windowId, 'system', '正在登录 ERP 系统...')

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
          sendLog(windowId, 'success', 'ERP 登录成功')

          // Create extractor service and run extraction with resolved order numbers
          const extractor = new ExtractorService(authService)
          log.info('Starting extraction', { orderCount: validOrderNumbers.length })

          const modifiedInput: ExtractorInput = {
            ...input,
            orderNumbers: validOrderNumbers,
            onProgress: (message, progress, extra) => {
              sendProgress(windowId, message, progress, extra)
              sendLog(windowId, 'info', message)
            },
            onLog: (level, message) => {
              sendLog(windowId, level, message)
            }
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

          // Clean up: disconnect database
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
      }, 'extractor:run')
    }
  )
}
