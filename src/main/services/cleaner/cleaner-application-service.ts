import type { WebContents } from 'electron'
import type { IDatabaseService } from '../../types/database.types'
import { ErpAuthService } from '../erp/erp-auth'
import { CleanerService } from '../erp/cleaner'
import { OrderNumberResolver } from '../erp/order-resolver'
import { MySqlService as MySqlServiceImpl } from '../database/mysql'
import { SqlServerService as SqlServerServiceImpl } from '../database/sql-server'
import { PostgreSqlService as PostgreSqlServiceImpl } from '../database/postgresql'
import { ConfigManager } from '../config/config-manager'
import { ResultExporter } from '../excel/result-exporter'
import { SessionManager } from '../user/session-manager'
import { UserErpConfigService } from '../user/user-erp-config-service'
import { createLogger } from '../logger'
import { logAuditWithCurrentUser } from '../logger/audit-logger'
import { AuditAction, AuditStatus } from '../../types/audit.types'
import { IPC_CHANNELS } from '../../../shared/ipc-channels'
import { DatabaseQueryError, ErpConnectionError, ValidationError } from '../../types/errors'
import { CleanerOperationHistoryDAO } from '../database/cleaner-operation-history-dao'
import type {
  CleanerInput,
  CleanerProgress,
  CleanerResult,
  ExportResultItem,
  ExportResultResponse
} from '../../types/cleaner.types'
import type { InsertMaterialDetailInput, InsertOrderInput } from '../../types/cleaner-history.types'
import type { OrderMapping } from '../../types/order-resolver.types'

const log = createLogger('CleanerApplicationService')

export class CleanerApplicationService {
  async runCleaner(
    eventSender: WebContents,
    input: CleanerInput,
    batchId: string,
    historyDao: CleanerOperationHistoryDAO,
    appVersion: string
  ): Promise<CleanerResult> {
    let authService: ErpAuthService | null = null
    let dbService: IDatabaseService | null = null

    try {
      log.info('Fetching ERP configuration from database...')
      const erpConfig = await this.getErpConfig()

      log.info('ERP config retrieved', {
        url: erpConfig.url ? 'configured' : 'EMPTY',
        username: erpConfig.username ? 'configured' : 'EMPTY'
      })

      const configManager = ConfigManager.getInstance()
      const dbType = configManager.getDatabaseType()
      log.info(
        `Connecting to ${dbType === 'sqlserver' ? 'SQL Server' : dbType === 'postgresql' ? 'PostgreSQL' : 'MySQL'} for order resolution...`
      )

      try {
        dbService = await this.getDatabaseService()
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

      // Build order inputs from ALL mappings (including resolution failures)
      const orderInputs = this.buildOrderInputs(mappings)

      log.info('Resolved order numbers', {
        total: mappings.length,
        resolved: validOrderNumbers.length,
        failed: mappings.length - validOrderNumbers.length
      })

      // Insert execution record and ALL order records into database
      const currentUser = SessionManager.getInstance().getUserInfo()
      if (currentUser) {
        await historyDao.insertExecution({
          batchId,
          attemptNumber: 1,
          userId: currentUser.id,
          username: currentUser.username,
          isDryRun: input.dryRun ?? false,
          totalOrders: orderInputs.length,
          appVersion
        })
        await historyDao.insertOrderRecords(batchId, 1, orderInputs)
      }

      // If no valid order numbers, update execution to failed and return early
      if (validOrderNumbers.length === 0) {
        if (currentUser) {
          await historyDao.updateExecutionStatus(
            batchId,
            1,
            'failed',
            0,
            0,
            0,
            0,
            0,
            new Date(),
            warnings.join('\n') || '没有有效的生产订单号可处理'
          )
        }
        const emptyResult: CleanerResult = {
          ordersProcessed: 0,
          materialsDeleted: 0,
          materialsSkipped: 0,
          errors: [...warnings],
          details: [],
          retriedOrders: 0,
          successfulRetries: 0,
          materialsFailed: 0,
          uncertainDeletions: 0
        }
        await this.recordCleanupAudit(0, input, emptyResult)
        return emptyResult
      }

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

      const totalOrders = validOrderNumbers.length
      this.sendProgress(eventSender, 'ERP 登录成功', (1 / (1 + totalOrders)) * 100, {
        phase: 'login',
        currentOrderIndex: 0,
        totalOrders,
        currentMaterialIndex: 0,
        totalMaterialsInOrder: 0
      })

      const modifiedInput: CleanerInput = {
        ...input,
        orderNumbers: validOrderNumbers,
        onProgress: (message, progress, extra) => {
          this.sendProgress(eventSender, message, progress ?? 0, extra)
        }
      }

      log.info('Starting cleaning', {
        batchId,
        orderCount: validOrderNumbers.length,
        queryBatchSize: input.queryBatchSize ?? 100,
        processConcurrency: input.processConcurrency ?? 1
      })

      let cleaner = new CleanerService(authService)
      let result = await cleaner.clean(modifiedInput)

      // Outer retry: re-login and re-run all orders on fatal crash
      if (result.crashed) {
        log.warn('检测到流程级崩溃，准备外层重试', { batchId })

        // Save attempt 1 result as crashed
        await this.saveAttemptToDatabase(historyDao, batchId, 1, result)

        this.sendProgress(eventSender, '流程崩溃，正在重新登录并重试...', 0, {
          phase: 'retry',
          currentOrderIndex: 0,
          totalOrders,
          currentMaterialIndex: 0,
          totalMaterialsInOrder: 0
        })

        try {
          await authService.close()
        } catch {
          // Browser may already be dead, ignore close errors
        }
        authService = null

        authService = new ErpAuthService({
          url: erpConfig.url,
          username: erpConfig.username,
          password: erpConfig.password,
          headless: input.headless ?? true
        })

        try {
          await authService.login()
          log.info('Outer retry: re-login successful', { batchId })
        } catch (loginError) {
          log.error('Outer retry: re-login failed', {
            batchId,
            error: loginError instanceof Error ? loginError.message : String(loginError)
          })
          // Return the original crash result if re-login fails
          result.errors.push(
            `外层重试登录失败: ${loginError instanceof Error ? loginError.message : String(loginError)}`
          )
          if (warnings.length > 0) {
            result.errors = [...warnings, ...result.errors]
          }
          await this.recordCleanupAudit(validOrderNumbers.length, input, result)
          // Attempt 1 already saved as crashed above
          return result
        }

        // Insert execution and order records for attempt 2
        if (currentUser) {
          await historyDao.insertExecution({
            batchId,
            attemptNumber: 2,
            userId: currentUser.id,
            username: currentUser.username,
            isDryRun: input.dryRun ?? false,
            totalOrders: orderInputs.length,
            appVersion
          })
          await historyDao.insertOrderRecords(batchId, 2, orderInputs)
        }

        cleaner = new CleanerService(authService)
        result = await cleaner.clean(modifiedInput)

        // Save attempt 2 result
        await this.saveAttemptToDatabase(historyDao, batchId, 2, result)

        log.info('Outer retry completed', {
          batchId,
          processedCount: result.ordersProcessed,
          errorCount: result.errors.length,
          crashed: result.crashed
        })
      } else {
        // No crash — save attempt 1 result
        await this.saveAttemptToDatabase(historyDao, batchId, 1, result)
      }

      if (warnings.length > 0) {
        result.errors = [...warnings, ...result.errors]
      }

      this.sendProgress(eventSender, '清理完成', 100, {
        phase: 'complete',
        currentOrderIndex: totalOrders,
        totalOrders,
        currentMaterialIndex: 0,
        totalMaterialsInOrder: 0
      })

      log.info('Cleaning completed', {
        batchId,
        processedCount: result.ordersProcessed,
        errorCount: result.errors.length
      })

      await this.recordCleanupAudit(validOrderNumbers.length, input, result)

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
  }

  async exportResults(items: ExportResultItem[]): Promise<ExportResultResponse> {
    log.info('Exporting validation results', { count: items.length })
    if (!items || items.length === 0) {
      throw new ValidationError('没有数据可导出', 'VAL_INVALID_INPUT')
    }

    const exporter = new ResultExporter()
    return exporter.exportValidationResults(items)
  }

  private sendProgress(
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

  private async getDatabaseService(): Promise<IDatabaseService> {
    const configManager = ConfigManager.getInstance()
    const config = configManager.getConfig()
    const dbType = configManager.getDatabaseType()

    if (dbType === 'sqlserver') {
      const dbConfig = config.database.sqlserver
      const sqlServerService = new SqlServerServiceImpl({
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
    }

    if (dbType === 'postgresql') {
      const dbConfig = config.database.postgresql
      const pgService = new PostgreSqlServiceImpl({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.database
      })
      await pgService.connect()
      return pgService
    }

    const dbConfig = config.database.mysql
    const mysqlService = new MySqlServiceImpl({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database
    })
    await mysqlService.connect()
    return mysqlService
  }

  private async getErpConfig(): Promise<{ url: string; username: string; password: string }> {
    const configManager = ConfigManager.getInstance()
    const globalConfig = configManager.getConfig()
    const erpUrl = globalConfig.erp.url

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
   * Build order inputs from ALL mappings, including resolution failures.
   * Deduplicates by orderNumber for resolved mappings, includes all failed mappings.
   */
  private buildOrderInputs(mappings: OrderMapping[]): InsertOrderInput[] {
    const inputs: InsertOrderInput[] = []
    const seenOrderNumbers = new Set<string>()

    for (const mapping of mappings) {
      if (mapping.resolved && mapping.orderNumber) {
        // Deduplicate resolved mappings by order number
        if (!seenOrderNumbers.has(mapping.orderNumber)) {
          seenOrderNumbers.add(mapping.orderNumber)
          inputs.push({
            orderNumber: mapping.orderNumber,
            productionId: mapping.productionId
          })
        }
      } else {
        // Resolution failure: use original input as orderNumber identifier
        inputs.push({
          orderNumber: mapping.input,
          productionId: mapping.productionId,
          initialStatus: 'not_found',
          errorMessage: mapping.error || '未在数据库中找到对应的订单号'
        })
      }
    }

    return inputs
  }

  private async recordCleanupAudit(
    orderCount: number,
    input: CleanerInput,
    result: CleanerResult
  ): Promise<void> {
    const currentUser = SessionManager.getInstance().getUserInfo()
    if (!currentUser) {
      return
    }

    const status: AuditStatus =
      result.errors.length > 0 && result.materialsDeleted > 0
        ? AuditStatus.PARTIAL
        : result.errors.length > 0
          ? AuditStatus.FAILURE
          : AuditStatus.SUCCESS

    logAuditWithCurrentUser(AuditAction.CLEAN, 'MATERIAL_PLAN', status, {
      orderCount,
      dryRun: input.dryRun ?? false,
      queryBatchSize: input.queryBatchSize ?? 100,
      processConcurrency: input.processConcurrency ?? 1,
      materialsDeleted: result.materialsDeleted,
      materialsSkipped: result.materialsSkipped,
      errorCount: result.errors.length
    })
  }

  /**
   * Save attempt results to database: update order statuses, insert material details,
   * and update execution status.
   */
  private async saveAttemptToDatabase(
    historyDao: CleanerOperationHistoryDAO,
    batchId: string,
    attemptNumber: number,
    result: CleanerResult
  ): Promise<void> {
    try {
      // Query execution record to determine if this is a dry run
      const batchDetails = await historyDao.getBatchDetails(batchId)
      const execution = batchDetails.executions.find((e) => e.attemptNumber === attemptNumber)
      const isDryRun = execution?.isDryRun ?? false

      // Update order statuses and insert material details
      for (const detail of result.details) {
        await historyDao.updateOrderStatus(
          batchId,
          attemptNumber,
          detail.orderNumber,
          detail.notFound ? 'erp_not_found' : detail.errors.length > 0 ? 'failed' : 'success',
          detail.materialsDeleted,
          detail.materialsSkipped,
          detail.materialsFailed,
          detail.uncertainDeletions,
          detail.retryCount,
          detail.retrySuccess ?? false,
          detail.errors.length > 0 ? detail.errors.join('\n') : undefined
        )

        // Insert material details for all materials
        const materialDetails: InsertMaterialDetailInput[] = []

        for (const deleted of detail.deletedMaterials) {
          materialDetails.push({
            orderNumber: detail.orderNumber,
            materialCode: deleted.materialCode,
            materialName: deleted.materialName,
            rowNumber: deleted.rowNumber,
            result: deleted.outcome,
            reason: null,
            attemptCount: 1,
            finalErrorCategory: null
          })
        }

        for (const skipped of detail.skippedMaterials) {
          materialDetails.push({
            orderNumber: detail.orderNumber,
            materialCode: skipped.materialCode,
            materialName: skipped.materialName,
            rowNumber: skipped.rowNumber,
            result: 'skipped',
            reason: skipped.reason,
            attemptCount: 0,
            finalErrorCategory: null
          })
        }

        for (const failed of detail.failedMaterials) {
          materialDetails.push({
            orderNumber: detail.orderNumber,
            materialCode: failed.materialCode,
            materialName: failed.materialName,
            rowNumber: failed.rowNumber,
            result: failed.finalOutcome,
            reason:
              failed.attempts
                .map((a) => a.errorMessage)
                .filter(Boolean)
                .join('; ') || null,
            attemptCount: failed.attempts.length,
            finalErrorCategory: failed.finalErrorCategory ?? null
          })
        }

        if (materialDetails.length > 0 && !isDryRun) {
          await historyDao.insertMaterialDetails(batchId, attemptNumber, materialDetails)
        }
      }

      // Determine execution status
      const execStatus = result.crashed
        ? 'crashed'
        : result.errors.length > 0 && result.materialsDeleted > 0
          ? 'partial'
          : result.errors.length > 0
            ? 'failed'
            : 'success'

      // Build error message from execution-level errors (excluding per-order errors)
      const execErrorMessage = result.errors.length > 0 ? result.errors.join('\n') : undefined

      // Update execution status
      await historyDao.updateExecutionStatus(
        batchId,
        attemptNumber,
        execStatus,
        result.ordersProcessed,
        result.materialsDeleted,
        result.materialsSkipped,
        result.materialsFailed,
        result.uncertainDeletions,
        new Date(),
        execErrorMessage
      )

      log.info('Attempt results saved to database', {
        batchId,
        attemptNumber,
        execStatus,
        ordersProcessed: result.ordersProcessed
      })
    } catch (dbError) {
      log.error('Failed to save attempt results to database', {
        batchId,
        attemptNumber,
        error: dbError instanceof Error ? dbError.message : String(dbError)
      })
      // Don't throw — database save failure should not affect the main result
    }
  }
}
