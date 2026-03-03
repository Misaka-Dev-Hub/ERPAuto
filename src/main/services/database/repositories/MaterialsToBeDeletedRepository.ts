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

    if (!materials.length) return stats

    try {
      const repo = await this.getRepository()

      const validMaterials = materials.filter((m) => m.materialCode?.trim())
      stats.failed = materials.length - validMaterials.length

      if (validMaterials.length === 0) return stats

      const isSqlServer = repo.manager.connection.options.type === 'mssql'

      if (isSqlServer) {
        // Use optimized MERGE statement for SQL Server
        const tableName = repo.metadata.tableName

        // Execute in smaller batches if necessary to avoid parameter limits
        const batchSize = 1000
        for (let i = 0; i < validMaterials.length; i += batchSize) {
          const batch = validMaterials.slice(i, i + batchSize)

          let valuesSql: string[] = []
          let params: any[] = []

          batch.forEach((material, idx) => {
            const mCodeParam = `@${idx * 2}`
            const mNameParam = `@${idx * 2 + 1}`
            valuesSql.push(`(${mCodeParam}, ${mNameParam})`)
            params.push(material.materialCode)
            params.push(material.managerName || null)
          })

          const sqlString = `
            MERGE ${tableName} AS target
            USING (VALUES ${valuesSql.join(', ')}) AS source (MaterialCode, ManagerName)
            ON target.MaterialCode = source.MaterialCode
            WHEN MATCHED THEN UPDATE SET ManagerName = source.ManagerName
            WHEN NOT MATCHED THEN INSERT (MaterialCode, ManagerName) VALUES (source.MaterialCode, source.ManagerName);
          `

          try {
            await repo.query(sqlString, params)
            stats.success += batch.length
          } catch (e) {
            stats.failed += batch.length
          }
        }
      } else {
        // MySQL handles orUpdate cleanly
        try {
          await repo
            .createQueryBuilder()
            .insert()
            .into(MaterialsToBeDeleted)
            .values(validMaterials)
            .orUpdate(['ManagerName'], ['MaterialCode'])
            .execute()

          stats.success = validMaterials.length
        } catch (insertError) {
          // Fallback to iterative if batch fails (e.g., driver issues)
          for (const material of validMaterials) {
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
      const records = await repo.find({
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

  /**
   * Get comprehensive statistics
   */
  async getStatistics(): Promise<any> {
    try {
      const repo = await this.getRepository()

      const statsQuery = repo
        .createQueryBuilder('m')
        .select('COUNT(*)', 'totalMaterials')
        .addSelect('COUNT(DISTINCT m.managerName)', 'uniqueManagers')
        .where('m.materialCode IS NOT NULL')

      const statsResult = await statsQuery.getRawOne()

      const managerQuery = repo
        .createQueryBuilder('m')
        .select('m.managerName', 'managerName')
        .addSelect('COUNT(*)', 'count')
        .where('m.managerName IS NOT NULL')
        .groupBy('m.managerName')
        .orderBy('count', 'DESC')

      const managerResult = await managerQuery.getRawMany()

      const materialsPerManager = managerResult.map(row => ({
        [row.managerName]: parseInt(row.count, 10) || 0
      }))

      return {
        totalMaterials: parseInt(statsResult?.totalMaterials || '0', 10),
        uniqueManagers: parseInt(statsResult?.uniqueManagers || '0', 10),
        materialsPerManager
      }
    } catch (error) {
      log.error('Get statistics error', {
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        totalMaterials: 0,
        uniqueManagers: 0,
        materialsPerManager: []
      }
    }
  }
}
