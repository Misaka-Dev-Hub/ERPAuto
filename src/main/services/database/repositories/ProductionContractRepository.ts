/**
 * Repository for ProductionContract entity
 *
 * Provides database operations for production contract data.
 * Supports both MySQL and SQL Server with dialect-specific SQL.
 *
 * MySQL uses backticks and ? placeholders
 * SQL Server uses brackets and @pN placeholders
 */

import { DataSource, Repository } from 'typeorm'
import { ProductionContract } from '../entities/ProductionContract'
import { getDataSource } from '../data-source'
import { createLogger } from '../../logger'

const log = createLogger('ProductionContractRepository')

/**
 * Production Contract Repository class
 */
export class ProductionContractRepository {
  private repository: Repository<ProductionContract> | null = null
  private dataSource: DataSource | null = null

  /**
   * Get the repository instance
   */
  private async getRepository(): Promise<Repository<ProductionContract>> {
    if (!this.repository) {
      this.dataSource = getDataSource()
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize()
      }
      this.repository = this.dataSource.getRepository(ProductionContract)
    }
    return this.repository
  }

  /**
   * Get database type from DataSource
   */
  private async getDatabaseType(): Promise<'mysql' | 'mssql'> {
    const ds = getDataSource()
    return ds.options.type as 'mysql' | 'mssql'
  }

  /**
   * Find order numbers by production IDs
   * @param productionIds - Array of production IDs (总排号)
   * @returns Map of productionId -> orderNumber
   */
  async findByProductionIds(productionIds: string[]): Promise<Map<string, string>> {
    if (!productionIds.length) {
      return new Map()
    }

    try {
      const repo = await this.getRepository()
      const dbType = await this.getDatabaseType()
      const resultMap = new Map<string, string>()

      // Process in batches of 2000
      const batchSize = 2000

      for (let i = 0; i < productionIds.length; i += batchSize) {
        const batch = productionIds.slice(i, i + batchSize)

        if (dbType === 'mysql') {
          // MySQL syntax: backticks and ? placeholders
          const placeholders = batch.map(() => '?').join(', ')
          const query = `
            SELECT \`总排号\`, \`生产订单号\`
            FROM \`productionContractData_26年压力表合同数据\`
            WHERE \`总排号\` IN (${placeholders})
          `

          const results = await repo.query(query, batch)

          for (const row of results) {
            const prodId = row['总排号'] as string
            const orderNum = row['生产订单号'] as string
            if (prodId && orderNum) {
              resultMap.set(prodId, orderNum)
            }
          }
        } else {
          // SQL Server syntax: brackets and @pN placeholders
          const placeholders = batch.map((_, idx) => `@p${idx}`).join(', ')
          const query = `
            SELECT [总排号], [生产订单号]
            FROM [productionContractData_26年压力表合同数据]
            WHERE [总排号] IN (${placeholders})
          `

          const results = await repo.query(query, batch)

          for (const row of results) {
            const prodId = row['总排号'] as string
            const orderNum = row['生产订单号'] as string
            if (prodId && orderNum) {
              resultMap.set(prodId, orderNum)
            }
          }
        }
      }

      return resultMap
    } catch (error) {
      log.error('findByProductionIds failed', {
        count: productionIds.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return new Map()
    }
  }

  /**
   * Verify that order numbers exist in database
   * @param orderNumbers - Array of order numbers (生产订单号)
   * @returns Array of valid order numbers
   */
  async verifyOrderNumbers(orderNumbers: string[]): Promise<string[]> {
    if (!orderNumbers.length) {
      return []
    }

    try {
      const repo = await this.getRepository()
      const dbType = await this.getDatabaseType()
      const validNumbers: string[] = []

      // Process in batches of 2000
      const batchSize = 2000

      for (let i = 0; i < orderNumbers.length; i += batchSize) {
        const batch = orderNumbers.slice(i, i + batchSize)

        if (dbType === 'mysql') {
          // MySQL syntax
          const placeholders = batch.map(() => '?').join(', ')
          const query = `
            SELECT \`生产订单号\`
            FROM \`productionContractData_26年压力表合同数据\`
            WHERE \`生产订单号\` IN (${placeholders})
          `

          const results = await repo.query(query, batch)
          validNumbers.push(...results.map((r: any) => r['生产订单号'] as string).filter(Boolean))
        } else {
          // SQL Server syntax
          const placeholders = batch.map((_, idx) => `@p${idx}`).join(', ')
          const query = `
            SELECT [生产订单号]
            FROM [productionContractData_26年压力表合同数据]
            WHERE [生产订单号] IN (${placeholders})
          `

          const results = await repo.query(query, batch)
          validNumbers.push(...results.map((r: any) => r['生产订单号'] as string).filter(Boolean))
        }
      }

      return validNumbers
    } catch (error) {
      log.error('verifyOrderNumbers failed', {
        count: orderNumbers.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }
}
