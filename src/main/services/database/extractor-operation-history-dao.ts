/**
 * Data Access Object for ExtractorOperationHistory table
 *
 * Handles database operations for tracking extraction operation history:
 * - Batch record insertion
 * - Batch status updates
 * - Querying batches (with user filtering for non-admin users)
 * - Getting batch details
 * - Deleting batches
 */

import { create, type IDatabaseService } from './index'
import { createDialect, type SqlDialect } from './dialects'
import { createLogger, getRequestId, trackDuration } from '../logger'
import type {
  OperationHistoryRecord,
  BatchStats,
  InsertBatchRecordInput,
  UpdateBatchStatusResult,
  GetBatchesOptions
} from '../../types/operation-history.types'

const log = createLogger('ExtractorOperationHistoryDAO')

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
 * Configuration for ExtractorOperationHistory table
 */
export const EXTRACTOR_OPERATION_HISTORY_CONFIG = {
  COLUMNS: {
    ID: 'ID',
    BATCH_ID: 'BatchId',
    USER_ID: 'UserId',
    USERNAME: 'Username',
    PRODUCTION_ID: 'ProductionId',
    ORDER_NUMBER: 'OrderNumber',
    OPERATION_TIME: 'OperationTime',
    STATUS: 'Status',
    RECORD_COUNT: 'RecordCount',
    ERROR_MESSAGE: 'ErrorMessage'
  }
} as const

/**
 * ExtractorOperationHistory DAO Class
 */
export class ExtractorOperationHistoryDAO {
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
  private getTableName(): string {
    return this.getDialect().quoteTableName('dbo', 'ExtractorOperationHistory')
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

  // ==================== INSERT ====================

  /**
   * Insert batch records for a single extraction operation
   * @param batchId - Unique batch identifier
   * @param userId - User ID performing the operation
   * @param username - Username performing the operation
   * @param records - Array of order records to insert
   * @returns True if successful
   */
  async insertBatchRecords(
    batchId: string,
    userId: number,
    username: string,
    records: InsertBatchRecordInput[]
  ): Promise<boolean> {
    if (!records || records.length === 0) {
      log.warn('No records to insert', {
        batchId,
        tableName: this.getTableName(),
        requestId: getRequestId()
      })
      return false
    }

    const requestId = getRequestId() || `insert-${Date.now()}`

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      log.info('Batch records insertion started', {
        tableName,
        operationType: 'INSERT',
        requestId,
        batchId,
        userId,
        username,
        recordCount: records.length
      })

      const columnsPerRecord = 5
      const batchSize = Math.max(1, dialect.maxBatchRows(columnsPerRecord))

      for (let offset = 0; offset < records.length; offset += batchSize) {
        const batch = records.slice(offset, offset + batchSize)
        try {
          const valuesSql: string[] = []
          const params: (string | number | null)[] = []

          batch.forEach((record, index) => {
            const paramOffset = index * columnsPerRecord
            valuesSql.push(
              `(${dialect.param(paramOffset)}, ${dialect.param(paramOffset + 1)}, ${dialect.param(paramOffset + 2)}, ${dialect.param(paramOffset + 3)}, ${dialect.param(paramOffset + 4)}, ${dialect.currentTimestamp()}, 'pending')`
            )
            params.push(batchId, userId, username, record.productionId || null, record.orderNumber)
          })

          const sqlString = `
            INSERT INTO ${tableName}
              (BatchId, UserId, Username, ProductionId, OrderNumber, OperationTime, Status)
            VALUES
              ${valuesSql.join(',\n              ')}
          `
          await trackDuration(async () => await dbService.query(sqlString, params), {
            operationName: 'ExtractorOperationHistoryDAO.insertBatchRecords',
            context: {
              tableName,
              operationType: 'INSERT',
              batchId,
              batchOffset: offset,
              batchCount: batch.length
            }
          })
        } catch (error) {
          log.error('Error inserting record batch', {
            tableName,
            operationType: 'INSERT',
            requestId,
            batchId,
            batchOffset: offset,
            batchCount: batch.length,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      log.info('Batch records inserted', {
        tableName,
        operationType: 'INSERT',
        requestId,
        batchId,
        count: records.length
      })
      return true
    } catch (error) {
      log.error('Insert batch records error', {
        tableName: this.getTableName(),
        operationType: 'INSERT',
        requestId,
        batchId,
        recordCount: records.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  // ==================== UPDATE ====================

  /**
   * Update the status of all records in a batch
   * @param batchId - Batch identifier
   * @param status - New status (success, failed, partial)
   * @returns Update result
   */
  async updateBatchStatus(batchId: string, status: string): Promise<UpdateBatchStatusResult> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const sqlString = `
        UPDATE ${tableName}
        SET Status = ${dialect.param(0)}
        WHERE BatchId = ${dialect.param(1)}
      `
      const params = [status, batchId]

      await trackDuration(async () => await dbService.query(sqlString, params), {
        operationName: 'ExtractorOperationHistoryDAO.updateBatchStatus',
        context: { tableName, operationType: 'UPDATE', batchId }
      })

      log.info('Batch status updated', {
        tableName,
        operationType: 'UPDATE',
        requestId: getRequestId(),
        batchId,
        status
      })
      return { success: true, updatedCount: 1 }
    } catch (error) {
      log.error('Update batch status error', {
        tableName: this.getTableName(),
        operationType: 'UPDATE',
        requestId: getRequestId(),
        batchId,
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false, updatedCount: 0 }
    }
  }

  /**
   * Update a single record's status, error message, and optional record count
   * @param batchId - Batch identifier
   * @param orderNumber - Order number
   * @param status - New status
   * @param errorMessage - Optional error message
   * @param recordCount - Optional per-order record count
   * @returns True if successful
   */
  async updateRecordStatus(
    batchId: string,
    orderNumber: string,
    status: string,
    errorMessage?: string,
    recordCount?: number
  ): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      let sqlString: string
      let params: (string | number | null)[]

      if (recordCount !== undefined) {
        sqlString = `
          UPDATE ${tableName}
          SET Status = ${dialect.param(0)},
              ErrorMessage = ${dialect.param(1)},
              RecordCount = ${dialect.param(2)}
          WHERE BatchId = ${dialect.param(3)}
            AND OrderNumber = ${dialect.param(4)}
        `
        params = [status, errorMessage || null, recordCount, batchId, orderNumber]
      } else {
        sqlString = `
          UPDATE ${tableName}
          SET Status = ${dialect.param(0)},
              ErrorMessage = ${dialect.param(1)}
          WHERE BatchId = ${dialect.param(2)}
            AND OrderNumber = ${dialect.param(3)}
        `
        params = [status, errorMessage || null, batchId, orderNumber]
      }

      await trackDuration(async () => await dbService.query(sqlString, params), {
        operationName: 'ExtractorOperationHistoryDAO.updateRecordStatus',
        context: { tableName, operationType: 'UPDATE', batchId }
      })

      return true
    } catch (error) {
      log.error('Update record status error', {
        tableName: this.getTableName(),
        operationType: 'UPDATE',
        requestId: getRequestId(),
        batchId,
        orderNumber,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  // ==================== READ ====================

  /**
   * Get batch statistics with optional user filtering
   * @param userId - Optional user ID for filtering (Admin gets all, User gets own)
   * @param options - Query options (limit, offset, usernames)
   * @returns Array of batch statistics
   */
  async getBatches(userId?: number, options?: GetBatchesOptions): Promise<BatchStats[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      let sqlString = `
        SELECT
          BatchId,
          UserId,
          Username,
          MIN(OperationTime) as OperationTime,
          MAX(Status) as Status,
          COUNT(*) as TotalOrders,
          SUM(COALESCE(RecordCount, 0)) as TotalRecords,
          SUM(CASE WHEN Status = 'success' THEN 1 ELSE 0 END) as SuccessCount,
          SUM(CASE WHEN Status = 'failed' THEN 1 ELSE 0 END) as FailedCount
        FROM ${tableName}
      `

      const params: (number | string)[] = []

      if (userId !== undefined) {
        sqlString += ` WHERE UserId = ${dialect.param(params.length)} `
        params.push(userId)
      } else if (options?.usernames && options.usernames.length > 0) {
        sqlString += ` WHERE Username IN (${dialect.params(options.usernames.length)}) `
        params.push(...options.usernames)
      }

      sqlString += `
        GROUP BY BatchId, UserId, Username
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
        operationName: 'ExtractorOperationHistoryDAO.getBatches',
        context: { tableName, operationType: 'SELECT', userId }
      })

      return result.result.rows.map((row) => ({
        batchId: row.BatchId as string,
        userId: row.UserId as number,
        username: row.Username as string,
        operationTime: formatDateTime(row.OperationTime),
        status: row.Status as string,
        totalOrders: row.TotalOrders as number,
        totalRecords: (row.TotalRecords as number) || 0,
        successCount: (row.SuccessCount as number) || 0,
        failedCount: (row.FailedCount as number) || 0
      }))
    } catch (error) {
      log.error('Get batches error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        userId,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Get detailed records for a specific batch
   * @param batchId - Batch identifier
   * @returns Array of operation records
   */
  async getBatchDetails(batchId: string): Promise<OperationHistoryRecord[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        SELECT
          ID,
          BatchId,
          UserId,
          Username,
          ProductionId,
          OrderNumber,
          OperationTime,
          Status,
          RecordCount,
          ErrorMessage
        FROM ${tableName}
        WHERE BatchId = ${placeholder}
        ORDER BY ID
      `

      const result = await trackDuration(async () => await dbService.query(sqlString, [batchId]), {
        operationName: 'ExtractorOperationHistoryDAO.getBatchDetails',
        context: { tableName, operationType: 'SELECT', batchId }
      })

      return result.result.rows.map((row) => ({
        id: row.ID as number,
        batchId: row.BatchId as string,
        userId: row.UserId as number,
        username: row.Username as string,
        productionId: row.ProductionId as string | null,
        orderNumber: row.OrderNumber as string,
        operationTime: new Date(row.OperationTime as string),
        status: row.Status as string,
        recordCount: row.RecordCount as number | null,
        errorMessage: row.ErrorMessage as string | null
      }))
    } catch (error) {
      log.error('Get batch details error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        batchId,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Get a single batch's statistics
   * @param batchId - Batch identifier
   * @returns Batch statistics or null
   */
  async getBatchStats(batchId: string): Promise<BatchStats | null> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        SELECT
          BatchId,
          UserId,
          Username,
          MIN(OperationTime) as OperationTime,
          MAX(Status) as Status,
          COUNT(*) as TotalOrders,
          SUM(COALESCE(RecordCount, 0)) as TotalRecords,
          SUM(CASE WHEN Status = 'success' THEN 1 ELSE 0 END) as SuccessCount,
          SUM(CASE WHEN Status = 'failed' THEN 1 ELSE 0 END) as FailedCount
        FROM ${tableName}
        WHERE BatchId = ${placeholder}
        GROUP BY BatchId, UserId, Username
      `

      const result = await trackDuration(async () => await dbService.query(sqlString, [batchId]), {
        operationName: 'ExtractorOperationHistoryDAO.getBatchStats',
        context: { tableName, operationType: 'SELECT', batchId }
      })

      if (result.result.rows.length === 0) {
        return null
      }

      const row = result.result.rows[0]
      return {
        batchId: row.BatchId as string,
        userId: row.UserId as number,
        username: row.Username as string,
        operationTime: formatDateTime(row.OperationTime),
        status: row.Status as string,
        totalOrders: row.TotalOrders as number,
        totalRecords: (row.TotalRecords as number) || 0,
        successCount: (row.SuccessCount as number) || 0,
        failedCount: (row.FailedCount as number) || 0
      }
    } catch (error) {
      log.error('Get batch stats error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        batchId,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  // ==================== DELETE ====================

  /**
   * Delete a batch with permission checking
   * @param batchId - Batch identifier
   * @param requestingUserId - User ID requesting the deletion
   * @param isAdmin - Whether the requesting user is an admin
   * @returns True if successful
   */
  async deleteBatch(
    batchId: string,
    requestingUserId: number,
    isAdmin: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const requestId = getRequestId() || `delete-${Date.now()}`

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      // First check if the batch exists and if the user has permission
      const batchStats = await this.getBatchStats(batchId)

      if (!batchStats) {
        return { success: false, error: '批次不存在' }
      }

      // Non-admin users can only delete their own batches
      if (!isAdmin && batchStats.userId !== requestingUserId) {
        return { success: false, error: '没有权限删除此批次' }
      }

      // Delete the batch
      const placeholder = dialect.param(0)
      const sqlString = `
        DELETE FROM ${tableName}
        WHERE BatchId = ${placeholder}
      `

      const result = await trackDuration(async () => await dbService.query(sqlString, [batchId]), {
        operationName: 'ExtractorOperationHistoryDAO.deleteBatch',
        context: { tableName, operationType: 'DELETE', batchId, requestingUserId }
      })

      log.info('Batch deleted', {
        tableName,
        operationType: 'DELETE',
        requestId,
        batchId,
        rowCount: result.result.rowCount
      })
      return { success: true }
    } catch (error) {
      log.error('Delete batch error', {
        tableName: this.getTableName(),
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

  /**
   * Delete all batches for a specific user
   * @param userId - User ID
   * @returns Number of batches deleted
   */
  async deleteByUser(userId: number): Promise<number> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        DELETE FROM ${tableName}
        WHERE UserId = ${placeholder}
      `

      const result = await trackDuration(async () => await dbService.query(sqlString, [userId]), {
        operationName: 'ExtractorOperationHistoryDAO.deleteByUser',
        context: { tableName, operationType: 'DELETE', userId }
      })
      return result.result.rowCount
    } catch (error) {
      log.error('Delete by user error', {
        tableName: this.getTableName(),
        operationType: 'DELETE',
        requestId: getRequestId(),
        userId,
        error: error instanceof Error ? error.message : String(error)
      })
      return 0
    }
  }

  // ==================== UTILITIES ====================

  /**
   * Check if a batch exists
   * @param batchId - Batch identifier
   * @returns True if batch exists
   */
  async batchExists(batchId: string): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE BatchId = ${placeholder}
      `

      const result = await trackDuration(async () => await dbService.query(sqlString, [batchId]), {
        operationName: 'ExtractorOperationHistoryDAO.batchExists',
        context: { tableName, operationType: 'SELECT', batchId }
      })
      return result.result.rows.length > 0 && (result.result.rows[0].count as number) > 0
    } catch (error) {
      log.error('Batch exists error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        batchId,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * Count total batches with optional user filtering
   * @param userId - Optional user ID for filtering
   * @param usernames - Optional usernames filter for Admin users
   * @returns Total number of batches
   */
  async countBatches(userId?: number, usernames?: string[]): Promise<number> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      let sqlString = `
        SELECT COUNT(DISTINCT BatchId) as count
        FROM ${tableName}
      `

      const params: (number | string)[] = []

      if (userId !== undefined) {
        sqlString += ` WHERE UserId = ${dialect.param(params.length)} `
        params.push(userId)
      } else if (usernames && usernames.length > 0) {
        sqlString += ` WHERE Username IN (${dialect.params(usernames.length)}) `
        params.push(...usernames)
      }

      const result = await trackDuration(async () => await dbService.query(sqlString, params), {
        operationName: 'ExtractorOperationHistoryDAO.countBatches',
        context: { tableName, operationType: 'SELECT', userId }
      })
      return result.result.rows.length > 0 ? (result.result.rows[0].count as number) : 0
    } catch (error) {
      log.error('Count batches error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return 0
    }
  }

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
