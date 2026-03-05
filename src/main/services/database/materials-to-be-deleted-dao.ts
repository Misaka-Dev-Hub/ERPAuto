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
import { createLogger } from '../logger'

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
  TABLE_NAME_SQLSERVER: '[dbo].[MaterialsToBeDeleted]',
  TABLE_NAME_MYSQL: 'dbo_MaterialsToBeDeleted',
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

  /**
   * Get the appropriate table name based on database type
   */
  private getTableName(): string {
    const isSqlServer = this.dbService?.type === 'sqlserver'
    return isSqlServer
      ? MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_SQLSERVER
      : MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL
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

  // ==================== UPSERT (MERGE) ====================

  /**
   * Insert or update a single material record
   * @param materialCode - Material code (exact match key)
   * @param managerName - Manager name
   * @returns True if successful
   */
  async upsertMaterial(materialCode: string, managerName: string): Promise<boolean> {
    if (!materialCode || !materialCode.trim()) {
      log.error('MaterialCode cannot be empty')
      return false
    }

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const code = materialCode.trim()
      const manager = managerName?.trim() || null
      const isSqlServer = dbService.type === 'sqlserver'

      if (isSqlServer) {
        // SQL Server MERGE statement
        const sqlString = `
          MERGE ${tableName} AS target
          USING (VALUES (@p0, @p1)) AS source (MaterialCode, ManagerName)
          ON target.MaterialCode = source.MaterialCode
          WHEN MATCHED THEN UPDATE SET ManagerName = source.ManagerName
          WHEN NOT MATCHED THEN INSERT (MaterialCode, ManagerName) VALUES (source.MaterialCode, source.ManagerName);
        `

        await dbService.query(sqlString, [code, manager])
      } else {
        // MySQL ON DUPLICATE KEY UPDATE
        const sqlString = `
          INSERT INTO ${tableName} (MaterialCode, ManagerName)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE ManagerName = VALUES(ManagerName)
        `

        await dbService.query(sqlString, [code, manager])
      }

      return true
    } catch (error) {
      log.error('Upsert material error', {
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

    const stats: UpsertStats = {
      total: materials.length,
      success: 0,
      failed: 0
    }

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const isSqlServer = dbService.type === 'sqlserver'

      for (const material of materials) {
        const materialCode = material.materialCode?.trim()
        const managerName = material.managerName?.trim() || ''

        if (!materialCode) {
          stats.failed++
          continue
        }

        try {
          if (isSqlServer) {
            // SQL Server MERGE statement
            const sqlString = `
              MERGE ${tableName} AS target
              USING (VALUES (@p0, @p1)) AS source (MaterialCode, ManagerName)
              ON target.MaterialCode = source.MaterialCode
              WHEN MATCHED THEN UPDATE SET ManagerName = source.ManagerName
              WHEN NOT MATCHED THEN INSERT (MaterialCode, ManagerName) VALUES (source.MaterialCode, source.ManagerName);
            `

            await dbService.query(sqlString, [materialCode, managerName || null])
          } else {
            // MySQL ON DUPLICATE KEY UPDATE
            const sqlString = `
              INSERT INTO ${tableName} (MaterialCode, ManagerName)
              VALUES (?, ?)
              ON DUPLICATE KEY UPDATE ManagerName = VALUES(ManagerName)
            `

            await dbService.query(sqlString, [materialCode, managerName || null])
          }

          stats.success++
        } catch (error) {
          log.error('Error upserting material', {
            materialCode,
            error: error instanceof Error ? error.message : String(error)
          })
          stats.failed++
        }
      }
    } catch (error) {
      log.error('Batch upsert error', {
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
      const isSqlServer = dbService.type === 'sqlserver'

      if (isSqlServer) {
        const sqlString = `
          MERGE ${tableName} AS target
          USING (VALUES (@p0, @p1)) AS source (MaterialCode, ManagerName)
          ON target.MaterialCode = source.MaterialCode
          WHEN MATCHED THEN UPDATE SET ManagerName = source.ManagerName
          WHEN NOT MATCHED THEN INSERT (MaterialCode, ManagerName) VALUES (source.MaterialCode, source.ManagerName);
        `
        await dbService.query(sqlString, [materialCode, managerName || null])
      } else {
        const sqlString = `
          INSERT INTO ${tableName} (MaterialCode, ManagerName)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE ManagerName = VALUES(ManagerName)
        `
        await dbService.query(sqlString, [materialCode, managerName || null])
      }

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

      const result = await dbService.query(sqlString)
      return new Set(result.rows.map((row) => row.MaterialCode as string).filter(Boolean))
    } catch (error) {
      log.error('Get all material codes error', {
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

      const result = await dbService.query(sqlString)
      return result.rows.map((row) => ({
        id: row.ID as number,
        materialCode: row.MaterialCode as string,
        managerName: row.ManagerName as string
      }))
    } catch (error) {
      log.error('Get all records error', {
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
      const isSqlServer = dbService.type === 'sqlserver'

      const placeholder = isSqlServer ? '@p0' : '?'
      const sqlString = `
        SELECT ID, MaterialCode, ManagerName
        FROM ${tableName}
        WHERE ManagerName = ${placeholder} AND MaterialCode IS NOT NULL
        ORDER BY MaterialCode
      `

      const result = await dbService.query(sqlString, [managerName])
      return result.rows.map((row) => ({
        id: row.ID as number,
        materialCode: row.MaterialCode as string,
        managerName: row.ManagerName as string
      }))
    } catch (error) {
      log.error('Get materials by manager error', {
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

      const result = await dbService.query(sqlString)
      return result.rows.map((row) => row.ManagerName as string).filter(Boolean)
    } catch (error) {
      log.error('Get managers error', {
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
      const isSqlServer = dbService.type === 'sqlserver'

      const placeholder = isSqlServer ? '@p0' : '?'
      const sqlString = `
        SELECT ID, MaterialCode, ManagerName
        FROM ${tableName}
        WHERE MaterialCode = ${placeholder}
      `

      const result = await dbService.query(sqlString, [code])

      if (result.rows.length === 0) {
        return null
      }

      const row = result.rows[0]
      return {
        id: row.ID as number,
        materialCode: row.MaterialCode as string,
        managerName: row.ManagerName as string
      }
    } catch (error) {
      log.error('Get record by material code error', {
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
      const isSqlServer = dbService.type === 'sqlserver'

      const placeholder = isSqlServer ? '@p0' : '?'
      const sqlString = `
        DELETE FROM ${tableName}
        WHERE MaterialCode = ${placeholder}
      `

      const result = await dbService.query(sqlString, [code])
      return result.rowCount > 0
    } catch (error) {
      log.error('Delete by material code error', {
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
      const isSqlServer = dbService.type === 'sqlserver'

      const placeholder = isSqlServer ? '@p0' : '?'
      const sqlString = `
        DELETE FROM ${tableName}
        WHERE ManagerName = ${placeholder}
      `

      const result = await dbService.query(sqlString, [managerName])
      return result.rowCount
    } catch (error) {
      log.error('Delete by manager error', {
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
      const result = await dbService.query(sqlString)
      return result.rowCount
    } catch (error) {
      log.error('Delete all materials error', {
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

    let totalDeleted = 0
    const batchSize = 1000

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const isSqlServer = dbService.type === 'sqlserver'

      for (let i = 0; i < materialCodes.length; i += batchSize) {
        const batch = materialCodes.slice(i, i + batchSize)
        const placeholders = this.buildPlaceholders(batch.length, isSqlServer)

        const sqlString = `
          DELETE FROM ${tableName}
          WHERE MaterialCode IN (${placeholders})
        `

        const result = await dbService.query(
          sqlString,
          batch.map((c) => c.trim())
        )
        totalDeleted += result.rowCount
      }
    } catch (error) {
      log.error('Delete by material codes error', {
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
      const isSqlServer = dbService.type === 'sqlserver'

      const placeholder = isSqlServer ? '@p0' : '?'
      const sqlString = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE MaterialCode = ${placeholder}
      `

      const result = await dbService.query(sqlString, [code])
      return result.rows.length > 0 && (result.rows[0].count as number) > 0
    } catch (error) {
      log.error('Material exists error', {
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
   * Count materials for a specific manager
   * @param managerName - Manager name
   * @returns Number of materials for the manager
   */
  async countByManager(managerName: string): Promise<number> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const isSqlServer = dbService.type === 'sqlserver'

      const placeholder = isSqlServer ? '@p0' : '?'
      const sqlString = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE ManagerName = ${placeholder}
      `

      const result = await dbService.query(sqlString, [managerName])
      return result.rows.length > 0 ? (result.rows[0].count as number) : 0
    } catch (error) {
      log.error('Count by manager error', {
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

      const statsResult = await dbService.query(statsSql)
      const stats = statsResult.rows[0] || {}

      // Get materials per manager
      const managerSql = `
        SELECT ManagerName, COUNT(*) as count
        FROM ${tableName}
        WHERE ManagerName IS NOT NULL
        GROUP BY ManagerName
        ORDER BY count DESC
      `

      const managerResult = await dbService.query(managerSql)
      const materialsPerManager = managerResult.rows.map((row) => ({
        [row.ManagerName as string]: row.count as number
      }))

      return {
        totalMaterials: (stats.totalMaterials as number) || 0,
        uniqueManagers: (stats.uniqueManagers as number) || 0,
        materialsPerManager
      }
    } catch (error) {
      log.error('Get statistics error', {
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
    }
  }
}
