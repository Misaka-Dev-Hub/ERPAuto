/**
 * Repository Unit Tests
 *
 * Behavior-based tests for MaterialsToBeDeletedRepository and DiscreteMaterialPlanRepository.
 * Verifies correct delegation to TypeORM methods, return values, and safe defaults on error.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockRepository, createMockQueryBuilder } from '../mocks'

// --- Shared mock state ---

let mockRepo: ReturnType<typeof createMockRepository>

// Mock TypeORM decorators (entities still need them)
vi.mock('typeorm', () => {
  const decorator = vi.fn()
  return {
    DataSource: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      isInitialized: true,
      getRepository: vi.fn(() => mockRepo),
      destroy: vi.fn()
    })),
    Repository: vi.fn(),
    In: vi.fn((arr: unknown[]) => arr),
    Entity: decorator,
    PrimaryGeneratedColumn: decorator,
    Column: decorator,
    ManyToOne: decorator,
    OneToMany: decorator,
    ManyToMany: decorator,
    JoinColumn: decorator,
    JoinTable: decorator,
    CreateDateColumn: decorator,
    UpdateDateColumn: decorator,
    DeleteDateColumn: decorator,
    Index: decorator,
    Unique: decorator,
    Check: decorator,
    Exclusion: decorator,
    Generated: decorator,
    Between: vi.fn(),
    LessThan: vi.fn(),
    LessThanOrEqual: vi.fn(),
    MoreThan: vi.fn(),
    MoreThanOrEqual: vi.fn(),
    Equal: vi.fn(),
    Like: vi.fn(),
    ILike: vi.fn(),
    IsNull: vi.fn(),
    Not: vi.fn()
  }
})

vi.mock('../../src/main/services/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

vi.mock('../../src/main/services/database/data-source', () => ({
  getDataSource: vi.fn(() => ({
    isInitialized: true,
    initialize: vi.fn().mockResolvedValue(undefined),
    getRepository: vi.fn(() => mockRepo)
  }))
}))

// ---------------------------------------------------------------------------
// MaterialsToBeDeletedRepository
// ---------------------------------------------------------------------------
describe('MaterialsToBeDeletedRepository', () => {
  let MaterialsToBeDeletedRepository: typeof import(
    '../../src/main/services/database/repositories/MaterialsToBeDeletedRepository'
  ).MaterialsToBeDeletedRepository

  beforeEach(async () => {
    vi.clearAllMocks()
    mockRepo = createMockRepository()
    const mod = await import(
      '../../src/main/services/database/repositories/MaterialsToBeDeletedRepository'
    )
    MaterialsToBeDeletedRepository = mod.MaterialsToBeDeletedRepository
  })

  afterEach(() => {
    vi.resetModules()
  })

  // --- upsert ---

  it('upsert: creates new entity when not found', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.findOne!.mockResolvedValue(null)
    mockRepo.create!.mockReturnValue({ materialCode: 'MAT01', managerName: 'Alice' })

    const result = await repo.upsert('MAT01', 'Alice')

    expect(result).toBe(true)
    expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { materialCode: 'MAT01' } })
    expect(mockRepo.create).toHaveBeenCalledWith({ materialCode: 'MAT01', managerName: 'Alice' })
    expect(mockRepo.save).toHaveBeenCalled()
  })

  it('upsert: updates existing entity', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    const existing = { materialCode: 'MAT01', managerName: 'Bob' }
    mockRepo.findOne!.mockResolvedValue(existing)

    const result = await repo.upsert('MAT01', 'Alice')

    expect(result).toBe(true)
    expect(existing.managerName).toBe('Alice')
    expect(mockRepo.save).toHaveBeenCalledWith(existing)
  })

  it('upsert: returns false on error', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.findOne!.mockRejectedValue(new Error('db fail'))

    const result = await repo.upsert('MAT01', 'Alice')

    expect(result).toBe(false)
  })

  // --- upsertBatch ---

  it('upsertBatch: processes valid materials', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.findOne!.mockResolvedValue(null)
    mockRepo.create!.mockImplementation((data) => data)

    const stats = await repo.upsertBatch([
      { materialCode: 'M1', managerName: 'A' },
      { materialCode: 'M2', managerName: 'B' }
    ])

    expect(stats.total).toBe(2)
    expect(stats.success).toBe(2)
    expect(stats.failed).toBe(0)
  })

  it('upsertBatch: skips empty materialCodes', async () => {
    const repo = new MaterialsToBeDeletedRepository()

    const stats = await repo.upsertBatch([
      { materialCode: '', managerName: 'A' },
      { materialCode: '   ', managerName: 'B' },
      { materialCode: 'M1', managerName: 'C' }
    ])

    expect(stats.total).toBe(3)
    expect(stats.success).toBe(1)
    expect(stats.failed).toBe(2)
  })

  it('upsertBatch: returns stats with partial failures', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.findOne!.mockRejectedValue(new Error('fail'))

    const stats = await repo.upsertBatch([{ materialCode: 'M1', managerName: 'A' }])

    expect(stats.total).toBe(1)
    expect(stats.failed).toBe(1)
  })

  // --- getAllMaterialCodes ---

  it('getAllMaterialCodes: returns Set via QueryBuilder', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    const qb = createMockQueryBuilder({
      result: [{ materialCode: 'M1' }, { materialCode: 'M2' }]
    })
    mockRepo.createQueryBuilder!.mockReturnValue(qb)

    const result = await repo.getAllMaterialCodes()

    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(2)
    expect(result.has('M1')).toBe(true)
    expect(result.has('M2')).toBe(true)
  })

  it('getAllMaterialCodes: returns empty Set on error', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.createQueryBuilder!.mockImplementation(() => {
      throw new Error('db fail')
    })

    const result = await repo.getAllMaterialCodes()

    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  // --- getAllRecords ---

  it('getAllRecords: returns ordered records', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    const records = [{ materialCode: 'M1' }, { materialCode: 'M2' }]
    mockRepo.find!.mockResolvedValue(records)

    const result = await repo.getAllRecords()

    expect(result).toEqual(records)
    expect(mockRepo.find).toHaveBeenCalledWith({
      order: { managerName: 'ASC', materialCode: 'ASC' }
    })
  })

  it('getAllRecords: returns empty array on error', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.find!.mockRejectedValue(new Error('db fail'))

    const result = await repo.getAllRecords()

    expect(result).toEqual([])
  })

  // --- getByManager ---

  it('getByManager: filters by managerName', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    const records = [{ materialCode: 'M1', managerName: 'Alice' }]
    mockRepo.find!.mockResolvedValue(records)

    const result = await repo.getByManager('Alice')

    expect(result).toEqual(records)
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { managerName: 'Alice' },
      order: { materialCode: 'ASC' }
    })
  })

  it('getByManager: returns empty array on error', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.find!.mockRejectedValue(new Error('db fail'))

    const result = await repo.getByManager('Alice')

    expect(result).toEqual([])
  })

  // --- getManagers ---

  it('getManagers: returns distinct names via QueryBuilder', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    const qb = createMockQueryBuilder({
      result: [{ managerName: 'Alice' }, { managerName: 'Bob' }]
    })
    mockRepo.createQueryBuilder!.mockReturnValue(qb)

    const result = await repo.getManagers()

    expect(result).toEqual(['Alice', 'Bob'])
  })

  it('getManagers: returns empty array on error', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.createQueryBuilder!.mockImplementation(() => {
      throw new Error('db fail')
    })

    const result = await repo.getManagers()

    expect(result).toEqual([])
  })

  // --- deleteByMaterialCode ---

  it('deleteByMaterialCode: returns true when affected > 0', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.delete!.mockResolvedValue({ affected: 1 })

    const result = await repo.deleteByMaterialCode('M1')

    expect(result).toBe(true)
    expect(mockRepo.delete).toHaveBeenCalledWith({ materialCode: 'M1' })
  })

  it('deleteByMaterialCode: returns false when affected is 0', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.delete!.mockResolvedValue({ affected: 0 })

    const result = await repo.deleteByMaterialCode('M1')

    expect(result).toBe(false)
  })

  it('deleteByMaterialCode: returns false on error', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.delete!.mockRejectedValue(new Error('db fail'))

    const result = await repo.deleteByMaterialCode('M1')

    expect(result).toBe(false)
  })

  // --- deleteByMaterialCodes ---

  it('deleteByMaterialCodes: returns 0 for empty array', async () => {
    const repo = new MaterialsToBeDeletedRepository()

    const result = await repo.deleteByMaterialCodes([])

    expect(result).toBe(0)
    expect(mockRepo.delete).not.toHaveBeenCalled()
  })

  it('deleteByMaterialCodes: returns affected count', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.delete!.mockResolvedValue({ affected: 3 })

    const result = await repo.deleteByMaterialCodes(['M1', 'M2', 'M3'])

    expect(result).toBe(3)
  })

  it('deleteByMaterialCodes: returns 0 on error', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.delete!.mockRejectedValue(new Error('db fail'))

    const result = await repo.deleteByMaterialCodes(['M1'])

    expect(result).toBe(0)
  })

  // --- exists ---

  it('exists: returns true when count > 0', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.count!.mockResolvedValue(1)

    const result = await repo.exists('M1')

    expect(result).toBe(true)
  })

  it('exists: returns false when count is 0', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.count!.mockResolvedValue(0)

    const result = await repo.exists('M1')

    expect(result).toBe(false)
  })

  it('exists: returns false on error', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.count!.mockRejectedValue(new Error('db fail'))

    const result = await repo.exists('M1')

    expect(result).toBe(false)
  })

  // --- countAll ---

  it('countAll: returns count', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.count!.mockResolvedValue(42)

    const result = await repo.countAll()

    expect(result).toBe(42)
  })

  it('countAll: returns 0 on error', async () => {
    const repo = new MaterialsToBeDeletedRepository()
    mockRepo.count!.mockRejectedValue(new Error('db fail'))

    const result = await repo.countAll()

    expect(result).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// DiscreteMaterialPlanRepository
// ---------------------------------------------------------------------------
describe('DiscreteMaterialPlanRepository', () => {
  let DiscreteMaterialPlanRepository: typeof import(
    '../../src/main/services/database/repositories/DiscreteMaterialPlanRepository'
  ).DiscreteMaterialPlanRepository

  beforeEach(async () => {
    vi.clearAllMocks()
    mockRepo = createMockRepository()
    const mod = await import(
      '../../src/main/services/database/repositories/DiscreteMaterialPlanRepository'
    )
    DiscreteMaterialPlanRepository = mod.DiscreteMaterialPlanRepository
  })

  afterEach(() => {
    vi.resetModules()
  })

  // --- queryAll ---

  it('queryAll: returns find results', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    const records = [{ sourceNumber: 'S1' }, { sourceNumber: 'S2' }]
    mockRepo.find!.mockResolvedValue(records)

    const result = await repo.queryAll()

    expect(result).toEqual(records)
  })

  it('queryAll: returns empty array on error', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    mockRepo.find!.mockRejectedValue(new Error('db fail'))

    const result = await repo.queryAll()

    expect(result).toEqual([])
  })

  // --- queryAllDistinctByMaterialCode ---

  it('queryAllDistinctByMaterialCode: calls repo.query() with raw SQL', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    const mockQueryResult = [{ MaterialCode: 'M1', rn: 1 }]
    mockRepo = { ...createMockRepository(), query: vi.fn().mockResolvedValue(mockQueryResult) }
    // Re-import to pick up new mockRepo
    vi.resetModules()
    const mod = await import(
      '../../src/main/services/database/repositories/DiscreteMaterialPlanRepository'
    )
    const freshRepo = new mod.DiscreteMaterialPlanRepository()

    const result = await freshRepo.queryAllDistinctByMaterialCode()

    expect(result).toEqual(mockQueryResult)
  })

  it('queryAllDistinctByMaterialCode: returns empty array on error', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    mockRepo = {
      ...createMockRepository(),
      query: vi.fn().mockRejectedValue(new Error('db fail'))
    }
    vi.resetModules()
    const mod = await import(
      '../../src/main/services/database/repositories/DiscreteMaterialPlanRepository'
    )
    const freshRepo = new mod.DiscreteMaterialPlanRepository()

    const result = await freshRepo.queryAllDistinctByMaterialCode()

    expect(result).toEqual([])
  })

  // --- queryBySourceNumbers ---

  it('queryBySourceNumbers: returns empty array for empty input', async () => {
    const repo = new DiscreteMaterialPlanRepository()

    const result = await repo.queryBySourceNumbers([])

    expect(result).toEqual([])
    expect(mockRepo.find).not.toHaveBeenCalled()
  })

  it('queryBySourceNumbers: batches in groups of 2000', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    // Create 2500 source numbers to trigger 2 batches
    const sourceNumbers = Array.from({ length: 2500 }, (_, i) => `S${i}`)
    mockRepo.find!.mockResolvedValue([])

    await repo.queryBySourceNumbers(sourceNumbers)

    // Should be called twice: once for 2000, once for 500
    expect(mockRepo.find).toHaveBeenCalledTimes(2)
  })

  it('queryBySourceNumbers: returns combined results', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    const records = [{ sourceNumber: 'S1' }, { sourceNumber: 'S2' }]
    mockRepo.find!.mockResolvedValue(records)

    const result = await repo.queryBySourceNumbers(['S1', 'S2'])

    expect(result).toEqual(records)
  })

  it('queryBySourceNumbers: returns empty array on error', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    mockRepo.find!.mockRejectedValue(new Error('db fail'))

    const result = await repo.queryBySourceNumbers(['S1'])

    expect(result).toEqual([])
  })

  // --- queryBySourceNumbersDistinct ---

  it('queryBySourceNumbersDistinct: returns empty array for empty input', async () => {
    const repo = new DiscreteMaterialPlanRepository()

    const result = await repo.queryBySourceNumbersDistinct([])

    expect(result).toEqual([])
  })

  it('queryBySourceNumbersDistinct: calls repo.query() per batch', async () => {
    mockRepo = { ...createMockRepository(), query: vi.fn().mockResolvedValue([{ M: 'X' }]) }
    vi.resetModules()
    const mod = await import(
      '../../src/main/services/database/repositories/DiscreteMaterialPlanRepository'
    )
    const repo = new mod.DiscreteMaterialPlanRepository()

    const result = await repo.queryBySourceNumbersDistinct(['S1', 'S2'])

    expect(result.length).toBeGreaterThan(0)
    expect((mockRepo as Record<string, unknown>).query).toHaveBeenCalled()
  })

  it('queryBySourceNumbersDistinct: returns empty array on error', async () => {
    mockRepo = {
      ...createMockRepository(),
      query: vi.fn().mockRejectedValue(new Error('db fail'))
    }
    vi.resetModules()
    const mod = await import(
      '../../src/main/services/database/repositories/DiscreteMaterialPlanRepository'
    )
    const repo = new mod.DiscreteMaterialPlanRepository()

    const result = await repo.queryBySourceNumbersDistinct(['S1'])

    expect(result).toEqual([])
  })

  // --- queryBySourceNumber ---

  it('queryBySourceNumber: calls find with where clause', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    const records = [{ sourceNumber: 'S1', planNumber: 'P1' }]
    mockRepo.find!.mockResolvedValue(records)

    const result = await repo.queryBySourceNumber('S1')

    expect(result).toEqual(records)
    expect(mockRepo.find).toHaveBeenCalledWith({ where: { sourceNumber: 'S1' } })
  })

  it('queryBySourceNumber: returns empty array on error', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    mockRepo.find!.mockRejectedValue(new Error('db fail'))

    const result = await repo.queryBySourceNumber('S1')

    expect(result).toEqual([])
  })

  // --- queryByPlanNumber ---

  it('queryByPlanNumber: calls find with where clause', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    const records = [{ sourceNumber: 'S1', planNumber: 'P1' }]
    mockRepo.find!.mockResolvedValue(records)

    const result = await repo.queryByPlanNumber('P1')

    expect(result).toEqual(records)
    expect(mockRepo.find).toHaveBeenCalledWith({ where: { planNumber: 'P1' } })
  })

  it('queryByPlanNumber: returns empty array on error', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    mockRepo.find!.mockRejectedValue(new Error('db fail'))

    const result = await repo.queryByPlanNumber('P1')

    expect(result).toEqual([])
  })

  // --- queryByPlanNumbers ---

  it('queryByPlanNumbers: returns empty array for empty input', async () => {
    const repo = new DiscreteMaterialPlanRepository()

    const result = await repo.queryByPlanNumbers([])

    expect(result).toEqual([])
    expect(mockRepo.find).not.toHaveBeenCalled()
  })

  it('queryByPlanNumbers: calls find with In()', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    const records = [{ planNumber: 'P1' }, { planNumber: 'P2' }]
    mockRepo.find!.mockResolvedValue(records)

    const result = await repo.queryByPlanNumbers(['P1', 'P2'])

    expect(result).toEqual(records)
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { planNumber: ['P1', 'P2'] } // In() mock returns the array as-is
    })
  })

  it('queryByPlanNumbers: returns empty array on error', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    mockRepo.find!.mockRejectedValue(new Error('db fail'))

    const result = await repo.queryByPlanNumbers(['P1'])

    expect(result).toEqual([])
  })

  // --- countAll ---

  it('countAll: returns count', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    mockRepo.count!.mockResolvedValue(99)

    const result = await repo.countAll()

    expect(result).toBe(99)
  })

  it('countAll: returns 0 on error', async () => {
    const repo = new DiscreteMaterialPlanRepository()
    mockRepo.count!.mockRejectedValue(new Error('db fail'))

    const result = await repo.countAll()

    expect(result).toBe(0)
  })
})
