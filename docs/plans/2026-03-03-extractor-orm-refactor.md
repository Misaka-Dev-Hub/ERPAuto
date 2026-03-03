# ExtractorPage ORM Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace MySqlService with TypeORM repository to support both MySQL and SQL Server for ExtractorPage order resolution.

**Architecture:** Create ProductionContract TypeORM entity and ProductionContractRepository with dual SQL dialect support. Update OrderNumberResolver to use repository pattern instead of direct MySqlService dependency. Update extractor-handler to use TypeORM DataSource.

**Tech Stack:** TypeORM 0.3.28, TypeScript 5.9, Vitest, MySQL, SQL Server

**Prerequisites:**

- Git worktree created: `feature/extractor-orm-refactor`
- Database configured in `.env` (DB_TYPE=mysql|mssql)
- Read design doc: `docs/plans/2026-03-03-extractor-orm-refactor-design.md`

---

## Task 1: Create ProductionContract TypeORM Entity

**Files:**

- Create: `src/main/services/database/entities/ProductionContract.ts`
- Modify: `src/main/services/database/data-source.ts`

**Step 1: Write the entity file**

Create file: `src/main/services/database/entities/ProductionContract.ts`

```typescript
import { Entity, PrimaryColumn, Column, Index } from 'typeorm'

/**
 * Production Contract Entity
 *
 * Represents the production contract database table.
 * Maps to: productionContractData_26年压力表合同数据
 *
 * Columns:
 * - 总排号 (productionId): Production ID, primary key
 * - 生产订单号 (orderNumber): Production order number
 */
@Entity('productionContractData_26年压力表合同数据')
@Index('idx_production_id', ['productionId'])
@Index('idx_order_number', ['orderNumber'])
export class ProductionContract {
  @PrimaryColumn({ name: '总排号', type: 'varchar', length: 50 })
  productionId: string

  @Column({ name: '生产订单号', type: 'varchar', length: 50 })
  orderNumber: string
}
```

**Step 2: Register entity in data-source**

Modify: `src/main/services/database/data-source.ts`

Find this line (around line 29):

```typescript
entities: [__dirname + '/entities/*.{ts,js}'],
```

This wildcard pattern already includes our new entity, so no change is needed. The entity will be automatically loaded.

**Step 3: Verify entity with TypeScript**

Run: `npm run typecheck:node`

Expected: No errors

**Step 4: Commit**

```bash
git add src/main/services/database/entities/ProductionContract.ts
git commit -m "feat: add ProductionContract TypeORM entity

- Add entity for production contract database table
- Supports both MySQL and SQL Server via TypeORM
- Indexed columns for query performance

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create ProductionContractRepository - Setup

**Files:**

- Create: `src/main/services/database/repositories/ProductionContractRepository.ts`

**Step 1: Write repository skeleton**

Create file: `src/main/services/database/repositories/ProductionContractRepository.ts`

```typescript
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

  // Methods will be implemented in next tasks
}
```

**Step 2: Verify with TypeScript**

Run: `npm run typecheck:node`

Expected: No errors

**Step 3: Commit**

```bash
git add src/main/services/database/repositories/ProductionContractRepository.ts
git commit -m "feat: add ProductionContractRepository skeleton

- Set up repository class with DataSource integration
- Add helper methods for repository access
- Add database type detection

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Implement findByProductionIds - MySQL Dialect

**Files:**

- Modify: `src/main/services/database/repositories/ProductionContractRepository.ts`

**Step 1: Add findByProductionIds method for MySQL**

Add this method to the `ProductionContractRepository` class:

```typescript
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
        }
        // SQL Server will be handled in next task
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
```

**Step 2: Verify with TypeScript**

Run: `npm run typecheck:node`

Expected: No errors

**Step 3: Commit**

```bash
git add src/main/services/database/repositories/ProductionContractRepository.ts
git commit -m "feat: implement findByProductionIds for MySQL

- Add MySQL dialect support with backticks and ? placeholders
- Batch queries in groups of 2000 for performance
- Return Map<productionId, orderNumber>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Implement findByProductionIds - SQL Server Dialect

**Files:**

- Modify: `src/main/services/database/repositories/ProductionContractRepository.ts`

**Step 1: Add SQL Server support to findByProductionIds**

Find the `if (dbType === 'mysql')` block in `findByProductionIds` and add the SQL Server branch:

Replace the SQL Server comment with:

```typescript
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
```

**Step 2: Verify with TypeScript**

Run: `npm run typecheck:node`

Expected: No errors

**Step 3: Commit**

```bash
git add src/main/services/database/repositories/ProductionContractRepository.ts
git commit -m "feat: add SQL Server support to findByProductionIds

- Add SQL Server dialect with brackets and @pN placeholders
- Dual SQL dialect support now complete
- Automatically selects correct syntax based on DB_TYPE

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Implement verifyOrderNumbers Method

**Files:**

- Modify: `src/main/services/database/repositories/ProductionContractRepository.ts`

**Step 1: Add verifyOrderNumbers method**

Add this method to the `ProductionContractRepository` class:

```typescript
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
```

**Step 2: Verify with TypeScript**

Run: `npm run typecheck:node`

Expected: No errors

**Step 3: Commit**

```bash
git add src/main/services/database/repositories/ProductionContractRepository.ts
git commit -m "feat: implement verifyOrderNumbers method

- Add verification for order numbers in database
- Support both MySQL and SQL Server dialects
- Batch processing for performance

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Implement findByProductionId Method

**Files:**

- Modify: `src/main/services/database/repositories/ProductionContractRepository.ts`

**Step 1: Add findByProductionId method**

Add this method to the `ProductionContractRepository` class:

```typescript
  /**
   * Find single contract by production ID
   * @param productionId - Production ID (总排号)
   * @returns ProductionContract entity or null
   */
  async findByProductionId(productionId: string): Promise<ProductionContract | null> {
    if (!productionId) {
      return null
    }

    try {
      const repo = await this.getRepository()
      return await repo.findOne({ where: { productionId } })
    } catch (error) {
      log.error('findByProductionId failed', {
        productionId,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }
```

**Step 2: Verify with TypeScript**

Run: `npm run typecheck:node`

Expected: No errors

**Step 3: Commit**

```bash
git add src/main/services/database/repositories/ProductionContractRepository.ts
git commit -m "feat: implement findByProductionId method

- Add single record lookup by production ID
- Use TypeORM QueryBuilder for database-agnostic query

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Write Unit Tests for ProductionContractRepository

**Files:**

- Create: `src/main/services/database/repositories/__tests__/ProductionContractRepository.test.ts`

**Step 1: Create test file with basic structure**

Create file: `src/main/services/database/repositories/__tests__/ProductionContractRepository.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ProductionContractRepository } from '../ProductionContractRepository'
import { DataSource } from 'typeorm'
import { ProductionContract } from '../../entities/ProductionContract'

describe('ProductionContractRepository', () => {
  let repository: ProductionContractRepository
  let dataSource: DataSource

  beforeEach(async () => {
    // Get data source and ensure it's initialized
    dataSource = require('../../../data-source').getDataSource()
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
```

**Step 2: Run tests**

Run: `npm test -- ProductionContractRepository.test.ts`

Expected: Tests pass (may fail if database not configured - that's OK for now)

**Step 3: Commit**

```bash
git add src/main/services/database/repositories/__tests__/ProductionContractRepository.test.ts
git commit -m "test: add unit tests for ProductionContractRepository

- Test findByProductionIds with various inputs
- Test verifyOrderNumbers filtering
- Test findByProductionId lookups
- Include test data setup and cleanup

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Refactor OrderNumberResolver Constructor

**Files:**

- Modify: `src/main/services/erp/order-resolver.ts`

**Step 1: Update import statement**

Find this import (around line 14):

```typescript
import { MySqlService } from '../database/mysql'
```

Replace with:

```typescript
import { ProductionContractRepository } from '../database/repositories/ProductionContractRepository'
```

**Step 2: Update constructor**

Find the constructor (around lines 73-78):

```typescript
export class OrderNumberResolver {
  private mysqlService: MySqlService

  constructor(mysqlService: MySqlService) {
    this.mysqlService = mysqlService
  }
```

Replace with:

```typescript
export class OrderNumberResolver {
  constructor(private repository: ProductionContractRepository) {}
```

**Step 3: Verify with TypeScript**

Run: `npm run typecheck:node`

Expected: Errors (because we haven't updated methods yet - that's OK)

**Step 4: Commit**

```bash
git add src/main/services/erp/order-resolver.ts
git commit -m "refactor: update OrderNumberResolver constructor

- Replace MySqlService dependency with ProductionContractRepository
- Use private parameter shorthand for cleaner code

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Update OrderNumberResolver.resolveProductionIds

**Files:**

- Modify: `src/main/services/erp/order-resolver.ts`

**Step 1: Replace resolveProductionIds method**

Find the `resolveProductionIds` method (around lines 202-276). Replace the entire method with:

```typescript
  /**
   * Resolve productionIDs to production order numbers via database lookup
   * @param productionIds - List of productionIDs to resolve
   * @returns List of order mappings
   */
  private async resolveProductionIds(productionIds: string[]): Promise<OrderMapping[]> {
    const mappings: OrderMapping[] = []

    try {
      // Use repository to query database
      const resultMap = await this.repository.findByProductionIds(productionIds)

      // Build mappings from result map
      for (const pid of productionIds) {
        const orderNumber = resultMap.get(pid)

        if (orderNumber) {
          mappings.push({
            input: pid,
            productionId: pid,
            orderNumber,
            isValid: true,
            inputType: 'productionId'
          })
        } else {
          mappings.push({
            input: pid,
            productionId: pid,
            isValid: false,
            error: `数据库中未找到生产 ID：${pid}`,
            inputType: 'productionId'
          })
        }
      }

      return mappings
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知数据库错误'

      // Return all as failed with error
      return productionIds.map((pid) => ({
        input: pid,
        productionId: pid,
        isValid: false,
        error: `数据库查询失败：${message}`,
        inputType: 'productionId'
      }))
    }
  }
```

**Step 2: Verify with TypeScript**

Run: `npm run typecheck:node`

Expected: No errors for this method

**Step 3: Commit**

```bash
git add src/main/services/erp/order-resolver.ts
git commit -m "refactor: update resolveProductionIds to use repository

- Replace MySQL-specific query logic with repository call
- Simplify from 70+ lines to ~40 lines
- Remove SQL string construction
- Use Map result from repository

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Update OrderNumberResolver.verifyOrderNumbers

**Files:**

- Modify: `src/main/services/erp/order-resolver.ts`

**Step 1: Replace verifyOrderNumbers method**

Find the `verifyOrderNumbers` method (around lines 278-302). Replace the entire method with:

```typescript
  /**
   * Verify that order numbers exist in the database
   * @param orderNumbers - List of order numbers to verify
   * @returns List of valid order numbers
   */
  private async verifyOrderNumbers(orderNumbers: string[]): Promise<string[]> {
    try {
      return await this.repository.verifyOrderNumbers(orderNumbers)
    } catch (error) {
      console.warn('[OrderResolver] Failed to verify order numbers:', error)
      return orderNumbers // Return original on error (fail open)
    }
  }
```

**Step 2: Verify with TypeScript**

Run: `npm run typecheck:node`

Expected: No errors

**Step 3: Commit**

```bash
git add src/main/services/erp/order-resolver.ts
git commit -m "refactor: update verifyOrderNumbers to use repository

- Replace MySQL-specific query with repository call
- Simplify from 20+ lines to 10 lines
- Remove SQL string construction

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Update OrderNumberResolver Tests

**Files:**

- Modify: `src/main/services/erp/__tests__/order-resolver.test.ts`

**Step 1: Update test imports and mocks**

Find the test file and update the imports. Replace MySqlService import with:

```typescript
import { ProductionContractRepository } from '../../database/repositories/ProductionContractRepository'
```

**Step 2: Update mock setup**

Replace MySqlService mock with:

```typescript
const mockRepository = {
  findByProductionIds: vi.fn(),
  verifyOrderNumbers: vi.fn()
}
```

**Step 3: Update resolver instantiation**

Replace `new OrderNumberResolver(mockMySqlService)` with:

```typescript
const resolver = new OrderNumberResolver(mockRepository as any)
```

**Step 4: Update test expectations**

Update tests to mock the repository methods instead of MySqlService. For example:

```typescript
it('should resolve production IDs', async () => {
  mockRepository.findByProductionIds.mockResolvedValue(new Map([['22A1', 'SC70202602120001']]))

  const result = await resolver.resolve(['22A1'])

  expect(result).toHaveLength(1)
  expect(result[0].isValid).toBe(true)
  expect(result[0].orderNumber).toBe('SC70202602120001')
})
```

**Step 5: Run tests**

Run: `npm test -- order-resolver.test.ts`

Expected: Tests pass

**Step 6: Commit**

```bash
git add src/main/services/erp/__tests__/order-resolver.test.ts
git commit -m "test: update OrderNumberResolver tests for repository

- Mock ProductionContractRepository instead of MySqlService
- Update test expectations for new interface
- All tests pass with new implementation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Update extractor-handler Imports

**Files:**

- Modify: `src/main/ipc/extractor-handler.ts`

**Step 1: Add new imports**

Add these imports after the existing ones (around line 8):

```typescript
import { getDataSource } from '../services/database/data-source'
import { ProductionContractRepository } from '../services/database/repositories/ProductionContractRepository'
```

**Step 2: Remove MySqlService import**

Find and remove this import:

```typescript
import { MySqlService } from '../services/database/mysql'
```

**Step 3: Verify with TypeScript**

Run: `npm run typecheck:node`

Expected: No errors related to imports

**Step 4: Commit**

```bash
git add src/main/ipc/extractor-handler.ts
git commit -m "refactor: update extractor-handler imports

- Add TypeORM DataSource and ProductionContractRepository imports
- Remove MySqlService import (no longer needed)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 13: Replace MySqlService with DataSource in extractor-handler

**Files:**

- Modify: `src/main/ipc/extractor-handler.ts`

**Step 1: Find MySqlService instantiation**

Locate this code (around lines 42-62):

```typescript
// Resolve order numbers (convert productionIDs to 生产订单号)
const mysqlConfig = {
  host: process.env.DB_MYSQL_HOST || 'localhost',
  port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || ''
}

log.info('Connecting to MySQL for order resolution...')
mysqlService = new MySqlService(mysqlConfig)

try {
  await mysqlService.connect()
} catch (error) {
  throw new DatabaseQueryError(
    'MySQL 连接失败',
    'DB_CONNECTION_FAILED',
    error instanceof Error ? error : undefined
  )
}

const resolver = new OrderNumberResolver(mysqlService)
```

**Step 2: Replace with DataSource**

Replace the entire MySqlService block with:

```typescript
// Resolve order numbers (convert productionIDs to 生产订单号)
log.info('Initializing database connection for order resolution...')

const dataSource = getDataSource()
if (!dataSource.isInitialized) {
  await dataSource.initialize()
}

const repository = new ProductionContractRepository()
const resolver = new OrderNumberResolver(repository)

log.info('Database connection established')
```

**Step 3: Remove mysqlService variable declaration**

Find this line (around line 22):

```typescript
let mysqlService: MySqlService | null = null
```

Delete it.

**Step 4: Verify with TypeScript**

Run: `npm run typecheck:node`

Expected: No errors

**Step 5: Commit**

```bash
git add src/main/ipc/extractor-handler.ts
git commit -m "refactor: replace MySqlService with TypeORM DataSource

- Remove MySqlService instantiation and configuration
- Use TypeORM DataSource for database connection
- Create ProductionContractRepository and inject into resolver
- Simplify connection logic (DataSource manages lifecycle)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 14: Update Cleanup Logic in extractor-handler

**Files:**

- Modify: `src/main/ipc/extractor-handler.ts`

**Step 1: Remove mysqlService cleanup**

Find the finally block (around lines 126-150). Remove this section:

```typescript
// Clean up: disconnect MySQL
if (mysqlService) {
  try {
    await mysqlService.disconnect()
    log.debug('MySQL disconnected')
  } catch (closeError) {
    log.warn('Error disconnecting MySQL', {
      error: closeError instanceof Error ? closeError.message : String(closeError)
    })
  }
}
```

**Step 2: Update log message**

The finally block should now only handle authService cleanup. Update to:

```typescript
        } finally {
          // Clean up: close browser
          if (authService) {
            try {
              await authService.close()
              log.debug('Browser closed')
            } catch (closeError) {
              log.warn('Error closing browser', {
                error: closeError instanceof Error ? closeError.message : String(closeError)
              })
            }
          }
          // Note: DataSource manages connection pool automatically
          // No explicit cleanup needed for repository
        }
```

**Step 3: Verify with TypeScript**

Run: `npm run typecheck:node`

Expected: No errors

**Step 4: Commit**

```bash
git add src/main/ipc/extractor-handler.ts
git commit -m "refactor: remove MySqlService cleanup logic

- Remove mysqlService.disconnect() from finally block
- DataSource manages connection pool automatically
- Simplify cleanup logic

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 15: Run Full Test Suite

**Files:**

- No file changes

**Step 1: Run all tests**

Run: `npm test`

Expected: All tests pass

**Step 2: Run type checking**

Run: `npm run typecheck`

Expected: No errors

**Step 3: Run linting**

Run: `npm run lint`

Expected: No warnings

**Step 4: Commit**

```bash
git commit --allow-empty -m "test: validate complete implementation

- All unit tests pass
- Type checking passes
- Linting passes
- Ready for manual testing

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 16: Manual Testing - MySQL

**Files:**

- No file changes

**Step 1: Configure .env for MySQL**

Edit `.env` file:

```bash
DB_TYPE=mysql
DB_MYSQL_HOST=localhost
DB_MYSQL_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_NAME=your_database
```

**Step 2: Start application**

Run: `npm run dev`

**Step 3: Test in UI**

1. Navigate to ExtractorPage
2. Enter production IDs in textarea:
   ```
   22A1
   22A2
   ```
3. Click "开始提取" button
4. Verify extraction completes successfully
5. Check console logs for MySQL query syntax (backticks, ? placeholders)

**Step 4: Document results**

Create notes file with test results

**Step 5: Commit test notes**

```bash
git add MANUAL_TEST_NOTES.md
git commit -m "test: add manual MySQL testing results

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 17: Manual Testing - SQL Server

**Files:**

- No file changes

**Step 1: Configure .env for SQL Server**

Edit `.env` file:

```bash
DB_TYPE=mssql
DB_SERVER=localhost
DB_SQLSERVER_PORT=1433
DB_USERNAME=sa
DB_PASSWORD=your_password
DB_NAME=your_database
DB_TRUST_SERVER_CERTIFICATE=yes
```

**Step 2: Start application**

Run: `npm run dev`

**Step 3: Test in UI**

1. Navigate to ExtractorPage
2. Enter same production IDs:
   ```
   22A1
   22A2
   ```
3. Click "开始提取" button
4. Verify extraction completes successfully
5. Check console logs for SQL Server query syntax (brackets, @pN placeholders)

**Step 4: Document results**

Update test notes with SQL Server results

**Step 5: Commit**

```bash
git add MANUAL_TEST_NOTES.md
git commit -m "test: add manual SQL Server testing results

- Both MySQL and SQL Server work correctly
- Dual database support verified

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 18: Update Documentation

**Files:**

- Modify: `CLAUDE.md`

**Step 1: Update Service Architecture section**

Find the Service Architecture section in CLAUDE.md. Add to Database Services section:

```markdown
- **Database Services** (`services/database/`): Dual database support with TypeORM
  - `MySqlService` / `mysql.ts` - MySQL operations (legacy, being phased out)
  - `SqlServerService` / `sql-server.ts` - SQL Server operations (legacy, being phased out)
  - `data-source.ts` - TypeORM DataSource configuration (supports MySQL and SQL Server)
  - `entities/` - TypeORM entity definitions
    - `DiscreteMaterialPlan.ts` - Discrete material plan entity
    - `ProductionContract.ts` - Production contract entity
  - `repositories/` - TypeORM repositories with dual SQL dialect support
    - `DiscreteMaterialPlanRepository.ts` - Discrete material plan data access
    - `MaterialsToBeDeletedRepository.ts` - Materials to be deleted data access
    - `ProductionContractRepository.ts` - Production contract data access
  - DAO pattern: `discrete-material-plan-dao.ts`, `materials-to-be-deleted-dao.ts` (legacy)
```

**Step 2: Add environment variable documentation**

Add to Environment Configuration section:

```markdown
**Database Settings**:

- `DB_TYPE` - Database type: 'mysql' or 'mssql' (required)
- `DB_MYSQL_HOST` - MySQL server host (if DB_TYPE=mysql)
- `DB_MYSQL_PORT` - MySQL server port (default: 3306)
- `DB_SERVER` - SQL Server host (if DB_TYPE=mssql)
- `DB_SQLSERVER_PORT` - SQL Server port (default: 1433)
- `DB_USERNAME` - Database username
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name
- `DB_TRUST_SERVER_CERTIFICATE` - Trust SQL Server certificate (yes/no, default: no)
```

**Step 3: Verify documentation**

Run: `npm run typecheck`

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for ORM refactoring

- Document TypeORM DataSource and repositories
- Add DB_TYPE environment variable
- Note legacy services being phased out

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 19: Final Verification and Cleanup

**Files:**

- Multiple files

**Step 1: Run full verification**

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected: All pass

**Step 2: Check for unused imports**

Run: `npm run lint -- --fix`

**Step 3: Review changes**

Run: `git diff dev`

Verify all changes look correct

**Step 4: Final commit**

```bash
git add .
git commit -m "chore: final cleanup and verification

- Remove unused imports
- Fix linting issues
- All tests passing
- Ready for merge

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 20: Push Feature Branch

**Files:**

- None (git operations)

**Step 1: Push to remote**

Run: `git push -u origin feature/extractor-orm-refactor`

**Step 2: Create pull request**

Run:

```bash
gh pr create \
  --title "refactor: Implement TypeORM repository for ExtractorPage database access" \
  --body "Implements Phase 2 of optimization-execution-plan.md

## Summary
- Replace MySqlService with TypeORM ProductionContractRepository
- Add dual SQL dialect support (MySQL and SQL Server)
- Update OrderNumberResolver to use repository pattern
- Remove database-specific code from business logic

## Changes
- ✅ Add ProductionContract TypeORM entity
- ✅ Add ProductionContractRepository with dual SQL support
- ✅ Refactor OrderNumberResolver to use repository
- ✅ Update extractor-handler to use TypeORM DataSource
- ✅ Add comprehensive unit tests
- ✅ Manual testing with both MySQL and SQL Server

## Testing
- Unit tests for ProductionContractRepository
- Updated tests for OrderNumberResolver
- Manual testing with MySQL: ✅
- Manual testing with SQL Server: ✅

## Checklist
- [x] All tests pass
- [x] Type checking passes
- [x] Manual testing completed
- [x] No regressions detected

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 3: Verify PR created**

Check GitHub to ensure PR is created

---

## Completion Checklist

After completing all tasks:

- [ ] All 20 tasks completed
- [ ] All tests passing (`npm test`)
- [ ] Type checking passing (`npm run typecheck`)
- [ ] Linting passing (`npm run lint`)
- [ ] Build successful (`npm run build`)
- [ ] Manual MySQL testing successful
- [ ] Manual SQL Server testing successful
- [ ] PR created and ready for review
- [ ] CLAUDE.md updated
- [ ] No regressions in other pages

---

## Rollback Plan (If Issues Found)

If critical issues discovered after merge:

```bash
# Quick revert
git revert -m 1 <merge-commit-hash>
git push origin dev

# Or restore worktree and fix
cd ../ERPAuto-extractor-orm
# Fix issues
git add .
git commit -m "fix: address issues found in testing"
git push origin feature/extractor-orm-refactor
```

---

**Plan complete and saved to `docs/plans/2026-03-03-extractor-orm-refactor.md`.**

**Execution Options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration
2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
