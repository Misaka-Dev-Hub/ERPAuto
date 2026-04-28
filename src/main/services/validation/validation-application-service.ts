import { DiscreteMaterialPlanDAO } from '../database/discrete-material-plan-dao'
import { MaterialsToBeDeletedDAO } from '../database/materials-to-be-deleted-dao'
import { SqlServerService } from '../database/sql-server'
import { createLogger, withRequestContext, trackDuration, getRequestId } from '../logger'
import type {
  MaterialRecordSummary,
  ValidationRequest,
  ValidationResponse,
  ValidationResult
} from '../../types/validation.types'
import type { UserInfo } from '../../types/user.types'
import { getSourceNumbersFromInputs, readProductionIds } from './production-input-service'
import { sharedProductionIdsStore } from './shared-production-ids-store'
import {
  createValidationDatabaseService,
  getValidationTableName,
  type ValidationDatabaseService
} from './validation-database'

const log = createLogger('ValidationApplicationService')

type TypeKeyword = {
  materialName: string
  managerName: string
}

export class ValidationApplicationService {
  async validate(
    request: ValidationRequest,
    userInfo: UserInfo,
    senderId: number
  ): Promise<ValidationResponse> {
    return withRequestContext(
      async () => {
        const requestId = getRequestId()
        let dbService: ValidationDatabaseService | null = null

        try {
          const isAdmin = userInfo.userType === 'Admin'
          const username = userInfo.username

          log.info('Starting validation workflow', {
            mode: request.mode,
            useSharedProductionIds: request.useSharedProductionIds,
            userId: userInfo.id,
            username,
            isAdmin,
            requestId
          })

          // Track data query duration
          const dataQueryResult = await trackDuration(
            async () => {
              dbService = await createValidationDatabaseService()

              let sourceNumbers: string[] | null = null

              if (request.mode === 'database_filtered') {
                if (request.useSharedProductionIds) {
                  const sharedIds = sharedProductionIdsStore.get(senderId)
                  log.info(`Using ${sharedIds.length} shared Production IDs`, {
                    userId: userInfo.id,
                    mode: request.mode,
                    useSharedProductionIds: true
                  })

                  if (sharedIds.length === 0) {
                    return {
                      sourceNumbers: null,
                      failure: this.emptyFailure(
                        '没有可用的共享 Production ID。请在数据提取页面输入 Production ID。'
                      )
                    }
                  }

                  sourceNumbers = await getSourceNumbersFromInputs(sharedIds, dbService)
                  log.info(
                    `Got ${sourceNumbers.length} source numbers from shared Production IDs`,
                    {
                      userId: userInfo.id,
                      sourceCount: sourceNumbers.length
                    }
                  )

                  if (sourceNumbers.length === 0) {
                    return {
                      sourceNumbers: null,
                      failure: this.emptyFailure(
                        '共享的 Production ID 没有找到对应的订单数据。请确保在数据提取页面输入了有效的 Production ID 并成功获取了订单数据。'
                      )
                    }
                  }
                } else if (request.productionIdFile) {
                  const inputs = readProductionIds(request.productionIdFile)
                  log.info(`Read ${inputs.length} inputs from file`, {
                    userId: userInfo.id,
                    fileMode: !request.useSharedProductionIds
                  })

                  sourceNumbers = await getSourceNumbersFromInputs(inputs, dbService)
                  log.info(`Got ${sourceNumbers.length} source numbers`, {
                    userId: userInfo.id,
                    sourceCount: sourceNumbers.length
                  })

                  if (sourceNumbers.length === 0) {
                    return {
                      sourceNumbers: null,
                      failure: this.emptyFailure(
                        '文件中的 Production ID 没有找到对应的订单数据。请检查 Production ID 是否正确，或确保数据库中有对应的订单数据。'
                      )
                    }
                  }
                }
              }

              const materialDao = new DiscreteMaterialPlanDAO()
              let materialRecords: any[] = []

              if (request.mode === 'database_full') {
                materialRecords = await materialDao.queryAllDistinctByMaterialCode()
              } else if (sourceNumbers && sourceNumbers.length > 0) {
                materialRecords = await materialDao.queryBySourceNumbersDistinct(sourceNumbers)
              }

              if (materialRecords.length === 0) {
                return {
                  sourceNumbers: null,
                  failure: this.emptyFailure(
                    '未找到物料记录。请检查数据库中是否有对应订单的物料数据。'
                  )
                }
              }

              return { sourceNumbers, materialRecords, failure: null }
            },
            {
              operationName: 'data-query',
              message: 'Data query phase',
              context: { mode: request.mode, userId: userInfo.id }
            }
          )

          // Check for failure
          if (dataQueryResult.result.failure) {
            return dataQueryResult.result.failure
          }

          // Track validation duration
          const validationResult = await trackDuration(
            async () => {
              const typeKeywords = await this.loadTypeKeywords(dbService!)
              const markedCodes = await this.loadMarkedCodes(dbService!)
              const results = this.buildValidationResults(
                (dataQueryResult.result as any).materialRecords,
                typeKeywords,
                markedCodes,
                { isAdmin, username }
              )

              const markedCount = results.filter((result) => result.isMarkedForDeletion).length
              const matchedCount = results.filter((result) => result.managerName).length

              log.info('Validation completed', {
                totalRecords: results.length,
                matchedCount,
                markedCount,
                userId: userInfo.id,
                mode: request.mode
              })

              return {
                success: true,
                results,
                stats: {
                  totalRecords: results.length,
                  matchedCount,
                  markedCount
                }
              }
            },
            {
              operationName: 'validation-processing',
              message: 'Validation processing phase',
              context: { mode: request.mode, userId: userInfo.id }
            }
          )

          return validationResult.result
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          log.error('Validation workflow failed', {
            error: message,
            mode: request.mode,
            useSharedProductionIds: request.useSharedProductionIds,
            userId: userInfo.id,
            username: userInfo.username,
            requestId
          })
          return {
            success: false,
            error: `Validation failed: ${message}`
          }
        } finally {
          if (dbService) {
            await this.disconnectQuietly(dbService)
          }
        }
      },
      { userId: userInfo.id.toString(), operation: 'validate' }
    )
  }

  async getMaterialsByManager(managerName: string): Promise<MaterialRecordSummary[]> {
    log.info(`Getting materials by manager: ${managerName}`)
    const dao = new MaterialsToBeDeletedDAO()
    const materials = await dao.getMaterialsByManager(managerName)
    const markedCodes = await dao.getAllMaterialCodes()
    log.info(`Found ${materials.length} materials for manager: ${managerName}`)
    return this.enrichMaterials(materials, markedCodes)
  }

  async getAllMaterials(): Promise<MaterialRecordSummary[]> {
    log.info('Getting all materials')
    const dao = new MaterialsToBeDeletedDAO()
    const materials = await dao.getAllRecords()
    const markedCodes = await dao.getAllMaterialCodes()
    log.info(`Found ${materials.length} total materials`)
    return this.enrichMaterials(materials, markedCodes)
  }

  async getCleanerData(
    userInfo: UserInfo,
    senderId: number,
    selectedManagers: string[] = []
  ): Promise<{
    success: boolean
    orderNumbers?: string[]
    originalInputs?: string[]
    materialCodes?: string[]
    error?: string
  }> {
    return withRequestContext(
      async () => {
        const requestId = getRequestId()
        let dbService: ValidationDatabaseService | null = null

        try {
          const isAdmin = userInfo.userType === 'Admin'
          const username = userInfo.username
          log.info('Getting cleaner data', {
            userId: userInfo.id,
            username,
            isAdmin,
            selectedManagers,
            requestId
          })

          dbService = await createValidationDatabaseService()

          const sharedIds = sharedProductionIdsStore.get(senderId)
          let orderNumbers: string[] = []

          if (sharedIds.length > 0) {
            log.info(`Using ${sharedIds.length} shared Production IDs`, {
              userId: userInfo.id,
              sharedCount: sharedIds.length
            })
            orderNumbers = await getSourceNumbersFromInputs(sharedIds, dbService)
            log.info(`Got ${orderNumbers.length} order numbers`, {
              userId: userInfo.id,
              orderCount: orderNumbers.length
            })
          }

          const materialCodes = await this.loadMaterialCodesForCleaner(
            dbService,
            username,
            isAdmin,
            selectedManagers,
            orderNumbers
          )
          log.info('Cleaner data retrieved', {
            userId: userInfo.id,
            orderCount: orderNumbers.length,
            materialCodeCount: materialCodes.length
          })

          return {
            success: true,
            orderNumbers,
            originalInputs: sharedIds,
            materialCodes
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          log.error('CleanerData error', {
            error: message,
            userId: userInfo.id,
            username: userInfo.username,
            requestId
          })
          return {
            success: false,
            error: `获取清理数据失败：${message}`
          }
        } finally {
          if (dbService) {
            await this.disconnectQuietly(dbService)
          }
        }
      },
      { userId: userInfo.id.toString(), operation: 'getCleanerData' }
    )
  }

  private emptyFailure(error: string): ValidationResponse {
    return {
      success: false,
      error,
      stats: {
        totalRecords: 0,
        matchedCount: 0,
        markedCount: 0
      }
    }
  }

  private async loadTypeKeywords(dbService: ValidationDatabaseService): Promise<TypeKeyword[]> {
    const typeKeywordTableName = getValidationTableName('dbo.MaterialsTypeToBeDeleted')
    const sql = `
      SELECT MaterialName, ManagerName
      FROM ${typeKeywordTableName}
      WHERE MaterialName IS NOT NULL
    `
    const result = await dbService.query(sql)
    return result.rows.map((row) => ({
      materialName: row.MaterialName as string,
      managerName: row.ManagerName as string
    }))
  }

  private async loadMarkedCodes(
    dbService: ValidationDatabaseService
  ): Promise<Map<string, string>> {
    const markedTableName = getValidationTableName('dbo.MaterialsToBeDeleted')
    const sql = `
      SELECT MaterialCode, ManagerName
      FROM ${markedTableName}
      WHERE MaterialCode IS NOT NULL AND ManagerName IS NOT NULL
    `
    const result = await dbService.query(sql)
    const markedCodes = new Map<string, string>()

    for (const row of result.rows) {
      markedCodes.set(row.MaterialCode as string, row.ManagerName as string)
    }

    return markedCodes
  }

  private buildValidationResults(
    materialRecords: any[],
    typeKeywords: TypeKeyword[],
    markedCodes: Map<string, string>,
    context: { isAdmin: boolean; username: string }
  ): ValidationResult[] {
    return materialRecords.map((record) => {
      const materialName = (record.MaterialName as string) || ''
      const materialCode = (record.MaterialCode as string) || ''
      const specification = (record.Specification as string) || ''
      const model = (record.Model as string) || ''

      let managerName = markedCodes.get(materialCode) || null
      const isMarkedForDeletion = managerName !== null
      let matchedTypeKeyword: string | undefined

      if (!managerName) {
        for (const typeKeyword of typeKeywords) {
          if (typeKeyword.materialName && materialName.includes(typeKeyword.materialName)) {
            matchedTypeKeyword = typeKeyword.materialName
            managerName = typeKeyword.managerName
            break
          }
        }
      }

      if (!context.isAdmin && context.username) {
        const userKeywords = typeKeywords.filter(
          (keyword) => keyword.managerName === context.username
        )
        for (const userKeyword of userKeywords) {
          if (userKeyword.materialName && materialName.includes(userKeyword.materialName)) {
            matchedTypeKeyword = userKeyword.materialName
            managerName = userKeyword.managerName
            break
          }
        }
      }

      return {
        materialName,
        materialCode,
        specification,
        model,
        managerName: managerName || '',
        isMarkedForDeletion,
        matchedTypeKeyword
      }
    })
  }

  private async enrichMaterials(
    materials: Array<{ materialCode: string; managerName: string }>,
    markedCodes: Set<string>
  ): Promise<MaterialRecordSummary[]> {
    let dbService: ValidationDatabaseService | null = null

    try {
      dbService = await createValidationDatabaseService()
      const detailTableName = getValidationTableName('dbo.DiscreteMaterialPlanData')
      const enrichedMaterials: MaterialRecordSummary[] = []

      log.info(`Enriching ${materials.length} materials with details`)

      for (const material of materials) {
        const detailResult = await this.queryMaterialDetail(
          dbService,
          detailTableName,
          material.materialCode
        )
        const firstRow = detailResult.rows[0]

        enrichedMaterials.push({
          materialCode: material.materialCode,
          materialName: firstRow ? (firstRow.MaterialName as string) : '',
          specification: firstRow ? (firstRow.Specification as string) : '',
          model: firstRow ? (firstRow.Model as string) : '',
          managerName: material.managerName,
          isMarked: markedCodes.has(material.materialCode)
        })
      }

      log.info(`Material enrichment completed`, {
        totalMaterials: materials.length,
        enrichedCount: enrichedMaterials.length
      })

      return enrichedMaterials
    } finally {
      if (dbService) {
        await this.disconnectQuietly(dbService)
      }
    }
  }

  private async queryMaterialDetail(
    dbService: ValidationDatabaseService,
    detailTableName: string,
    materialCode: string
  ) {
    if (dbService.type === 'sqlserver') {
      const sql = await import('mssql')
      return (dbService as SqlServerService).queryWithParams(
        `
          SELECT TOP 1 MaterialName, Specification, Model
          FROM ${detailTableName}
          WHERE MaterialCode = @materialCode
        `,
        {
          materialCode: { value: materialCode, type: sql.default.NVarChar }
        }
      )
    }

    if (dbService.type === 'postgresql') {
      return dbService.query(
        `
          SELECT "MaterialName", "Specification", "Model"
          FROM ${detailTableName}
          WHERE "MaterialCode" = $1
          LIMIT 1
        `,
        [materialCode]
      )
    }

    return dbService.query(
      `
        SELECT MaterialName, Specification, Model
        FROM ${detailTableName}
        WHERE MaterialCode = ?
        LIMIT 1
      `,
      [materialCode]
    )
  }

  private async loadMaterialCodesForCleaner(
    dbService: ValidationDatabaseService,
    username: string,
    isAdmin: boolean,
    selectedManagers: string[],
    orderNumbers: string[]
  ): Promise<string[]> {
    const markedTableName = getValidationTableName('dbo.MaterialsToBeDeleted')

    // Admin with selected managers: filter MaterialsToBeDeleted by ManagerName IN (selectedManagers)
    if (isAdmin && selectedManagers && selectedManagers.length > 0) {
      const materialCodes = await this.queryMaterialCodesByManagers(
        dbService,
        markedTableName,
        selectedManagers
      )
      log.info(`Admin with selected managers: got ${materialCodes.length} materials`, {
        userId: username,
        isAdmin: true,
        selectedManagers,
        materialCount: materialCodes.length
      })
      return materialCodes
    }

    // Admin without selected managers: query all materials from DiscreteMaterialPlanData by orderNumbers
    if (isAdmin) {
      if (orderNumbers.length === 0) {
        log.warn('Admin without selected managers but no orderNumbers available', {
          userId: username
        })
        return []
      }
      const materialDao = new DiscreteMaterialPlanDAO()
      const records = await materialDao.queryBySourceNumbersDistinct(orderNumbers)
      const materialCodes = [
        ...new Set(records.map((r) => r.MaterialCode as string).filter(Boolean))
      ]
      log.info(
        `Admin without selected managers: got ${materialCodes.length} materials from DiscreteMaterialPlanData`,
        {
          userId: username,
          isAdmin: true,
          orderCount: orderNumbers.length,
          materialCount: materialCodes.length
        }
      )
      return materialCodes
    }

    // Regular user: filter MaterialsToBeDeleted by ManagerName = username
    if (dbService.type === 'sqlserver') {
      const sql = await import('mssql')
      const result = await (dbService as SqlServerService).queryWithParams(
        `
          SELECT MaterialCode
          FROM ${markedTableName}
          WHERE ManagerName = @username AND MaterialCode IS NOT NULL
        `,
        {
          username: { value: username, type: sql.default.NVarChar }
        }
      )
      const materialCodes = result.rows
        .map((row: Record<string, unknown>) => row.MaterialCode as string)
        .filter(Boolean)
      log.info(`Regular user: got ${materialCodes.length} materials`, {
        userId: username,
        isAdmin: false,
        materialCount: materialCodes.length
      })
      return materialCodes
    }

    if (dbService.type === 'postgresql') {
      const result = await dbService.query(
        `
          SELECT "MaterialCode"
          FROM ${markedTableName}
          WHERE "ManagerName" = $1 AND "MaterialCode" IS NOT NULL
        `,
        [username]
      )
      const materialCodes = result.rows.map((row) => row.MaterialCode as string).filter(Boolean)
      log.info(`Regular user: got ${materialCodes.length} materials`, {
        userId: username,
        isAdmin: false,
        materialCount: materialCodes.length
      })
      return materialCodes
    }

    const result = await dbService.query(
      `
        SELECT MaterialCode
        FROM ${markedTableName}
        WHERE ManagerName = ? AND MaterialCode IS NOT NULL
      `,
      [username]
    )
    const materialCodes = result.rows.map((row) => row.MaterialCode as string).filter(Boolean)
    log.info(`Regular user: got ${materialCodes.length} materials`, {
      userId: username,
      isAdmin: false,
      materialCount: materialCodes.length
    })
    return materialCodes
  }

  private async queryMaterialCodesByManagers(
    dbService: ValidationDatabaseService,
    tableName: string,
    managers: string[]
  ): Promise<string[]> {
    if (dbService.type === 'sqlserver') {
      const sql = await import('mssql')
      const params: Record<string, { value: string; type: any }> = {}
      const paramNames = managers.map((m, i) => {
        const name = `@manager${i}`
        params[`manager${i}`] = { value: m, type: sql.default.NVarChar }
        return name
      })
      const result = await (dbService as SqlServerService).queryWithParams(
        `
          SELECT MaterialCode
          FROM ${tableName}
          WHERE ManagerName IN (${paramNames.join(', ')}) AND MaterialCode IS NOT NULL
        `,
        params
      )
      return result.rows
        .map((row: Record<string, unknown>) => row.MaterialCode as string)
        .filter(Boolean)
    }

    if (dbService.type === 'postgresql') {
      const placeholders = managers.map((_, i) => `$${i + 1}`).join(', ')
      const result = await dbService.query(
        `
          SELECT "MaterialCode"
          FROM ${tableName}
          WHERE "ManagerName" IN (${placeholders}) AND "MaterialCode" IS NOT NULL
        `,
        managers
      )
      return result.rows.map((row) => row.MaterialCode as string).filter(Boolean)
    }

    const placeholders = managers.map(() => '?').join(', ')
    const result = await dbService.query(
      `
        SELECT MaterialCode
        FROM ${tableName}
        WHERE ManagerName IN (${placeholders}) AND MaterialCode IS NOT NULL
      `,
      managers
    )
    return result.rows.map((row) => row.MaterialCode as string).filter(Boolean)
  }

  private async disconnectQuietly(dbService: ValidationDatabaseService): Promise<void> {
    try {
      await dbService.disconnect()
    } catch (closeError) {
      log.warn('Error disconnecting database', {
        error: closeError instanceof Error ? closeError.message : String(closeError)
      })
    }
  }
}

export const validationApplicationService = new ValidationApplicationService()
