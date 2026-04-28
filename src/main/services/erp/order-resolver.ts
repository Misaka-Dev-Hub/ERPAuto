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
import type {
  OrderMapping,
  OrderNumberType,
  ResolutionStats
} from '../../types/order-resolver.types'

const log = createLogger('OrderResolver')

/**
 * ProductionID pattern: 2 digits + 1 letter + 1-6 digits
 * Examples: 22A1, 22A123, 26B10617
 */
const PRODUCTION_ID_PATTERN = /^\d{2}[A-Z]\d{1,6}$/i

/**
 * Production order number pattern: SC + 14 digits
 */
const ORDER_NUMBER_PATTERN = /^SC\d{14}$/i

const RESOLUTION_QUERY_BATCH_SIZE = 1000

/**
 * Database table and field names
 * Loaded from config.yaml via ConfigManager
 */
export function getDbConfig() {
  const configManager = ConfigManager.getInstance()
  const config = configManager.getConfig()
  return {
    TABLE_NAME: config.orderResolution.tableName || 'ERPAuto.vw_productionContractData',
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

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size))
    }
    return chunks
  }

  /**
   * Get table name based on database type
   * Converts schema.tablename format to database-specific quoting:
   * - SQL Server: [schema].[tablename]
   * - PostgreSQL: "schema"."tablename"
   * e.g., ERPAuto.vw_productionContractData ->
   *   SQL Server: [ERPAuto].[vw_productionContractData]
   *   PostgreSQL: "ERPAuto"."vw_productionContractData"
   */
  private getTableName(tableName: string): string {
    const dotIndex = tableName.indexOf('.')
    if (dotIndex > 0) {
      const schema = tableName.substring(0, dotIndex)
      const actualTableName = tableName.substring(dotIndex + 1)
      if (this.dbService.type === 'sqlserver') {
        return `[${schema}].[${actualTableName}]`
      }
      return `"${schema}"."${actualTableName}"`
    }
    // No dot found — use default schema
    if (this.dbService.type === 'sqlserver') {
      return `[dbo].[${tableName}]`
    }
    return `"public"."${tableName}"`
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
        // 使用 COLLATE 指定不区分大小写的排序规则
        sql = `SELECT TOP 1 [${dbConfig.FIELD_ORDER_NUMBER}] FROM ${tableName} WHERE [${dbConfig.FIELD_PRODUCTION_ID}] COLLATE SQL_Latin1_General_CP1_CI_AS = @p0`
        params = [productionId]
      } else if (this.dbService.type === 'postgresql') {
        // PostgreSQL: 使用双引号保护中文标识符，UPPER 实现不区分大小写
        // prepareSql() 会保留已双引号包裹的标识符
        // 注意：getTableName() 已返回带双引号的表名，不应再加引号
        sql = `SELECT DISTINCT "${dbConfig.FIELD_PRODUCTION_ID}", "${dbConfig.FIELD_ORDER_NUMBER}" FROM ${tableName} WHERE UPPER("${dbConfig.FIELD_PRODUCTION_ID}") = UPPER($1) LIMIT 1`
        params = [productionId]
      } else {
        // MySQL 默认不区分大小写，但显式使用 UPPER 确保一致性
        sql = `SELECT \`${dbConfig.FIELD_ORDER_NUMBER}\` FROM \`${tableName}\` WHERE UPPER(\`${dbConfig.FIELD_PRODUCTION_ID}\`) = UPPER(?) LIMIT 1`
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

      // P1: Deduplicate input productionIds to avoid redundant queries
      const uniqueProductionIds = [...new Set(productionIds)]

      const mappings = new Map<string, string>()
      const batches = this.chunk(uniqueProductionIds, RESOLUTION_QUERY_BATCH_SIZE)

      for (const batch of batches) {
        let sql: string
        const params = batch

        if (this.dbService.type === 'sqlserver') {
          const placeholders = batch.map((_, i) => `@p${i}`).join(', ')
          // P0: Use DISTINCT to prevent duplicates from one-to-many relationships.
          sql = `SELECT DISTINCT [${dbConfig.FIELD_PRODUCTION_ID}], [${dbConfig.FIELD_ORDER_NUMBER}] FROM ${tableName} WHERE [${dbConfig.FIELD_PRODUCTION_ID}] COLLATE SQL_Latin1_General_CP1_CI_AS IN (${placeholders})`
        } else if (this.dbService.type === 'postgresql') {
          // PostgreSQL: 使用双引号保护中文标识符，UPPER 实现不区分大小写。
          const pgPlaceholders = batch.map((_, i) => `UPPER($${i + 1})`).join(', ')
          sql = `SELECT DISTINCT "${dbConfig.FIELD_PRODUCTION_ID}", "${dbConfig.FIELD_ORDER_NUMBER}" FROM ${tableName} WHERE UPPER("${dbConfig.FIELD_PRODUCTION_ID}") IN (${pgPlaceholders})`
        } else {
          const idPlaceholders = batch.map(() => 'UPPER(?)').join(', ')
          // MySQL: 使用 UPPER 确保不区分大小写。
          sql = `SELECT DISTINCT \`${dbConfig.FIELD_PRODUCTION_ID}\`, \`${dbConfig.FIELD_ORDER_NUMBER}\` FROM \`${tableName}\` WHERE UPPER(\`${dbConfig.FIELD_PRODUCTION_ID}\`) IN (${idPlaceholders})`
        }

        const result = await this.dbService.query(sql, params)

        for (const row of result.rows) {
          const keys = Object.keys(row)
          const prodId = row[keys[0]] as string
          const orderNum = row[keys[1]] as string
          if (prodId && orderNum) {
            mappings.set(prodId, orderNum)
          }
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
   *
   * Optimized for batch processing with deduplication:
   * - Multiple productionIDs mapping to the same order number are treated as valid (not errors)
   * - Returns all mappings with duplicate tracking
   */
  async resolve(inputs: string[]): Promise<OrderMapping[]> {
    // P1: Deduplicate inputs at the input layer to avoid redundant queries
    const uniqueInputs = [...new Set(inputs)]

    // Separate productionIds and order numbers
    const productionIds: string[] = []
    const orderNumbers: string[] = []

    for (const input of uniqueInputs) {
      if (this.isOrderNumber(input)) {
        orderNumbers.push(input)
      } else if (this.isProductionId(input)) {
        productionIds.push(input)
      }
    }

    // Batch query productionId to order number mappings
    // 使用小写 key 存储映射，以支持忽略大小写查找
    const mappings = new Map<string, string>()
    if (productionIds.length > 0) {
      const batchMappings = await this.mapProductionIdsToOrderNumbers(productionIds)
      batchMappings.forEach((orderNum, prodId) => {
        mappings.set(prodId.toLowerCase(), orderNum)
      })
    }

    // Build results while preserving original input order
    // Note: Multiple productionIDs mapping to the same order number is VALID (not an error)
    const results: OrderMapping[] = []
    const processedInputs = new Set<string>()

    for (const input of inputs) {
      // Skip if this exact input was already processed
      if (processedInputs.has(input)) {
        continue
      }
      processedInputs.add(input)

      const mapping: OrderMapping = { input, resolved: false }

      if (this.isOrderNumber(input)) {
        // Already an order number
        mapping.orderNumber = input
        mapping.resolved = true
      } else if (this.isProductionId(input)) {
        // Is a productionID, lookup from batch mappings (使用小写查找以忽略大小写)
        mapping.productionId = input
        const orderNumber = mappings.get(input.toLowerCase())
        if (orderNumber) {
          mapping.orderNumber = orderNumber
          mapping.resolved = true
        } else {
          mapping.error = '未在数据库中找到对应的订单号'
        }
      } else {
        mapping.error = '格式不识别：既不是有效的生产订单号也不是总排号格式'
      }

      results.push(mapping)
    }

    return results
  }

  /**
   * Get valid order numbers from mappings
   * P2: Returns deduplicated order numbers
   */
  getValidOrderNumbers(mappings: OrderMapping[]): string[] {
    const validNumbers = mappings
      .filter((m) => m.resolved && m.orderNumber)
      .map((m) => m.orderNumber!)
    // P2: Deduplicate before returning
    return [...new Set(validNumbers)]
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

  /**
   * Get deduplication summary for logging
   * Returns a human-readable report showing:
   * - Input count
   * - Unique order numbers count
   * - Mapping details (which productionIDs map to which order numbers)
   */
  getDeduplicationReport(mappings: OrderMapping[]): {
    inputCount: number
    uniqueOrderNumbersCount: number
    orderNumberGroups: Map<string, string[]>
    summary: string
  } {
    // Group productionIDs by their resolved order number
    const orderNumberGroups = new Map<string, string[]>()

    for (const mapping of mappings) {
      if (mapping.resolved && mapping.orderNumber) {
        const existing = orderNumberGroups.get(mapping.orderNumber) || []
        existing.push(mapping.input)
        orderNumberGroups.set(mapping.orderNumber, existing)
      }
    }

    const inputCount = mappings.length
    const uniqueOrderNumbersCount = orderNumberGroups.size

    // Build summary string
    let summary = `输入 ${inputCount} 个总排号 → 解析为 ${uniqueOrderNumbersCount} 个唯一订单号`

    if (inputCount > uniqueOrderNumbersCount) {
      const duplicateCount = inputCount - uniqueOrderNumbersCount
      summary += `（${duplicateCount} 个重复已合并）`
    }

    return {
      inputCount,
      uniqueOrderNumbersCount,
      orderNumberGroups,
      summary
    }
  }
}
