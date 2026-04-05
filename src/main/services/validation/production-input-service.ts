import fs from 'fs'
import { ConfigManager } from '../config/config-manager'
import { SqlServerService } from '../database/sql-server'
import type { ValidationDatabaseService } from './validation-database'
import { getValidationTableName } from './validation-database'

export function readProductionIds(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function identifyInputType(input: string): 'production_id' | 'order_number' | 'unknown' {
  if (/^SC\d{14}$/.test(input)) {
    return 'order_number'
  }
  if (/^\d{2}[A-Za-z]\d{1,6}$/.test(input)) {
    return 'production_id'
  }
  return 'unknown'
}

export async function getSourceNumbersFromInputs(
  inputs: string[],
  dbService: ValidationDatabaseService
): Promise<string[]> {
  const productionIds: string[] = []
  const orderNumbers: string[] = []
  const configManager = ConfigManager.getInstance()
  const dbType = configManager.getDatabaseType()

  for (const item of inputs) {
    const type = identifyInputType(item)
    if (type === 'order_number') {
      orderNumbers.push(item)
    } else if (type === 'production_id') {
      productionIds.push(item)
    }
  }

  if (productionIds.length > 0) {
    const contractTableName = getValidationTableName('productionContractData_26年压力表合同数据')
    const batchSize = 2000

    if (dbType === 'sqlserver') {
      const sql = await import('mssql')
      const allOrderNumbers: string[] = []

      for (let i = 0; i < productionIds.length; i += batchSize) {
        const batch = productionIds.slice(i, i + batchSize)
        const placeholders = batch.map((_, idx) => `@p${idx}`).join(',')
        const params: Record<string, { value: string; type: typeof sql.default.NVarChar }> = {}

        batch.forEach((id, idx) => {
          params[`p${idx}`] = { value: id, type: sql.default.NVarChar }
        })

        const contractSql = `
          SELECT DISTINCT 生产订单号
          FROM ${contractTableName}
          WHERE 总排号 IN (${placeholders})
        `
        const contractResult = await (dbService as SqlServerService).queryWithParams(
          contractSql,
          params
        )
        allOrderNumbers.push(
          ...contractResult.rows.map((row: Record<string, unknown>) => row.生产订单号 as string)
        )
      }

      orderNumbers.push(...allOrderNumbers)
    } else if (dbType === 'postgresql') {
      const allOrderNumbers: string[] = []

      for (let i = 0; i < productionIds.length; i += batchSize) {
        const batch = productionIds.slice(i, i + batchSize)
        const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(',')
        const contractSql = `
          SELECT DISTINCT "生产订单号"
          FROM ${contractTableName}
          WHERE "总排号" IN (${placeholders})
        `
        const contractResult = await dbService.query(contractSql, batch)
        allOrderNumbers.push(...contractResult.rows.map((row) => row.生产订单号 as string))
      }

      orderNumbers.push(...allOrderNumbers)
    } else {
      const allOrderNumbers: string[] = []

      for (let i = 0; i < productionIds.length; i += batchSize) {
        const batch = productionIds.slice(i, i + batchSize)
        const placeholders = batch.map(() => '?').join(',')
        const contractSql = `
          SELECT DISTINCT 生产订单号
          FROM ${contractTableName}
          WHERE 总排号 IN (${placeholders})
        `
        const contractResult = await dbService.query(contractSql, batch)
        allOrderNumbers.push(...contractResult.rows.map((row) => row.生产订单号 as string))
      }

      orderNumbers.push(...allOrderNumbers)
    }
  }

  return [...new Set(orderNumbers)]
}
