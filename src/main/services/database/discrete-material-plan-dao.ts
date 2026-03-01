/**
 * Data Access Object for DiscreteMaterialPlanData table
 *
 * Mirrors the Python DiscreteMaterialPlanDAO functionality:
 * - Query operations for discrete material plan data
 * - Support for querying by PlanNumber, SourceNumber
 * - Deduplication by MaterialCode
 * - Statistics gathering
 */

import { MySqlService } from './mysql'

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
  private mysqlService: MySqlService | null = null

  /**
   * Get MySQL service instance
   */
  private async getMySqlService(): Promise<MySqlService> {
    if (this.mysqlService && this.mysqlService.isConnected()) {
      return this.mysqlService
    }

    this.mysqlService = new MySqlService({
      host: process.env.DB_MYSQL_HOST || 'localhost',
      port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || ''
    })

    await this.mysqlService.connect()
    return this.mysqlService
  }

  // ==================== QUERY ALL ====================

  /**
   * Query all records from DiscreteMaterialPlanData table
   * @returns List of all records
   */
  async queryAll(): Promise<any[]> {
    try {
      const mysqlService = await this.getMySqlService()

      const sql = `SELECT * FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}`

      const result = await mysqlService.query(sql)
      return result.rows
    } catch (error) {
      console.error('[DiscreteMaterialPlanDAO] Query all error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        WITH RankedRecords AS (
          SELECT
            *,
            ROW_NUMBER() OVER (
              PARTITION BY MaterialCode
              ORDER BY CreateDate ASC, SequenceNumber ASC
            ) AS rn
          FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}
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

      const result = await mysqlService.query(sql)
      return result.rows
    } catch (error) {
      console.error('[DiscreteMaterialPlanDAO] Query all distinct by material code error:', error)
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
      const mysqlService = await this.getMySqlService()
      const batchSize = 2000
      const allResults: any[] = []

      for (let i = 0; i < sourceNumbers.length; i += batchSize) {
        const batch = sourceNumbers.slice(i, i + batchSize)
        const placeholders = batch.map(() => '?').join(',')

        const sql = `
          SELECT *
          FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}
          WHERE SourceNumber IN (${placeholders})
        `

        const result = await mysqlService.query(sql, batch)
        allResults.push(...result.rows)
      }

      return allResults
    } catch (error) {
      console.error('[DiscreteMaterialPlanDAO] Query by source numbers error:', error)
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
      const mysqlService = await this.getMySqlService()
      const batchSize = 2000
      const allResults: any[] = []

      for (let i = 0; i < sourceNumbers.length; i += batchSize) {
        const batch = sourceNumbers.slice(i, i + batchSize)
        const placeholders = batch.map(() => '?').join(',')

        const sql = `
          WITH RankedRecords AS (
            SELECT
              *,
              ROW_NUMBER() OVER (
                PARTITION BY MaterialCode
                ORDER BY CreateDate ASC, SequenceNumber ASC
              ) AS rn
            FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}
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

        const result = await mysqlService.query(sql, batch)
        allResults.push(...result.rows)
      }

      return allResults
    } catch (error) {
      console.error('[DiscreteMaterialPlanDAO] Query by source numbers distinct error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT *
        FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}
        WHERE SourceNumber = ?
      `

      const result = await mysqlService.query(sql, [sourceNumber])
      return result.rows
    } catch (error) {
      console.error('[DiscreteMaterialPlanDAO] Query by source number error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT *
        FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}
        WHERE PlanNumber = ?
      `

      const result = await mysqlService.query(sql, [planNumber])
      return result.rows
    } catch (error) {
      console.error('[DiscreteMaterialPlanDAO] Query by plan number error:', error)
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
      const mysqlService = await this.getMySqlService()
      const placeholders = planNumbers.map(() => '?').join(',')

      const sql = `
        SELECT *
        FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}
        WHERE PlanNumber IN (${placeholders})
      `

      const result = await mysqlService.query(sql, planNumbers)
      return result.rows
    } catch (error) {
      console.error('[DiscreteMaterialPlanDAO] Query by plan numbers error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `SELECT COUNT(*) as count FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}`

      const result = await mysqlService.query(sql)
      return result.rows.length > 0 ? (result.rows[0].count as number) : 0
    } catch (error) {
      console.error('[DiscreteMaterialPlanDAO] Count all error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT COUNT(*) as count
        FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}
        WHERE PlanNumber = ?
      `

      const result = await mysqlService.query(sql, [planNumber])
      return result.rows.length > 0 ? (result.rows[0].count as number) : 0
    } catch (error) {
      console.error('[DiscreteMaterialPlanDAO] Count by plan number error:', error)
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
      const mysqlService = await this.getMySqlService()

      let sql: string
      let params: any[] = []

      if (sourceNumbers && sourceNumbers.length > 0) {
        const placeholders = sourceNumbers.map(() => '?').join(',')
        sql = `
          SELECT DISTINCT MaterialName
          FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}
          WHERE SourceNumber IN (${placeholders})
            AND MaterialName IS NOT NULL
        `
        params = sourceNumbers
      } else {
        sql = `
          SELECT DISTINCT MaterialName
          FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}
          WHERE MaterialName IS NOT NULL
        `
      }

      const result = await mysqlService.query(sql, params)
      return result.rows
        .map(row => row.MaterialName as string)
        .filter(Boolean)
    } catch (error) {
      console.error('[DiscreteMaterialPlanDAO] Get unique material names error:', error)
      return []
    }
  }

  /**
   * Get statistics
   * @returns Statistics object
   */
  async getStatistics(): Promise<any> {
    try {
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT
          COUNT(*) as totalRecords,
          COUNT(DISTINCT PlanNumber) as uniquePlans,
          COUNT(DISTINCT SourceNumber) as uniqueOrders,
          MIN(CreateDate) as earliestRecord,
          MAX(CreateDate) as latestRecord
        FROM ${DISCRETE_MATERIAL_PLAN_CONFIG.TABLE_NAME_MYSQL}
      `

      const result = await mysqlService.query(sql)
      return result.rows.length > 0 ? result.rows[0] : {}
    } catch (error) {
      console.error('[DiscreteMaterialPlanDAO] Get statistics error:', error)
      return {}
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.mysqlService) {
      await this.mysqlService.disconnect()
      this.mysqlService = null
    }
  }
}
