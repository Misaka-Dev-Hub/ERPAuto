import { ipcMain, type WebContents } from 'electron'
import { ErpAuthService } from '../services/erp/erp-auth'
import { ExtractorService } from '../services/erp/extractor'
import { OrderNumberResolver } from '../services/erp/order-resolver'
import { create, type IDatabaseService } from '../services/database'
import { ExtractorOperationHistoryDAO } from '../services/database/extractor-operation-history-dao'
import { createLogger } from '../services/logger'
import { logAudit } from '../services/logger/audit-logger'
import { SessionManager } from '../services/user/session-manager'
import { withErrorHandling, type IpcResult } from './index'
import { ErpConnectionError, ValidationError, DatabaseQueryError } from '../types/errors'
import type { ExtractorInput, ExtractorResult, ExtractionProgress } from '../types/extractor.types'
import { UserErpConfigService } from '../services/user/user-erp-config-service'
import { ConfigManager } from '../services/config/config-manager'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { randomUUID } from 'crypto'

const log = createLogger('ExtractorHandler')

function sendProgress(
  sender: WebContents,
  message: string,
  progress: number,
  extra?: Partial<ExtractionProgress>
): void {
  try {
    const progressData = { message, progress, ...extra }
    sender.send(IPC_CHANNELS.EXTRACTOR_PROGRESS, progressData)
  } catch (error) {
    log.warn('Failed to send progress event', { error })
  }
}

function sendLog(sender: WebContents, level: string, message: string): void {
  try {
    sender.send(IPC_CHANNELS.EXTRACTOR_LOG, { level, message })
  } catch (error) {
    log.warn('Failed to send log event', { error })
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

/**
 * Register IPC handlers for extractor service
 */
export function registerExtractorHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.EXTRACTOR_RUN,
    async (event, input: ExtractorInput): Promise<IpcResult<ExtractorResult>> => {
      const sender = event.sender

      return withErrorHandling(async () => {
        let authService: ErpAuthService | null = null
        let dbService: IDatabaseService | null = null

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
          sendProgress(sender, '连接数据库...', 3.33, {
            phase: 'login',
            subProgress: { step: '连接数据库', current: 1, total: 3 }
          })
          sendLog(sender, 'system', '正在连接数据库...')

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
          sendProgress(sender, '解析订单号...', 6.67, {
            phase: 'login',
            subProgress: { step: '解析订单号', current: 2, total: 3 }
          })
          sendLog(sender, 'info', '正在解析订单号...')

          const resolver = new OrderNumberResolver(dbService)
          const mappings = await resolver.resolve(input.orderNumbers)

          // Get valid order numbers and warnings
          const validOrderNumbers = resolver.getValidOrderNumbers(mappings)
          const warnings = resolver.getWarnings(mappings)

          // Get deduplication report for detailed logging
          const dedupReport = resolver.getDeduplicationReport(mappings)

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

          // Initialize operation history recording
          const currentUser = SessionManager.getInstance().getUserInfo()
          const historyDao = new ExtractorOperationHistoryDAO()
          const batchId = randomUUID()

          // Save order records to history (preserve productionId -> orderNumber mapping)
          if (currentUser) {
            const orderRecords = mappings.map((m) => ({
              productionId: m.productionId || null,
              orderNumber: m.orderNumber || m.input
            }))
            await historyDao.insertBatchRecords(
              batchId,
              currentUser.id,
              currentUser.username,
              orderRecords
            )
            log.info('Operation history batch created', {
              batchId,
              recordCount: orderRecords.length
            })
          }

          // Log deduplication summary
          sendLog(sender, 'info', dedupReport.summary)

          // Log only merged mappings (where multiple productionIDs map to the same order number)
          if (dedupReport.inputCount > dedupReport.uniqueOrderNumbersCount) {
            sendLog(sender, 'info', '重复合并详情：')
            dedupReport.orderNumberGroups.forEach((productionIds, orderNumber) => {
              if (productionIds.length > 1) {
                sendLog(
                  sender,
                  'info',
                  `  ${orderNumber} ← ${productionIds.join('、')} (共 ${productionIds.length} 个总排号)`
                )
              }
            })
          }

          // Create auth service and login
          authService = new ErpAuthService({
            url: erpConfig.url,
            username: erpConfig.username,
            password: erpConfig.password,
            headless: true
          })

          sendProgress(sender, '登录 ERP 系统...', 9.99, {
            phase: 'login',
            subProgress: { step: '登录 ERP 系统', current: 3, total: 3 }
          })
          sendLog(sender, 'system', '正在登录 ERP 系统...')

          log.info('Logging in to ERP...')
          try {
            await authService.login()
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : '未知错误'
            sendLog(sender, 'error', `ERP 登录失败：${errorMsg}`)
            throw new ErpConnectionError(
              'ERP 登录失败',
              'ERP_LOGIN_FAILED',
              error instanceof Error ? error : undefined
            )
          }
          log.info('Login successful')
          sendLog(sender, 'success', 'ERP 登录成功')

          // Create extractor service and run extraction with resolved order numbers
          const extractor = new ExtractorService(authService)
          log.info('Starting extraction', { orderCount: validOrderNumbers.length })

          const modifiedInput: ExtractorInput = {
            ...input,
            orderNumbers: validOrderNumbers,
            onProgress: (message, progress, extra) => {
              sendProgress(sender, message, progress, extra)
              sendLog(sender, 'info', message)
            },
            onLog: (level, message) => {
              sendLog(sender, level, message)
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

          // Log detailed error information if any errors occurred
          if (result.errors.length > 0) {
            log.warn('Extraction errors occurred', { errors: result.errors })
            result.errors.forEach((err, index) => {
              log.error(`Error ${index + 1}/${result.errors.length}: ${err}`)
            })
          }

          // Update operation history batch status
          if (currentUser) {
            const status: 'success' | 'failed' | 'partial' =
              result.errors.length > 0 && result.recordCount > 0
                ? 'partial'
                : result.errors.length > 0
                  ? 'failed'
                  : 'success'

            // Write per-order record counts
            for (const { orderNumber, recordCount } of result.orderRecordCounts) {
              await historyDao.updateRecordStatus(
                batchId,
                orderNumber,
                status,
                undefined,
                recordCount
              )
            }

            // Update batch status without recordCount (per-order counts are set individually)
            await historyDao.updateBatchStatus(batchId, status)
            log.info('Operation history batch status updated', { batchId, status })
          }

          // Audit log: EXTRACT (non-blocking)
          const os = await import('os')
          if (currentUser) {
            const auditStatus: 'success' | 'failure' | 'partial' =
              result.errors.length > 0 && result.recordCount > 0
                ? 'partial'
                : result.errors.length > 0
                  ? 'failure'
                  : 'success'
            logAudit('EXTRACT', String(currentUser.id), {
              username: currentUser.username,
              computerName: os.hostname(),
              resource: 'MATERIAL_PLAN',
              status: auditStatus,
              metadata: {
                orderCount: validOrderNumbers.length,
                recordCount: result.recordCount,
                errorCount: result.errors.length
              }
            })
          }

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
