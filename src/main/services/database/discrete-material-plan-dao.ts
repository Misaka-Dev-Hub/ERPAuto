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
import { createLogger } from '../logger'

const log = createLogger('DiscreteMaterialPlanDAO')

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
  TABLE_NAME_SQLSERVER: '[dbo].[DiscreteMaterialPlanData]',
  TABLE_NAME_MYSQL: 'dbo_DiscreteMaterialPlanData',
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

  /**
   * Get the appropriate table name based on database type
   */
  private getTableName(): string {
    const isSqlServer = this.dbService?.type === 'sqlserver'
    return isSqlServer
      ? DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_SQLSERVER
      : DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL
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

  /**
   * Build placeholders for IN clause based on database type
   */
  private buildPlaceholders(count: number, isSqlServer: boolean): string {
    return isSqlServer
      ? Array.from({ length: count }, (_, idx) => `@p${idx}`).join(',')
      : Array.from({ length: count }, () => '?').join(',')
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
      const result = await dbService.query(sqlString)

      return result.rows
    } catch (error) {
      log.error('Query all error', {
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

      const result = await dbService.query(sqlString)
      return result.rows
    } catch (error) {
      log.error('Query all distinct by material code error', {
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
      const isSqlServer = dbService.type === 'sqlserver'
      const batchSize = 2000
      const allResults: any[] = []

      for (let i = 0; i < sourceNumbers.length; i += batchSize) {
        const batch = sourceNumbers.slice(i, i + batchSize)
        const placeholders = this.buildPlaceholders(batch.length, isSqlServer)

        const sqlString = `
          SELECT *
          FROM ${tableName}
          WHERE SourceNumber IN (${placeholders})
        `

        const result = await dbService.query(sqlString, batch)
        allResults.push(...result.rows)
      }

      return allResults
    } catch (error) {
      log.error('Query by source numbers error', {
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
      const isSqlServer = dbService.type === 'sqlserver'
      const batchSize = 2000
      const allResults: any[] = []

      for (let i = 0; i < sourceNumbers.length; i += batchSize) {
        const batch = sourceNumbers.slice(i, i + batchSize)
        const placeholders = this.buildPlaceholders(batch.length, isSqlServer)

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

        const result = await dbService.query(sqlString, batch)
        allResults.push(...result.rows)
      }

      return allResults
    } catch (error) {
      log.error('Query by source numbers distinct error', {
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
      const isSqlServer = dbService.type === 'sqlserver'

      const placeholder = isSqlServer ? '@p0' : '?'
      const sqlString = `
        SELECT *
        FROM ${tableName}
        WHERE SourceNumber = ${placeholder}
      `

      const result = await dbService.query(sqlString, [sourceNumber])
      return result.rows
    } catch (error) {
      log.error('Query by source number error', {
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
      const isSqlServer = dbService.type === 'sqlserver'

      const placeholder = isSqlServer ? '@p0' : '?'
      const sqlString = `
        SELECT *
        FROM ${tableName}
        WHERE PlanNumber = ${placeholder}
      `

      const result = await dbService.query(sqlString, [planNumber])
      return result.rows
    } catch (error) {
      log.error('Query by plan number error', {
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
      const isSqlServer = dbService.type === 'sqlserver'
      const placeholders = this.buildPlaceholders(planNumbers.length, isSqlServer)

      const sqlString = `
        SELECT *
        FROM ${tableName}
        WHERE PlanNumber IN (${placeholders})
      `

      const result = await dbService.query(sqlString, planNumbers)
      return result.rows
    } catch (error) {
      log.error('Query by plan numbers error', {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
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
      const result = await dbService.query(sqlString)

      return result.rows.length > 0 ? (result.rows[0].count as number) : 0
    } catch (error) {
      log.error('Count all error', {
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
      const isSqlServer = dbService.type === 'sqlserver'

      const placeholder = isSqlServer ? '@p0' : '?'
      const sqlString = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE PlanNumber = ${placeholder}
      `

      const result = await dbService.query(sqlString, [planNumber])
      return result.rows.length > 0 ? (result.rows[0].count as number) : 0
    } catch (error) {
      log.error('Count by plan number error', {
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
      const isSqlServer = dbService.type === 'sqlserver'

      if (sourceNumbers && sourceNumbers.length > 0) {
        const placeholders = this.buildPlaceholders(sourceNumbers.length, isSqlServer)

        const sqlString = `
          SELECT DISTINCT MaterialName
          FROM ${tableName}
          WHERE SourceNumber IN (${placeholders})
            AND MaterialName IS NOT NULL
        `

        const result = await dbService.query(sqlString, sourceNumbers)
        return result.rows.map((row) => row.MaterialName as string).filter(Boolean)
      } else {
        const sqlString = `
          SELECT DISTINCT MaterialName
          FROM ${tableName}
          WHERE MaterialName IS NOT NULL
        `

        const result = await dbService.query(sqlString)
        return result.rows.map((row) => row.MaterialName as string).filter(Boolean)
      }
    } catch (error) {
      log.error('Get unique material names error', {
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

      const result = await dbService.query(sqlString)
      return result.rows.length > 0 ? result.rows[0] : {}
    } catch (error) {
      log.error('Get statistics error', {
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
    }
  }
}
