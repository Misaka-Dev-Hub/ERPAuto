/**
 * Repository Unit Tests
 *
 * Tests for TypeORM repository patterns.
 * Note: These tests mock the database connections.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock TypeORM
vi.mock('typeorm', () => {
  // Create mock decorator functions
  const Entity = vi.fn()
  const PrimaryGeneratedColumn = vi.fn()
  const Column = vi.fn()
  const ManyToOne = vi.fn()
  const OneToMany = vi.fn()
  const ManyToMany = vi.fn()
  const JoinColumn = vi.fn()
  const JoinTable = vi.fn()
  const CreateDateColumn = vi.fn()
  const UpdateDateColumn = vi.fn()
  const DeleteDateColumn = vi.fn()
  const Index = vi.fn()
  const Unique = vi.fn()
  const Check = vi.fn()
  const Exclusion = vi.fn()
  const Generated = vi.fn()

  return {
    DataSource: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue({}),
      isInitialized: false,
      getRepository: vi.fn(),
      destroy: vi.fn()
    })),
    Repository: vi.fn(),
    In: vi.fn((arr) => arr),
    // Add all the decorators that entities use
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    ManyToMany,
    JoinColumn,
    JoinTable,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    Index,
    Unique,
    Check,
    Exclusion,
    Generated,
    // Other TypeORM exports
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
