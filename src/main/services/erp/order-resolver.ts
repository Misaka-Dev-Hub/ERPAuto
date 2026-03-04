/**
 * Order Number Resolver Service
 *
 * Automatically recognizes productionID and 生产订单号 (production order number),
 * and converts them via database lookup.
 *
 * - productionID format: 2 digits + 1 letter + serial number (e.g., "22A1", "22A1234")
 * - 生产订单号 format: SC + 14 digits (e.g., "SC70202602120085")
 *
 * Database table: productionContractData_26年压力表合同数据
 * Fields: 总排号 (productionID), 生产订单号 (production order number)
 */

import type { IDatabaseService } from '../database'
import { SqlServerService } from '../database/sql-server'
import { createLogger } from '../logger'
import sql from 'mssql'

const log = createLogger('OrderResolver')

/**
 * Order mapping result
 */
export interface OrderMapping {
  /** Original input from user */
  input: string
  /** Recognized productionID (if input matches productionID pattern) */
  productionId?: string
  /** Final production order number to use */
  orderNumber?: string
  /** Whether this mapping is valid */
  isValid: boolean
  /** Error or warning message */
  error?: string
  /** Input type */
  inputType: 'productionId' | 'orderNumber' | 'unknown'
}

/**
 * Resolution statistics
 */
export interface ResolutionStats {
  totalInputs: number
  recognizedAsProductionId: number
  recognizedAsOrderNumber: number
  unknownFormat: number
  successfullyResolved: number
  failedToResolve: number
  notFoundInDatabase: number
}

/**
 * Regular expression patterns
 */
export const ORDER_PATTERNS = {
  /** productionID: 2 digits + 1 letter + serial number (1+) */
  PRODUCTION_ID: /^\d{2}[A-Za-z]\d+$/,
  /** 生产订单号：SC + 14 digits */
  ORDER_NUMBER: /^SC\d{14}$/
} as const

/**
 * Database table and field names
 * Can be overridden via environment variables:
 * - DB_TABLE_NAME: Table name (default: 'productionContractData_26年压力表合同数据')
 * - DB_FIELD_PRODUCTION_ID: Field name for productionID (default: '总排号')
 * - DB_FIELD_ORDER_NUMBER: Field name for order number (default: '生产订单号')
 */
export const DB_CONFIG = {
  TABLE_NAME: process.env.DB_TABLE_NAME || 'productionContractData_26年压力表合同数据',
  FIELD_PRODUCTION_ID: process.env.DB_FIELD_PRODUCTION_ID || '总排号',
  FIELD_ORDER_NUMBER: process.env.DB_FIELD_ORDER_NUMBER || '生产订单号'
} as const

/**
 * Order Number Resolver Service
 */
export class OrderNumberResolver {
  private dbService: IDatabaseService

  constructor(dbService: IDatabaseService) {
    this.dbService = dbService
  }

  /**
   * Get table name based on database type
   * Converts MySQL schema_tablename format to SQL Server [schema].[tablename] format
   * e.g., productionContractData_26年压力表合同数据 -> [productionContractData].[26年压力表合同数据]
   */
  private getTableName(mysqlTableName: string): string {
    if (this.dbService.type === 'sqlserver') {
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
   * Recognize the type of an input string
   * @param input - The input string to recognize
   * @returns The recognized type
   */
  recognizeType(input: string): 'productionId' | 'orderNumber' | 'unknown' {
    const trimmed = input.trim()

    if (ORDER_PATTERNS.ORDER_NUMBER.test(trimmed)) {
      return 'orderNumber'
    }

    if (ORDER_PATTERNS.PRODUCTION_ID.test(trimmed)) {
      return 'productionId'
    }

    return 'unknown'
  }

  /**
   * Resolve a list of inputs to production order numbers
   * @param inputs - List of input strings (can be productionID or 生产订单号)
   * @returns List of order mappings
   */
  async resolve(inputs: string[]): Promise<OrderMapping[]> {
    const mappings: OrderMapping[] = []
    const stats: ResolutionStats = {
      totalInputs: inputs.length,
      recognizedAsProductionId: 0,
      recognizedAsOrderNumber: 0,
      unknownFormat: 0,
      successfullyResolved: 0,
      failedToResolve: 0,
      notFoundInDatabase: 0
    }

    // First pass: recognize types and categorize
    const productionIds: string[] = []
    const orderNumbers: string[] = []

    for (const input of inputs) {
      const trimmed = input.trim()
      if (!trimmed) continue

      const type = this.recognizeType(trimmed)

      const baseMapping: OrderMapping = {
        input: trimmed,
        isValid: false,
        inputType: type
      }

      if (type === 'productionId') {
        stats.recognizedAsProductionId++
        productionIds.push(trimmed)
        baseMapping.productionId = trimmed
      } else if (type === 'orderNumber') {
        stats.recognizedAsOrderNumber++
        orderNumbers.push(trimmed)
        baseMapping.orderNumber = trimmed
        baseMapping.isValid = true // Order numbers are valid by format
        stats.successfullyResolved++
      } else {
        stats.unknownFormat++
        baseMapping.error = `无法识别的格式：${trimmed}`
        mappings.push(baseMapping)
        continue
      }

      mappings.push(baseMapping)
    }

    // Query database for productionIDs
    if (productionIds.length > 0) {
      const productionIdMappings = await this.resolveProductionIds(productionIds)

      // Update mappings with database results
      for (const mapping of mappings) {
        if (mapping.inputType === 'productionId') {
          const dbResult = productionIdMappings.find((m) => m.input === mapping.input)
          if (dbResult) {
            mapping.orderNumber = dbResult.orderNumber
            mapping.isValid = dbResult.isValid
            mapping.error = dbResult.error

            if (dbResult.isValid) {
              stats.successfullyResolved++
            } else {
              stats.failedToResolve++
            }
          }
        }
      }
    }

    // Verify order numbers exist in database (optional validation)
    // This can be skipped if you want to allow any SC+14digits format
    // For now, we'll verify them against the database
    if (orderNumbers.length > 0) {
      const verifiedOrderNumbers = new Set(await this.verifyOrderNumbers(orderNumbers))

      for (const mapping of mappings) {
        if (mapping.inputType === 'orderNumber' && mapping.orderNumber) {
          if (!verifiedOrderNumbers.has(mapping.orderNumber)) {
            mapping.isValid = false
            mapping.error = `生产订单号不存在于数据库中：${mapping.orderNumber}`
            stats.notFoundInDatabase++
            stats.successfullyResolved--
            stats.failedToResolve++
          }
        }
      }
    }

    return mappings
  }

  /**
   * Resolve productionIDs to production order numbers via database lookup
   * @param productionIds - List of productionIDs to resolve
   * @returns List of order mappings
   */
  private async resolveProductionIds(productionIds: string[]): Promise<OrderMapping[]> {
    const mappings: OrderMapping[] = []

    if (!this.dbService.isConnected()) {
      // Database not connected, return all as failed
      for (const pid of productionIds) {
        mappings.push({
          input: pid,
          productionId: pid,
          isValid: false,
          error: '数据库未连接，无法查询生产订单号',
          inputType: 'productionId'
        })
      }
      return mappings
    }

    try {
      const isSqlServer = this.dbService.type === 'sqlserver'
      const tableName = this.getTableName(DB_CONFIG.TABLE_NAME)

      log.debug('Resolving production IDs', {
        count: productionIds.length,
        dbType: this.dbService.type
      })

      let result

      if (isSqlServer) {
        // Use queryWithParams for SQL Server with explicit parameter types
        const placeholders = productionIds.map((_, idx) => `@p${idx}`).join(', ')
        const params: Record<
          string,
          {
            value: string
            type: sql.ISqlType | sql.ISqlTypeFactoryWithLength | sql.ISqlTypeWithLength
          }
        > = {}

        productionIds.forEach((id, idx) => {
          params[`p${idx}`] = { value: id, type: sql.NVarChar(255) }
        })

        const query = `
          SELECT ${DB_CONFIG.FIELD_PRODUCTION_ID}, ${DB_CONFIG.FIELD_ORDER_NUMBER}
          FROM ${tableName}
          WHERE ${DB_CONFIG.FIELD_PRODUCTION_ID} IN (${placeholders})
        `

        result = await (this.dbService as SqlServerService).queryWithParams(query, params)
      } else {
        // Use standard query for MySQL
        const placeholders = productionIds.map(() => '?').join(', ')
        const query = `
          SELECT \`${DB_CONFIG.FIELD_PRODUCTION_ID}\`, \`${DB_CONFIG.FIELD_ORDER_NUMBER}\`
          FROM ${tableName}
          WHERE \`${DB_CONFIG.FIELD_PRODUCTION_ID}\` IN (${placeholders})
        `
        result = await this.dbService.query(query, productionIds)
      }

      // Create a map for quick lookup (use lowercase key for case-insensitive matching)
      const resultMap = new Map<string, string>()
      for (const row of result.rows) {
        const prodId = row[DB_CONFIG.FIELD_PRODUCTION_ID] as string
        const orderNum = row[DB_CONFIG.FIELD_ORDER_NUMBER] as string
        if (prodId && orderNum) {
          // Store with lowercase key for case-insensitive matching
          resultMap.set(prodId.toLowerCase(), orderNum)
        }
      }

      // Build mappings
      for (const pid of productionIds) {
        // Use lowercase for case-insensitive lookup
        const orderNumber = resultMap.get(pid.toLowerCase())

        if (orderNumber) {
          mappings.push({
            input: pid,
            productionId: pid,
            orderNumber,
            isValid: true,
            inputType: 'productionId'
          })
        } else {
          mappings.push({
            input: pid,
            productionId: pid,
            isValid: false,
            error: `数据库中未找到生产 ID：${pid}`,
            inputType: 'productionId'
          })
        }
      }

      return mappings
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知数据库错误'

      // Return all as failed with error
      return productionIds.map((pid) => ({
        input: pid,
        productionId: pid,
        isValid: false,
        error: `数据库查询失败：${message}`,
        inputType: 'productionId'
      }))
    }
  }

  /**
   * Verify that order numbers exist in the database
   * @param orderNumbers - List of order numbers to verify
   * @returns List of valid order numbers
   */
  private async verifyOrderNumbers(orderNumbers: string[]): Promise<string[]> {
    if (!this.dbService.isConnected()) {
      return orderNumbers // Skip verification if not connected
    }

    try {
      const isSqlServer = this.dbService.type === 'sqlserver'
      const tableName = this.getTableName(DB_CONFIG.TABLE_NAME)

      let result

      if (isSqlServer) {
        // Use queryWithParams for SQL Server with explicit parameter types
        const placeholders = orderNumbers.map((_, idx) => `@p${idx}`).join(', ')
        const params: Record<
          string,
          {
            value: string
            type: sql.ISqlType | sql.ISqlTypeFactoryWithLength | sql.ISqlTypeWithLength
          }
        > = {}

        orderNumbers.forEach((id, idx) => {
          params[`p${idx}`] = { value: id, type: sql.NVarChar(255) }
        })

        const query = `
          SELECT ${DB_CONFIG.FIELD_ORDER_NUMBER}
          FROM ${tableName}
          WHERE ${DB_CONFIG.FIELD_ORDER_NUMBER} IN (${placeholders})
        `

        result = await (this.dbService as SqlServerService).queryWithParams(query, params)
      } else {
        // Use standard query for MySQL
        const placeholders = orderNumbers.map(() => '?').join(', ')
        const query = `
          SELECT \`${DB_CONFIG.FIELD_ORDER_NUMBER}\`
          FROM ${tableName}
          WHERE \`${DB_CONFIG.FIELD_ORDER_NUMBER}\` IN (${placeholders})
        `
        result = await this.dbService.query(query, orderNumbers)
      }

      return result.rows.map((row) => row[DB_CONFIG.FIELD_ORDER_NUMBER] as string)
    } catch (error) {
      console.warn('[OrderResolver] Failed to verify order numbers:', error)
      return orderNumbers // Skip verification on error
    }
  }

  /**
   * Get resolution statistics
   * @param mappings - List of order mappings
   * @returns Resolution statistics
   */
  getStats(mappings: OrderMapping[]): ResolutionStats {
    const stats: ResolutionStats = {
      totalInputs: mappings.length,
      recognizedAsProductionId: 0,
      recognizedAsOrderNumber: 0,
      unknownFormat: 0,
      successfullyResolved: 0,
      failedToResolve: 0,
      notFoundInDatabase: 0
    }

    for (const mapping of mappings) {
      if (mapping.inputType === 'productionId') {
        stats.recognizedAsProductionId++
      } else if (mapping.inputType === 'orderNumber') {
        stats.recognizedAsOrderNumber++
      } else {
        stats.unknownFormat++
      }

      if (mapping.isValid) {
        stats.successfullyResolved++
      } else if (mapping.error?.includes('不存在于数据库中')) {
        stats.notFoundInDatabase++
        stats.failedToResolve++
      } else if (mapping.error) {
        stats.failedToResolve++
      }
    }

    return stats
  }

  /**
   * Extract valid order numbers from mappings
   * @param mappings - List of order mappings
   * @returns List of valid production order numbers
   */
  getValidOrderNumbers(mappings: OrderMapping[]): string[] {
    return mappings.filter((m) => m.isValid && m.orderNumber).map((m) => m.orderNumber!)
  }

  /**
   * Extract warnings/errors from mappings
   * @param mappings - List of order mappings
   * @returns List of warning messages
   */
  getWarnings(mappings: OrderMapping[]): string[] {
    return mappings.filter((m) => !m.isValid && m.error).map((m) => m.error!)
  }
}
