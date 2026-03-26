/**
 * Repository for DiscreteMaterialPlan entity
 *
 * Provides type-safe database operations for discrete material plan data.
 */

import { DataSource, Repository, In } from 'typeorm'
import { DiscreteMaterialPlan } from '../entities/DiscreteMaterialPlan'
import { getDataSource } from '../data-source'
import { createLogger } from '../../logger'

const log = createLogger('DiscreteMaterialPlanRepository')

/**
 * DiscreteMaterialPlan Repository class
 */
export class DiscreteMaterialPlanRepository {
  private repository: Repository<DiscreteMaterialPlan> | null = null
  private dataSource: DataSource | null = null

  /**
   * Get the repository instance
   */
  private async getRepository(): Promise<Repository<DiscreteMaterialPlan>> {
    if (!this.repository) {
      this.dataSource = getDataSource()
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize()
      }
      this.repository = this.dataSource.getRepository(DiscreteMaterialPlan)
    }
    return this.repository
  }

  /**
   * Query all records
   */
  async queryAll(): Promise<DiscreteMaterialPlan[]> {
    try {
      const repo = await this.getRepository()
      return await repo.find()
    } catch (error) {
      log.error('Query all failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Query all records with deduplication by MaterialCode
   */
  async queryAllDistinctByMaterialCode(): Promise<DiscreteMaterialPlan[]> {
    try {
      const repo = await this.getRepository()

      const query = `
        WITH RankedRecords AS (
          SELECT *,
            ROW_NUMBER() OVER (
              PARTITION BY MaterialCode
              ORDER BY CreateDate ASC, SequenceNumber ASC
            ) AS rn
          FROM DiscreteMaterialPlanData
          WHERE MaterialCode IS NOT NULL
        )
        SELECT * FROM RankedRecords WHERE rn = 1
      `

      return await repo.query(query)
    } catch (error) {
      log.error('Query all distinct by material code failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Query by source numbers (production order numbers)
   */
  async queryBySourceNumbers(sourceNumbers: string[]): Promise<DiscreteMaterialPlan[]> {
    if (!sourceNumbers.length) return []

    try {
      const repo = await this.getRepository()
      const batchSize = 2000
      const allResults: DiscreteMaterialPlan[] = []

      for (let i = 0; i < sourceNumbers.length; i += batchSize) {
        const batch = sourceNumbers.slice(i, i + batchSize)
        const results = await repo.find({
          where: { sourceNumber: In(batch) }
        })
        allResults.push(...results)
      }

      return allResults
    } catch (error) {
      log.error('Query by source numbers failed', {
        count: sourceNumbers.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Query by source numbers with deduplication by MaterialCode
   */
  async queryBySourceNumbersDistinct(sourceNumbers: string[]): Promise<DiscreteMaterialPlan[]> {
    if (!sourceNumbers.length) return []

    try {
      const repo = await this.getRepository()
      const batchSize = 2000
      const allResults: DiscreteMaterialPlan[] = []

      for (let i = 0; i < sourceNumbers.length; i += batchSize) {
        const batch = sourceNumbers.slice(i, i + batchSize)

        const query = `
          WITH RankedRecords AS (
            SELECT *,
              ROW_NUMBER() OVER (
                PARTITION BY MaterialCode
                ORDER BY CreateDate ASC, SequenceNumber ASC
              ) AS rn
            FROM DiscreteMaterialPlanData
            WHERE SourceNumber IN (?) AND MaterialCode IS NOT NULL
          )
          SELECT * FROM RankedRecords WHERE rn = 1
        `

        const results = await repo.query(query, [batch])
        allResults.push(...results)
      }

      return allResults
    } catch (error) {
      log.error('Query by source numbers distinct failed', {
        count: sourceNumbers.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Query by single source number
   */
  async queryBySourceNumber(sourceNumber: string): Promise<DiscreteMaterialPlan[]> {
    try {
      const repo = await this.getRepository()
      return await repo.find({ where: { sourceNumber } })
    } catch (error) {
      log.error('Query by source number failed', {
        sourceNumber,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Query by plan number
   */
  async queryByPlanNumber(planNumber: string): Promise<DiscreteMaterialPlan[]> {
    try {
      const repo = await this.getRepository()
      return await repo.find({ where: { planNumber } })
    } catch (error) {
      log.error('Query by plan number failed', {
        planNumber,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Query by multiple plan numbers
   */
  async queryByPlanNumbers(planNumbers: string[]): Promise<DiscreteMaterialPlan[]> {
    if (!planNumbers.length) return []

    try {
      const repo = await this.getRepository()
      return await repo.find({
        where: { planNumber: In(planNumbers) }
      })
    } catch (error) {
      log.error('Query by plan numbers failed', {
        count: planNumbers.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Count all records
   */
  async countAll(): Promise<number> {
    try {
      const repo = await this.getRepository()
      return await repo.count()
    } catch {
      return 0
    }
  }

  /**
   * Get unique material names
   */
  async getUniqueMaterialNames(sourceNumbers?: string[]): Promise<string[]> {
    try {
      const repo = await this.getRepository()

      let query = repo
        .createQueryBuilder('m')
        .select('DISTINCT m.materialName', 'materialName')
        .where('m.materialName IS NOT NULL')

      if (sourceNumbers && sourceNumbers.length > 0) {
        query = query.andWhere('m.sourceNumber IN (:...sourceNumbers)', { sourceNumbers })
      }

      const result = await query.orderBy('m.materialName', 'ASC').getRawMany()
      return result.map((r) => r.materialName).filter(Boolean)
    } catch (error) {
      log.error('Get unique material names failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    totalRecords: number
    uniquePlans: number
    uniqueOrders: number
    earliestRecord: Date | null
    latestRecord: Date | null
  }> {
    try {
      const repo = await this.getRepository()

      const result = await repo
        .createQueryBuilder('m')
        .select('COUNT(*)', 'totalRecords')
        .addSelect('COUNT(DISTINCT m.planNumber)', 'uniquePlans')
        .addSelect('COUNT(DISTINCT m.sourceNumber)', 'uniqueOrders')
        .addSelect('MIN(m.createDate)', 'earliestRecord')
        .addSelect('MAX(m.createDate)', 'latestRecord')
        .getRawOne()

      return {
        totalRecords: parseInt(result?.totalRecords || '0', 10),
        uniquePlans: parseInt(result?.uniquePlans || '0', 10),
        uniqueOrders: parseInt(result?.uniqueOrders || '0', 10),
        earliestRecord: result?.earliestRecord || null,
        latestRecord: result?.latestRecord || null
      }
    } catch (error) {
      log.error('Get statistics failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        totalRecords: 0,
        uniquePlans: 0,
        uniqueOrders: 0,
        earliestRecord: null,
        latestRecord: null
      }
    }
  }
}
