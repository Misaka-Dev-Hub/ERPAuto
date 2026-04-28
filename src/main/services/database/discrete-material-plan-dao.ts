/**
 * Data Access Object for DiscreteMaterialPlanData table
 *
 * Mirrors the Python DiscreteMaterialPlanDAO functionality:
 * - Query operations for discrete material plan data
 * - Support for querying by PlanNumber, SourceNumber
 * - Deduplication by MaterialCode
 * - Statistics gathering
 */

import { create, type IDatabaseService } from './index'
import { createDialect, type SqlDialect } from './dialects'
import { createLogger, getRequestId, trackDuration } from '../logger'

const log = createLogger('DiscreteMaterialPlanDAO')
const SQLSERVER_REPLACE_SOURCE_NUMBER_BATCH_SIZE = 25

/**
 * Material plan record interface
 */
export interface MaterialPlanRecord {
  id?: number
  factory: string
  materialStatus: string
  planNumber: string
  sourceNumber: string
  materialType: string
  productCode: string
  productName: string
  productUnit: string
  productPlanQuantity: number
  useDepartment: string
  remark: string
  creator: string
  createDate: Date
  approver: string
  approveDate: Date
  sequenceNumber: number
  materialCode: string
  materialName: string
  specification: string
  model: string
  drawingNumber: string
  materialQuality: string
  planQuantity: number
  unit: string
  requiredDate: Date
  warehouse: string
  unitUsage: number
  cumulativeOutputQuantity: number
  bomVersion: string
}

/**
 * Configuration for DiscreteMaterialPlanData table
 */
export const DISCRETE_MATERIAL_PLAN_CONFIG = {
  COLUMNS: {
    ID: 'ID',
    FACTORY: 'Factory',
    MATERIAL_STATUS: 'MaterialStatus',
    PLAN_NUMBER: 'PlanNumber',
    SOURCE_NUMBER: 'SourceNumber',
    MATERIAL_TYPE: 'MaterialType',
    PRODUCT_CODE: 'ProductCode',
    PRODUCT_NAME: 'ProductName',
    PRODUCT_UNIT: 'ProductUnit',
    PRODUCT_PLAN_QUANTITY: 'ProductPlanQuantity',
    USE_DEPARTMENT: 'UseDepartment',
    REMARK: 'Remark',
    CREATOR: 'Creator',
    CREATE_DATE: 'CreateDate',
    APPROVER: 'Approver',
    APPROVE_DATE: 'ApproveDate',
    SEQUENCE_NUMBER: 'SequenceNumber',
    MATERIAL_CODE: 'MaterialCode',
    MATERIAL_NAME: 'MaterialName',
    SPECIFICATION: 'Specification',
    MODEL: 'Model',
    DRAWING_NUMBER: 'DrawingNumber',
    MATERIAL_QUALITY: 'MaterialQuality',
    PLAN_QUANTITY: 'PlanQuantity',
    UNIT: 'Unit',
    REQUIRED_DATE: 'RequiredDate',
    WAREHOUSE: 'Warehouse',
    UNIT_USAGE: 'UnitUsage',
    CUMULATIVE_OUTPUT_QUANTITY: 'CumulativeOutputQuantity',
    BOM_VERSION: 'BOMVersion'
  }
} as const

/**
 * DiscreteMaterialPlanDAO Class
 */
export class DiscreteMaterialPlanDAO {
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
    return this.getDialect().quoteTableName('dbo', 'DiscreteMaterialPlanData')
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

  // ==================== QUERY ALL ====================

  /**
   * Query all records from DiscreteMaterialPlanData table
   * @returns List of all records
   */
  async queryAll(): Promise<any[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `SELECT * FROM ${tableName}`
      const result = await trackDuration(async () => await dbService.query(sqlString), {
        operationName: 'DiscreteMaterialPlanDAO.queryAll',
        context: { tableName, operationType: 'SELECT' }
      })

      return result.result.rows
    } catch (error) {
      log.error('Query all error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Query all records with deduplication by MaterialCode
   * Strategy: Keep first record for each MaterialCode
   * Order: CreateDate ASC, SequenceNumber ASC
   * @returns List of deduplicated records
   */
  async queryAllDistinctByMaterialCode(): Promise<any[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `
        WITH RankedRecords AS (
          SELECT
            *,
            ROW_NUMBER() OVER (
              PARTITION BY MaterialCode
              ORDER BY CreateDate ASC, SequenceNumber ASC
            ) AS rn
          FROM ${tableName}
          WHERE MaterialCode IS NOT NULL
        )
        SELECT
          Factory, MaterialStatus, PlanNumber, SourceNumber, MaterialType,
          ProductCode, ProductName, ProductUnit, ProductPlanQuantity,
          UseDepartment, Remark, Creator, CreateDate, Approver, ApproveDate,
          SequenceNumber, MaterialCode, MaterialName, Specification, Model,
          DrawingNumber, MaterialQuality, PlanQuantity, Unit, RequiredDate,
          Warehouse, UnitUsage, CumulativeOutputQuantity, BOMVersion
        FROM RankedRecords
        WHERE rn = 1
      `

      const result = await trackDuration(async () => await dbService.query(sqlString), {
        operationName: 'DiscreteMaterialPlanDAO.queryAllDistinctByMaterialCode',
        context: { tableName: this.getTableName(), operationType: 'SELECT' }
      })
      return result.result.rows
    } catch (error) {
      log.error('Query all distinct by material code error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  // ==================== QUERY BY SOURCE NUMBER ====================

  /**
   * Query records by SourceNumber list
   * @param sourceNumbers - List of SourceNumber values
   * @returns List of records
   */
  async queryBySourceNumbers(sourceNumbers: string[]): Promise<any[]> {
    if (!sourceNumbers || sourceNumbers.length === 0) {
      return []
    }

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()
      const batchSize = 1500
      const allResults: any[] = []

      for (let i = 0; i < sourceNumbers.length; i += batchSize) {
        const batch = sourceNumbers.slice(i, i + batchSize)
        const placeholders = dialect.params(batch.length)

        const sqlString = `
          SELECT *
          FROM ${tableName}
          WHERE SourceNumber IN (${placeholders})
        `

        const result = await trackDuration(async () => await dbService.query(sqlString, batch), {
          operationName: 'DiscreteMaterialPlanDAO.queryBySourceNumbers',
          context: {
            tableName,
            operationType: 'SELECT',
            batchNumber: Math.floor(i / batchSize) + 1,
            batchSize: batch.length
          }
        })
        allResults.push(...result.result.rows)
      }

      return allResults
    } catch (error) {
      log.error('Query by source numbers error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        recordCount: sourceNumbers.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Query records by SourceNumber with deduplication by MaterialCode
   * Strategy: Keep first record for each MaterialCode
   * Order: CreateDate ASC, SequenceNumber ASC
   * @param sourceNumbers - List of SourceNumber values
   * @returns List of deduplicated records
   */
  async queryBySourceNumbersDistinct(sourceNumbers: string[]): Promise<any[]> {
    if (!sourceNumbers || sourceNumbers.length === 0) {
      return []
    }

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()
      const batchSize = 1500
      const allResults: any[] = []

      for (let i = 0; i < sourceNumbers.length; i += batchSize) {
        const batch = sourceNumbers.slice(i, i + batchSize)
        const placeholders = dialect.params(batch.length)

        const sqlString = `
          WITH RankedRecords AS (
            SELECT
              *,
              ROW_NUMBER() OVER (
                PARTITION BY MaterialCode
                ORDER BY CreateDate ASC, SequenceNumber ASC
              ) AS rn
            FROM ${tableName}
            WHERE SourceNumber IN (${placeholders})
              AND MaterialCode IS NOT NULL
          )
          SELECT
            Factory, MaterialStatus, PlanNumber, SourceNumber, MaterialType,
            ProductCode, ProductName, ProductUnit, ProductPlanQuantity,
            UseDepartment, Remark, Creator, CreateDate, Approver, ApproveDate,
            SequenceNumber, MaterialCode, MaterialName, Specification, Model,
            DrawingNumber, MaterialQuality, PlanQuantity, Unit, RequiredDate,
            Warehouse, UnitUsage, CumulativeOutputQuantity, BOMVersion
          FROM RankedRecords
          WHERE rn = 1
        `

        const result = await trackDuration(async () => await dbService.query(sqlString, batch), {
          operationName: 'DiscreteMaterialPlanDAO.queryBySourceNumbersDistinct',
          context: {
            tableName,
            operationType: 'SELECT',
            batchNumber: Math.floor(i / batchSize) + 1,
            batchSize: batch.length
          }
        })
        allResults.push(...result.result.rows)
      }

      return allResults
    } catch (error) {
      log.error('Query by source numbers distinct error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        recordCount: sourceNumbers.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Query by production order number (SourceNumber)
   * @param sourceNumber - SourceNumber value
   * @returns List of records
   */
  async queryBySourceNumber(sourceNumber: string): Promise<any[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        SELECT *
        FROM ${tableName}
        WHERE SourceNumber = ${placeholder}
      `

      const result = await trackDuration(
        async () => await dbService.query(sqlString, [sourceNumber]),
        {
          operationName: 'DiscreteMaterialPlanDAO.queryBySourceNumber',
          context: { tableName, operationType: 'SELECT' }
        }
      )
      return result.result.rows
    } catch (error) {
      log.error('Query by source number error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  // ==================== QUERY BY PLAN NUMBER ====================

  /**
   * Query by plan number
   * @param planNumber - PlanNumber value
   * @returns List of records
   */
  async queryByPlanNumber(planNumber: string): Promise<any[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        SELECT *
        FROM ${tableName}
        WHERE PlanNumber = ${placeholder}
      `

      const result = await trackDuration(
        async () => await dbService.query(sqlString, [planNumber]),
        {
          operationName: 'DiscreteMaterialPlanDAO.queryByPlanNumber',
          context: { tableName, operationType: 'SELECT' }
        }
      )
      return result.result.rows
    } catch (error) {
      log.error('Query by plan number error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Query by multiple plan numbers
   * @param planNumbers - List of PlanNumber values
   * @returns List of records
   */
  async queryByPlanNumbers(planNumbers: string[]): Promise<any[]> {
    if (!planNumbers || planNumbers.length === 0) {
      return []
    }

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()
      const batchSize = 1500
      const allResults: any[] = []

      for (let i = 0; i < planNumbers.length; i += batchSize) {
        const batch = planNumbers.slice(i, i + batchSize)
        const placeholders = dialect.params(batch.length)

        const sqlString = `
          SELECT *
          FROM ${tableName}
          WHERE PlanNumber IN (${placeholders})
        `

        const result = await trackDuration(async () => await dbService.query(sqlString, batch), {
          operationName: 'DiscreteMaterialPlanDAO.queryByPlanNumbers',
          context: {
            tableName,
            operationType: 'SELECT',
            batchNumber: Math.floor(i / batchSize) + 1,
            batchSize: batch.length
          }
        })
        allResults.push(...result.result.rows)
      }

      return allResults
    } catch (error) {
      log.error('Query by plan numbers error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        recordCount: planNumbers.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  // ==================== DELETE OPERATIONS ====================

  /**
   * Delete records by SourceNumber list
   * Uses batch processing for large lists
   * @param sourceNumbers - List of SourceNumber values to delete
   * @returns Number of records deleted
   */
  async deleteBySourceNumbers(sourceNumbers: string[]): Promise<number> {
    if (!sourceNumbers || sourceNumbers.length === 0) {
      return 0
    }

    const batchId = getRequestId() || `delete-${Date.now()}`
    let totalDeleted = 0

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()
      const batchSize = 2000

      // Get unique source numbers
      const uniqueSourceNumbers = [...new Set(sourceNumbers.filter(Boolean))]
      const totalBatches = Math.ceil(uniqueSourceNumbers.length / batchSize)

      log.info('Starting batch delete operation', {
        tableName: this.getTableName(),
        operationType: 'DELETE',
        requestId: batchId,
        totalRecords: uniqueSourceNumbers.length,
        batchSize,
        totalBatches
      })

      for (let i = 0; i < uniqueSourceNumbers.length; i += batchSize) {
        const batch = uniqueSourceNumbers.slice(i, i + batchSize)
        const batchNumber = Math.floor(i / batchSize) + 1
        const placeholders = dialect.params(batch.length)

        const sqlString = `
          DELETE FROM ${tableName}
          WHERE SourceNumber IN (${placeholders})
        `

        const result = await trackDuration(async () => await dbService.query(sqlString, batch), {
          operationName: 'DiscreteMaterialPlanDAO.deleteBySourceNumbers',
          context: {
            tableName,
            operationType: 'DELETE',
            batchId,
            batchNumber,
            totalBatches,
            batchSize: batch.length
          }
        })
        const deletedCount = result.result.rowCount || 0
        totalDeleted += deletedCount

        log.debug('Deleted batch', {
          batch: batchNumber,
          totalBatches,
          count: deletedCount,
          batchId
        })
      }

      log.info('Deleted records by source numbers', {
        tableName: this.getTableName(),
        operationType: 'DELETE',
        requestId: batchId,
        totalDeleted,
        sourceNumberCount: uniqueSourceNumbers.length
      })

      return totalDeleted
    } catch (error) {
      log.error('Delete by source numbers error', {
        tableName: this.getTableName(),
        operationType: 'DELETE',
        requestId: batchId,
        totalDeleted,
        recordCount: sourceNumbers.length,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  // ==================== INSERT OPERATIONS ====================

  /**
   * Insert records in batches
   * @param records - List of MaterialPlanRecord to insert
   * @param batchSize - Number of records per batch (default: 1000, auto-adjusted for SQL Server)
   * @returns Number of records inserted
   */
  async batchInsert(records: MaterialPlanRecord[], batchSize = 1000): Promise<number> {
    if (!records || records.length === 0) {
      return 0
    }

    const batchId = getRequestId() || `insert-${Date.now()}`
    let totalInserted = 0

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      if (dbService.type === 'sqlserver') {
        return await this.batchInsertSqlServerJson(
          dbService,
          tableName,
          records,
          batchSize,
          batchId
        )
      }

      const columnsPerRow = 28
      const effectiveBatchSize = Math.min(batchSize, dialect.maxBatchRows(columnsPerRow))
      const totalBatches = Math.ceil(records.length / effectiveBatchSize)

      log.info('Batch insert started', {
        tableName,
        operationType: 'INSERT',
        requestId: batchId,
        dbType: dbService.type,
        columnsPerRow,
        effectiveBatchSize,
        totalRecords: records.length,
        totalBatches
      })

      // Process in batches
      for (let i = 0; i < records.length; i += effectiveBatchSize) {
        const batch = records.slice(i, i + effectiveBatchSize)
        const batchNumber = Math.floor(i / effectiveBatchSize) + 1

        const inserted = await this.insertBatchWithTracking(
          dbService,
          tableName,
          batch,
          batchId,
          batchNumber,
          totalBatches
        )
        totalInserted += inserted

        log.debug('Inserted batch', {
          batch: batchNumber,
          totalBatches,
          count: inserted,
          batchId
        })
      }

      log.info('Batch insert completed', {
        tableName,
        operationType: 'INSERT',
        requestId: batchId,
        totalInserted,
        batchSize: effectiveBatchSize,
        totalBatches
      })

      return totalInserted
    } catch (error) {
      log.error('Batch insert error', {
        tableName: this.getTableName(),
        operationType: 'INSERT',
        requestId: batchId,
        totalInserted,
        recordCount: records.length,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  async replaceBySourceNumbers(
    records: MaterialPlanRecord[],
    batchSize = 1000
  ): Promise<{ deleted: number; inserted: number }> {
    if (!records || records.length === 0) {
      return { deleted: 0, inserted: 0 }
    }

    const dbService = await this.getDatabaseService()
    const sourceNumbers = [...new Set(records.map((record) => record.sourceNumber).filter(Boolean))]

    if (dbService.type === 'sqlserver') {
      return await this.replaceSqlServerJson(dbService, records, sourceNumbers)
    }

    const deleted = await this.deleteBySourceNumbers(sourceNumbers)
    const inserted = await this.batchInsert(records, batchSize)
    return { deleted, inserted }
  }

  private async replaceSqlServerJson(
    dbService: IDatabaseService,
    records: MaterialPlanRecord[],
    sourceNumbers: string[]
  ): Promise<{ deleted: number; inserted: number }> {
    const tableName = this.getTableName()
    const columns = this.getInsertColumns()
    const withColumns = this.getSqlServerJsonWithColumns(columns)
    const quotedColumns = columns.map((column) => `[${column}]`).join(', ')
    const recordsBySourceNumber = this.groupRecordsBySourceNumber(records)
    const totalBatches = Math.ceil(
      sourceNumbers.length / SQLSERVER_REPLACE_SOURCE_NUMBER_BATCH_SIZE
    )
    let totalDeleted = 0
    let totalInserted = 0

    log.info('SQL Server JSON replace started', {
      tableName,
      operationType: 'REPLACE',
      totalSourceNumbers: sourceNumbers.length,
      totalRecords: records.length,
      sourceNumberBatchSize: SQLSERVER_REPLACE_SOURCE_NUMBER_BATCH_SIZE,
      totalBatches
    })

    for (
      let offset = 0;
      offset < sourceNumbers.length;
      offset += SQLSERVER_REPLACE_SOURCE_NUMBER_BATCH_SIZE
    ) {
      const sourceNumberBatch = sourceNumbers.slice(
        offset,
        offset + SQLSERVER_REPLACE_SOURCE_NUMBER_BATCH_SIZE
      )
      const batchNumber = Math.floor(offset / SQLSERVER_REPLACE_SOURCE_NUMBER_BATCH_SIZE) + 1
      const recordBatch = sourceNumberBatch.flatMap(
        (sourceNumber) => recordsBySourceNumber.get(sourceNumber) || []
      )
      const jsonRows = recordBatch.map((record) => this.buildJsonRow(record, columns))

      const sqlString = `
        DECLARE @deleted int = 0;
        DECLARE @inserted int = 0;

        BEGIN TRY
          BEGIN TRANSACTION;

          DELETE target
          FROM ${tableName} AS target
          INNER JOIN OPENJSON(@p0)
          WITH (SourceNumber nvarchar(100) '$') AS source
            ON target.SourceNumber = source.SourceNumber;
          SET @deleted = @@ROWCOUNT;

          INSERT INTO ${tableName} (${quotedColumns})
          SELECT ${quotedColumns}
          FROM OPENJSON(@p1)
          WITH (
            ${withColumns}
          );
          SET @inserted = @@ROWCOUNT;

          COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
          IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
          THROW;
        END CATCH;

        SELECT @deleted AS deletedCount, @inserted AS insertedCount;
      `

      const result = await trackDuration(
        async () =>
          await dbService.query(sqlString, [
            JSON.stringify(sourceNumberBatch),
            JSON.stringify(jsonRows)
          ]),
        {
          operationName: 'DiscreteMaterialPlanDAO.replaceSqlServerJsonBatch',
          context: {
            tableName,
            operationType: 'REPLACE',
            batchNumber,
            totalBatches,
            sourceNumberCount: sourceNumberBatch.length,
            recordCount: recordBatch.length
          }
        }
      )

      const stats = result.result.rows[0] || {}
      totalDeleted += Number(stats.deletedCount || 0)
      totalInserted += Number(stats.insertedCount || recordBatch.length)

      log.debug('SQL Server JSON replace batch completed', {
        tableName,
        batchNumber,
        totalBatches,
        sourceNumberCount: sourceNumberBatch.length,
        recordCount: recordBatch.length
      })
    }

    log.info('SQL Server JSON replace completed', {
      tableName,
      operationType: 'REPLACE',
      totalDeleted,
      totalInserted,
      totalBatches
    })

    return {
      deleted: totalDeleted,
      inserted: totalInserted
    }
  }

  private groupRecordsBySourceNumber(
    records: MaterialPlanRecord[]
  ): Map<string, MaterialPlanRecord[]> {
    const groups = new Map<string, MaterialPlanRecord[]>()

    for (const record of records) {
      if (!record.sourceNumber) {
        continue
      }

      const existing = groups.get(record.sourceNumber) || []
      existing.push(record)
      groups.set(record.sourceNumber, existing)
    }

    return groups
  }

  private async batchInsertSqlServerJson(
    dbService: IDatabaseService,
    tableName: string,
    records: MaterialPlanRecord[],
    batchSize: number,
    batchId: string
  ): Promise<number> {
    const columns = this.getInsertColumns()
    const effectiveBatchSize = Math.max(1, batchSize)
    const totalBatches = Math.ceil(records.length / effectiveBatchSize)
    let totalInserted = 0

    log.info('SQL Server JSON batch insert started', {
      tableName,
      operationType: 'INSERT',
      requestId: batchId,
      totalRecords: records.length,
      effectiveBatchSize,
      totalBatches
    })

    for (let i = 0; i < records.length; i += effectiveBatchSize) {
      const batch = records.slice(i, i + effectiveBatchSize)
      const batchNumber = Math.floor(i / effectiveBatchSize) + 1
      const jsonRows = batch.map((record) => this.buildJsonRow(record, columns))

      const withColumns = this.getSqlServerJsonWithColumns(columns)
      const quotedColumns = columns.map((column) => `[${column}]`).join(', ')

      const sqlString = `
        INSERT INTO ${tableName} (${quotedColumns})
        SELECT ${quotedColumns}
        FROM OPENJSON(@p0)
        WITH (
          ${withColumns}
        )
      `

      const result = await trackDuration(
        async () => await dbService.query(sqlString, [JSON.stringify(jsonRows)]),
        {
          operationName: 'DiscreteMaterialPlanDAO.insertBatchSqlServerJson',
          context: {
            tableName,
            operationType: 'INSERT',
            batchId,
            batchNumber,
            totalBatches,
            recordCount: batch.length
          }
        }
      )
      totalInserted += result.result.rowCount || batch.length

      log.debug('Inserted SQL Server JSON batch', {
        batch: batchNumber,
        totalBatches,
        count: batch.length,
        batchId
      })
    }

    log.info('SQL Server JSON batch insert completed', {
      tableName,
      operationType: 'INSERT',
      requestId: batchId,
      totalInserted,
      batchSize: effectiveBatchSize,
      totalBatches
    })

    return totalInserted
  }

  /**
   * Insert a single batch of records with tracking
   */
  private async insertBatchWithTracking(
    dbService: IDatabaseService,
    tableName: string,
    records: MaterialPlanRecord[],
    batchId: string,
    batchNumber: number,
    totalBatches: number
  ): Promise<number> {
    if (records.length === 0) {
      return 0
    }

    const columns = this.getInsertColumns()

    // Build parameterized insert
    const values: any[] = []
    const rowPlaceholders: string[] = []

    records.forEach((record, rowIndex) => {
      const rowValues = this.buildRowValues(record, columns, rowIndex, values)
      rowPlaceholders.push(`(${rowValues.join(',')})`)
    })

    const sqlString = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${rowPlaceholders.join(', ')}
    `

    const result = await trackDuration(async () => await dbService.query(sqlString, values), {
      operationName: 'DiscreteMaterialPlanDAO.insertBatch',
      context: {
        tableName,
        operationType: 'INSERT',
        batchId,
        batchNumber,
        totalBatches,
        recordCount: records.length
      }
    })
    return result.result.rowCount || records.length
  }

  /**
   * Insert a single batch of records (legacy method - kept for compatibility)
   */
  private async insertBatch(
    dbService: IDatabaseService,
    tableName: string,
    records: MaterialPlanRecord[]
  ): Promise<number> {
    return this.insertBatchWithTracking(dbService, tableName, records, 'unknown', 1, 1)
  }

  /**
   * Build parameter values for a single row
   */
  private buildRowValues(
    record: MaterialPlanRecord,
    columns: string[],
    _rowIndex: number,
    values: any[]
  ): string[] {
    const dialect = this.getDialect()
    return columns.map((col) => {
      const value = this.getColumnValue(record, col)
      values.push(value)

      return dialect.param(values.length - 1)
    })
  }

  private getInsertColumns(): string[] {
    return [
      'Factory',
      'MaterialStatus',
      'PlanNumber',
      'SourceNumber',
      'MaterialType',
      'ProductCode',
      'ProductName',
      'ProductUnit',
      'ProductPlanQuantity',
      'UseDepartment',
      'Remark',
      'Creator',
      'CreateDate',
      'Approver',
      'ApproveDate',
      'SequenceNumber',
      'MaterialCode',
      'MaterialName',
      'Specification',
      'Model',
      'DrawingNumber',
      'MaterialQuality',
      'PlanQuantity',
      'Unit',
      'RequiredDate',
      'Warehouse',
      'UnitUsage',
      'CumulativeOutputQuantity'
    ]
  }

  private buildJsonRow(record: MaterialPlanRecord, columns: string[]): Record<string, unknown> {
    const row: Record<string, unknown> = {}

    for (const column of columns) {
      const value = this.getColumnValue(record, column)
      row[column] = value instanceof Date ? value.toISOString() : value
    }

    return row
  }

  private getSqlServerJsonWithColumns(columns: string[]): string {
    return columns
      .map((column) => `[${column}] ${this.getSqlServerJsonColumnType(column)} '$.${column}'`)
      .join(',\n          ')
  }

  private getSqlServerJsonColumnType(column: string): string {
    const columnTypes: Record<string, string> = {
      Factory: 'nvarchar(100)',
      MaterialStatus: 'nvarchar(50)',
      PlanNumber: 'nvarchar(100)',
      SourceNumber: 'nvarchar(100)',
      MaterialType: 'nvarchar(100)',
      ProductCode: 'nvarchar(100)',
      ProductName: 'nvarchar(255)',
      ProductUnit: 'nvarchar(50)',
      ProductPlanQuantity: 'decimal(18,4)',
      UseDepartment: 'nvarchar(100)',
      Remark: 'nvarchar(500)',
      Creator: 'nvarchar(100)',
      CreateDate: 'datetime2',
      Approver: 'nvarchar(100)',
      ApproveDate: 'datetime2',
      SequenceNumber: 'int',
      MaterialCode: 'nvarchar(100)',
      MaterialName: 'nvarchar(255)',
      Specification: 'nvarchar(255)',
      Model: 'nvarchar(255)',
      DrawingNumber: 'nvarchar(100)',
      MaterialQuality: 'nvarchar(100)',
      PlanQuantity: 'decimal(18,4)',
      Unit: 'nvarchar(50)',
      RequiredDate: 'datetime2',
      Warehouse: 'nvarchar(100)',
      UnitUsage: 'decimal(18,6)',
      CumulativeOutputQuantity: 'decimal(18,4)'
    }

    return columnTypes[column] || 'nvarchar(max)'
  }

  /**
   * Get the value for a specific column from the record
   */
  private getColumnValue(record: MaterialPlanRecord, column: string): any {
    const columnMapping: Record<string, keyof MaterialPlanRecord> = {
      Factory: 'factory',
      MaterialStatus: 'materialStatus',
      PlanNumber: 'planNumber',
      SourceNumber: 'sourceNumber',
      MaterialType: 'materialType',
      ProductCode: 'productCode',
      ProductName: 'productName',
      ProductUnit: 'productUnit',
      ProductPlanQuantity: 'productPlanQuantity',
      UseDepartment: 'useDepartment',
      Remark: 'remark',
      Creator: 'creator',
      CreateDate: 'createDate',
      Approver: 'approver',
      ApproveDate: 'approveDate',
      SequenceNumber: 'sequenceNumber',
      MaterialCode: 'materialCode',
      MaterialName: 'materialName',
      Specification: 'specification',
      Model: 'model',
      DrawingNumber: 'drawingNumber',
      MaterialQuality: 'materialQuality',
      PlanQuantity: 'planQuantity',
      Unit: 'unit',
      RequiredDate: 'requiredDate',
      Warehouse: 'warehouse',
      UnitUsage: 'unitUsage',
      CumulativeOutputQuantity: 'cumulativeOutputQuantity'
    }

    const key = columnMapping[column]
    if (!key) {
      return null
    }

    const value = record[key]

    // Handle null/undefined
    if (value === null || value === undefined) {
      return null
    }

    if (value instanceof Date && Number.isNaN(value.getTime())) {
      return null
    }

    // Handle empty strings for string fields
    if (typeof value === 'string' && value.trim() === '') {
      return null
    }

    return value
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Count all records
   * @returns Total number of records
   */
  async countAll(): Promise<number> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `SELECT COUNT(*) as count FROM ${tableName}`
      const result = await trackDuration(async () => await dbService.query(sqlString), {
        operationName: 'DiscreteMaterialPlanDAO.countAll',
        context: { tableName, operationType: 'SELECT' }
      })

      return result.result.rows.length > 0 ? (result.result.rows[0].count as number) : 0
    } catch (error) {
      log.error('Count all error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return 0
    }
  }

  /**
   * Count records by plan number
   * @param planNumber - PlanNumber value
   * @returns Number of records
   */
  async countByPlanNumber(planNumber: string): Promise<number> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE PlanNumber = ${placeholder}
      `

      const result = await trackDuration(
        async () => await dbService.query(sqlString, [planNumber]),
        {
          operationName: 'DiscreteMaterialPlanDAO.countByPlanNumber',
          context: { tableName, operationType: 'SELECT' }
        }
      )
      return result.result.rows.length > 0 ? (result.result.rows[0].count as number) : 0
    } catch (error) {
      log.error('Count by plan number error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return 0
    }
  }

  /**
   * Get unique material names
   * @param sourceNumbers - Optional list of SourceNumber values to filter
   * @returns List of unique material names
   */
  async getUniqueMaterialNames(sourceNumbers?: string[]): Promise<string[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      if (sourceNumbers && sourceNumbers.length > 0) {
        const batchSize = 1500
        const allNames: string[] = []

        for (let i = 0; i < sourceNumbers.length; i += batchSize) {
          const batch = sourceNumbers.slice(i, i + batchSize)
          const placeholders = dialect.params(batch.length)

          const sqlString = `
            SELECT DISTINCT MaterialName
            FROM ${tableName}
            WHERE SourceNumber IN (${placeholders})
              AND MaterialName IS NOT NULL
          `

          const result = await trackDuration(async () => await dbService.query(sqlString, batch), {
            operationName: 'DiscreteMaterialPlanDAO.getUniqueMaterialNames',
            context: {
              tableName,
              operationType: 'SELECT',
              batchNumber: Math.floor(i / batchSize) + 1,
              batchSize: batch.length
            }
          })
          allNames.push(
            ...result.result.rows.map((row) => row.MaterialName as string).filter(Boolean)
          )
        }

        return allNames
      } else {
        const sqlString = `
          SELECT DISTINCT MaterialName
          FROM ${tableName}
          WHERE MaterialName IS NOT NULL
        `

        const result = await trackDuration(async () => await dbService.query(sqlString), {
          operationName: 'DiscreteMaterialPlanDAO.getUniqueMaterialNames',
          context: { tableName, operationType: 'SELECT' }
        })
        return result.result.rows.map((row) => row.MaterialName as string).filter(Boolean)
      }
    } catch (error) {
      log.error('Get unique material names error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        recordCount: sourceNumbers?.length || 0,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Get statistics
   * @returns Statistics object
   */
  async getStatistics(): Promise<any> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `
        SELECT
          COUNT(*) as totalRecords,
          COUNT(DISTINCT PlanNumber) as uniquePlans,
          COUNT(DISTINCT SourceNumber) as uniqueOrders,
          MIN(CreateDate) as earliestRecord,
          MAX(CreateDate) as latestRecord
        FROM ${tableName}
      `

      const result = await trackDuration(async () => await dbService.query(sqlString), {
        operationName: 'DiscreteMaterialPlanDAO.getStatistics',
        context: { tableName, operationType: 'SELECT' }
      })
      return result.result.rows.length > 0 ? result.result.rows[0] : {}
    } catch (error) {
      log.error('Get statistics error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return {}
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
