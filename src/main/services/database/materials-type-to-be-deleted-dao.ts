/**
 * Data Access Object for MaterialsTypeToBeDeleted table
 *
 * Manages material type keywords for identifying materials to be deleted.
 * Used for matching material names against type keywords to assign managers.
 */

import { create, type IDatabaseService } from './index'
import { createDialect, type SqlDialect } from './dialects'
import { createLogger, getRequestId, trackDuration } from '../logger'

const log = createLogger('MaterialsTypeToBeDeletedDAO')

/**
 * Material type record interface
 */
export interface MaterialTypeRecord {
  id?: number
  materialName: string
  managerName: string
}

/**
 * Batch update request
 */
export interface MaterialTypeBatchRequest {
  toInsert: MaterialTypeRecord[]
  toUpdate: { old: MaterialTypeRecord; new: MaterialTypeRecord }[]
  toDelete: MaterialTypeRecord[]
}

/**
 * Configuration for MaterialsTypeToBeDeleted table
 */
export const MATERIALS_TYPE_TO_BE_DELETED_CONFIG = {
  COLUMNS: {
    ID: 'ID',
    MATERIAL_NAME: 'MaterialName',
    MANAGER_NAME: 'ManagerName'
  }
} as const

/**
 * MaterialsTypeToBeDeleted DAO Class
 */
export class MaterialsTypeToBeDeletedDAO {
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
    return this.getDialect().quoteTableName('dbo', 'MaterialsTypeToBeDeleted')
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

  // ==================== READ ====================

  /**
   * Get all material type records
   * @returns List of all material type records
   */
  async getAllMaterials(): Promise<MaterialTypeRecord[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `
        SELECT ID, MaterialName, ManagerName
        FROM ${tableName}
        WHERE MaterialName IS NOT NULL
        ORDER BY ManagerName, MaterialName
      `

      const result = await trackDuration(async () => await dbService.query(sqlString), {
        operationName: 'MaterialsTypeToBeDeletedDAO.getAllMaterials',
        context: { tableName, operationType: 'SELECT' }
      })
      return result.result.rows.map((row) => ({
        id: row.ID as number,
        materialName: row.MaterialName as string,
        managerName: row.ManagerName as string
      }))
    } catch (error) {
      log.error('Get all materials error', {
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
  async getMaterialsByManager(managerName: string): Promise<MaterialTypeRecord[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const placeholder = dialect.param(0)
      const sqlString = `
        SELECT ID, MaterialName, ManagerName
        FROM ${tableName}
        WHERE ManagerName = ${placeholder} AND MaterialName IS NOT NULL
        ORDER BY MaterialName
      `

      const result = await trackDuration(
        async () => await dbService.query(sqlString, [managerName]),
        {
          operationName: 'MaterialsTypeToBeDeletedDAO.getMaterialsByManager',
          context: { tableName, operationType: 'SELECT' }
        }
      )
      return result.result.rows.map((row) => ({
        id: row.ID as number,
        materialName: row.MaterialName as string,
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
        operationName: 'MaterialsTypeToBeDeletedDAO.getManagers',
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

  // ==================== UPSERT ====================

  /**
   * Insert or update a material type record
   * @param materialName - Material name (type keyword)
   * @param managerName - Manager name
   * @returns True if successful
   */
  async upsertMaterial(materialName: string, managerName: string): Promise<boolean> {
    if (!materialName || !materialName.trim()) {
      log.error('MaterialName cannot be empty', {
        tableName: this.getTableName(),
        operationType: 'UPSERT',
        requestId: getRequestId()
      })
      return false
    }

    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const name = materialName.trim()
      const manager = managerName?.trim() || null
      const dialect = this.getDialect()

      if (dbService.type === 'postgresql') {
        const updateSql = `
          UPDATE ${tableName}
          SET ManagerName = ${dialect.param(0)}
          WHERE MaterialName = ${dialect.param(1)}
        `

        const updateResult = await trackDuration(
          async () => await dbService.query(updateSql, [manager, name]),
          {
            operationName: 'MaterialsTypeToBeDeletedDAO.upsertMaterial',
            context: { tableName, operationType: 'UPSERT_UPDATE_FIRST' }
          }
        )

        if (updateResult.result.rowCount > 0) {
          return true
        }

        const insertSql = `
          INSERT INTO ${tableName} (MaterialName, ManagerName)
          SELECT ${dialect.param(0)}, ${dialect.param(1)}
          WHERE NOT EXISTS (
            SELECT 1
            FROM ${tableName}
            WHERE MaterialName = ${dialect.param(0)}
          )
        `

        const insertResult = await trackDuration(
          async () => await dbService.query(insertSql, [name, manager]),
          {
            operationName: 'MaterialsTypeToBeDeletedDAO.upsertMaterial',
            context: { tableName, operationType: 'UPSERT_INSERT_FALLBACK' }
          }
        )

        if (insertResult.result.rowCount > 0) {
          return true
        }

        const retryUpdateResult = await trackDuration(
          async () => await dbService.query(updateSql, [manager, name]),
          {
            operationName: 'MaterialsTypeToBeDeletedDAO.upsertMaterial',
            context: { tableName, operationType: 'UPSERT_UPDATE_RETRY' }
          }
        )

        return retryUpdateResult.result.rowCount > 0
      }

      const { sql: sqlString } = dialect.upsert({
        table: tableName,
        keyColumns: ['MaterialName'],
        allColumns: ['MaterialName', 'ManagerName'],
        startParamIndex: 0
      })

      await trackDuration(async () => await dbService.query(sqlString, [name, manager]), {
        operationName: 'MaterialsTypeToBeDeletedDAO.upsertMaterial',
        context: { tableName, operationType: 'UPSERT' }
      })

      return true
    } catch (error) {
      log.error('Upsert material error', {
        tableName: this.getTableName(),
        operationType: 'UPSERT',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  // ==================== DELETE ====================

  /**
   * Delete a specific material type record
   * @param materialName - Material name
   * @param managerName - Manager name (optional, for verification)
   * @returns True if successful
   */
  async deleteMaterial(materialName: string, managerName?: string): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const name = materialName.trim()
      const dialect = this.getDialect()

      let sqlString: string
      let params: (string | null)[]

      if (managerName) {
        sqlString = `DELETE FROM ${tableName} WHERE MaterialName = ${dialect.param(0)} AND ManagerName = ${dialect.param(1)}`
        params = [name, managerName.trim()]
      } else {
        sqlString = `DELETE FROM ${tableName} WHERE MaterialName = ${dialect.param(0)}`
        params = [name]
      }

      const result = await trackDuration(async () => await dbService.query(sqlString, params), {
        operationName: 'MaterialsTypeToBeDeletedDAO.deleteMaterial',
        context: { tableName, operationType: 'DELETE' }
      })
      return result.result.rowCount > 0
    } catch (error) {
      log.error('Delete material error', {
        tableName: this.getTableName(),
        operationType: 'DELETE',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  // ==================== UPDATE ====================

  /**
   * Update a material type record (change name and/or manager)
   * @param oldName - Current material name
   * @param oldManager - Current manager name
   * @param newName - New material name
   * @param newManager - New manager name
   * @returns True if successful
   */
  async updateMaterial(
    oldName: string,
    oldManager: string,
    newName: string,
    newManager: string
  ): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const sqlString = `
        UPDATE ${tableName}
        SET MaterialName = ${dialect.param(0)}, ManagerName = ${dialect.param(1)}
        WHERE MaterialName = ${dialect.param(2)} AND ManagerName = ${dialect.param(3)}
      `
      const result = await trackDuration(
        async () =>
          await dbService.query(sqlString, [
            newName.trim(),
            newManager.trim(),
            oldName.trim(),
            oldManager.trim()
          ]),
        {
          operationName: 'MaterialsTypeToBeDeletedDAO.updateMaterial',
          context: { tableName, operationType: 'UPDATE' }
        }
      )
      return result.result.rowCount > 0
    } catch (error) {
      log.error('Update material error', {
        tableName: this.getTableName(),
        operationType: 'UPDATE',
        requestId: getRequestId(),
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  // ==================== BATCH OPERATIONS ====================

  /**
   * Process batch changes (insert, update, delete)
   * @param request - Batch request with toInsert, toUpdate, toDelete arrays
   * @returns Statistics object
   */
  async upsertBatch(
    request: MaterialTypeBatchRequest
  ): Promise<{ total: number; success: number; failed: number }> {
    const batchId = getRequestId() || `batch-${Date.now()}`
    const stats = { total: 0, success: 0, failed: 0 }

    try {
      const tableName = this.getTableName()
      const totalOperations =
        request.toInsert.length + request.toUpdate.length + request.toDelete.length

      log.info('Batch upsert started', {
        tableName,
        operationType: 'BATCH',
        requestId: batchId,
        totalOperations,
        inserts: request.toInsert.length,
        updates: request.toUpdate.length,
        deletes: request.toDelete.length
      })

      // Process inserts
      for (const record of request.toInsert) {
        stats.total++
        const success = await this.upsertMaterial(record.materialName, record.managerName)
        if (success) stats.success++
        else stats.failed++
      }

      // Process updates
      for (const update of request.toUpdate) {
        stats.total++
        const success = await this.updateMaterial(
          update.old.materialName,
          update.old.managerName,
          update.new.materialName,
          update.new.managerName
        )
        if (success) stats.success++
        else stats.failed++
      }

      // Process deletes
      for (const record of request.toDelete) {
        stats.total++
        const success = await this.deleteMaterial(record.materialName, record.managerName)
        if (success) stats.success++
        else stats.failed++
      }

      log.info('Batch upsert completed', {
        tableName,
        operationType: 'BATCH',
        requestId: batchId,
        success: stats.success,
        failed: stats.failed,
        total: stats.total
      })

      return stats
    } catch (error) {
      log.error('Batch upsert error', {
        tableName: this.getTableName(),
        operationType: 'BATCH',
        requestId: batchId,
        total: stats.total,
        success: stats.success,
        failed: stats.failed,
        error: error instanceof Error ? error.message : String(error)
      })
      return stats
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
