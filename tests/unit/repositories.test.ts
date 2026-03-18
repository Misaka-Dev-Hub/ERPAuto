/**
 * Repository Unit Tests
 *
 * Tests for TypeORM repository patterns.
 * Note: These tests mock the database connections.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock TypeORM
vi.mock('typeorm', () => ({
  DataSource: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue({}),
    isInitialized: false,
    getRepository: vi.fn(),
    destroy: vi.fn()
  })),
  Repository: vi.fn(),
  In: vi.fn((arr) => arr),
  Entity: vi.fn(() => vi.fn()),
  PrimaryGeneratedColumn: vi.fn(() => vi.fn()),
  Column: vi.fn(() => vi.fn()),
  Index: vi.fn(() => vi.fn())
}))

vi.mock('../../src/main/services/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

describe('MaterialsToBeDeletedRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should be defined', async () => {
    const { MaterialsToBeDeletedRepository } =
      await import('../../src/main/services/database/repositories/MaterialsToBeDeletedRepository')
    expect(MaterialsToBeDeletedRepository).toBeDefined()
  })

  it('should create repository instance', async () => {
    const { MaterialsToBeDeletedRepository } =
      await import('../../src/main/services/database/repositories/MaterialsToBeDeletedRepository')
    const repo = new MaterialsToBeDeletedRepository()
    expect(repo).toBeDefined()
  })
})

describe('DiscreteMaterialPlanRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should be defined', async () => {
    const { DiscreteMaterialPlanRepository } =
      await import('../../src/main/services/database/repositories/DiscreteMaterialPlanRepository')
    expect(DiscreteMaterialPlanRepository).toBeDefined()
  })

  it('should create repository instance', async () => {
    const { DiscreteMaterialPlanRepository } =
      await import('../../src/main/services/database/repositories/DiscreteMaterialPlanRepository')
    const repo = new DiscreteMaterialPlanRepository()
    expect(repo).toBeDefined()
  })
})
