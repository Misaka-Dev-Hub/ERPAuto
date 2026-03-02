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
import { SqlServerService } from './sql-server'
import sql from 'mssql'

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
  private mysqlService: MySqlService | null = null
  private sqlServerService: SqlServerService | null = null
  private dbType: 'mysql' | 'sqlserver' = 'mysql'

  /**
   * Constructor - determine database type from environment
   */
  constructor() {
    const dbType = process.env.DB_TYPE?.toLowerCase()
    if (dbType === 'sqlserver' || dbType === 'mssql') {
      this.dbType = 'sqlserver'
    } else {
      this.dbType = 'mysql'
    }
  }

  /**
   * Get the appropriate table name based on database type
   */
  private getTableName(): string {
    return this.dbType === 'sqlserver'
      ? MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_SQLSERVER
      : MATERIALS_TO_BE_DELETED_CONFIG.TABLE_NAME_MYSQL
  }

  /**
   * Get database service instance (MySQL or SQL Server)
   */
  private async getDatabaseService(): Promise<MySqlService | SqlServerService> {
    if (this.dbType === 'sqlserver') {
      if (this.sqlServerService && this.sqlServerService.isConnected()) {
        return this.sqlServerService
      }

      this.sqlServerService = new SqlServerService({
        server: process.env.DB_SERVER || 'localhost',
        port: parseInt(process.env.DB_SQLSERVER_PORT || '1433', 10),
        user: process.env.DB_USERNAME || 'sa',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || '',
        options: {
          encrypt: process.env.DB_TRUST_SERVER_CERTIFICATE === 'yes',
          trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'yes'
        }
      })

      await this.sqlServerService.connect()
      return this.sqlServerService
    } else {
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const code = materialCode.trim()
      const manager = managerName?.trim() || null

      if (this.dbType === 'sqlserver') {
        const sql = `
          MERGE ${tableName} AS target
          USING (VALUES (@materialCode, @managerName)) AS source (MaterialCode, ManagerName)
          ON target.MaterialCode = source.MaterialCode
          WHEN MATCHED THEN UPDATE SET ManagerName = source.ManagerName
          WHEN NOT MATCHED THEN INSERT (MaterialCode, ManagerName) VALUES (source.MaterialCode, source.ManagerName);
        `

        await (dbService as SqlServerService).queryWithParams(sql, {
          materialCode: { value: code, type: sql.NVarChar },
          managerName: { value: manager, type: sql.NVarChar }
        })
      } else {
        const sql = `
          INSERT INTO ${tableName} (MaterialCode, ManagerName)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE ManagerName = VALUES(ManagerName)
        `

        await (dbService as MySqlService).query(sql, [code, manager])
      }

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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      for (const material of materials) {
        const materialCode = material.materialCode?.trim()
        const managerName = material.managerName?.trim() || ''

        if (!materialCode) {
          stats.failed++
          continue
        }

        try {
          if (this.dbType === 'sqlserver') {
            const sql = `
              MERGE ${tableName} AS target
              USING (VALUES (@materialCode, @managerName)) AS source (MaterialCode, ManagerName)
              ON target.MaterialCode = source.MaterialCode
              WHEN MATCHED THEN UPDATE SET ManagerName = source.ManagerName
              WHEN NOT MATCHED THEN INSERT (MaterialCode, ManagerName) VALUES (source.MaterialCode, source.ManagerName);
            `

            await (dbService as SqlServerService).queryWithParams(sql, {
              materialCode: { value: materialCode, type: sql.NVarChar },
              managerName: { value: managerName || null, type: sql.NVarChar }
            })
          } else {
            const sql = `
              INSERT INTO ${tableName} (MaterialCode, ManagerName)
              VALUES (?, ?)
              ON DUPLICATE KEY UPDATE ManagerName = VALUES(ManagerName)
            `

            await (dbService as MySqlService).query(sql, [materialCode, managerName || null])
          }

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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sql = `
        SELECT MaterialCode
        FROM ${tableName}
        WHERE MaterialCode IS NOT NULL
      `

      const result = this.dbType === 'sqlserver'
        ? await (dbService as SqlServerService).query(sql)
        : await (dbService as MySqlService).query(sql)

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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sql = `
        SELECT ID, MaterialCode, ManagerName
        FROM ${tableName}
        WHERE MaterialCode IS NOT NULL
        ORDER BY ManagerName, MaterialCode
      `

      const result = this.dbType === 'sqlserver'
        ? await (dbService as SqlServerService).query(sql)
        : await (dbService as MySqlService).query(sql)

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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      if (this.dbType === 'sqlserver') {
        const sql = `
          SELECT ID, MaterialCode, ManagerName
          FROM ${tableName}
          WHERE ManagerName = @managerName AND MaterialCode IS NOT NULL
          ORDER BY MaterialCode
        `

        const result = await (dbService as SqlServerService).queryWithParams(sql, {
          managerName: { value: managerName, type: sql.NVarChar }
        })

        return result.rows.map(row => ({
          id: row.ID as number,
          materialCode: row.MaterialCode as string,
          managerName: row.ManagerName as string
        }))
      } else {
        const sql = `
          SELECT ID, MaterialCode, ManagerName
          FROM ${tableName}
          WHERE ManagerName = ? AND MaterialCode IS NOT NULL
          ORDER BY MaterialCode
        `

        const result = await (dbService as MySqlService).query(sql, [managerName])

        return result.rows.map(row => ({
          id: row.ID as number,
          materialCode: row.MaterialCode as string,
          managerName: row.ManagerName as string
        }))
      }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sql = `
        SELECT DISTINCT ManagerName
        FROM ${tableName}
        WHERE ManagerName IS NOT NULL
        ORDER BY ManagerName
      `

      const result = this.dbType === 'sqlserver'
        ? await (dbService as SqlServerService).query(sql)
        : await (dbService as MySqlService).query(sql)

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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const code = materialCode.trim()

      if (this.dbType === 'sqlserver') {
        const sql = `
          SELECT ID, MaterialCode, ManagerName
          FROM ${tableName}
          WHERE MaterialCode = @materialCode
        `

        const result = await (dbService as SqlServerService).queryWithParams(sql, {
          materialCode: { value: code, type: sql.NVarChar }
        })

        if (result.rows.length === 0) {
          return null
        }

        const row = result.rows[0]
        return {
          id: row.ID as number,
          materialCode: row.MaterialCode as string,
          managerName: row.ManagerName as string
        }
      } else {
        const sql = `
          SELECT ID, MaterialCode, ManagerName
          FROM ${tableName}
          WHERE MaterialCode = ?
        `

        const result = await (dbService as MySqlService).query(sql, [code])

        if (result.rows.length === 0) {
          return null
        }

        const row = result.rows[0]
        return {
          id: row.ID as number,
          materialCode: row.MaterialCode as string,
          managerName: row.ManagerName as string
        }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const code = materialCode.trim()

      if (this.dbType === 'sqlserver') {
        const sql = `
          DELETE FROM ${tableName}
          WHERE MaterialCode = @materialCode
        `

        const result = await (dbService as SqlServerService).queryWithParams(sql, {
          materialCode: { value: code, type: sql.NVarChar }
        })

        return result.rowCount > 0
      } else {
        const sql = `
          DELETE FROM ${tableName}
          WHERE MaterialCode = ?
        `

        const result = await (dbService as MySqlService).query(sql, [code])

        return result.rowCount > 0
      }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      if (this.dbType === 'sqlserver') {
        const sql = `
          DELETE FROM ${tableName}
          WHERE ManagerName = @managerName
        `

        const result = await (dbService as SqlServerService).queryWithParams(sql, {
          managerName: { value: managerName, type: sql.NVarChar }
        })

        return result.rowCount
      } else {
        const sql = `
          DELETE FROM ${tableName}
          WHERE ManagerName = ?
        `

        const result = await (dbService as MySqlService).query(sql, [managerName])

        return result.rowCount
      }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sql = `DELETE FROM ${tableName}`

      const result = this.dbType === 'sqlserver'
        ? await (dbService as SqlServerService).query(sql)
        : await (dbService as MySqlService).query(sql)

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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      for (let i = 0; i < materialCodes.length; i += batchSize) {
        const batch = materialCodes.slice(i, i + batchSize)

        if (this.dbType === 'sqlserver') {
          const placeholders = batch.map((_, idx) => `@p${idx}`).join(',')
          const params: Record<string, { value: string; type: sql.ISqlType }> = {}

          batch.forEach((code, idx) => {
            params[`p${idx}`] = { value: code.trim(), type: sql.NVarChar }
          })

          const sql = `
            DELETE FROM ${tableName}
            WHERE MaterialCode IN (${placeholders})
          `

          const result = await (dbService as SqlServerService).queryWithParams(sql, params)
          totalDeleted += result.rowCount
        } else {
          const placeholders = batch.map(() => '?').join(',')

          const sql = `
            DELETE FROM ${tableName}
            WHERE MaterialCode IN (${placeholders})
          `

          const result = await (dbService as MySqlService).query(sql, batch)
          totalDeleted += result.rowCount
        }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const code = materialCode.trim()

      if (this.dbType === 'sqlserver') {
        const sql = `
          SELECT COUNT(*) as count
          FROM ${tableName}
          WHERE MaterialCode = @materialCode
        `

        const result = await (dbService as SqlServerService).queryWithParams(sql, {
          materialCode: { value: code, type: sql.NVarChar }
        })

        return result.rows.length > 0 && (result.rows[0].count as number) > 0
      } else {
        const sql = `
          SELECT COUNT(*) as count
          FROM ${tableName}
          WHERE MaterialCode = ?
        `

        const result = await (dbService as MySqlService).query(sql, [code])

        return result.rows.length > 0 && (result.rows[0].count as number) > 0
      }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sql = `SELECT COUNT(*) as count FROM ${tableName}`

      const result = this.dbType === 'sqlserver'
        ? await (dbService as SqlServerService).query(sql)
        : await (dbService as MySqlService).query(sql)

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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      if (this.dbType === 'sqlserver') {
        const sql = `
          SELECT COUNT(*) as count
          FROM ${tableName}
          WHERE ManagerName = @managerName
        `

        const result = await (dbService as SqlServerService).queryWithParams(sql, {
          managerName: { value: managerName, type: sql.NVarChar }
        })

        return result.rows.length > 0 ? (result.rows[0].count as number) : 0
      } else {
        const sql = `
          SELECT COUNT(*) as count
          FROM ${tableName}
          WHERE ManagerName = ?
        `

        const result = await (dbService as MySqlService).query(sql, [managerName])

        return result.rows.length > 0 ? (result.rows[0].count as number) : 0
      }
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

      const statsResult = this.dbType === 'sqlserver'
        ? await (dbService as SqlServerService).query(statsSql)
        : await (dbService as MySqlService).query(statsSql)

      const stats = statsResult.rows[0] || {}

      // Get materials per manager
      const managerSql = `
        SELECT ManagerName, COUNT(*) as count
        FROM ${tableName}
        WHERE ManagerName IS NOT NULL
        GROUP BY ManagerName
        ORDER BY count DESC
      `

      const managerResult = this.dbType === 'sqlserver'
        ? await (dbService as SqlServerService).query(managerSql)
        : await (dbService as MySqlService).query(managerSql)

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
    if (this.sqlServerService) {
      await this.sqlServerService.disconnect()
      this.sqlServerService = null
    }
  }
}
