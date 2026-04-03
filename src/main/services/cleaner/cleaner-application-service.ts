import type { WebContents } from 'electron'
import type { MySqlService } from '../database/mysql'
import type { SqlServerService } from '../database/sql-server'
import { ErpAuthService } from '../erp/erp-auth'
import { CleanerService } from '../erp/cleaner'
import { OrderNumberResolver } from '../erp/order-resolver'
import { MySqlService as MySqlServiceImpl } from '../database/mysql'
import { SqlServerService as SqlServerServiceImpl } from '../database/sql-server'
import { ConfigManager } from '../config/config-manager'
import { ResultExporter } from '../excel/result-exporter'
import { CleanerReportGenerator } from '../report/cleaner-report-generator'
import { RustfsService } from '../rustfs'
import { SessionManager } from '../user/session-manager'
import { UserErpConfigService } from '../user/user-erp-config-service'
import { createLogger } from '../logger'
import { logAudit } from '../logger/audit-logger'
import { IPC_CHANNELS } from '../../../shared/ipc-channels'
import { DatabaseQueryError, ErpConnectionError, ValidationError } from '../../types/errors'
import type {
  CleanerInput,
  CleanerProgress,
  CleanerResult,
  ExportResultItem,
  ExportResultResponse
} from '../../types/cleaner.types'

const log = createLogger('CleanerApplicationService')

type DatabaseService = MySqlService | SqlServerService

export class CleanerApplicationService {
  async runCleaner(eventSender: WebContents, input: CleanerInput): Promise<CleanerResult> {
    const startTime = Date.now()
    let authService: ErpAuthService | null = null
    let dbService: DatabaseService | null = null

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
        `Connecting to ${dbType === 'sqlserver' ? 'SQL Server' : 'MySQL'} for order resolution...`
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

      const totalOrders = validOrderNumbers.length
      this.sendProgress(eventSender, 'ERP 登录成功', (1 / (1 + totalOrders)) * 100, {
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
          this.sendProgress(eventSender, message, progress ?? 0, extra)
        }
      }

      log.info('Starting cleaning', {
        orderCount: validOrderNumbers.length,
        queryBatchSize: input.queryBatchSize ?? 100,
        processConcurrency: input.processConcurrency ?? 1
      })

      const result = await cleaner.clean(modifiedInput)

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
        processedCount: result.ordersProcessed,
        errorCount: result.errors.length
      })

      await this.recordCleanupAudit(validOrderNumbers.length, input, result)
      await this.generateAndUploadReport(input, result, startTime)

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

  private async getDatabaseService(): Promise<DatabaseService> {
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

  private async recordCleanupAudit(
    orderCount: number,
    input: CleanerInput,
    result: CleanerResult
  ): Promise<void> {
    const currentUser = SessionManager.getInstance().getUserInfo()
    if (!currentUser) {
      return
    }

    const status: 'success' | 'failure' | 'partial' =
      result.errors.length > 0 && result.materialsDeleted > 0
        ? 'partial'
        : result.errors.length > 0
          ? 'failure'
          : 'success'

    logAudit('CLEAN', String(currentUser.id), {
      username: currentUser.username,
      computerName: (await import('os')).hostname(),
      resource: 'MATERIAL_PLAN',
      status,
      metadata: {
        orderCount,
        dryRun: input.dryRun ?? false,
        queryBatchSize: input.queryBatchSize ?? 100,
        processConcurrency: input.processConcurrency ?? 1,
        materialsDeleted: result.materialsDeleted,
        materialsSkipped: result.materialsSkipped,
        errorCount: result.errors.length
      }
    })
  }

  private async generateAndUploadReport(
    input: CleanerInput,
    result: CleanerResult,
    startTime: number
  ): Promise<void> {
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

      const configManager = ConfigManager.getInstance()
      const config = configManager.getConfig()

      if (!config.rustfs?.enabled || !config.rustfs.endpoint) {
        log.debug('RustFS is not enabled, skipping upload')
        return
      }

      try {
        const rustfs = new RustfsService({ config: config.rustfs })
        const reportFileName = reportPath.split(/[\\/]/).pop() || 'report.md'
        const storageKey = rustfs.generateReportKey(reportFileName, username)

        log.info('Uploading report to RustFS', {
          localPath: reportPath,
          storageKey
        })

        const uploadResult = await rustfs.uploadFile(
          reportPath,
          storageKey,
          'text/markdown; charset=utf-8'
        )

        if (uploadResult.success) {
          log.info('Report uploaded to RustFS successfully', {
            key: storageKey,
            etag: uploadResult.etag
          })
        } else {
          log.warn('Failed to upload report to RustFS', {
            error: uploadResult.error,
            key: storageKey
          })
        }
      } catch (rustfsError) {
        log.error('RustFS upload failed', {
          error: rustfsError instanceof Error ? rustfsError.message : String(rustfsError)
        })
      }
    } catch (reportError) {
      log.warn('Failed to generate report', {
        error: reportError instanceof Error ? reportError.message : String(reportError)
      })
    }
  }
}
