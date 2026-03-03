/**
 * IPC handlers for material validation operations
 *
 * Provides endpoints for:
 * - Running material validation from database
 * - Getting/setting materials to be deleted
 * - Manager-based filtering
 */

import { ipcMain } from 'electron'
import { getDataSource } from '../services/database/data-source'
import { MaterialsToBeDeletedRepository } from '../services/database/repositories/MaterialsToBeDeletedRepository'
import { DiscreteMaterialPlanRepository } from '../services/database/repositories/DiscreteMaterialPlanRepository'
import { createLogger } from '../services/logger'
import type {
  ValidationRequest,
  ValidationResponse,
  MaterialUpsertBatchRequest,
  MaterialDeleteRequest,
  MaterialOperationResponse,
  ValidationResult,
  MaterialRecordSummary
} from '../types/validation.types'

const log = createLogger('ValidationHandler')

/**
 * Shared state for Production IDs from extractor page
 * This is a simple in-memory store for sharing Production IDs between pages
 */
const sharedProductionIds = new Set<string>()

/**
 * Set shared Production IDs
 */
export function setSharedProductionIds(ids: string[]): void {
  sharedProductionIds.clear()
  ids.forEach((id) => sharedProductionIds.add(id))
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
 * Get table name based on database type
 * Converts MySQL schema_tablename format to SQL Server [schema].[tablename] format
 * e.g., productionContractData_26年压力表合同数据 -> [productionContractData].[26年压力表合同数据]
 *      dbo_MaterialsToBeDeleted -> [dbo].[MaterialsToBeDeleted]
 */
function getTableName(mysqlTableName: string): string {
  const dbType = process.env.DB_TYPE?.toLowerCase()
  if (dbType === 'sqlserver' || dbType === 'mssql') {
    // Find the FIRST underscore to split schema and table name
    // This handles patterns like: schema_tablename
    const firstUnderscoreIndex = mysqlTableName.indexOf('_')
    if (firstUnderscoreIndex > 0) {
      const schema = mysqlTableName.substring(0, firstUnderscoreIndex)
      const tableName = mysqlTableName.substring(firstUnderscoreIndex + 1)
      return `[${schema}].[${tableName}]`
    }
    // If no underscore found, default to dbo schema
    return `[dbo].[${mysqlTableName}]`
  }
  return mysqlTableName
}

/**
 * Read Production IDs from file
 */
function readProductionIds(filePath: string): string[] {
  const fs = require('fs')
  const content = fs.readFileSync(filePath, 'utf-8') as string
  return content
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)
}

/**
 * Identify input type (production ID or order number)
 */
function identifyInputType(input: string): 'production_id' | 'order_number' | 'unknown' {
  // Order number: SC + 14 digits
  if (/^SC\d{14}$/.test(input)) {
    return 'order_number'
  }
  // Production ID: 2 digits + 1 letter + 1-6 digits
  if (/^\d{2}[A-Za-z]\d{1,6}$/.test(input)) {
    return 'production_id'
  }
  return 'unknown'
}

/**
 * Get source numbers from inputs
 */
async function getSourceNumbersFromInputs(
  inputs: string[]
): Promise<string[]> {
  const dataSource = await (await import('../services/database/data-source')).initializeDataSource()
  const productionIds: string[] = []
  const orderNumbers: string[] = []
  const dbType = process.env.DB_TYPE?.toLowerCase()
  const isSqlServer = dbType === 'sqlserver' || dbType === 'mssql'

  for (const item of inputs) {
    const type = identifyInputType(item)
    if (type === 'order_number') {
      orderNumbers.push(item)
    } else if (type === 'production_id') {
      productionIds.push(item)
    }
  }

  if (productionIds.length > 0) {
    const contractTableName = getTableName('productionContractData_26年压力表合同数据')

    if (isSqlServer) {
      const placeholders = productionIds.map((_, idx) => `@${idx}`).join(',')
      const contractSql = `
        SELECT DISTINCT 生产订单号
        FROM ${contractTableName}
        WHERE 总排号 IN (${placeholders})
      `
      const contractResult = await dataSource.query(contractSql, productionIds)
      const dbOrderNumbers = contractResult.map((row: any) => row.生产订单号 as string)
      orderNumbers.push(...dbOrderNumbers)
    } else {
      const placeholders = productionIds.map(() => '?').join(',')
      const contractSql = `
        SELECT DISTINCT 生产订单号
        FROM ${contractTableName}
        WHERE 总排号 IN (${placeholders})
      `
      const contractResult = await dataSource.query(contractSql, productionIds)
      const dbOrderNumbers = contractResult.map((row: any) => row.生产订单号 as string)
      orderNumbers.push(...dbOrderNumbers)
    }
  }

  return [...new Set(orderNumbers)]
}

/**
 * Register IPC handlers for validation operations
 */
export function registerValidationHandlers(): void {
  // ==================== VALIDATION ====================

  /**
   * Run material validation from database
   */
  ipcMain.handle(
    'validation:validate',
    async (_event, request: ValidationRequest): Promise<ValidationResponse> => {
      try {
        const sessionManager = (
          await import('../services/user/session-manager')
        ).SessionManager.getInstance()

        const userInfo = sessionManager.getUserInfo()
        if (!userInfo) {
          return {
            success: false,
            error: '用户未登录',
            stats: {
              totalRecords: 0,
              matchedCount: 0,
              markedCount: 0
            }
          }
        }

        const isAdmin = userInfo.userType === 'Admin'
        const username = userInfo.username

        log.info('Starting validation', { mode: request.mode, user: username, isAdmin })

        const dataSource = await (await import('../services/database/data-source')).initializeDataSource()
        const dbType = process.env.DB_TYPE?.toLowerCase()
        const isSqlServer = dbType === 'sqlserver' || dbType === 'mssql'

        let sourceNumbers: string[] | null = null

        // Get source numbers based on mode
        if (request.mode === 'database_filtered') {
          if (request.useSharedProductionIds) {
            // Use shared Production IDs from extractor page
            const sharedIds = getSharedProductionIds()
            log.info(`Using ${sharedIds.length} shared Production IDs`)

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

            sourceNumbers = await getSourceNumbersFromInputs(sharedIds)
            log.info(`Got ${sourceNumbers.length} source numbers from shared Production IDs`)
          } else if (request.productionIdFile) {
            // Read from file
            const inputs = readProductionIds(request.productionIdFile)
            log.info(`Read ${inputs.length} inputs from file`)
            sourceNumbers = await getSourceNumbersFromInputs(inputs)
            log.info(`Got ${sourceNumbers.length} source numbers`)
          }
        }

        // Get material records from DiscreteMaterialPlanData
        const materialDao = new DiscreteMaterialPlanRepository()

        let materialRecords: any[] = []

        if (request.mode === 'database_full') {
          // Full table query with deduplication by MaterialCode
          materialRecords = await materialDao.queryAllDistinctByMaterialCode()
        } else if (sourceNumbers && sourceNumbers.length > 0) {
          // Filtered query by source numbers
          materialRecords = await materialDao.queryBySourceNumbersDistinct(sourceNumbers)
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
        const typeKeywordTableName = getTableName('dbo_MaterialsTypeToBeDeleted')
        const typeKeywordSql = `
          SELECT MaterialName, ManagerName
          FROM ${typeKeywordTableName}
          WHERE MaterialName IS NOT NULL
        `
        const typeKeywordResult = await dataSource.query(typeKeywordSql)

        const typeKeywords = typeKeywordResult.map((row: any) => ({
          materialName: row.MaterialName as string,
          managerName: row.ManagerName as string
        }))

        // Get marked material codes from MaterialsToBeDeleted
        const markedTableName = getTableName('dbo_MaterialsToBeDeleted')
        const markedSql = `
          SELECT MaterialCode, ManagerName
          FROM ${markedTableName}
          WHERE MaterialCode IS NOT NULL AND ManagerName IS NOT NULL
        `
        const markedResult = await dataSource.query(markedSql)

        const markedCodesDict = new Map<string, string>()
        for (const row of markedResult) {
          markedCodesDict.set(row.MaterialCode as string, row.ManagerName as string)
        }

        // Match materials
        const results: ValidationResult[] = []
        for (const record of materialRecords) {
          const materialName = (record.materialName as string) || (record.MaterialName as string) || ''
          const materialCode = (record.materialCode as string) || (record.MaterialCode as string) || ''
          const specification = (record.specification as string) || (record.Specification as string) || ''
          const model = (record.model as string) || (record.Model as string) || ''

          // Priority 1: Check MaterialsToBeDeleted (MaterialCode exact match)
          let managerName = markedCodesDict.get(materialCode) || null
          const isMarkedForDeletion = managerName !== null
          let matchedTypeKeyword: string | undefined = undefined

          // Priority 2: Match with MaterialsTypeToBeDeleted (MaterialName contains)
          if (!managerName) {
            for (const typeKeyword of typeKeywords) {
              if (typeKeyword.materialName && materialName.includes(typeKeyword.materialName)) {
                matchedTypeKeyword = typeKeyword.materialName
                managerName = typeKeyword.managerName
                break
              }
            }
          }

          // Priority 3: User Override Match (only for non-admin users)
          // Override with current user's typeKeyword if available
          if (!isAdmin && username) {
            const userKeywords = typeKeywords.filter((tk: any) => tk.managerName === username)
            for (const userKeyword of userKeywords) {
              if (userKeyword.materialName && materialName.includes(userKeyword.materialName)) {
                matchedTypeKeyword = userKeyword.materialName
                managerName = userKeyword.managerName
                break // Force override with first match
              }
            }
          }

          results.push({
            materialName,
            materialCode,
            specification,
            model,
            managerName: managerName || '',
            isMarkedForDeletion,
            matchedTypeKeyword
          })
        }

        const markedCount = results.filter((r) => r.isMarkedForDeletion).length
        const matchedCount = results.filter((r) => r.managerName).length

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
        log.error('Validation error', {
          error: error instanceof Error ? error.message : String(error)
        })
        return {
          success: false,
          error: `Validation failed: ${message}`
        }
      } finally {
        // Handled by TypeORM
      }
    }
  )

  // ==================== MATERIAL OPERATIONS ====================

  /**
   * Upsert batch materials to MaterialsToBeDeleted
   */
  ipcMain.handle(
    'materials:upsertBatch',
    async (_event, request: MaterialUpsertBatchRequest): Promise<MaterialOperationResponse> => {
      try {
        const dao = new MaterialsToBeDeletedRepository()
        const stats = await dao.upsertBatch(request.materials)

        return {
          success: true,
          stats
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Upsert batch error', {
          error: error instanceof Error ? error.message : String(error)
        })
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
    async (_event, request: MaterialDeleteRequest): Promise<MaterialOperationResponse> => {
      try {
        const dao = new MaterialsToBeDeletedRepository()
        const count = await dao.deleteByMaterialCodes(request.materialCodes)

        return {
          success: true,
          count
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Delete error', { error: error instanceof Error ? error.message : String(error) })
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
  ipcMain.handle('materials:getManagers', async (_event): Promise<{ managers: string[] }> => {
    try {
      const dao = new MaterialsToBeDeletedRepository()
      const managers = await dao.getManagers()
      return { managers }
    } catch (error) {
      log.error('Get managers error', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { managers: [] }
    }
  })

  /**
   * Get materials by manager
   */
  ipcMain.handle(
    'materials:getByManager',
    async (_event, managerName: string): Promise<{ materials: MaterialRecordSummary[] }> => {
      try {
        const dataSource = await (await import('../services/database/data-source')).initializeDataSource()
        const dbType = process.env.DB_TYPE?.toLowerCase()
        const isSqlServer = dbType === 'sqlserver' || dbType === 'mssql'

        const dao = new MaterialsToBeDeletedRepository()
        const materials = await dao.getByManager(managerName)

        // Get material codes set for quick lookup
        const markedCodes = await dao.getAllMaterialCodes()

        // Enrich with material details from DiscreteMaterialPlanData
        const enrichedMaterials: MaterialRecordSummary[] = []
        const detailTableName = getTableName('dbo_DiscreteMaterialPlanData')

        for (const mat of materials) {
          let detailResult: any

          if (isSqlServer) {
            const detailSql = `
              SELECT TOP 1 MaterialName, Specification, Model
              FROM ${detailTableName}
              WHERE MaterialCode = @0
            `
            detailResult = await dataSource.query(detailSql, [mat.materialCode])
          } else {
            const detailSql = `
              SELECT MaterialName, Specification, Model
              FROM ${detailTableName}
              WHERE MaterialCode = ?
              LIMIT 1
            `
            detailResult = await dataSource.query(detailSql, [mat.materialCode])
          }

          enrichedMaterials.push({
            materialCode: mat.materialCode,
            materialName:
              detailResult.length > 0 ? (detailResult[0].MaterialName as string) : '',
            specification:
              detailResult.length > 0 ? (detailResult[0].Specification as string) : '',
            model: detailResult.length > 0 ? (detailResult[0].Model as string) : '',
            managerName: mat.managerName || '',
            isMarked: markedCodes.has(mat.materialCode)
          })
        }

        return { materials: enrichedMaterials }
      } catch (error) {
        log.error('Get by manager error', {
          error: error instanceof Error ? error.message : String(error)
        })
        return { materials: [] }
      }
    }
  )

  /**
   * Get all material records
   */
  ipcMain.handle(
    'materials:getAll',
    async (_event): Promise<{ materials: MaterialRecordSummary[] }> => {
      try {
        const dataSource = await (await import('../services/database/data-source')).initializeDataSource()
        const dbType = process.env.DB_TYPE?.toLowerCase()
        const isSqlServer = dbType === 'sqlserver' || dbType === 'mssql'

        const dao = new MaterialsToBeDeletedRepository()
        const materials = await dao.getAllRecords()
        const markedCodes = await dao.getAllMaterialCodes()

        const enrichedMaterials: MaterialRecordSummary[] = []
        const detailTableName = getTableName('dbo_DiscreteMaterialPlanData')

        for (const mat of materials) {
          let detailResult: any

          if (isSqlServer) {
            const detailSql = `
              SELECT TOP 1 MaterialName, Specification, Model
              FROM ${detailTableName}
              WHERE MaterialCode = @0
            `
            detailResult = await dataSource.query(detailSql, [mat.materialCode])
          } else {
            const detailSql = `
              SELECT MaterialName, Specification, Model
              FROM ${detailTableName}
              WHERE MaterialCode = ?
              LIMIT 1
            `
            detailResult = await dataSource.query(detailSql, [mat.materialCode])
          }

          enrichedMaterials.push({
            materialCode: mat.materialCode,
            materialName:
              detailResult.length > 0 ? (detailResult[0].MaterialName as string) : '',
            specification:
              detailResult.length > 0 ? (detailResult[0].Specification as string) : '',
            model: detailResult.length > 0 ? (detailResult[0].Model as string) : '',
            managerName: mat.managerName || '',
            isMarked: markedCodes.has(mat.materialCode)
          })
        }

        return { materials: enrichedMaterials }
      } catch (error) {
        log.error('Get all error', {
          error: error instanceof Error ? error.message : String(error)
        })
        return { materials: [] }
      }
    }
  )

  /**
   * Get statistics
   */
  ipcMain.handle('materials:getStatistics', async (_event): Promise<{ stats: any }> => {
    try {
      const dao = new MaterialsToBeDeletedRepository()
      const stats = await dao.getStatistics()
      return { stats }
    } catch (error) {
      log.error('Get statistics error', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { stats: null }
    }
  })

  /**
   * Set shared Production IDs from extractor page
   */
  ipcMain.handle(
    'validation:setSharedProductionIds',
    async (_event, productionIds: string[]): Promise<void> => {
      log.info(`Received ${productionIds.length} shared Production IDs`)
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
    async (
      _event
    ): Promise<{
      success: boolean
      orderNumbers?: string[]
      materialCodes?: string[]
      error?: string
    }> => {
      const sessionManager = (
        await import('../services/user/session-manager')
      ).SessionManager.getInstance()

      try {
        const userInfo = sessionManager.getUserInfo()
        if (!userInfo) {
          return {
            success: false,
            error: '用户未登录'
          }
        }

        const isAdmin = userInfo.userType === 'Admin'
        const username = userInfo.username
        const dbType = process.env.DB_TYPE?.toLowerCase()
        const isSqlServer = dbType === 'sqlserver' || dbType === 'mssql'

        log.info(`User: ${username}, isAdmin: ${isAdmin}`)

        const dataSource = await (await import('../services/database/data-source')).initializeDataSource()

        // 1. Get order numbers from shared Production IDs
        const sharedIds = getSharedProductionIds()
        let orderNumbers: string[] = []

        if (sharedIds.length > 0) {
          log.info(`Using ${sharedIds.length} shared Production IDs`)
          orderNumbers = await getSourceNumbersFromInputs(sharedIds)
          log.info(`Got ${orderNumbers.length} order numbers`)
        }

        // 2. Get material codes from MaterialsToBeDeleted table
        let materialCodes: string[] = []
        const markedTableName = getTableName('dbo_MaterialsToBeDeleted')

        if (isAdmin) {
          // Admin sees all materials
          const allCodesSql = `
            SELECT MaterialCode
            FROM ${markedTableName}
            WHERE MaterialCode IS NOT NULL
          `
          const result = await dataSource.query(allCodesSql)

          materialCodes = result.map((row: any) => row.MaterialCode as string).filter(Boolean)
          log.info(`Admin user: got ${materialCodes.length} materials`)
        } else {
          // Regular users only see their own materials
          if (isSqlServer) {
            const userMaterialsSql = `
              SELECT MaterialCode
              FROM ${markedTableName}
              WHERE ManagerName = @0 AND MaterialCode IS NOT NULL
            `
            const result = await dataSource.query(userMaterialsSql, [username])
            materialCodes = result.map((row: any) => row.MaterialCode as string).filter(Boolean)
          } else {
            const userMaterialsSql = `
              SELECT MaterialCode
              FROM ${markedTableName}
              WHERE ManagerName = ? AND MaterialCode IS NOT NULL
            `
            const result = await dataSource.query(userMaterialsSql, [username])
            materialCodes = result.map((row: any) => row.MaterialCode as string).filter(Boolean)
          }
          log.info(`Regular user: got ${materialCodes.length} materials`)
        }

        return {
          success: true,
          orderNumbers,
          materialCodes
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('CleanerData error', {
          error: error instanceof Error ? error.message : String(error)
        })
        return {
          success: false,
          error: `获取清理数据失败：${message}`
        }
      }
    }
  )
}
