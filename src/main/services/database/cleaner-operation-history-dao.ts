/**
 * Data Access Object for Cleaner operation history (three-table design)
 *
 * Handles database operations for tracking cleaner operation history across:
 * - CleanerExecution: execution-level records (one per attempt)
 * - CleanerOrderHistory: order-level records (one per order per attempt)
 * - CleanerMaterialDetail: material-level records (one per material per order per attempt)
 */

import { create, type IDatabaseService } from './index'
import { createDialect, type SqlDialect } from './dialects'
import { createLogger, getRequestId, trackDuration } from '../logger'
import type {
  CleanerExecutionRecord,
  CleanerOrderRecord,
  CleanerMaterialRecord,
  CleanerBatchStats,
  InsertCleanerExecutionInput,
  InsertOrderInput,
  InsertMaterialDetailInput,
  GetCleanerBatchesOptions,
  SearchCleanerHistoryOptions,
  CleanerSearchBatchResult,
  CleanerHistorySearchResult
} from '../../types/cleaner-history.types'

const log = createLogger('CleanerOperationHistoryDAO')

/**
 * Format datetime value from database to ISO string
 * mssql driver returns Date objects in UTC format
 */
function formatDateTime(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return value ? String(value) : new Date().toISOString()
}

/**
 * Configuration constants for all three Cleaner history tables
 */
export const CLEANER_EXECUTION_CONFIG = {
  COLUMNS: {
    ID: 'ID',
    BATCH_ID: 'BatchId',
    ATTEMPT_NUMBER: 'AttemptNumber',
    USER_ID: 'UserId',
    USERNAME: 'Username',
    OPERATION_TIME: 'OperationTime',
    END_TIME: 'EndTime',
    STATUS: 'Status',
    IS_DRY_RUN: 'IsDryRun',
    TOTAL_ORDERS: 'TotalOrders',
    ORDERS_PROCESSED: 'OrdersProcessed',
    TOTAL_MATERIALS_DELETED: 'TotalMaterialsDeleted',
    TOTAL_MATERIALS_SKIPPED: 'TotalMaterialsSkipped',
    TOTAL_MATERIALS_FAILED: 'TotalMaterialsFailed',
    TOTAL_UNCERTAIN_DELETIONS: 'TotalUncertainDeletions',
    ERROR_MESSAGE: 'ErrorMessage',
    APP_VERSION: 'AppVersion'
  }
} as const

export const CLEANER_ORDER_CONFIG = {
  COLUMNS: {
    ID: 'ID',
    BATCH_ID: 'BatchId',
    ATTEMPT_NUMBER: 'AttemptNumber',
    ORDER_NUMBER: 'OrderNumber',
    PRODUCTION_ID: 'ProductionId',
    STATUS: 'Status',
    MATERIALS_DELETED: 'MaterialsDeleted',
    MATERIALS_SKIPPED: 'MaterialsSkipped',
    MATERIALS_FAILED: 'MaterialsFailed',
    UNCERTAIN_DELETIONS: 'UncertainDeletions',
    RETRY_COUNT: 'RetryCount',
    RETRY_SUCCESS: 'RetrySuccess',
    ERROR_MESSAGE: 'ErrorMessage'
  }
} as const

export const CLEANER_MATERIAL_CONFIG = {
  COLUMNS: {
    ID: 'ID',
    BATCH_ID: 'BatchId',
    ATTEMPT_NUMBER: 'AttemptNumber',
    ORDER_NUMBER: 'OrderNumber',
    MATERIAL_CODE: 'MaterialCode',
    MATERIAL_NAME: 'MaterialName',
    ROW_NUMBER: 'RowNumber',
    RESULT: 'Result',
    REASON: 'Reason',
    ATTEMPT_COUNT: 'AttemptCount',
    FINAL_ERROR_CATEGORY: 'FinalErrorCategory'
  }
} as const

/**
 * CleanerOperationHistory DAO Class
 */
export class CleanerOperationHistoryDAO {
  private dbService: IDatabaseService | null = null
  private dialect: SqlDialect | null = null

  private getDialect(): SqlDialect {
    if (!this.dialect) {
      this.dialect = createDialect(this.dbService!.type)
    }
    return this.dialect
  }

  /**
   * Get the appropriate table name based on database type
   */
  private getExecutionTableName(): string {
    return this.getDialect().quoteTableName('ERPAuto', 'CleanerExecution')
  }

  private getOrderTableName(): string {
    return this.getDialect().quoteTableName('ERPAuto', 'CleanerOrderHistory')
  }

  private getMaterialTableName(): string {
    return this.getDialect().quoteTableName('ERPAuto', 'CleanerMaterialDetail')
  }

  private getIsDryRunAggregateSql(): string {
    const dialect = this.getDialect()
    if (dialect.dbType === 'postgresql') {
      return `MAX(CASE WHEN e.IsDryRun THEN 1 ELSE 0 END)`
    }

    return `MAX(CAST(e.IsDryRun AS INT))`
  }

  /**
   * Get database service instance using DatabaseFactory
   */
  private async getDatabaseService(): Promise<IDatabaseService> {
    if (this.dbService && this.dbService.isConnected()) {
      return this.dbService
    }

    this.dbService = await create()
    return this.dbService
  }

  // ==================== EXECUTION INSERT ====================

  /**
   * Insert a new execution record
   * @param input - Execution input data
   * @returns True if successful
   */
  async insertExecution(input: InsertCleanerExecutionInput): Promise<boolean> {
    const requestId = getRequestId() || `insert-exec-${Date.now()}`

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getExecutionTableName()
      const dialect = this.getDialect()

      log.info('Execution insertion started', {
        tableName,
        operationType: 'INSERT',
        requestId,
        batchId: input.batchId,
        attemptNumber: input.attemptNumber,
        userId: input.userId,
        username: input.username
      })

      const sqlString = `
        INSERT INTO ${tableName}
          (BatchId, AttemptNumber, UserId, Username, OperationTime, Status, IsDryRun,
           TotalOrders, OrdersProcessed, TotalMaterialsDeleted, TotalMaterialsSkipped,
           TotalMaterialsFailed, TotalUncertainDeletions, ErrorMessage, AppVersion)
        VALUES
          (${dialect.param(0)}, ${dialect.param(1)}, ${dialect.param(2)}, ${dialect.param(3)},
           ${dialect.currentTimestamp()}, 'pending', ${dialect.param(4)},
           ${dialect.param(5)}, 0, 0, 0, 0, 0, NULL, ${dialect.param(6)})
      `

      const params = [
        input.batchId,
        input.attemptNumber,
        input.userId,
        input.username,
        input.isDryRun ? 1 : 0,
        input.totalOrders,
        input.appVersion
      ]

      await trackDuration(async () => await dbService.query(sqlString, params), {
        operationName: 'CleanerOperationHistoryDAO.insertExecution',
        context: { tableName, operationType: 'INSERT', batchId: input.batchId }
      })

      log.info('Execution inserted', {
        tableName,
        operationType: 'INSERT',
        requestId,
        batchId: input.batchId,
        attemptNumber: input.attemptNumber
      })
      return true
    } catch (error) {
      log.error('Insert execution error', {
        tableName: this.getExecutionTableName(),
        operationType: 'INSERT',
        requestId,
        batchId: input.batchId,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  // ==================== EXECUTION UPDATE ====================

  /**
   * Update execution status and counters
   */
  async updateExecutionStatus(
    batchId: string,
    attemptNumber: number,
    status: string,
    ordersProcessed: number,
    materialsDeleted: number,
    materialsSkipped: number,
    materialsFailed: number,
    uncertainDeletions: number,
    endTime: Date,
    errorMessage?: string
  ): Promise<boolean> {
    const requestId = getRequestId() || `update-exec-${Date.now()}`

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getExecutionTableName()
      const dialect = this.getDialect()

      const sqlString = `
        UPDATE ${tableName}
        SET Status = ${dialect.param(0)},
            OrdersProcessed = ${dialect.param(1)},
            TotalMaterialsDeleted = ${dialect.param(2)},
            TotalMaterialsSkipped = ${dialect.param(3)},
            TotalMaterialsFailed = ${dialect.param(4)},
            TotalUncertainDeletions = ${dialect.param(5)},
            EndTime = ${dialect.param(6)},
            ErrorMessage = ${dialect.param(7)}
        WHERE BatchId = ${dialect.param(8)}
          AND AttemptNumber = ${dialect.param(9)}
      `

      const params = [
        status,
        ordersProcessed,
        materialsDeleted,
        materialsSkipped,
        materialsFailed,
        uncertainDeletions,
        endTime,
        errorMessage || null,
        batchId,
        attemptNumber
      ]

      await trackDuration(async () => await dbService.query(sqlString, params), {
        operationName: 'CleanerOperationHistoryDAO.updateExecutionStatus',
        context: { tableName, operationType: 'UPDATE', batchId, attemptNumber }
      })

      log.info('Execution status updated', {
        tableName,
        operationType: 'UPDATE',
        requestId,
        batchId,
        attemptNumber,
        status
      })
      return true
    } catch (error) {
      log.error('Update execution status error', {
        tableName: this.getExecutionTableName(),
        operationType: 'UPDATE',
        requestId,
        batchId,
        attemptNumber,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  // ==================== ORDER INSERT ====================

  /**
   * Insert order records for a specific execution
   * @param batchId - Batch identifier
   * @param attemptNumber - Attempt number
   * @param orders - Array of order inputs
   * @returns True if successful
   */
  async insertOrderRecords(
    batchId: string,
    attemptNumber: number,
    orders: InsertOrderInput[]
  ): Promise<boolean> {
    if (!orders || orders.length === 0) {
      log.warn('No orders to insert', {
        batchId,
        attemptNumber,
        tableName: this.getOrderTableName(),
        requestId: getRequestId()
      })
      return false
    }

    const requestId = getRequestId() || `insert-orders-${Date.now()}`

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getOrderTableName()
      const dialect = this.getDialect()

      log.info('Order records insertion started', {
        tableName,
        operationType: 'INSERT',
        requestId,
        batchId,
        attemptNumber,
        orderCount: orders.length
      })

      for (const order of orders) {
        try {
          const status = order.initialStatus || 'pending'
          const sqlString = `
            INSERT INTO ${tableName}
              (BatchId, AttemptNumber, OrderNumber, ProductionId, Status,
               MaterialsDeleted, MaterialsSkipped, MaterialsFailed,
               UncertainDeletions, RetryCount, RetrySuccess, ErrorMessage)
            VALUES
              (${dialect.param(0)}, ${dialect.param(1)}, ${dialect.param(2)}, ${dialect.param(3)}, ${dialect.param(4)},
               0, 0, 0, 0, 0, 0, ${dialect.param(5)})
          `
          await trackDuration(
            async () =>
              await dbService.query(sqlString, [
                batchId,
                attemptNumber,
                order.orderNumber,
                order.productionId || null,
                status,
                order.errorMessage || null
              ]),
            {
              operationName: 'CleanerOperationHistoryDAO.insertOrderRecords',
              context: { tableName, operationType: 'INSERT', batchId, attemptNumber }
            }
          )
        } catch (error) {
          log.error('Error inserting individual order record', {
            tableName,
            operationType: 'INSERT',
            requestId,
            batchId,
            attemptNumber,
            orderNumber: order.orderNumber,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      log.info('Order records inserted', {
        tableName,
        operationType: 'INSERT',
        requestId,
        batchId,
        attemptNumber,
        count: orders.length
      })
      return true
    } catch (error) {
      log.error('Insert order records error', {
        tableName: this.getOrderTableName(),
        operationType: 'INSERT',
        requestId,
        batchId,
        attemptNumber,
        orderCount: orders.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  // ==================== ORDER UPDATE ====================

  /**
   * Update order status and counters
   */
  async updateOrderStatus(
    batchId: string,
    attemptNumber: number,
    orderNumber: string,
    status: string,
    materialsDeleted: number,
    materialsSkipped: number,
    materialsFailed: number,
    uncertainDeletions: number,
    retryCount: number,
    retrySuccess: boolean,
    errorMessage?: string
  ): Promise<boolean> {
    const requestId = getRequestId() || `update-order-${Date.now()}`

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getOrderTableName()
      const dialect = this.getDialect()

      const sqlString = `
        UPDATE ${tableName}
        SET Status = ${dialect.param(0)},
            MaterialsDeleted = ${dialect.param(1)},
            MaterialsSkipped = ${dialect.param(2)},
            MaterialsFailed = ${dialect.param(3)},
            UncertainDeletions = ${dialect.param(4)},
            RetryCount = ${dialect.param(5)},
            RetrySuccess = ${dialect.param(6)},
            ErrorMessage = ${dialect.param(7)}
        WHERE BatchId = ${dialect.param(8)}
          AND AttemptNumber = ${dialect.param(9)}
          AND OrderNumber = ${dialect.param(10)}
      `

      const params = [
        status,
        materialsDeleted,
        materialsSkipped,
        materialsFailed,
        uncertainDeletions,
        retryCount,
        retrySuccess ? 1 : 0,
        errorMessage || null,
        batchId,
        attemptNumber,
        orderNumber
      ]

      await trackDuration(async () => await dbService.query(sqlString, params), {
        operationName: 'CleanerOperationHistoryDAO.updateOrderStatus',
        context: {
          tableName,
          operationType: 'UPDATE',
          batchId,
          attemptNumber,
          orderNumber
        }
      })

      log.info('Order status updated', {
        tableName,
        operationType: 'UPDATE',
        requestId,
        batchId,
        attemptNumber,
        orderNumber,
        status
      })
      return true
    } catch (error) {
      log.error('Update order status error', {
        tableName: this.getOrderTableName(),
        operationType: 'UPDATE',
        requestId,
        batchId,
        attemptNumber,
        orderNumber,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  // ==================== MATERIAL INSERT ====================

  /**
   * Insert material detail records for a specific order
   * @param batchId - Batch identifier
   * @param attemptNumber - Attempt number
   * @param details - Array of material detail inputs
   * @returns True if successful
   */
  async insertMaterialDetails(
    batchId: string,
    attemptNumber: number,
    details: InsertMaterialDetailInput[]
  ): Promise<boolean> {
    if (!details || details.length === 0) {
      log.warn('No material details to insert', {
        batchId,
        attemptNumber,
        tableName: this.getMaterialTableName(),
        requestId: getRequestId()
      })
      return false
    }

    const requestId = getRequestId() || `insert-materials-${Date.now()}`

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getMaterialTableName()
      const dialect = this.getDialect()

      log.info('Material details insertion started', {
        tableName,
        operationType: 'INSERT',
        requestId,
        batchId,
        attemptNumber,
        detailCount: details.length
      })

      for (const detail of details) {
        try {
          const sqlString = `
            INSERT INTO ${tableName}
              (BatchId, AttemptNumber, OrderNumber, MaterialCode, MaterialName,
               RowNumber, Result, Reason, AttemptCount, FinalErrorCategory)
            VALUES
              (${dialect.param(0)}, ${dialect.param(1)}, ${dialect.param(2)},
               ${dialect.param(3)}, ${dialect.param(4)}, ${dialect.param(5)},
               ${dialect.param(6)}, ${dialect.param(7)}, ${dialect.param(8)},
               ${dialect.param(9)})
          `
          await trackDuration(
            async () =>
              await dbService.query(sqlString, [
                batchId,
                attemptNumber,
                detail.orderNumber,
                detail.materialCode,
                detail.materialName,
                detail.rowNumber,
                detail.result,
                detail.reason || null,
                detail.attemptCount,
                detail.finalErrorCategory || null
              ]),
            {
              operationName: 'CleanerOperationHistoryDAO.insertMaterialDetails',
              context: {
                tableName,
                operationType: 'INSERT',
                batchId,
                attemptNumber,
                materialCode: detail.materialCode
              }
            }
          )
        } catch (error) {
          log.error('Error inserting individual material detail', {
            tableName,
            operationType: 'INSERT',
            requestId,
            batchId,
            attemptNumber,
            orderNumber: detail.orderNumber,
            materialCode: detail.materialCode,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      log.info('Material details inserted', {
        tableName,
        operationType: 'INSERT',
        requestId,
        batchId,
        attemptNumber,
        count: details.length
      })
      return true
    } catch (error) {
      log.error('Insert material details error', {
        tableName: this.getMaterialTableName(),
        operationType: 'INSERT',
        requestId,
        batchId,
        attemptNumber,
        detailCount: details.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  // ==================== QUERY: GET BATCHES ====================

  /**
   * Get batch statistics with optional user filtering
   * @param userId - Optional user ID for filtering
   * @param options - Query options (limit, offset, usernames)
   * @returns Array of batch statistics
   */
  async getBatches(
    userId?: number,
    options?: GetCleanerBatchesOptions
  ): Promise<CleanerBatchStats[]> {
    try {
      const dbService = await this.getDatabaseService()
      const execTable = this.getExecutionTableName()
      const orderTable = this.getOrderTableName()
      const dialect = this.getDialect()

      let sqlString = `
        SELECT
          e.BatchId,
          e.UserId,
          e.Username,
          MIN(e.OperationTime) as OperationTime,
          MAX(CASE WHEN e.AttemptNumber = latest.max_attempt THEN e.Status ELSE NULL END) as Status,
          COUNT(DISTINCT e.AttemptNumber) as TotalAttempts,
          MAX(e.TotalOrders) as TotalOrders,
          MAX(CASE WHEN e.AttemptNumber = latest.max_attempt THEN e.OrdersProcessed ELSE 0 END) as OrdersProcessed,
          MAX(CASE WHEN e.AttemptNumber = latest.max_attempt THEN e.TotalMaterialsDeleted ELSE 0 END) as TotalMaterialsDeleted,
          MAX(CASE WHEN e.AttemptNumber = latest.max_attempt THEN e.TotalMaterialsFailed ELSE 0 END) as TotalMaterialsFailed,
          ${this.getIsDryRunAggregateSql()} as IsDryRun,
          COALESCE(SUM(CASE WHEN o.Status = 'success' THEN 1 ELSE 0 END), 0) as SuccessCount,
          COALESCE(SUM(CASE WHEN o.Status = 'failed' THEN 1 ELSE 0 END), 0) as FailedCount
        FROM ${execTable} e
        INNER JOIN (
          SELECT BatchId, MAX(AttemptNumber) as max_attempt
          FROM ${execTable}
          GROUP BY BatchId
        ) latest ON e.BatchId = latest.BatchId
        LEFT JOIN ${orderTable} o ON e.BatchId = o.BatchId AND e.AttemptNumber = latest.max_attempt
      `

      const params: (number | string)[] = []

      if (userId !== undefined) {
        sqlString += ` WHERE e.UserId = ${dialect.param(params.length)} `
        params.push(userId)
      } else if (options?.usernames && options.usernames.length > 0) {
        sqlString += ` WHERE e.Username IN (${dialect.params(options.usernames.length)}) `
        params.push(...options.usernames)
      }

      sqlString += `
        GROUP BY e.BatchId, e.UserId, e.Username, latest.max_attempt
        ORDER BY OperationTime DESC
      `

      if (options?.limit) {
        const safeLimit = Math.floor(options.limit)
        const safeOffset = options.offset !== undefined ? Math.floor(options.offset) : undefined

        const result = dialect.paginate({
          sql: sqlString,
          limit: safeLimit,
          offset: safeOffset,
          paramIndex: params.length
        })
        sqlString = result.sql

        if (dialect.dbType === 'sqlserver') {
          if (safeOffset !== undefined) {
            params.push(safeOffset)
          }
          params.push(safeLimit)
        }
      }

      const result = await trackDuration(async () => await dbService.query(sqlString, params), {
        operationName: 'CleanerOperationHistoryDAO.getBatches',
        context: { operationType: 'SELECT', userId }
      })

      return result.result.rows.map((row) => ({
        batchId: row.BatchId as string,
        userId: row.UserId as number,
        username: row.Username as string,
        operationTime: formatDateTime(row.OperationTime),
        status: row.Status as string,
        totalAttempts: row.TotalAttempts as number,
        totalOrders: (row.TotalOrders as number) || 0,
        ordersProcessed: (row.OrdersProcessed as number) || 0,
        totalMaterialsDeleted: (row.TotalMaterialsDeleted as number) || 0,
        totalMaterialsFailed: (row.TotalMaterialsFailed as number) || 0,
        successCount: (row.SuccessCount as number) || 0,
        failedCount: (row.FailedCount as number) || 0,
        isDryRun: !!(row.IsDryRun as number)
      }))
    } catch (error) {
      log.error('Get batches error', {
        operationType: 'SELECT',
        requestId: getRequestId(),
        userId,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  // ==================== QUERY: GET BATCH DETAILS ====================

  /**
   * Get detailed records for a specific batch
   * @param batchId - Batch identifier
   * @returns Object with executions and orders arrays
   */
  async getBatchDetails(
    batchId: string
  ): Promise<{ executions: CleanerExecutionRecord[]; orders: CleanerOrderRecord[] }> {
    const requestId = getRequestId() || `details-${Date.now()}`

    try {
      const dbService = await this.getDatabaseService()
      const execTable = this.getExecutionTableName()
      const orderTable = this.getOrderTableName()
      const dialect = this.getDialect()

      // Query executions
      const execSql = `
        SELECT
          ID, BatchId, AttemptNumber, UserId, Username,
          OperationTime, EndTime, Status, IsDryRun,
          TotalOrders, OrdersProcessed,
          TotalMaterialsDeleted, TotalMaterialsSkipped, TotalMaterialsFailed,
          TotalUncertainDeletions, ErrorMessage, AppVersion
        FROM ${execTable}
        WHERE BatchId = ${dialect.param(0)}
        ORDER BY AttemptNumber
      `

      const execResult = await trackDuration(
        async () => await dbService.query(execSql, [batchId]),
        {
          operationName: 'CleanerOperationHistoryDAO.getBatchDetails.executions',
          context: { operationType: 'SELECT', batchId }
        }
      )

      // Query orders
      const orderSql = `
        SELECT
          ID, BatchId, AttemptNumber, OrderNumber, ProductionId, Status,
          MaterialsDeleted, MaterialsSkipped, MaterialsFailed,
          UncertainDeletions, RetryCount, RetrySuccess, ErrorMessage
        FROM ${orderTable}
        WHERE BatchId = ${dialect.param(0)}
        ORDER BY AttemptNumber, ID
      `

      const orderResult = await trackDuration(
        async () => await dbService.query(orderSql, [batchId]),
        {
          operationName: 'CleanerOperationHistoryDAO.getBatchDetails.orders',
          context: { operationType: 'SELECT', batchId }
        }
      )

      const executions: CleanerExecutionRecord[] = execResult.result.rows.map((row) => ({
        id: row.ID as number,
        batchId: row.BatchId as string,
        attemptNumber: row.AttemptNumber as number,
        userId: row.UserId as number,
        username: row.Username as string,
        operationTime:
          row.OperationTime instanceof Date
            ? row.OperationTime
            : new Date(row.OperationTime as string),
        endTime: row.EndTime
          ? row.EndTime instanceof Date
            ? row.EndTime
            : new Date(row.EndTime as string)
          : null,
        status: row.Status as string,
        isDryRun: !!(row.IsDryRun as number),
        totalOrders: row.TotalOrders as number,
        ordersProcessed: row.OrdersProcessed as number,
        totalMaterialsDeleted: row.TotalMaterialsDeleted as number,
        totalMaterialsSkipped: row.TotalMaterialsSkipped as number,
        totalMaterialsFailed: row.TotalMaterialsFailed as number,
        totalUncertainDeletions: row.TotalUncertainDeletions as number,
        errorMessage: row.ErrorMessage as string | null,
        appVersion: row.AppVersion as string | null
      }))

      const orders: CleanerOrderRecord[] = orderResult.result.rows.map((row) => ({
        id: row.ID as number,
        batchId: row.BatchId as string,
        attemptNumber: row.AttemptNumber as number,
        orderNumber: row.OrderNumber as string,
        productionId: (row.ProductionId as string) || null,
        status: row.Status as string,
        materialsDeleted: row.MaterialsDeleted as number,
        materialsSkipped: row.MaterialsSkipped as number,
        materialsFailed: row.MaterialsFailed as number,
        uncertainDeletions: row.UncertainDeletions as number,
        retryCount: row.RetryCount as number,
        retrySuccess: !!(row.RetrySuccess as number),
        errorMessage: row.ErrorMessage as string | null
      }))

      log.info('Batch details retrieved', {
        operationType: 'SELECT',
        requestId,
        batchId,
        executionCount: executions.length,
        orderCount: orders.length
      })

      return { executions, orders }
    } catch (error) {
      log.error('Get batch details error', {
        operationType: 'SELECT',
        requestId,
        batchId,
        error: error instanceof Error ? error.message : String(error)
      })
      return { executions: [], orders: [] }
    }
  }

  // ==================== QUERY: GET MATERIAL DETAILS ====================

  /**
   * Get material details for a specific order in an attempt
   * @param batchId - Batch identifier
   * @param attemptNumber - Attempt number
   * @param orderNumber - Order number
   * @returns Array of material records
   */
  async getMaterialDetails(
    batchId: string,
    attemptNumber: number,
    orderNumber: string
  ): Promise<CleanerMaterialRecord[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getMaterialTableName()
      const dialect = this.getDialect()

      const sqlString = `
        SELECT
          ID, BatchId, AttemptNumber, OrderNumber,
          MaterialCode, MaterialName, RowNumber,
          Result, Reason, AttemptCount, FinalErrorCategory
        FROM ${tableName}
        WHERE BatchId = ${dialect.param(0)}
          AND AttemptNumber = ${dialect.param(1)}
          AND OrderNumber = ${dialect.param(2)}
      `

      const result = await trackDuration(
        async () => await dbService.query(sqlString, [batchId, attemptNumber, orderNumber]),
        {
          operationName: 'CleanerOperationHistoryDAO.getMaterialDetails',
          context: { operationType: 'SELECT', batchId, attemptNumber, orderNumber }
        }
      )

      return result.result.rows.map((row) => ({
        id: row.ID as number,
        batchId: row.BatchId as string,
        attemptNumber: row.AttemptNumber as number,
        orderNumber: row.OrderNumber as string,
        materialCode: row.MaterialCode as string,
        materialName: row.MaterialName as string,
        rowNumber: row.RowNumber as number,
        result: row.Result as string,
        reason: row.Reason as string | null,
        attemptCount: row.AttemptCount as number,
        finalErrorCategory: row.FinalErrorCategory as string | null
      }))
    } catch (error) {
      log.error('Get material details error', {
        tableName: this.getMaterialTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        batchId,
        attemptNumber,
        orderNumber,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  // ==================== DELETE ====================

  /**
   * Delete a batch with permission checking across all three tables
   * @param batchId - Batch identifier
   * @param requestingUserId - User ID requesting the deletion
   * @param isAdmin - Whether the requesting user is an admin
   * @returns Result with success flag and optional error message
   */
  async deleteBatch(
    batchId: string,
    requestingUserId: number,
    isAdmin: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const requestId = getRequestId() || `delete-${Date.now()}`

    try {
      const dbService = await this.getDatabaseService()
      const execTable = this.getExecutionTableName()
      const orderTable = this.getOrderTableName()
      const materialTable = this.getMaterialTableName()
      const dialect = this.getDialect()

      const details = await this.getBatchDetails(batchId)
      if (details.executions.length === 0) {
        return { success: false, error: '批次不存在' }
      }

      // Permission check: non-admin can only delete own batches
      const batchUserId = details.executions[0].userId
      if (!isAdmin && batchUserId !== requestingUserId) {
        return { success: false, error: '没有权限删除此批次' }
      }

      // Delete from CleanerMaterialDetail first (potential FK)
      const deleteMaterialSql = `
        DELETE FROM ${materialTable}
        WHERE BatchId = ${dialect.param(0)}
      `
      await trackDuration(async () => await dbService.query(deleteMaterialSql, [batchId]), {
        operationName: 'CleanerOperationHistoryDAO.deleteBatch.materials',
        context: { operationType: 'DELETE', batchId }
      })

      // Delete from CleanerOrderHistory
      const deleteOrderSql = `
        DELETE FROM ${orderTable}
        WHERE BatchId = ${dialect.param(0)}
      `
      await trackDuration(async () => await dbService.query(deleteOrderSql, [batchId]), {
        operationName: 'CleanerOperationHistoryDAO.deleteBatch.orders',
        context: { operationType: 'DELETE', batchId }
      })

      // Delete from CleanerExecution
      const deleteExecSql = `
        DELETE FROM ${execTable}
        WHERE BatchId = ${dialect.param(0)}
      `
      const deleteResult = await trackDuration(
        async () => await dbService.query(deleteExecSql, [batchId]),
        {
          operationName: 'CleanerOperationHistoryDAO.deleteBatch.executions',
          context: { operationType: 'DELETE', batchId, requestingUserId }
        }
      )

      log.info('Batch deleted', {
        operationType: 'DELETE',
        requestId,
        batchId,
        rowCount: deleteResult.result.rowCount
      })
      return { success: true }
    } catch (error) {
      log.error('Delete batch error', {
        operationType: 'DELETE',
        requestId,
        batchId,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  // ==================== QUERY: SEARCH BATCHES ====================

  /**
   * Full-level search across batches, orders, and materials.
   * Uses a UNION ALL query to find matching BatchIds, then fetches
   * full nested data for each matched batch.
   *
   * @param userId - Optional user ID for filtering
   * @param options - Search options (query string, usernames filter, result limit)
   * @returns Search result with matched batches and total count
   */
  async searchBatches(
    userId: number | undefined,
    options: SearchCleanerHistoryOptions
  ): Promise<CleanerHistorySearchResult> {
    const emptyResult: CleanerHistorySearchResult = { batches: [], totalMatches: 0 }

    try {
      const dbService = await this.getDatabaseService()
      const execTable = this.getExecutionTableName()
      const orderTable = this.getOrderTableName()
      const materialTable = this.getMaterialTableName()
      const dialect = this.getDialect()

      const { query, limit = 20 } = options
      const safeLimit = Math.floor(limit)
      const likePattern = `%${query}%`

      // Build UNION ALL to find distinct BatchIds matching the query
      // Each subquery searches a different table's columns
      let paramIndex = 0
      const p = () => dialect.param(paramIndex++)

      const unionSql = `
        SELECT DISTINCT BatchId FROM (
          SELECT BatchId FROM ${execTable}
          WHERE BatchId LIKE ${p()}
             OR Username LIKE ${p()}
             OR Status LIKE ${p()}
          UNION ALL
          SELECT BatchId FROM ${orderTable}
          WHERE OrderNumber LIKE ${p()}
             OR ProductionId LIKE ${p()}
          UNION ALL
          SELECT BatchId FROM ${materialTable}
          WHERE MaterialCode LIKE ${p()}
             OR MaterialName LIKE ${p()}
        ) AS matched
        WHERE BatchId IN (
          SELECT BatchId FROM ${execTable}
          WHERE 1=1
          ${userId !== undefined ? `AND UserId = ${p()}` : ''}
          ${userId === undefined && options.usernames && options.usernames.length > 0 ? `AND Username IN (${dialect.params(options.usernames.length)})` : ''}
        )
      `

      const unionParams: (string | number)[] = [
        likePattern, likePattern, likePattern, // exec table: BatchId, Username, Status
        likePattern, likePattern, // order table: OrderNumber, ProductionId
        likePattern, likePattern // material table: MaterialCode, MaterialName
      ]

      // User filtering params
      if (userId !== undefined) {
        unionParams.push(userId)
      } else if (options.usernames && options.usernames.length > 0) {
        unionParams.push(...options.usernames)
      }

      const { result } = await trackDuration(
        async () => await dbService.query(unionSql, unionParams),
        {
          operationName: 'CleanerOperationHistoryDAO.searchBatches.union',
          context: { operationType: 'SELECT', query }
        }
      )

      const matchedBatchIds: string[] = result.rows.map((row) => row.BatchId as string)
      const totalMatches = matchedBatchIds.length
      const limitedBatchIds = matchedBatchIds.slice(0, safeLimit)

      if (limitedBatchIds.length === 0) {
        return { batches: [], totalMatches: 0 }
      }

      // Fetch full nested data for each matched batch
      const batches: CleanerSearchBatchResult[] = []

      for (const batchId of limitedBatchIds) {
        try {
          const details = await this.getBatchDetails(batchId)

          if (details.executions.length === 0) {
            continue
          }

          // Derive batch stats from execution records
          const latestExec = details.executions.reduce((a, b) =>
            a.attemptNumber > b.attemptNumber ? a : b
          )

          const batch: CleanerBatchStats = {
            batchId,
            userId: latestExec.userId,
            username: latestExec.username,
            operationTime: latestExec.operationTime.toISOString(),
            status: latestExec.status,
            totalAttempts: details.executions.length,
            totalOrders: latestExec.totalOrders,
            ordersProcessed: latestExec.ordersProcessed,
            totalMaterialsDeleted: latestExec.totalMaterialsDeleted,
            totalMaterialsFailed: latestExec.totalMaterialsFailed,
            successCount: details.orders.filter((o) => o.status === 'success').length,
            failedCount: details.orders.filter((o) => o.status === 'failed').length,
            isDryRun: latestExec.isDryRun
          }

          // Fetch materials for each order
          const ordersWithMaterials = await Promise.all(
            details.orders.map(async (order) => {
              const materials = await this.getMaterialDetails(
                batchId,
                order.attemptNumber,
                order.orderNumber
              )
              return { order, materials }
            })
          )

          batches.push({
            batch,
            executions: details.executions,
            orders: ordersWithMaterials
          })
        } catch (error) {
          log.error('Error fetching batch data for search result', {
            operationType: 'SELECT',
            batchId,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      log.info('Search batches completed', {
        operationType: 'SELECT',
        requestId: getRequestId(),
        query,
        totalMatches,
        returnedBatches: batches.length
      })

      return { batches, totalMatches }
    } catch (error) {
      log.error('Search batches error', {
        operationType: 'SELECT',
        requestId: getRequestId(),
        query: options.query,
        error: error instanceof Error ? error.message : String(error)
      })
      return emptyResult
    }
  }

  // ==================== UTILITIES ====================

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.dbService) {
      await this.dbService.disconnect()
      this.dbService = null
      this.dialect = null
    }
  }
}
