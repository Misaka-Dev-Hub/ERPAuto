/**
 * Repository for MaterialsToBeDeleted entity
 *
 * Provides type-safe database operations for materials to be deleted.
 */

import { DataSource, Repository, In } from 'typeorm'
import { MaterialsToBeDeleted, MaterialRecordData } from '../entities/MaterialsToBeDeleted'
import { getDataSource } from '../data-source'
import { createLogger } from '../../logger'

const log = createLogger('MaterialsToBeDeletedRepository')

/**
 * Upsert statistics
 */
export interface UpsertStats {
  total: number
  success: number
  failed: number
}

/**
 * MaterialsToBeDeleted Repository class
 */
export class MaterialsToBeDeletedRepository {
  private repository: Repository<MaterialsToBeDeleted> | null = null
  private dataSource: DataSource | null = null

  /**
   * Get the repository instance
   */
  private async getRepository(): Promise<Repository<MaterialsToBeDeleted>> {
    if (!this.repository) {
      this.dataSource = getDataSource()
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize()
      }
      this.repository = this.dataSource.getRepository(MaterialsToBeDeleted)
    }
    return this.repository
  }

  /**
   * Insert or update a single material record
   */
  async upsert(materialCode: string, managerName: string | null): Promise<boolean> {
    try {
      const repo = await this.getRepository()

      // Use upsert pattern
      let entity = await repo.findOne({ where: { materialCode } })

      if (entity) {
        entity.managerName = managerName
      } else {
        entity = repo.create({ materialCode, managerName })
      }

      await repo.save(entity)
      log.debug('Upserted material', { materialCode })
      return true
    } catch (error) {
      log.error('Upsert material failed', {
        materialCode,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * Insert or update multiple material records in batch
   */
  async upsertBatch(materials: MaterialRecordData[]): Promise<UpsertStats> {
    const stats: UpsertStats = {
      total: materials.length,
      success: 0,
      failed: 0
    }

    try {
      const repo = await this.getRepository()

      for (const material of materials) {
        if (!material.materialCode?.trim()) {
          stats.failed++
          continue
        }

        try {
          let entity = await repo.findOne({ where: { materialCode: material.materialCode } })

          if (entity) {
            entity.managerName = material.managerName
          } else {
            entity = repo.create({
              materialCode: material.materialCode,
              managerName: material.managerName
            })
          }

          await repo.save(entity)
          stats.success++
        } catch {
          stats.failed++
        }
      }

      log.info('Batch upsert completed', stats)
      return stats
    } catch (error) {
      log.error('Batch upsert failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      stats.failed = stats.total - stats.success
      return stats
    }
  }

  /**
   * Get all material codes as a set
   */
  async getAllMaterialCodes(): Promise<Set<string>> {
    try {
      const repo = await this.getRepository()
      const _records = await repo.find({
        select: ['materialCode'],
        where: { materialCode: In([]) } // This will be overridden
      })

      // Use query builder for better performance
      const result = await repo
        .createQueryBuilder('m')
        .select('m.materialCode')
        .where('m.materialCode IS NOT NULL')
        .getMany()

      return new Set(result.map((r) => r.materialCode).filter(Boolean))
    } catch (error) {
      log.error('Get all material codes failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return new Set()
    }
  }

  /**
   * Get all records
   */
  async getAllRecords(): Promise<MaterialsToBeDeleted[]> {
    try {
      const repo = await this.getRepository()
      return await repo.find({
        order: { managerName: 'ASC', materialCode: 'ASC' }
      })
    } catch (error) {
      log.error('Get all records failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Get materials by manager name
   */
  async getByManager(managerName: string): Promise<MaterialsToBeDeleted[]> {
    try {
      const repo = await this.getRepository()
      return await repo.find({
        where: { managerName },
        order: { materialCode: 'ASC' }
      })
    } catch (error) {
      log.error('Get by manager failed', {
        managerName,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Get unique manager names
   */
  async getManagers(): Promise<string[]> {
    try {
      const repo = await this.getRepository()
      const result = await repo
        .createQueryBuilder('m')
        .select('DISTINCT m.managerName', 'managerName')
        .where('m.managerName IS NOT NULL')
        .orderBy('m.managerName', 'ASC')
        .getRawMany()

      return result.map((r) => r.managerName).filter(Boolean)
    } catch (error) {
      log.error('Get managers failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Delete by material code
   */
  async deleteByMaterialCode(materialCode: string): Promise<boolean> {
    try {
      const repo = await this.getRepository()
      const result = await repo.delete({ materialCode })
      return (result.affected ?? 0) > 0
    } catch (error) {
      log.error('Delete by material code failed', {
        materialCode,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * Delete multiple materials by codes
   */
  async deleteByMaterialCodes(materialCodes: string[]): Promise<number> {
    if (!materialCodes.length) return 0

    try {
      const repo = await this.getRepository()
      const result = await repo.delete({ materialCode: In(materialCodes) })
      return result.affected ?? 0
    } catch (error) {
      log.error('Delete by material codes failed', {
        count: materialCodes.length,
        error: error instanceof Error ? error.message : String(error)
      })
      return 0
    }
  }

  /**
   * Check if a material exists
   */
  async exists(materialCode: string): Promise<boolean> {
    try {
      const repo = await this.getRepository()
      const count = await repo.count({ where: { materialCode } })
      return count > 0
    } catch {
      return false
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
}
