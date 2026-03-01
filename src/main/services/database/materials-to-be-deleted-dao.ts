/**
 * Data Access Object for MaterialsToBeDeleted table
 *
 * Mirrors the Python MaterialsToBeDeletedDAO functionality:
 * - CRUD operations for materials identified by MaterialCode
 * - Batch upsert operations
 * - Manager-based filtering and queries
 * - Statistics gathering
 */

import { MySqlService } from './mysql'

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

  // ==================== UPSERT (MERGE) ====================

  /**
   * Insert or update a single material record
   * @param materialCode - Material code (exact match key)
   * @param managerName - Manager name
   * @returns True if successful
   */
  async upsertMaterial(materialCode: string, managerName: string): Promise<boolean> {
    if (!materialCode || !materialCode.trim()) {
      console.error('[MaterialsToBeDeletedDAO] MaterialCode cannot be empty')
      return false
    }

    try {
      const mysqlService = await this.getMySqlService()

      const sql = `
        INSERT INTO ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL} (MaterialCode, ManagerName)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE ManagerName = VALUES(ManagerName)
      `

      await mysqlService.query(sql, [materialCode.trim(), managerName?.trim() || null])
      return true
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Upsert material error:', error)
      return false
    }
  }

  /**
   * Insert or update multiple material records in batch
   * @param materials - List of materials with materialCode and managerName
   * @returns Statistics object
   */
  async upsertBatch(materials: { materialCode: string; managerName: string }[]): Promise<UpsertStats> {
    if (!materials || materials.length === 0) {
      return { total: 0, success: 0, failed: 0 }
    }

    const stats: UpsertStats = {
      total: materials.length,
      success: 0,
      failed: 0
    }

    try {
      const mysqlService = await this.getMySqlService()

      for (const material of materials) {
        const materialCode = material.materialCode?.trim()
        const managerName = material.managerName?.trim() || ''

        if (!materialCode) {
          stats.failed++
          continue
        }

        try {
          const sql = `
            INSERT INTO ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL} (MaterialCode, ManagerName)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE ManagerName = VALUES(ManagerName)
          `

          await mysqlService.query(sql, [materialCode, managerName || null])
          stats.success++
        } catch (error) {
          console.error('[MaterialsToBeDeletedDAO] Error upserting material:', materialCode, error)
          stats.failed++
        }
      }
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Batch upsert error:', error)
      stats.failed = stats.total - stats.success
    }

    return stats
  }

  // ==================== READ ====================

  /**
   * Get all material codes as a set
   * @returns Set of material codes
   */
  async getAllMaterialCodes(): Promise<Set<string>> {
    try {
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT MaterialCode
        FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
        WHERE MaterialCode IS NOT NULL
      `

      const result = await mysqlService.query(sql)
      return new Set(result.rows.map(row => row.MaterialCode as string).filter(Boolean))
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Get all material codes error:', error)
      return new Set()
    }
  }

  /**
   * Get all material records
   * @returns List of all material records
   */
  async getAllRecords(): Promise<MaterialRecord[]> {
    try {
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT ID, MaterialCode, ManagerName
        FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
        WHERE MaterialCode IS NOT NULL
        ORDER BY ManagerName, MaterialCode
      `

      const result = await mysqlService.query(sql)
      return result.rows.map(row => ({
        id: row.ID as number,
        materialCode: row.MaterialCode as string,
        managerName: row.ManagerName as string
      }))
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Get all records error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT ID, MaterialCode, ManagerName
        FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
        WHERE ManagerName = ? AND MaterialCode IS NOT NULL
        ORDER BY MaterialCode
      `

      const result = await mysqlService.query(sql, [managerName])
      return result.rows.map(row => ({
        id: row.ID as number,
        materialCode: row.MaterialCode as string,
        managerName: row.ManagerName as string
      }))
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Get materials by manager error:', error)
      return []
    }
  }

  /**
   * Get list of unique manager names
   * @returns List of unique manager names
   */
  async getManagers(): Promise<string[]> {
    try {
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT DISTINCT ManagerName
        FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
        WHERE ManagerName IS NOT NULL
        ORDER BY ManagerName
      `

      const result = await mysqlService.query(sql)
      return result.rows.map(row => row.ManagerName as string).filter(Boolean)
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Get managers error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT ID, MaterialCode, ManagerName
        FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
        WHERE MaterialCode = ?
      `

      const result = await mysqlService.query(sql, [materialCode.trim()])
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
      console.error('[MaterialsToBeDeletedDAO] Get record by material code error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        DELETE FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
        WHERE MaterialCode = ?
      `

      const result = await mysqlService.query(sql, [materialCode.trim()])
      return result.rowCount > 0
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Delete by material code error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        DELETE FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
        WHERE ManagerName = ?
      `

      const result = await mysqlService.query(sql, [managerName])
      return result.rowCount
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Delete by manager error:', error)
      return 0
    }
  }

  /**
   * Delete all material records
   * @returns Number of records deleted
   */
  async deleteAllMaterials(): Promise<number> {
    try {
      const mysqlService = await this.getMySqlService()

      const sql = `DELETE FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}`

      const result = await mysqlService.query(sql)
      return result.rowCount
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Delete all materials error:', error)
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
      const mysqlService = await this.getMySqlService()

      for (let i = 0; i < materialCodes.length; i += batchSize) {
        const batch = materialCodes.slice(i, i + batchSize)
        const placeholders = batch.map(() => '?').join(',')

        const sql = `
          DELETE FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
          WHERE MaterialCode IN (${placeholders})
        `

        const result = await mysqlService.query(sql, batch)
        totalDeleted += result.rowCount
      }
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Delete by material codes error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT COUNT(*) as count
        FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
        WHERE MaterialCode = ?
      `

      const result = await mysqlService.query(sql, [materialCode.trim()])
      return result.rows.length > 0 && (result.rows[0].count as number) > 0
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Material exists error:', error)
      return false
    }
  }

  /**
   * Count all material records
   * @returns Total number of records
   */
  async countAll(): Promise<number> {
    try {
      const mysqlService = await this.getMySqlService()

      const sql = `SELECT COUNT(*) as count FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}`

      const result = await mysqlService.query(sql)
      return result.rows.length > 0 ? (result.rows[0].count as number) : 0
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Count all error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT COUNT(*) as count
        FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
        WHERE ManagerName = ?
      `

      const result = await mysqlService.query(sql, [managerName])
      return result.rows.length > 0 ? (result.rows[0].count as number) : 0
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Count by manager error:', error)
      return 0
    }
  }

  /**
   * Get comprehensive statistics
   * @returns Statistics object
   */
  async getStatistics(): Promise<MaterialStats> {
    try {
      const mysqlService = await this.getMySqlService()

      // Get total and unique managers
      const statsSql = `
        SELECT
          COUNT(*) as totalMaterials,
          COUNT(DISTINCT ManagerName) as uniqueManagers
        FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
        WHERE MaterialCode IS NOT NULL
      `

      const statsResult = await mysqlService.query(statsSql)
      const stats = statsResult.rows[0] || {}

      // Get materials per manager
      const managerSql = `
        SELECT ManagerName, COUNT(*) as count
        FROM ${MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL}
        WHERE ManagerName IS NOT NULL
        GROUP BY ManagerName
        ORDER BY count DESC
      `

      const managerResult = await mysqlService.query(managerSql)
      const materialsPerManager = managerResult.rows.map(row => ({
        [row.ManagerName as string]: row.count as number
      }))

      return {
        totalMaterials: (stats.totalMaterials as number) || 0,
        uniqueManagers: (stats.uniqueManagers as number) || 0,
        materialsPerManager
      }
    } catch (error) {
      console.error('[MaterialsToBeDeletedDAO] Get statistics error:', error)
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
    if (this.mysqlService) {
      await this.mysqlService.disconnect()
      this.mysqlService = null
    }
  }
}
