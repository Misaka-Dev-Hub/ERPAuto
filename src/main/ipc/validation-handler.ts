/**
 * IPC handlers for material validation operations
 *
 * Provides endpoints for:
 * - Running material validation from database
 * - Getting/setting materials to be deleted
 * - Manager-based filtering
 */

import { ipcMain } from 'electron'
import { MySqlService } from '../services/database/mysql'
import { SqlServerService } from '../services/database/sql-server'
import { MaterialsToBeDeletedDAO } from '../services/database/materials-to-be-deleted-dao'
import { DiscreteMaterialPlanDAO } from '../services/database/discrete-material-plan-dao'
import { ValidationService } from '../services/validation/validation-service'
import type {
  ValidationRequest,
  ValidationResponse,
  MaterialUpsertBatchRequest,
  MaterialDeleteRequest,
  MaterialOperationResponse,
  ValidationResult,
  MaterialRecordSummary
} from '../types/validation.types'

/**
 * Shared state for Production IDs from extractor page
 * This is a simple in-memory store for sharing Production IDs between pages
 */
const sharedProductionIds = new Set<string>()

/**
 * Set shared Production IDs
 */
export function setSharedProductionIds(ids: string[]): void {
  ids.forEach(id => sharedProductionIds.add(id))
}

/**
 * Get shared Production IDs
 */
export function getSharedProductionIds(): string[] {
  return [...sharedProductionIds]
}

/**
 * Clear shared Production IDs
 */
export function clearSharedProductionIds(): void {
  sharedProductionIds.clear()
}

/**
 * Get database service for validation operations (MySQL or SQL Server)
 */
async function getValidationDatabaseService(): Promise<MySqlService | SqlServerService> {
  const dbType = process.env.DB_TYPE?.toLowerCase()

  if (dbType === 'sqlserver' || dbType === 'mssql') {
    const sqlServerService = new SqlServerService({
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
    await sqlServerService.connect()
    return sqlServerService
  } else {
    const mysqlService = new MySqlService({
      host: process.env.DB_MYSQL_HOST || 'localhost',
      port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || ''
    })
    await mysqlService.connect()
    return mysqlService
  }
}

/**
 * Get table name based on database type
 * Converts MySQL schema_tablename format to SQL Server [schema].[tablename] format
 * e.g., productionContractData_26年压力表合同数据 -> [productionContractData].[26年压力表合同数据]
 *      dbo_MaterialsToBeDeleted -> [dbo].[MaterialsToBeDeleted]
 */
function readProductionIds(filePath: string): string[] {
  const fs = require('fs')
  const content = fs.readFileSync(filePath, 'utf-8')
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

/**
 * Register IPC handlers for validation operations
 */
export function registerValidationHandlers(): void {
  const validationService = new ValidationService()
  const dbType = process.env.DB_TYPE?.toLowerCase()
  const isSqlServer = dbType === 'sqlserver' || dbType === 'mssql'

  // ==================== VALIDATION ====================

  /**
   * Run material validation from database
   */
  ipcMain.handle(
    'validation:validate',
    async (
      _event,
      request: ValidationRequest
    ): Promise<ValidationResponse> => {
      let dbService: MySqlService | SqlServerService | null = null

      try {
        console.log('[Validation] Starting validation:', request)

        // Connect to database
        dbService = await getValidationDatabaseService()

        let sourceNumbers: string[] | null = null

        // Get source numbers based on mode
        if (request.mode === 'database_filtered') {
          if (request.useSharedProductionIds) {
            // Use shared Production IDs from extractor page
            const sharedIds = getSharedProductionIds()
            console.log(`[Validation] Using ${sharedIds.length} shared Production IDs`)

            if (sharedIds.length === 0) {
              return {
                success: false,
                error: '没有可用的共享 Production ID。请在数据提取页面输入 Production ID。',
                stats: {
                  totalRecords: 0,
                  matchedCount: 0,
                  markedCount: 0
                }
              }
            }

            sourceNumbers = await validationService.getSourceNumbersFromInputs(sharedIds, dbService)
            console.log(
              `[Validation] Got ${sourceNumbers.length} source numbers from shared Production IDs`
            )
          } else if (request.productionIdFile) {
            // Read from file
            const inputs = readProductionIds(request.productionIdFile)
            console.log(
              `[Validation] Read ${inputs.length} inputs from file`
            )
            sourceNumbers = await validationService.getSourceNumbersFromInputs(inputs, dbService)
            console.log(
              `[Validation] Got ${sourceNumbers.length} source numbers`
            )
          }
        }

        // Get material records from DiscreteMaterialPlanData
        const materialDao = new DiscreteMaterialPlanDAO()

        let materialRecords: any[] = []

        if (request.mode === 'database_full') {
          // Full table query with deduplication by MaterialCode
          materialRecords = await materialDao.queryAllDistinctByMaterialCode()
        } else if (sourceNumbers && sourceNumbers.length > 0) {
          // Filtered query by source numbers
          materialRecords = await materialDao.queryBySourceNumbersDistinct(
            sourceNumbers
          )
        }

        if (materialRecords.length === 0) {
          return {
            success: false,
            error: 'No material records found',
            stats: {
              totalRecords: 0,
              matchedCount: 0,
              markedCount: 0
            }
          }
        }

        // Get type keywords from MaterialsTypeToBeDeleted
        const typeKeywordTableName = validationService.getTableName('dbo_MaterialsTypeToBeDeleted')
        const typeKeywordSql = `
          SELECT MaterialName, ManagerName
          FROM ${typeKeywordTableName}
          WHERE MaterialName IS NOT NULL
        `
        const typeKeywordResult = validationService.isSqlServer()
          ? await (dbService as SqlServerService).query(typeKeywordSql)
          : await (dbService as MySqlService).query(typeKeywordSql)

        const typeKeywords = typeKeywordResult.rows.map(row => ({
          materialName: row.MaterialName as string,
          managerName: row.ManagerName as string
        }))

        // Get marked material codes from MaterialsToBeDeleted
        const markedTableName = validationService.getTableName('dbo_MaterialsToBeDeleted')
        const markedSql = `
          SELECT MaterialCode, ManagerName
          FROM ${markedTableName}
          WHERE MaterialCode IS NOT NULL AND ManagerName IS NOT NULL
        `
        const markedResult = validationService.isSqlServer()
          ? await (dbService as SqlServerService).query(markedSql)
          : await (dbService as MySqlService).query(markedSql)

        const markedCodesDict = new Map<string, string>()
        for (const row of markedResult.rows) {
          markedCodesDict.set(
            row.MaterialCode as string,
            row.ManagerName as string
          )
        }

        // Match materials
        const results = validationService.matchMaterials(materialRecords, markedCodesDict, typeKeywords)

        const markedCount = results.filter(r => r.isMarkedForDeletion).length
        const matchedCount = results.filter(r => r.managerName).length

        return {
          success: true,
          results,
          stats: {
            totalRecords: results.length,
            matchedCount,
            markedCount
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[Validation] Validation error:', error)
        return {
          success: false,
          error: `Validation failed: ${message}`
        }
      } finally {
        if (dbService) {
          try {
            await dbService.disconnect()
          } catch (closeError) {
            console.warn('[Validation] Error disconnecting database:', closeError)
          }
        }
      }
    }
  )

  // ==================== MATERIAL OPERATIONS ====================

  /**
   * Upsert batch materials to MaterialsToBeDeleted
   */
  ipcMain.handle(
    'materials:upsertBatch',
    async (
      _event,
      request: MaterialUpsertBatchRequest
    ): Promise<MaterialOperationResponse> => {
      try {
        const dao = new MaterialsToBeDeletedDAO()
        const stats = await dao.upsertBatch(request.materials)

        return {
          success: true,
          stats
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[Materials] Upsert batch error:', error)
        return {
          success: false,
          error: `Upsert failed: ${message}`
        }
      }
    }
  )

  /**
   * Delete materials by material codes
   */
  ipcMain.handle(
    'materials:delete',
    async (
      _event,
      request: MaterialDeleteRequest
    ): Promise<MaterialOperationResponse> => {
      try {
        const dao = new MaterialsToBeDeletedDAO()
        const count = await dao.deleteByMaterialCodes(request.materialCodes)

        return {
          success: true,
          count
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[Materials] Delete error:', error)
        return {
          success: false,
          error: `Delete failed: ${message}`
        }
      }
    }
  )

  /**
   * Get unique manager names
   */
  ipcMain.handle(
    'materials:getManagers',
    async (_event): Promise<{ managers: string[] }> => {
      try {
        const dao = new MaterialsToBeDeletedDAO()
        const managers = await dao.getManagers()
        return { managers }
      } catch (error) {
        console.error('[Materials] Get managers error:', error)
        return { managers: [] }
      }
    }
  )

  /**
   * Get materials by manager
   */
  ipcMain.handle(
    'materials:getByManager',
    async (
      _event,
      managerName: string
    ): Promise<{ materials: MaterialRecordSummary[] }> => {
      let dbService: MySqlService | SqlServerService | null = null

      try {
        dbService = await getValidationDatabaseService()

        const dao = new MaterialsToBeDeletedDAO()
        const materials = await dao.getMaterialsByManager(managerName)

        // Get material codes set for quick lookup
        const markedCodes = await dao.getAllMaterialCodes()

        // Enrich with material details from DiscreteMaterialPlanData
        const enrichedMaterials: MaterialRecordSummary[] = []
        const detailTableName = validationService.getTableName('dbo_DiscreteMaterialPlanData')

        for (const mat of materials) {
          let detailResult: any

          if (validationService.isSqlServer()) {
            const sql = require('mssql')
            const detailSql = `
              SELECT TOP 1 MaterialName, Specification, Model
              FROM ${detailTableName}
              WHERE MaterialCode = @materialCode
            `
            detailResult = await (dbService as SqlServerService).queryWithParams(detailSql, {
              materialCode: { value: mat.materialCode, type: sql.NVarChar }
            })
          } else {
            const detailSql = `
              SELECT MaterialName, Specification, Model
              FROM ${detailTableName}
              WHERE MaterialCode = ?
              LIMIT 1
            `
            detailResult = await (dbService as MySqlService).query(detailSql, [
              mat.materialCode
            ])
          }

          enrichedMaterials.push({
            materialCode: mat.materialCode,
            materialName:
              detailResult.rows.length > 0
                ? (detailResult.rows[0].MaterialName as string)
                : '',
            specification:
              detailResult.rows.length > 0
                ? (detailResult.rows[0].Specification as string)
                : '',
            model:
              detailResult.rows.length > 0
                ? (detailResult.rows[0].Model as string)
                : '',
            managerName: mat.managerName,
            isMarked: markedCodes.has(mat.materialCode)
          })
        }

        return { materials: enrichedMaterials }
      } catch (error) {
        console.error('[Materials] Get by manager error:', error)
        return { materials: [] }
      } finally {
        if (dbService) {
          try {
            await dbService.disconnect()
          } catch (closeError) {
            console.warn('[Materials] Error disconnecting database:', closeError)
          }
        }
      }
    }
  )

  /**
   * Get all material records
   */
  ipcMain.handle(
    'materials:getAll',
    async (_event): Promise<{ materials: MaterialRecordSummary[] }> => {
      let dbService: MySqlService | SqlServerService | null = null

      try {
        dbService = await getValidationDatabaseService()

        const dao = new MaterialsToBeDeletedDAO()
        const materials = await dao.getAllRecords()
        const markedCodes = await dao.getAllMaterialCodes()

        const enrichedMaterials: MaterialRecordSummary[] = []
        const detailTableName = validationService.getTableName('dbo_DiscreteMaterialPlanData')

        for (const mat of materials) {
          let detailResult: any

          if (validationService.isSqlServer()) {
            const sql = require('mssql')
            const detailSql = `
              SELECT TOP 1 MaterialName, Specification, Model
              FROM ${detailTableName}
              WHERE MaterialCode = @materialCode
            `
            detailResult = await (dbService as SqlServerService).queryWithParams(detailSql, {
              materialCode: { value: mat.materialCode, type: sql.NVarChar }
            })
          } else {
            const detailSql = `
              SELECT MaterialName, Specification, Model
              FROM ${detailTableName}
              WHERE MaterialCode = ?
              LIMIT 1
            `
            detailResult = await (dbService as MySqlService).query(detailSql, [
              mat.materialCode
            ])
          }

          enrichedMaterials.push({
            materialCode: mat.materialCode,
            materialName:
              detailResult.rows.length > 0
                ? (detailResult.rows[0].MaterialName as string)
                : '',
            specification:
              detailResult.rows.length > 0
                ? (detailResult.rows[0].Specification as string)
                : '',
            model:
              detailResult.rows.length > 0
                ? (detailResult.rows[0].Model as string)
                : '',
            managerName: mat.managerName,
            isMarked: markedCodes.has(mat.materialCode)
          })
        }

        return { materials: enrichedMaterials }
      } catch (error) {
        console.error('[Materials] Get all error:', error)
        return { materials: [] }
      } finally {
        if (dbService) {
          try {
            await dbService.disconnect()
          } catch (closeError) {
            console.warn('[Materials] Error disconnecting database:', closeError)
          }
        }
      }
    }
  )

  /**
   * Get statistics
   */
  ipcMain.handle(
    'materials:getStatistics',
    async (_event): Promise<{ stats: any }> => {
      try {
        const dao = new MaterialsToBeDeletedDAO()
        const stats = await dao.getStatistics()
        return { stats }
      } catch (error) {
        console.error('[Materials] Get statistics error:', error)
        return { stats: null }
      }
    }
  )

  /**
   * Set shared Production IDs from extractor page
   */
  ipcMain.handle(
    'validation:setSharedProductionIds',
    async (_event, productionIds: string[]): Promise<void> => {
      console.log(`[Validation] Received ${productionIds.length} shared Production IDs`)
      setSharedProductionIds(productionIds)
    }
  )

  /**
   * Get shared Production IDs
   */
  ipcMain.handle(
    'validation:getSharedProductionIds',
    async (): Promise<{ productionIds: string[] }> => {
      return { productionIds: getSharedProductionIds() }
    }
  )

  /**
   * Get cleaner data (order numbers from shared Production IDs + material codes from MaterialsToBeDeleted)
   * Filters materials by current user (admin sees all, regular users see only their own)
   */
  ipcMain.handle(
    'validation:getCleanerData',
    async (_event): Promise<{
      success: boolean
      orderNumbers?: string[]
      materialCodes?: string[]
      error?: string
    }> => {
      let dbService: MySqlService | SqlServerService | null = null
      const sessionManager = (await import('../services/user/session-manager')).SessionManager.getInstance()

      try {
        // Get current user
        const userInfo = sessionManager.getUserInfo()
        if (!userInfo) {
          return {
            success: false,
            error: '用户未登录'
          }
        }

        const isAdmin = userInfo.userType === 'Admin'
        const username = userInfo.username
        console.log(`[CleanerData] User: ${username}, isAdmin: ${isAdmin}`)

        // Connect to database
        dbService = await getValidationDatabaseService()

        // 1. Get order numbers from shared Production IDs
        const sharedIds = getSharedProductionIds()
        let orderNumbers: string[] = []

        if (sharedIds.length > 0) {
          console.log(`[CleanerData] Using ${sharedIds.length} shared Production IDs`)
          orderNumbers = await validationService.getSourceNumbersFromInputs(sharedIds, dbService)
          console.log(`[CleanerData] Got ${orderNumbers.length} order numbers`)
        }

        // 2. Get material codes from MaterialsToBeDeleted table
        let materialCodes: string[] = []
        const markedTableName = validationService.getTableName('dbo_MaterialsToBeDeleted')

        if (isAdmin) {
          // Admin sees all materials
          const allCodesSql = `
            SELECT MaterialCode
            FROM ${markedTableName}
            WHERE MaterialCode IS NOT NULL
          `
          const result = validationService.isSqlServer()
            ? await (dbService as SqlServerService).query(allCodesSql)
            : await (dbService as MySqlService).query(allCodesSql)

          materialCodes = result.rows
            .map(row => row.MaterialCode as string)
            .filter(Boolean)
          console.log(`[CleanerData] Admin user: got ${materialCodes.length} materials`)
        } else {
          // Regular users only see their own materials
          if (validationService.isSqlServer()) {
            const sql = require('mssql')
            const userMaterialsSql = `
              SELECT MaterialCode
              FROM ${markedTableName}
              WHERE ManagerName = @username AND MaterialCode IS NOT NULL
            `
            const result = await (dbService as SqlServerService).queryWithParams(userMaterialsSql, {
              username: { value: username, type: sql.NVarChar }
            })
            materialCodes = result.rows
              .map(row => row.MaterialCode as string)
              .filter(Boolean)
          } else {
            const userMaterialsSql = `
              SELECT MaterialCode
              FROM ${markedTableName}
              WHERE ManagerName = ? AND MaterialCode IS NOT NULL
            `
            const result = await (dbService as MySqlService).query(userMaterialsSql, [username])
            materialCodes = result.rows
              .map(row => row.MaterialCode as string)
              .filter(Boolean)
          }
          console.log(`[CleanerData] Regular user: got ${materialCodes.length} materials`)
        }

        return {
          success: true,
          orderNumbers,
          materialCodes
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[CleanerData] Error:', error)
        return {
          success: false,
          error: `获取清理数据失败：${message}`
        }
      } finally {
        if (dbService) {
          try {
            await dbService.disconnect()
          } catch (closeError) {
            console.warn('[CleanerData] Error disconnecting database:', closeError)
          }
        }
      }
    }
  )
}
