/**
 * Data Access Object for MaterialsToBeDeleted table
 *
 * Mirrors the Python MaterialsToBeDeletedDAO functionality:
 * - CRUD operations for materials identified by MaterialCode
 * - Batch upsert operations
 * - Manager-based filtering and queries
 * - Statistics gathering
 */

import { create, type IDatabaseService } from './index'
import { createDialect, type SqlDialect } from './dialects'
import { createLogger, run, getRequestId, trackDuration } from '../logger'

const log = createLogger('MaterialsToBeDeletedDAO')

/**
 * Material record interface
 */
export interface MaterialRecord {
  id?: number
  materialCode: string
  managerName: string
}

/**
 * Upsert statistics
 */
export interface UpsertStats {
  total: number
  success: number
  failed: number
}

/**
 * Material statistics
 */
export interface MaterialStats {
  totalMaterials: number
  uniqueManagers: number
  materialsPerManager: Record<string, number>[]
}

/**
 * Configuration for MaterialsToBeDeleted table
 */
export const MATERIALS_TO_BE_DELETED_CONFIG = {
  COLUMNS: {
    ID: 'ID',
    MATERIAL_CODE: 'MaterialCode',
    MANAGER_NAME: 'ManagerName'
  }
} as const

/**
 * MaterialsToBeDeleted DAO Class
 */
export class MaterialsToBeDeletedDAO {
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
    return this.getDialect().quoteTableName('dbo', 'MaterialsToBeDeleted')
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

  // ==================== UPSERT (MERGE) ====================

  /**
   * Insert or update a single material record
   * @param materialCode - Material code (exact match key)
   * @param managerName - Manager name
   * @returns True if successful
   */
  async upsertMaterial(materialCode: string, managerName: string): Promise<boolean> {
    if (!materialCode || !materialCode.trim()) {
      log.error('MaterialCode cannot be empty', {
        tableName: this.getTableName(),
        operationType: 'UPSERT',
        requestId: getRequestId()
      })
      return false
    }

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const code = materialCode.trim()
      const manager = managerName?.trim() || null
      const dialect = this.getDialect()

      const { sql: sqlString } = dialect.upsert({
        table: tableName,
        keyColumns: ['MaterialCode'],
        allColumns: ['MaterialCode', 'ManagerName'],
        startParamIndex: 0
      })

      await trackDuration(async () => await dbService.query(sqlString, [code, manager]), {
        operationName: 'MaterialsToBeDeletedDAO.upsertMaterial',
        context: { tableName, operationType: 'UPSERT' }
      })

      return true
    } catch (error) {
      log.error('Upsert material error', {
        tableName: this.getTableName(),
        operationType: 'UPSERT',
        requestId: getRequestId(),
        materialCode: materialCode.trim(),
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * Insert or update multiple material records in batch
   * @param materials - List of materials with materialCode and managerName
   * @returns Statistics object
   */
  async upsertBatch(
    materials: { materialCode: string; managerName: string }[]
  ): Promise<UpsertStats> {
    if (!materials || materials.length === 0) {
      return { total: 0, success: 0, failed: 0 }
    }

    const batchId = getRequestId() || `upsert-${Date.now()}`
    const stats: UpsertStats = {
      total: materials.length,
      success: 0,
      failed: 0
    }

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      log.info('Batch upsert started', {
        tableName,
        operationType: 'UPSERT',
        requestId: batchId,
        totalRecords: materials.length,
        dbType: dbService.type
      })

      for (const material of materials) {
        const materialCode = material.materialCode?.trim()
        const managerName = material.managerName?.trim() || ''

        if (!materialCode) {
          stats.failed++
          continue
        }

        try {
          const { sql: sqlString } = dialect.upsert({
            table: tableName,
            keyColumns: ['MaterialCode'],
            allColumns: ['MaterialCode', 'ManagerName'],
            startParamIndex: 0
          })

          await trackDuration(
            async () => await dbService.query(sqlString, [materialCode, managerName || null]),
            {
              operationName: 'MaterialsToBeDeletedDAO.upsertBatch',
              context: { tableName, operationType: 'UPSERT', batchId }
            }
          )

          stats.success++
        } catch (error) {
          log.error('Error upserting material', {
            tableName,
            operationType: 'UPSERT',
            requestId: batchId,
            materialCode,
            error: error instanceof Error ? error.message : String(error)
          })
          stats.failed++
        }
      }

      log.info('Batch upsert completed', {
        tableName,
        operationType: 'UPSERT',
        requestId: batchId,
        success: stats.success,
        failed: stats.failed,
        total: stats.total
      })
    } catch (error) {
      log.error('Batch upsert error', {
        tableName: this.getTableName(),
        operationType: 'UPSERT',
        requestId: batchId,
        totalRecords: materials.length,
        error: error instanceof Error ? error.message : String(error)
      })
      stats.failed = stats.total - stats.success
    }

    return stats
  }

  /**
   * Update manager for a single material
   * @param materialCode - Material code
   * @param managerName - New manager name
   * @returns Success status
   */
  async updateManager(
    materialCode: string,
    managerName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const { sql: sqlString } = dialect.upsert({
        table: tableName,
        keyColumns: ['MaterialCode'],
        allColumns: ['MaterialCode', 'ManagerName'],
        startParamIndex: 0
      })
      await dbService.query(sqlString, [materialCode, managerName || null])

      return { success: true }
    } catch (error) {
      log.error('Update manager error', {
        materialCode,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  // ==================== READ ====================

  /**
   * Get all material codes as a set
   * @returns Set of material codes
   */
  async getAllMaterialCodes(): Promise<Set<string>> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `
        SELECT MaterialCode
        FROM ${tableName}
        WHERE MaterialCode IS NOT NULL
      `

      const result = await trackDuration(async () => await dbService.query(sqlString), {
        operationName: 'MaterialsToBeDeletedDAO.getAllMaterialCodes',
        context: { tableName, operationType: 'SELECT' }
      })
      return new Set(result.result.rows.map((row) => row.MaterialCode as string).filter(Boolean))
    } catch (error) {
      log.error('Get all material codes error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return new Set()
    }
  }

  /**
   * Get all material records
   * @returns List of all material records
   */
  async getAllRecords(): Promise<MaterialRecord[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `
        SELECT ID, MaterialCode, ManagerName
        FROM ${tableName}
        WHERE MaterialCode IS NOT NULL
        ORDER BY ManagerName, MaterialCode
      `

      const result = await trackDuration(async () => await dbService.query(sqlString), {
        operationName: 'MaterialsToBeDeletedDAO.getAllRecords',
        context: { tableName, operationType: 'SELECT' }
      })
      return result.result.rows.map((row) => ({
        id: row.ID as number,
        materialCode: row.MaterialCode as string,
        managerName: row.ManagerName as string
      }))
    } catch (error) {
      log.error('Get all records error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Get all materials for a specific manager
   * @param managerName - Manager name
   * @returns List of materials for the manager
   */
  async getMaterialsByManager(managerName: string): Promise<MaterialRecord[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        SELECT ID, MaterialCode, ManagerName
        FROM ${tableName}
        WHERE ManagerName = ${placeholder} AND MaterialCode IS NOT NULL
        ORDER BY MaterialCode
      `

      const result = await trackDuration(
        async () => await dbService.query(sqlString, [managerName]),
        {
          operationName: 'MaterialsToBeDeletedDAO.getMaterialsByManager',
          context: { tableName, operationType: 'SELECT' }
        }
      )
      return result.result.rows.map((row) => ({
        id: row.ID as number,
        materialCode: row.MaterialCode as string,
        managerName: row.ManagerName as string
      }))
    } catch (error) {
      log.error('Get materials by manager error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Get list of unique manager names
   * @returns List of unique manager names
   */
  async getManagers(): Promise<string[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `
        SELECT DISTINCT ManagerName
        FROM ${tableName}
        WHERE ManagerName IS NOT NULL
        ORDER BY ManagerName
      `

      const result = await trackDuration(async () => await dbService.query(sqlString), {
        operationName: 'MaterialsToBeDeletedDAO.getManagers',
        context: { tableName, operationType: 'SELECT' }
      })
      return result.result.rows.map((row) => row.ManagerName as string).filter(Boolean)
    } catch (error) {
      log.error('Get managers error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Get a specific record by material code
   * @param materialCode - Material code
   * @returns Material record or null
   */
  async getRecordByMaterialCode(materialCode: string): Promise<MaterialRecord | null> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const code = materialCode.trim()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        SELECT ID, MaterialCode, ManagerName
        FROM ${tableName}
        WHERE MaterialCode = ${placeholder}
      `

      const result = await trackDuration(async () => await dbService.query(sqlString, [code]), {
        operationName: 'MaterialsToBeDeletedDAO.getRecordByMaterialCode',
        context: { tableName, operationType: 'SELECT' }
      })

      if (result.result.rows.length === 0) {
        return null
      }

      const row = result.result.rows[0]
      return {
        id: row.ID as number,
        materialCode: row.MaterialCode as string,
        managerName: row.ManagerName as string
      }
    } catch (error) {
      log.error('Get record by material code error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  // ==================== DELETE ====================

  /**
   * Delete a specific material by material code
   * @param materialCode - Material code
   * @returns True if successful
   */
  async deleteByMaterialCode(materialCode: string): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const code = materialCode.trim()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        DELETE FROM ${tableName}
        WHERE MaterialCode = ${placeholder}
      `

      const result = await trackDuration(async () => await dbService.query(sqlString, [code]), {
        operationName: 'MaterialsToBeDeletedDAO.deleteByMaterialCode',
        context: { tableName, operationType: 'DELETE' }
      })
      return result.result.rowCount > 0
    } catch (error) {
      log.error('Delete by material code error', {
        tableName: this.getTableName(),
        operationType: 'DELETE',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * Delete all materials for a specific manager
   * @param managerName - Manager name
   * @returns Number of records deleted
   */
  async deleteByManager(managerName: string): Promise<number> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        DELETE FROM ${tableName}
        WHERE ManagerName = ${placeholder}
      `

      const result = await trackDuration(
        async () => await dbService.query(sqlString, [managerName]),
        {
          operationName: 'MaterialsToBeDeletedDAO.deleteByManager',
          context: { tableName, operationType: 'DELETE' }
        }
      )
      return result.result.rowCount
    } catch (error) {
      log.error('Delete by manager error', {
        tableName: this.getTableName(),
        operationType: 'DELETE',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return 0
    }
  }

  /**
   * Delete all material records
   * @returns Number of records deleted
   */
  async deleteAllMaterials(): Promise<number> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `DELETE FROM ${tableName}`
      const result = await trackDuration(async () => await dbService.query(sqlString), {
        operationName: 'MaterialsToBeDeletedDAO.deleteAllMaterials',
        context: { tableName, operationType: 'DELETE' }
      })
      return result.result.rowCount
    } catch (error) {
      log.error('Delete all materials error', {
        tableName: this.getTableName(),
        operationType: 'DELETE',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return 0
    }
  }

  /**
   * Delete multiple materials by material codes
   * @param materialCodes - List of material codes to delete
   * @returns Number of records deleted
   */
  async deleteByMaterialCodes(materialCodes: string[]): Promise<number> {
    if (!materialCodes || materialCodes.length === 0) {
      return 0
    }

    const batchId = getRequestId() || `delete-${Date.now()}`
    let totalDeleted = 0
    const batchSize = 1000

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()
      const totalBatches = Math.ceil(materialCodes.length / batchSize)

      log.info('Batch delete started', {
        tableName,
        operationType: 'DELETE',
        requestId: batchId,
        totalRecords: materialCodes.length,
        batchSize,
        totalBatches
      })

      for (let i = 0; i < materialCodes.length; i += batchSize) {
        const batch = materialCodes.slice(i, i + batchSize)
        const batchNumber = Math.floor(i / batchSize) + 1
        const placeholders = dialect.params(batch.length)

        const sqlString = `
          DELETE FROM ${tableName}
          WHERE MaterialCode IN (${placeholders})
        `

        const result = await trackDuration(
          async () =>
            await dbService.query(
              sqlString,
              batch.map((c) => c.trim())
            ),
          {
            operationName: 'MaterialsToBeDeletedDAO.deleteByMaterialCodes',
            context: {
              tableName,
              operationType: 'DELETE',
              batchId,
              batchNumber,
              totalBatches,
              batchSize: batch.length
            }
          }
        )
        totalDeleted += result.result.rowCount
      }

      log.info('Batch delete completed', {
        tableName,
        operationType: 'DELETE',
        requestId: batchId,
        totalDeleted,
        totalRecords: materialCodes.length
      })
    } catch (error) {
      log.error('Delete by material codes error', {
        tableName: this.getTableName(),
        operationType: 'DELETE',
        requestId: batchId,
        totalDeleted,
        recordCount: materialCodes.length,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    return totalDeleted
  }

  // ==================== UTILITIES ====================

  /**
   * Check if a material exists
   * @param materialCode - Material code
   * @returns True if material exists
   */
  async materialExists(materialCode: string): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const code = materialCode.trim()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE MaterialCode = ${placeholder}
      `

      const result = await trackDuration(async () => await dbService.query(sqlString, [code]), {
        operationName: 'MaterialsToBeDeletedDAO.materialExists',
        context: { tableName, operationType: 'SELECT' }
      })
      return result.result.rows.length > 0 && (result.result.rows[0].count as number) > 0
    } catch (error) {
      log.error('Material exists error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * Count all material records
   * @returns Total number of records
   */
  async countAll(): Promise<number> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `SELECT COUNT(*) as count FROM ${tableName}`
      const result = await trackDuration(async () => await dbService.query(sqlString), {
        operationName: 'MaterialsToBeDeletedDAO.countAll',
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
   * Count materials for a specific manager
   * @param managerName - Manager name
   * @returns Number of materials for the manager
   */
  async countByManager(managerName: string): Promise<number> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE ManagerName = ${placeholder}
      `

      const result = await trackDuration(
        async () => await dbService.query(sqlString, [managerName]),
        {
          operationName: 'MaterialsToBeDeletedDAO.countByManager',
          context: { tableName, operationType: 'SELECT' }
        }
      )
      return result.result.rows.length > 0 ? (result.result.rows[0].count as number) : 0
    } catch (error) {
      log.error('Count by manager error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return 0
    }
  }

  /**
   * Get comprehensive statistics
   * @returns Statistics object
   */
  async getStatistics(): Promise<MaterialStats> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      // Get total and unique managers
      const statsSql = `
        SELECT
          COUNT(*) as totalMaterials,
          COUNT(DISTINCT ManagerName) as uniqueManagers
        FROM ${tableName}
        WHERE MaterialCode IS NOT NULL
      `

      const statsResult = await trackDuration(async () => await dbService.query(statsSql), {
        operationName: 'MaterialsToBeDeletedDAO.getStatistics',
        context: { tableName, operationType: 'SELECT' }
      })
      const stats = statsResult.result.rows[0] || {}

      // Get materials per manager
      const managerSql = `
        SELECT ManagerName, COUNT(*) as count
        FROM ${tableName}
        WHERE ManagerName IS NOT NULL
        GROUP BY ManagerName
        ORDER BY count DESC
      `

      const managerResult = await trackDuration(async () => await dbService.query(managerSql), {
        operationName: 'MaterialsToBeDeletedDAO.getStatistics.managers',
        context: { tableName, operationType: 'SELECT' }
      })
      const materialsPerManager = managerResult.result.rows.map((row) => ({
        [row.ManagerName as string]: row.count as number
      }))

      return {
        totalMaterials: (stats.totalMaterials as number) || 0,
        uniqueManagers: (stats.uniqueManagers as number) || 0,
        materialsPerManager
      }
    } catch (error) {
      log.error('Get statistics error', {
        tableName: this.getTableName(),
        operationType: 'SELECT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        totalMaterials: 0,
        uniqueManagers: 0,
        materialsPerManager: []
      }
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
