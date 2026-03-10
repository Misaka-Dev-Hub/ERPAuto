/**
 * Order Number Resolver Service
 *
 * Automatically recognizes productionID and 生产订单号 (production order number),
 * and converts them via database lookup.
 *
 * - productionID format: 2 digits + 1 letter + serial number (e.g., "22A1", "22A1234")
 * - 生产订单号 format: SC + 14 digits (e.g., "SC70202602120085")
 *
 * Database table and field names are loaded from config.yaml
 */

import type { IDatabaseService } from '../database'
import { ConfigManager } from '../config/config-manager'
import { createLogger } from '../logger'

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
  /** Whether the order number was successfully resolved */
  resolved: boolean
  /** Error message if resolution failed */
  error?: string
}

/**
 * Order number type recognition result
 */
export type OrderNumberType = 'productionId' | 'orderNumber' | 'unknown'

/**
 * Resolution statistics
 */
export interface ResolutionStats {
  totalInputs: number
  validOrderNumbers: number
  validProductionIds: number
  resolvedCount: number
  failedCount: number
  unknownFormat: number
}

/**
 * ProductionID pattern: 2 digits + 1 letter + 1-6 digits
 * Examples: 22A1, 22A123, 26B10617
 */
const PRODUCTION_ID_PATTERN = /^\d{2}[A-Z]\d{1,6}$/i

/**
 * Production order number pattern: SC + 14 digits
 */
const ORDER_NUMBER_PATTERN = /^SC\d{14}$/i

/**
 * Database table and field names
 * Loaded from config.yaml via ConfigManager
 */
export function getDbConfig() {
  const configManager = ConfigManager.getInstance()
  const config = configManager.getConfig()
  return {
    TABLE_NAME: config.orderResolution.tableName || 'productionContractData_26 年压力表合同数据',
    FIELD_PRODUCTION_ID: config.orderResolution.productionIdField || '总排号',
    FIELD_ORDER_NUMBER: config.orderResolution.orderNumberField || '生产订单号'
  }
}

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
   *      dbo_MaterialsToBeDeleted -> [dbo].[MaterialsToBeDeleted]
   */
  private getTableName(tableName: string): string {
    if (this.dbService.type === 'sqlserver') {
      // Find the FIRST underscore to split schema and table name
      // This handles patterns like: schema_tablename
      const firstUnderscoreIndex = tableName.indexOf('_')
      if (firstUnderscoreIndex > 0) {
        const schema = tableName.substring(0, firstUnderscoreIndex)
        const actualTableName = tableName.substring(firstUnderscoreIndex + 1)
        return `[${schema}].[${actualTableName}]`
      }
      // If no underscore found, default to dbo schema
      return `[dbo].[${tableName}]`
    }
    return tableName
  }

  /**
   * Check if input matches productionID pattern
   */
  isProductionId(input: string): boolean {
    return PRODUCTION_ID_PATTERN.test(input)
  }

  /**
   * Check if input matches order number pattern
   */
  isOrderNumber(input: string): boolean {
    return ORDER_NUMBER_PATTERN.test(input)
  }

  /**
   * Map productionID to order number via database lookup
   */
  async mapProductionIdToOrderNumber(productionId: string): Promise<string | null> {
    try {
      const dbConfig = getDbConfig()
      const tableName = this.getTableName(dbConfig.TABLE_NAME)

      let sql: string
      let params: any[]

      if (this.dbService.type === 'sqlserver') {
        sql = `SELECT TOP 1 [${dbConfig.FIELD_ORDER_NUMBER}] FROM ${tableName} WHERE [${dbConfig.FIELD_PRODUCTION_ID}] = @p0`
        params = [productionId]
      } else {
        sql = `SELECT \`${dbConfig.FIELD_ORDER_NUMBER}\` FROM \`${tableName}\` WHERE \`${dbConfig.FIELD_PRODUCTION_ID}\` = ? LIMIT 1`
        params = [productionId]
      }

      const result = await this.dbService.query(sql, params)

      if (result.rows.length > 0) {
        const orderNumber = result.rows[0][Object.keys(result.rows[0])[0]] as string
        return orderNumber || null
      }

      return null
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知数据库错误'
      log.error('Failed to map productionID to order number', {
        productionId,
        error: message
      })
      throw error
    }
  }

  /**
   * Map multiple productionIds to order numbers
   */
  async mapProductionIdsToOrderNumbers(productionIds: string[]): Promise<Map<string, string>> {
    try {
      const dbConfig = getDbConfig()
      const tableName = this.getTableName(dbConfig.TABLE_NAME)

      if (productionIds.length === 0) {
        return new Map()
      }

      // Use parameterized query to prevent SQL injection
      const placeholders = productionIds.map((_, i) => `@p${i}`).join(', ')
      const params = productionIds

      let sql: string
      if (this.dbService.type === 'sqlserver') {
        sql = `SELECT [${dbConfig.FIELD_PRODUCTION_ID}], [${dbConfig.FIELD_ORDER_NUMBER}] FROM ${tableName} WHERE [${dbConfig.FIELD_PRODUCTION_ID}] IN (${placeholders})`
      } else {
        const idPlaceholders = productionIds.map(() => '?').join(', ')
        sql = `SELECT \`${dbConfig.FIELD_PRODUCTION_ID}\`, \`${dbConfig.FIELD_ORDER_NUMBER}\` FROM \`${tableName}\` WHERE \`${dbConfig.FIELD_PRODUCTION_ID}\` IN (${idPlaceholders})`
      }

      const result = await this.dbService.query(sql, params)

      const mappings = new Map<string, string>()
      for (const row of result.rows) {
        const keys = Object.keys(row)
        const prodId = row[keys[0]] as string
        const orderNum = row[keys[1]] as string
        if (prodId && orderNum) {
          mappings.set(prodId, orderNum)
        }
      }

      return mappings
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知数据库错误'
      log.error('Failed to map productionIds to order numbers', {
        error: message
      })
      throw error
    }
  }

  /**
   * Resolve order numbers from mixed input
   */
  async resolve(inputs: string[]): Promise<OrderMapping[]> {
    const mappings: OrderMapping[] = []

    for (const input of inputs) {
      const mapping: OrderMapping = { input, resolved: false }

      if (this.isOrderNumber(input)) {
        // Already an order number
        mapping.orderNumber = input
        mapping.resolved = true
      } else if (this.isProductionId(input)) {
        // Is a productionID, need to lookup
        mapping.productionId = input
        try {
          const orderNumber = await this.mapProductionIdToOrderNumber(input)
          if (orderNumber) {
            mapping.orderNumber = orderNumber
            mapping.resolved = true
          } else {
            mapping.error = '未在数据库中找到对应的订单号'
          }
        } catch (error) {
          mapping.error = error instanceof Error ? error.message : '数据库查询失败'
          log.warn('Failed to resolve productionID', { productionId: input, error })
        }
      } else {
        mapping.error = '格式不识别：既不是有效的生产订单号也不是总排号格式'
      }

      mappings.push(mapping)
    }

    return mappings
  }

  /**
   * Get valid order numbers from mappings
   */
  getValidOrderNumbers(mappings: OrderMapping[]): string[] {
    return mappings.filter((m) => m.resolved && m.orderNumber).map((m) => m.orderNumber!)
  }

  /**
   * Get warnings from failed mappings
   */
  getWarnings(mappings: OrderMapping[]): string[] {
    return mappings.filter((m) => !m.resolved && m.error).map((m) => `${m.input}: ${m.error}`)
  }

  /**
   * Recognize the type of input
   */
  recognizeType(input: string): OrderNumberType {
    if (this.isOrderNumber(input)) return 'orderNumber'
    if (this.isProductionId(input)) return 'productionId'
    return 'unknown'
  }

  /**
   * Get resolution statistics
   */
  getStats(mappings: OrderMapping[]): ResolutionStats {
    const stats: ResolutionStats = {
      totalInputs: mappings.length,
      validOrderNumbers: 0,
      validProductionIds: 0,
      resolvedCount: 0,
      failedCount: 0,
      unknownFormat: 0
    }

    for (const mapping of mappings) {
      if (mapping.resolved) {
        stats.resolvedCount++
        if (mapping.orderNumber && !mapping.productionId) {
          stats.validOrderNumbers++
        } else if (mapping.productionId) {
          stats.validProductionIds++
        }
      } else {
        stats.failedCount++
        if (!mapping.productionId && !mapping.orderNumber) {
          stats.unknownFormat++
        }
      }
    }

    return stats
  }
}
