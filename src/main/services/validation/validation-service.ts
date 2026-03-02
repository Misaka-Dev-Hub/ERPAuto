import { MySqlService } from '../database/mysql'
import { SqlServerService } from '../database/sql-server'
import { DiscreteMaterialPlanDAO } from '../database/discrete-material-plan-dao'
import sql from 'mssql'
import type { ValidationResult } from '../../types/validation.types'

/**
 * Service for material validation business logic
 */
export class ValidationService {
  /**
   * Identifies if the input is a production ID or order number
   */
  public identifyInputType(input: string): 'production_id' | 'order_number' | 'unknown' {
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
   * Checks if the database is SQL Server
   */
  public isSqlServer(): boolean {
    const dbType = process.env.DB_TYPE?.toLowerCase()
    return dbType === 'sqlserver' || dbType === 'mssql'
  }

  /**
   * Get table name based on database type
   * Converts MySQL schema_tablename format to SQL Server [schema].[tablename] format
   */
  public getTableName(mysqlTableName: string): string {
    if (this.isSqlServer()) {
      // Find the FIRST underscore to split schema and table name
      const firstUnderscoreIndex = mysqlTableName.indexOf('_')
      if (firstUnderscoreIndex > 0) {
        const schema = mysqlTableName.substring(0, firstUnderscoreIndex)
        const tableName = mysqlTableName.substring(firstUnderscoreIndex + 1)
        return `[${schema}].[${tableName}]`
      }
      return `[dbo].[${mysqlTableName}]`
    }
    return mysqlTableName
  }

  /**
   * Gets source numbers (order numbers) given an array of inputs (production IDs and/or order numbers)
   */
  public async getSourceNumbersFromInputs(
    inputs: string[],
    dbService: MySqlService | SqlServerService
  ): Promise<string[]> {
    const productionIds: string[] = []
    const orderNumbers: string[] = []

    for (const item of inputs) {
      const type = this.identifyInputType(item)
      if (type === 'order_number') {
        orderNumbers.push(item)
      } else if (type === 'production_id') {
        productionIds.push(item)
      }
    }

    if (productionIds.length > 0) {
      const isSql = this.isSqlServer()
      const contractTableName = this.getTableName('productionContractData_26年压力表合同数据')

      if (isSql) {
        const placeholders = productionIds.map((_, idx) => `@p${idx}`).join(',')
        const params: Record<string, { value: string; type: any }> = {}

        productionIds.forEach((id, idx) => {
          params[`p${idx}`] = { value: id, type: sql.NVarChar }
        })

        const contractSql = `
          SELECT DISTINCT 生产订单号
          FROM ${contractTableName}
          WHERE 总排号 IN (${placeholders})
        `
        const contractResult = await (dbService as SqlServerService).queryWithParams(contractSql, params)
        const dbOrderNumbers = contractResult.rows.map(
          row => row.生产订单号 as string
        )
        orderNumbers.push(...dbOrderNumbers)
      } else {
        const placeholders = productionIds.map(() => '?').join(',')
        const contractSql = `
          SELECT DISTINCT 生产订单号
          FROM ${contractTableName}
          WHERE 总排号 IN (${placeholders})
        `
        const contractResult = await (dbService as MySqlService).query(contractSql, productionIds)
        const dbOrderNumbers = contractResult.rows.map(
          row => row.生产订单号 as string
        )
        orderNumbers.push(...dbOrderNumbers)
      }
    }

    // Deduplicate
    return [...new Set(orderNumbers)]
  }

  /**
   * Executes the core matching algorithm to determine validation results
   */
  public matchMaterials(
    materialRecords: any[],
    markedCodesDict: Map<string, string>,
    typeKeywords: Array<{ materialName: string; managerName: string }>
  ): ValidationResult[] {
    const results: ValidationResult[] = []

    for (const record of materialRecords) {
      const materialName = (record.MaterialName as string) || ''
      const materialCode = (record.MaterialCode as string) || ''
      const specification = (record.Specification as string) || ''
      const model = (record.Model as string) || ''

      // Priority 1: Check MaterialsToBeDeleted (MaterialCode exact match)
      let managerName = markedCodesDict.get(materialCode) || null
      const isMarkedForDeletion = managerName !== null
      let matchedTypeKeyword: string | undefined = undefined

      // Priority 2: Match with MaterialsTypeToBeDeleted (MaterialName contains)
      if (!managerName) {
        for (const typeKeyword of typeKeywords) {
          if (
            typeKeyword.materialName &&
            typeKeyword.materialName.includes(materialName)
          ) {
            matchedTypeKeyword = typeKeyword.materialName
            managerName = typeKeyword.managerName
            break
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

    return results
  }
}
