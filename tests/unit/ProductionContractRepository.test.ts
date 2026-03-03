import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ProductionContractRepository } from '@services/database/repositories/ProductionContractRepository'
import { DataSource } from 'typeorm'
import { ProductionContract } from '@services/database/entities/ProductionContract'

describe('ProductionContractRepository', () => {
  let repository: ProductionContractRepository
  let dataSource: DataSource

  beforeEach(async () => {
    // Get data source and ensure it's initialized
    const { getDataSource } = require('@services/database/data-source')
    dataSource = getDataSource()
    if (!dataSource.isInitialized) {
      await dataSource.initialize()
    }
    repository = new ProductionContractRepository()

    // Clean up test data
    await dataSource.getRepository(ProductionContract).delete({})
  })

  afterEach(async () => {
    // Clean up test data
    await dataSource.getRepository(ProductionContract).delete({})
  })

  describe('findByProductionIds', () => {
    it('should return empty map for empty input', async () => {
      const result = await repository.findByProductionIds([])
      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(0)
    })

    it('should return correct mappings for valid production IDs', async () => {
      // Seed test data
      const repo = dataSource.getRepository(ProductionContract)
      await repo.save([
        { productionId: '22A1', orderNumber: 'SC70202602120001' },
        { productionId: '22A2', orderNumber: 'SC70202602120002' }
      ])

      const result = await repository.findByProductionIds(['22A1', '22A2'])

      expect(result.size).toBe(2)
      expect(result.get('22A1')).toBe('SC70202602120001')
      expect(result.get('22A2')).toBe('SC70202602120002')
    })

    it('should return empty map for non-existent production IDs', async () => {
      const result = await repository.findByProductionIds(['NONEXISTENT'])
      expect(result.size).toBe(0)
    })
  })

  describe('verifyOrderNumbers', () => {
    it('should return empty array for empty input', async () => {
      const result = await repository.verifyOrderNumbers([])
      expect(result).toEqual([])
    })

    it('should return subset of valid order numbers', async () => {
      // Seed test data
      const repo = dataSource.getRepository(ProductionContract)
      await repo.save([
        { productionId: '22A1', orderNumber: 'SC70202602120001' },
        { productionId: '22A2', orderNumber: 'SC70202602120002' }
      ])

      const result = await repository.verifyOrderNumbers([
        'SC70202602120001',
        'SC70202602120002',
        'SC99999999999999' // Non-existent
      ])

      expect(result).toHaveLength(2)
      expect(result).toContain('SC70202602120001')
      expect(result).toContain('SC70202602120002')
      expect(result).not.toContain('SC99999999999999')
    })
  })

  describe('findByProductionId', () => {
    it('should return null for non-existent production ID', async () => {
      const result = await repository.findByProductionId('NONEXISTENT')
      expect(result).toBeNull()
    })

    it('should return entity for valid production ID', async () => {
      // Seed test data
      const repo = dataSource.getRepository(ProductionContract)
      await repo.save({
        productionId: '22A1',
        orderNumber: 'SC70202602120001'
      })

      const result = await repository.findByProductionId('22A1')

      expect(result).not.toBeNull()
      expect(result?.productionId).toBe('22A1')
      expect(result?.orderNumber).toBe('SC70202602120001')
    })
  })
})
