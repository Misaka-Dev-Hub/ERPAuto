# ExtractorPage Database Access Refactoring Design

**Date**: 2026-03-03
**Author**: Claude Code
**Status**: Design Approved
**Related Issue**: Phase 2 of optimization-execution-plan.md

## Executive Summary

This document outlines the refactoring of the "开始提取" (Start Extraction) button's database access logic in ExtractorPage to support both MySQL and SQL Server using TypeORM. The refactoring replaces the direct MySqlService dependency with a TypeORM-based repository pattern, enabling database-agnostic operations and improved type safety.

**Approach**: Direct Replacement - Complete replacement of MySqlService with TypeORM repository in a single step.

---

## 1. Architecture Overview

### 1.1 Current Architecture

```
ExtractorPage.tsx
    ↓ (IPC call)
extractor-handler.ts
    ↓ (creates MySqlService)
OrderNumberResolver (depends on MySqlService)
    ↓ (MySQL queries only)
Database: productionContractData_26年压力表合同数据
```

**Problem**: OrderNumberResolver only supports MySQL via MySqlService, limiting database flexibility.

### 1.2 New Architecture

```
ExtractorPage.tsx
    ↓ (IPC call)
extractor-handler.ts
    ↓ (uses TypeORM DataSource)
OrderNumberResolver (depends on ProductionContractRepository)
    ↓ (TypeORM queries, auto-selects MySQL/SQL Server)
Database: productionContractData_26年压力表合同数据
```

**Solution**: TypeORM repository with dual SQL dialect support based on `DB_TYPE` environment variable.

### 1.3 Key Changes

1. **New TypeORM Entity**: `ProductionContract` entity in `src/main/services/database/entities/`
2. **New Repository**: `ProductionContractRepository` in `src/main/services/database/repositories/`
3. **Updated OrderNumberResolver**: Remove MySqlService dependency, inject Repository
4. **Updated extractor-handler.ts**: Use TypeORM DataSource instead of MySqlService
5. **Environment-based**: `DB_TYPE` env var controls MySQL vs SQL Server selection

### 1.4 Data Flow

1. User clicks "开始提取" → IPC call to `extractor:run`
2. Handler checks `DB_TYPE` env var (mysql/mssql)
3. TypeORM DataSource initialized with correct database type
4. `ProductionContractRepository` created from DataSource
5. `OrderNumberResolver` uses Repository to query order numbers
6. Repository automatically uses correct SQL dialect based on database type

---

## 2. Component Specifications

### 2.1 ProductionContract Entity (New File)

**Location**: `src/main/services/database/entities/ProductionContract.ts`

**Purpose**: TypeORM entity representing the production contract database table.

**Implementation**:

```typescript
import { Entity, PrimaryColumn, Column, Index } from 'typeorm'

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

**Schema Definition**:
- Fixed table name using existing convention
- Both columns indexed for query performance
- Entity registered in `data-source.ts` entities array

**Dependencies**: None (pure entity)

---

### 2.2 ProductionContractRepository (New File)

**Location**: `src/main/services/database/repositories/ProductionContractRepository.ts`

**Purpose**: Repository layer with dual SQL dialect support for order resolution queries.

**Interface**:

```typescript
export class ProductionContractRepository {
  /**
   * Find order numbers by production IDs
   * @param productionIds - Array of production IDs (总排号)
   * @returns Map of productionId -> orderNumber
   */
  async findByProductionIds(productionIds: string[]): Promise<Map<string, string>>

  /**
   * Verify that order numbers exist in database
   * @param orderNumbers - Array of order numbers (生产订单号)
   * @returns Array of valid order numbers
   */
  async verifyOrderNumbers(orderNumbers: string[]): Promise<string[]>

  /**
   * Find single contract by production ID
   * @param productionId - Production ID (总排号)
   * @returns ProductionContract entity or null
   */
  async findByProductionId(productionId: string): Promise<ProductionContract | null>
}
```

**Database-Specific Queries**:

**For MySQL dialect**:
```sql
SELECT `总排号`, `生产订单号`
FROM `productionContractData_26年压力表合同数据`
WHERE `总排号` IN (?, ?, ?)
```

**For SQL Server dialect**:
```sql
SELECT [总排号], [生产订单号]
FROM [productionContractData_26年压力表合同数据]
WHERE [总排号] IN (@p0, @p1, @p2)
```

**Implementation Details**:
- Detects database type from DataSource
- Uses appropriate SQL syntax (backticks for MySQL, brackets for SQL Server)
- Handles parameter binding differences (? vs @pN)
- Batches large queries (2000 records per batch)
- Comprehensive error handling with structured logging

**Dependencies**:
- `DataSource` from `data-source.ts`
- `ProductionContract` entity
- `createLogger` from `../../logger`

---

### 2.3 OrderNumberResolver (Refactored)

**Location**: `src/main/services/erp/order-resolver.ts`

**Changes**:

**Before**:
```typescript
import { MySqlService } from '../database/mysql'

export class OrderNumberResolver {
  private mysqlService: MySqlService

  constructor(mysqlService: MySqlService) {
    this.mysqlService = mysqlService
  }

  private async resolveProductionIds(productionIds: string[]): Promise<OrderMapping[]> {
    // MySQL-specific query logic
    const placeholders = productionIds.map(() => '?').join(', ')
    const query = `SELECT \`${DB_CONFIG.FIELD_PRODUCTION_ID}\`, ...`
    const result = await this.mysqlService.query(query, productionIds)
    // ...
  }
}
```

**After**:
```typescript
import { ProductionContractRepository } from '../database/repositories/ProductionContractRepository'

export class OrderNumberResolver {
  constructor(private repository: ProductionContractRepository) {}

  private async resolveProductionIds(productionIds: string[]): Promise<OrderMapping[]> {
    // Repository handles database-specific logic
    const resultMap = await this.repository.findByProductionIds(productionIds)
    // Build mappings from resultMap
  }
}
```

**Method Changes**:
- `resolveProductionIds()`: Now calls `repository.findByProductionIds()`
- `verifyOrderNumbers()`: Now calls `repository.verifyOrderNumbers()`
- All MySQL-specific query logic removed
- Error handling adapted for Repository exceptions

**Benefits**:
- Database-agnostic (works with MySQL or SQL Server)
- Cleaner separation of concerns
- Type-safe repository interface
- Testable with mocked repository

---

### 2.4 extractor-handler.ts (Refactored)

**Location**: `src/main/ipc/extractor-handler.ts`

**Changes**:

**Before**:
```typescript
import { MySqlService } from '../services/database/mysql'

// In handler:
const mysqlConfig = {
  host: process.env.DB_MYSQL_HOST || 'localhost',
  port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || ''
}

mysqlService = new MySqlService(mysqlConfig)
await mysqlService.connect()
const resolver = new OrderNumberResolver(mysqlService)

// In finally block:
if (mysqlService) {
  await mysqlService.disconnect()
}
```

**After**:
```typescript
import { getDataSource } from '../services/database/data-source'
import { ProductionContractRepository } from '../services/database/repositories/ProductionContractRepository'

// In handler:
const dataSource = getDataSource()
if (!dataSource.isInitialized) {
  await dataSource.initialize()
}
const repository = new ProductionContractRepository()
const resolver = new OrderNumberResolver(repository)

// In finally block:
// No cleanup needed - DataSource manages connection pool
```

**Cleanup**:
- Remove `MySqlService` import
- Remove mysql configuration parsing
- Remove `mysqlService.disconnect()` from finally block
- DataSource manages connection lifecycle automatically

---

## 3. Data Flow

### 3.1 Complete Flow: "开始提取" Button Click

```
┌─────────────────┐
│ ExtractorPage   │
│  (Renderer)     │
└────────┬────────┘
         │ 1. User clicks "开始提取"
         │    window.electron.extractor.runExtractor({
         │      orderNumbers: ['22A1', 'SC70202602120085'],
         │      batchSize: 100
         │    })
         ↓
┌─────────────────────────────────────────┐
│ extractor-handler.ts (Main Process)     │
│  - withErrorHandling wrapper            │
└────────┬────────────────────────────────┘
         │ 2. Check environment variables
         │    ERP_URL, ERP_USERNAME, ERP_PASSWORD
         │
         │ 3. Get TypeORM DataSource
         │    const dataSource = getDataSource()
         │    reads DB_TYPE from .env → 'mysql' or 'mssql'
         │
         │ 4. Initialize DataSource
         │    await dataSource.initialize()
         │    → Creates connection pool to MySQL or SQL Server
         │
         │ 5. Create Repository
         │    const repository = new ProductionContractRepository()
         │    → Repository uses DataSource for queries
         │
         │ 6. Create Resolver
         │    const resolver = new OrderNumberResolver(repository)
         │
         │ 7. Resolve order numbers
         │    const mappings = await resolver.resolve(input.orderNumbers)
         ↓
┌────────────────────────────────────────────┐
│ OrderNumberResolver.resolve()              │
│  - Categorizes inputs by type              │
│  - Delegates to repository for DB lookups  │
└────────┬───────────────────────────────────┘
         │ 8. For each input:
         │    - Recognize type (productionId/orderNumber/unknown)
         │      using regex patterns
         │    - Categorize into productionIds[] and orderNumbers[]
         │
         │ 9. Resolve production IDs
         │    const productionIdMappings = await this.resolveProductionIds(productionIds)
         ↓
┌────────────────────────────────────────────┐
│ ProductionContractRepository               │
│  .findByProductionIds(['22A1', '22A2'])    │
└────────┬───────────────────────────────────┘
         │ 10. Get repository from DataSource
         │     const repo = await this.getRepository()
         │
         │ 11. Check DB_TYPE from DataSource.options.type
         │
         ├─┬ If 'mysql':
         │ │ 12a. Build MySQL query:
         │ │     SELECT `总排号`, `生产订单号`
         │ │     FROM `productionContractData_26年压力表合同数据`
         │ │     WHERE `总排号` IN (?, ?)
         │ │
         │ │ 13a. Execute with TypeORM QueryBuilder
         │ │     const results = await repo.query(query, productionIds)
         │ │     → Returns: [{总排号: '22A1', 生产订单号: 'SC7020...'}, ...]
         │ │
         │ │ 14a. Build Map<productionId, orderNumber>
         │ │     return new Map([['22A1', 'SC7020...'], ['22A2', 'SC7020...']])
         │ │
         └─┬ If 'mssql':
           │ 12b. Build SQL Server query:
           │     SELECT [总排号], [生产订单号]
           │     FROM [productionContractData_26年压力表合同数据]
           │     WHERE [总排号] IN (@p0, @p1)
           │
           │ 13b. Execute with TypeORM QueryBuilder
           │     const results = await repo.query(query, productionIds)
           │     → Returns: [{总排号: '22A1', 生产订单号: 'SC7020...'}, ...]
           │
           │ 14b. Build Map<productionId, orderNumber>
           │     return new Map([['22A1', 'SC7020...'], ['22A2', 'SC7020...']])
         │
         │ 15. Return Map to resolver
         ↓
┌────────────────────────────────────────────┐
│ OrderNumberResolver                        │
│  .resolveProductionIds()                   │
└────────┬───────────────────────────────────┘
         │ 16. Build OrderMapping[] from resultMap
         │     - For each productionId in input:
         │       - If found in resultMap: isValid=true, orderNumber=...
         │       - If not found: isValid=false, error='Not found'
         │
         │ 17. Verify order numbers exist
         │     const verifiedNumbers = await this.verifyOrderNumbers(orderNumbers)
         ↓
┌────────────────────────────────────────────┐
│ ProductionContractRepository               │
│  .verifyOrderNumbers(['SC70202602120085']) │
└────────┬───────────────────────────────────┘
         │ 18. Same DB_TYPE logic as above
         │     - MySQL: `SELECT `生产订单号` FROM ... WHERE `生产订单号` IN (?)`
         │     - SQL Server: `SELECT [生产订单号] FROM ... WHERE [生产订单号] IN (@p0)`
         │
         │ 19. Return verified order numbers array
         ↓
┌────────────────────────────────────────────┐
│ OrderNumberResolver                        │
└────────┬───────────────────────────────────┘
         │ 20. Combine all mappings
         │     - Production ID mappings with resolved order numbers
         │     - Direct order number mappings (verified)
         │     - Invalid format mappings
         │
         │ 21. Return complete OrderMapping[]
         ↓
┌────────────────────────────────────────────┐
│ extractor-handler.ts                       │
└────────┬───────────────────────────────────┘
         │ 22. Extract valid order numbers
         │      const validOrderNumbers = resolver.getValidOrderNumbers(mappings)
         │      → ['SC70202602120085', 'SC70202602120086']
         │
         │ 23. Extract warnings
         │      const warnings = resolver.getWarnings(mappings)
         │
         │ 24. Login to ERP (existing flow, unchanged)
         │      authService = new ErpAuthService(...)
         │      await authService.login()
         │
         │ 25. Run extraction (existing flow, unchanged)
         │      extractor = new ExtractorService(authService)
         │      result = await extractor.extract({
         │        orderNumbers: validOrderNumbers,
         │        batchSize: input.batchSize
         │      })
         │
         │ 26. Add warnings to result
         │      result.errors = [...warnings, ...result.errors]
         │
         │ 27. Return result to renderer
         │      {
         │        success: true,
         │        data: {
         │          downloadedFiles: [...],
         │          mergedFile: null,
         │          recordCount: 150,
         │          errors: []
         │        }
         │      }
         ↓
┌─────────────────┐
│ ExtractorPage   │
│  (Renderer)     │
└────────┬────────┘
         │ 28. Display results
         │     setResult(response.data)
         │     → Shows downloaded files count, record count, errors
```

### 3.2 Error Handling Flow

```
┌─────────────────────────────────────────┐
│ ProductionContractRepository            │
│  .findByProductionIds(['22A1'])         │
└────────┬────────────────────────────────┘
         │ Query attempt
         │
         ├─┬ Success
         │ │ → Return Map<string, string>
         │ │
         └─┬ Error (database connection, query syntax, etc.)
           │
           │ 1. Log error with context
           │    log.error('Query failed', {
           │      error: error.message,
           │      dbType: 'mysql|mssql',
           │      query: 'SELECT...',
           │      productionIdCount: 1
           │    })
           │
           │ 2. Throw DatabaseQueryError
           │    throw new DatabaseQueryError(
           │      'Failed to resolve production IDs',
           │      'DB_QUERY_FAILED',
           │      error
           │    )
           ↓
┌─────────────────────────────────────────┐
│ OrderNumberResolver                     │
│  .resolveProductionIds()                │
└────────┬────────────────────────────────┘
         │ 3. Catch error (optional, can re-throw)
         │
         │ 4. Return failed mappings
         │    return productionIds.map(pid => ({
         │      input: pid,
         │      productionId: pid,
         │      isValid: false,
         │      error: '数据库查询失败：...',
         │      inputType: 'productionId'
         │    }))
         ↓
┌─────────────────────────────────────────┐
│ extractor-handler.ts                    │
│  (withErrorHandling wrapper)            │
└────────┬────────────────────────────────┘
         │ 5. Any error thrown in handler
         │
         │ 6. withErrorHandling wrapper catches
         │
         │ 7. Return IPC error response
         │    {
         │      success: false,
         │      error: 'Failed to resolve production IDs: 数据库查询失败：...',
         │      code: 'DB_QUERY_FAILED'
         │    }
         ↓
┌─────────────────┐
│ ExtractorPage   │
└────────┬────────┘
         │ 8. Receive response
         │
         │ 9. Check success flag
         │    if (!response.success) {
         │      setError(response.error)
         │    }
         │
         │ 10. Display error to user
         │     → Red error message below button
```

---

## 4. Testing Strategy

### 4.1 Unit Tests - ProductionContractRepository

**Location**: `src/main/services/database/repositories/__tests__/ProductionContractRepository.test.ts`

**Test Cases**:

1. **findByProductionIds - MySQL**
   - ✅ Returns correct mappings for valid production IDs
   - ✅ Returns empty map for non-existent production IDs
   - ✅ Handles empty input array
   - ✅ Handles batch queries (2000+ records)
   - ✅ Uses correct MySQL query syntax (backticks, ? placeholders)

2. **findByProductionIds - SQL Server**
   - ✅ Returns correct mappings for valid production IDs
   - ✅ Returns empty map for non-existent production IDs
   - ✅ Handles empty input array
   - ✅ Uses correct SQL Server query syntax (brackets, @params)

3. **verifyOrderNumbers - MySQL**
   - ✅ Returns subset of valid order numbers
   - ✅ Returns empty array for invalid order numbers
   - ✅ Handles empty input array

4. **verifyOrderNumbers - SQL Server**
   - ✅ Returns subset of valid order numbers
   - ✅ Returns empty array for invalid order numbers
   - ✅ Handles empty input array

5. **findByProductionId**
   - ✅ Returns entity for valid production ID
   - ✅ Returns null for non-existent production ID

6. **Error Handling**
   - ✅ Throws DatabaseQueryError on connection failure
   - ✅ Logs errors with proper context (dbType, query, params)
   - ✅ Handles malformed data gracefully
   - ✅ Returns empty results on query errors (doesn't crash)

**Test Setup**:
- Use existing TypeORM test database (configured in `.env.test`)
- Seed test data before each test:
  ```sql
  INSERT INTO productionContractData_26年压力表合同数据 (总排号, 生产订单号)
  VALUES ('22A1', 'SC70202602120085'), ('22A2', 'SC70202602120086')
  ```
- Clean up after each test
- Mock both MySQL and SQL Server connections if actual DB not available

---

### 4.2 Unit Tests - OrderNumberResolver

**Location**: `src/main/services/erp/__tests__/order-resolver.test.ts`

**Test Cases**:

1. **recognizeType()**
   - ✅ Recognizes valid production IDs (22A123, 23B456)
   - ✅ Recognizes valid order numbers (SC70202602120085)
   - ✅ Returns 'unknown' for invalid formats

2. **resolve() with mocked repository**
   - ✅ Resolves production IDs to order numbers via repository
   - ✅ Passes through order numbers unchanged (with verification)
   - ✅ Marks unrecognized formats as invalid
   - ✅ Returns correct error messages for database errors
   - ✅ Handles mixed input (production IDs + order numbers)

3. **getValidOrderNumbers()**
   - ✅ Extracts valid order numbers from mappings
   - ✅ Filters out invalid mappings
   - ✅ Returns empty array for all-invalid mappings

4. **getWarnings()**
   - ✅ Extracts error messages from invalid mappings
   - ✅ Returns empty array for all-valid mappings

5. **getStats()**
   - ✅ Calculates correct statistics for various scenarios
   - ✅ Handles all edge cases (empty, all valid, all invalid)

**Test Setup**:
- Mock ProductionContractRepository:
  ```typescript
  const mockRepository = {
    findByProductionIds: vi.fn().mockResolvedValue(new Map([['22A1', 'SC7020...']])),
    verifyOrderNumbers: vi.fn().mockResolvedValue(['SC7020...'])
  }
  const resolver = new OrderNumberResolver(mockRepository)
  ```
- Test business logic independently of database

---

### 4.3 Integration Tests - extractor-handler

**Location**: `src/main/ipc/__tests__/extractor-handler.integration.test.ts`

**Test Scenarios**:

1. **MySQL Integration**
   - ✅ End-to-end extraction with MySQL database
   - ✅ Order resolution with production IDs only
   - ✅ Order resolution with order numbers only
   - ✅ Mixed input handling (production IDs + order numbers)
   - ✅ Invalid production ID handling
   - ✅ Empty order list handling

2. **SQL Server Integration**
   - ✅ End-to-end extraction with SQL Server database
   - ✅ Order resolution with production IDs only
   - ✅ Order resolution with order numbers only
   - ✅ Mixed input handling
   - ✅ Invalid production ID handling

3. **Error Scenarios**
   - ✅ Database connection failure (MySQL)
   - ✅ Database connection failure (SQL Server)
   - ✅ Invalid order numbers
   - ✅ ERP connection failure (existing tests)
   - ✅ ERP login failure (existing tests)

**Test Setup**:
- Use integration test databases
- Mock ERP service (focus on database layer)
- Test real TypeORM queries

---

### 4.4 Manual Testing Procedure

**Prerequisites**:
1. Create git worktree for isolated testing
2. Configure both MySQL and SQL Server test databases
3. Seed test data in both databases:
   ```sql
   INSERT INTO productionContractData_26年压力表合同数据 (总排号, 生产订单号)
   VALUES
     ('22A1', 'SC70202602120001'),
     ('22A2', 'SC70202602120002'),
     ('22A3', 'SC70202602120003');
   ```

**Test Steps**:

**Step 1: MySQL Testing**
```bash
# Set MySQL configuration in .env
DB_TYPE=mysql
DB_MYSQL_HOST=localhost
DB_MYSQL_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_NAME=test_db

# Run application
npm run dev

# Test in UI:
# 1. Navigate to ExtractorPage
# 2. Enter production IDs: "22A1", "22A2"
# 3. Click "开始提取"
# 4. Verify order numbers resolved correctly (SC70202602120001, SC70202602120002)
# 5. Check logs for MySQL query syntax (backticks, ? placeholders)
# 6. Verify extraction completes successfully
```

**Step 2: SQL Server Testing**
```bash
# Set SQL Server configuration in .env
DB_TYPE=mssql
DB_SERVER=localhost
DB_SQLSERVER_PORT=1433
DB_USERNAME=sa
DB_PASSWORD=your_password
DB_NAME=test_db
DB_TRUST_SERVER_CERTIFICATE=yes

# Run application
npm run dev

# Test in UI:
# 1. Navigate to ExtractorPage
# 2. Enter production IDs: "22A1", "22A2"
# 3. Click "开始提取"
# 4. Verify order numbers resolved correctly
# 5. Check logs for SQL Server query syntax (brackets, @params)
# 6. Verify extraction completes successfully
```

**Step 3: Error Handling**
```bash
# Test with invalid production ID
# Input: "INVALID123"
# Expected: Error message "无法识别的格式" or "数据库中未找到生产 ID"

# Test with empty input
# Input: (empty)
# Expected: Validation message "请输入至少一个订单号"

# Test with database disconnected
# Action: Stop MySQL/SQL Server service
# Expected: Error "数据库连接失败" or "数据库查询失败"
```

**Step 4: Performance**
```bash
# Seed large dataset (1000+ records)
# Input: 1000 production IDs

# Verify:
# - Query batching works (batches of 2000)
# - Memory usage remains stable
# - Response time < 5 seconds
# - No memory leaks
```

**Step 5: Edge Cases**
```bash
# Test duplicate production IDs
# Input: "22A1", "22A1"
# Expected: Both resolved correctly (idempotent)

# Test mixed valid/invalid
# Input: "22A1", "INVALID", "22A2"
# Expected: 2 valid, 1 invalid with warning

# Test order numbers directly
# Input: "SC70202602120001"
# Expected: Verified and passed through
```

---

### 4.5 Type Safety Verification

**Commands**:
```bash
# Run TypeScript checks
npm run typecheck

# Expected: No errors
# Verify specifically:
# - Type mismatch in repository methods
# - Missing type annotations
# - Incorrect entity column types
# - DataSource type inference
```

**Expected Output**:
```
src/main/services/database/entities/ProductionContract.ts:12:15 - error: No errors
src/main/services/database/repositories/ProductionContractRepository.ts:45:10 - error: No errors
src/main/services/erp/order-resolver.ts:78:25 - error: No errors
src/main/ipc/extractor-handler.ts:52:30 - error: No errors
```

---

### 4.6 Automated Test Coverage

**Commands**:
```bash
# Run all unit tests
npm run test

# Run with coverage
npm run test:coverage

# Expected coverage targets:
# - ProductionContractRepository: >90%
# - OrderNumberResolver: >85%
# - extractor-handler: >80% (integration tests)
```

---

## 5. Implementation Phases

### Phase 1: Foundation (Worktree Setup & Entity Creation)
**Goal**: Create isolated work environment and core entity

**Tasks**:
1. Create new git worktree: `feature/extractor-orm-refactor`
2. Create `ProductionContract.ts` entity
3. Register entity in `data-source.ts`
4. Run typecheck to verify entity definitions
5. Commit: "feat: add ProductionContract TypeORM entity"

**Files Created**:
- `src/main/services/database/entities/ProductionContract.ts`

**Files Modified**:
- `src/main/services/database/data-source.ts`

**Verification**:
```bash
npm run typecheck  # Should pass with no errors
```

---

### Phase 2: Repository Implementation
**Goal**: Build ProductionContractRepository with dual SQL support

**Tasks**:
1. Create `ProductionContractRepository.ts`
2. Implement `findByProductionIds()` with MySQL dialect
3. Implement `findByProductionIds()` with SQL Server dialect
4. Implement `verifyOrderNumbers()` with both dialects
5. Implement `findByProductionId()`
6. Add comprehensive error handling and logging
7. Write unit tests for repository
8. Run tests: `npm run test`
9. Commit: "feat: add ProductionContractRepository with dual SQL support"

**Files Created**:
- `src/main/services/database/repositories/ProductionContractRepository.ts`
- `src/main/services/database/repositories/__tests__/ProductionContractRepository.test.ts`

**Verification**:
```bash
npm run test              # All repository tests pass
npm run test:coverage     # Coverage >90%
```

---

### Phase 3: Resolver Refactoring
**Goal**: Update OrderNumberResolver to use Repository

**Tasks**:
1. Refactor `OrderNumberResolver` constructor to accept Repository
2. Update `resolveProductionIds()` to use repository methods
3. Update `verifyOrderNumbers()` to use repository methods
4. Remove MySqlService import and dependency
5. Remove all MySQL-specific query logic
6. Update unit tests to mock Repository instead of MySqlService
7. Run tests: `npm run test`
8. Commit: "refactor: migrate OrderNumberResolver to TypeORM repository"

**Files Modified**:
- `src/main/services/erp/order-resolver.ts`
- `src/main/services/erp/__tests__/order-resolver.test.ts`

**Verification**:
```bash
npm run test              # All resolver tests pass
npm run typecheck         # No type errors
```

---

### Phase 4: Handler Integration
**Goal**: Update extractor-handler to use TypeORM DataSource

**Tasks**:
1. Update `extractor-handler.ts` imports
2. Replace MySqlService instantiation with DataSource
3. Remove MySQL configuration parsing (host, port, user, password)
4. Update cleanup logic (remove mysqlService.disconnect())
5. Update error handling for TypeORM exceptions
6. Manual test with both MySQL and SQL Server
7. Update integration tests
8. Commit: "refactor: use TypeORM DataSource in extractor-handler"

**Files Modified**:
- `src/main/ipc/extractor-handler.ts`
- `src/main/ipc/__tests__/extractor-handler.integration.test.ts`

**Verification**:
```bash
# Manual testing
DB_TYPE=mysql npm run dev     # Test with MySQL
DB_TYPE=mssql npm run dev     # Test with SQL Server

# Automated tests
npm run test                  # All tests pass
```

---

### Phase 5: Testing & Validation
**Goal**: Comprehensive testing before merge

**Tasks**:
1. Run full test suite: `npm run test`
2. Run typecheck: `npm run typecheck`
3. Run linting: `npm run lint`
4. Manual testing with MySQL (see Section 4.4)
5. Manual testing with SQL Server
6. Performance testing with 1000+ records
7. Edge case testing (duplicates, invalid inputs, etc.)
8. Fix any issues found
9. Regression testing (verify cleaner page still works)
10. Final commit: "test: complete validation of ORM refactor"

**Verification Checklist**:
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Type checking passes with no errors
- [ ] Linting passes
- [ ] Manual MySQL testing successful
- [ ] Manual SQL Server testing successful
- [ ] Performance acceptable (<5s for 1000 records)
- [ ] No regressions in other pages
- [ ] Error handling works correctly
- [ ] Logging captures useful information

---

### Phase 6: Documentation & Cleanup
**Goal**: Update docs and remove obsolete code

**Tasks**:
1. Update CLAUDE.md with new architecture
2. Add inline documentation for new repository
3. Update this design document with any changes made during implementation
4. Remove MySqlService from OrderNumberResolver imports (if any remain)
5. Verify no unused imports
6. Run final typecheck
7. Commit: "docs: update documentation for ORM refactor"
8. Create pull request to dev branch

**Files Modified**:
- `CLAUDE.md`
- `docs/plans/2026-03-03-extractor-orm-refactor-design.md`

**Final Verification**:
```bash
npm run typecheck    # No errors
npm run lint         # No warnings
npm run test         # All pass
```

---

## 6. Migration Steps

### Step-by-Step Migration Procedure

#### Step 1: Create Git Worktree
```bash
# From project root (D:\Node\ERPAuto)
git worktree add ../ERPAuto-extractor-orm -b feature/extractor-orm-refactor

# Change to worktree directory
cd ../ERPAuto-extractor-orm

# Verify worktree
git worktree list
# Expected output:
# D:/Node/ERPAuto                b942b2f [dev]
# D:/Node/ERPAuto-extractor-orm  <new-hash> [feature/extractor-orm-refactor]
```

#### Step 2: Install Dependencies & Verify
```bash
# In worktree directory
npm install

# Verify current state
npm run typecheck
npm run test

# All should pass before starting changes
```

#### Step 3: Execute Implementation Phases 1-6
Follow each phase sequentially as outlined in Section 5.

After each phase:
```bash
git add .
git commit -m "<phase commit message>"
```

#### Step 4: Final Verification
```bash
# In worktree directory
npm run build          # Verify build succeeds
npm run test:e2e       # Run E2E tests if available
npm run lint           # Check code style

# Verify both database types
# Update .env for MySQL
DB_TYPE=mysql npm run test

# Update .env for SQL Server
DB_TYPE=mssql npm run test
```

#### Step 5: Create Pull Request
```bash
# Push feature branch to remote
git push -u origin feature/extractor-orm-refactor

# Create PR via GitHub or command line
gh pr create \
  --title "refactor: Implement TypeORM repository for ExtractorPage database access" \
  --body "Implements Phase 2 of optimization-execution-plan.md

## Summary
- Replace MySqlService with TypeORM ProductionContractRepository
- Add dual SQL dialect support (MySQL and SQL Server)
- Update OrderNumberResolver to use repository pattern
- Remove database-specific code from business logic

## Testing
- Unit tests for ProductionContractRepository
- Integration tests for extractor-handler
- Manual testing with both MySQL and SQL Server
- Performance testing with 1000+ records

## Checklist
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Manual testing completed
- [ ] No regressions detected"

# Or open GitHub and create PR manually
```

#### Step 6: Code Review & Merge
1. Request review from team members
2. Address review feedback
3. Ensure CI/CD checks pass
4. Merge to dev branch:
   ```bash
   # After PR approval
   gh pr merge --merge
   ```

#### Step 7: Cleanup Worktree
```bash
# After successful merge to dev
# From original repo directory (D:\Node\ERPAuto)
git worktree remove ../ERPAuto-extractor-orm

# Optional: Delete local feature branch
git branch -d feature/extractor-orm-refactor
```

---

### Rollback Plan

**If critical issues found after merge**:

**Option A: Quick Revert (Recommended)**
```bash
# Revert the merge commit
git revert -m 1 <merge-commit-hash>

# Push the revert
git push origin dev

# This preserves history and is easy to understand
```

**Option B: Branch Reset (Use if urgent)**
```bash
# Reset dev to before merge
git checkout dev
git reset --hard <commit-before-merge>
git push origin dev --force

# ⚠️ Warning: This rewrites history
```

**Recovery Steps After Rollback**:
1. Restore MySqlService-based implementation from git history
2. Revert extractor-handler.ts to use MySqlService
3. Hotfix deployment if needed
4. Investigate failure in worktree
5. Fix issues and retry migration

**Common Issues & Solutions**:

| Issue | Symptom | Solution |
|-------|---------|----------|
| TypeORM connection timeout | "Connection timeout after 30000ms" | Check DB_HOST, DB_PORT, firewall |
| Wrong SQL syntax | "You have an error in your SQL syntax" | Verify DB_TYPE matches actual database |
| Entity not found | "Entity metadata not found" | Ensure entity registered in data-source.ts |
| Column name mismatch | "Unknown column 'xxx'" | Check entity column names match database |
| Parameter binding error | "Bind parameters not matching" | Check MySQL (?) vs SQL Server (@pN) syntax |

---

## 7. Success Criteria

The refactoring will be considered successful when:

1. **Functionality**
   - ✅ ExtractorPage "开始提取" button works with MySQL
   - ✅ ExtractorPage "开始提取" button works with SQL Server
   - ✅ Order resolution produces identical results to old implementation
   - ✅ Error handling works correctly for all scenarios

2. **Code Quality**
   - ✅ All unit tests pass (>90% coverage for repository)
   - ✅ All integration tests pass
   - ✅ Type checking passes with no errors
   - ✅ Linting passes with no warnings
   - ✅ No console.log statements (use logger instead)

3. **Performance**
   - ✅ Query performance ≤ old implementation (±10%)
   - ✅ Memory usage within acceptable limits
   - ✅ No memory leaks detected

4. **Maintainability**
   - ✅ Code follows existing patterns (similar to DiscreteMaterialPlanRepository)
   - ✅ Comprehensive inline documentation
   - ✅ Error messages are clear and actionable
   - ✅ Logging captures useful diagnostic information

5. **Testing**
   - ✅ Manual testing completed for both databases
   - ✅ Edge cases tested and handled
   - ✅ No regressions in other pages (CleanerPage, etc.)

---

## 8. Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| TypeORM connection pool exhaustion | Low | High | Configure pool size in .env, monitor connections |
| SQL dialect differences causing bugs | Medium | Medium | Comprehensive testing for both databases |
| Performance regression | Low | Medium | Benchmark before/after, optimize queries if needed |
| Breaking change for dependent code | Low | High | Ensure backwards compatibility, test all pages |
| Rollback complexity | Low | Medium | Keep rollback plan simple, document steps |
| Missing test coverage | Medium | Medium | Enforce coverage thresholds, review test gaps |

---

## 9. Future Considerations

### Phase 2+ Alignment

This refactoring aligns with Phase 2 of the optimization plan:

1. ✅ **ORM Integration**: TypeORM repository replaces raw SQL
2. ✅ **Repository Abstraction**: Database implementation isolated
3. ✅ **Dual Database Support**: MySQL and SQL Server via `DB_TYPE`
4. ✅ **Type Safety**: Full TypeScript types throughout

### Next Steps (Beyond This Refactoring)

1. **Zod Validation**: Add runtime validation for IPC payloads (Phase 2, item 3)
2. **React Hooks**: Extract IPC calls to `useExtractor` hook (Phase 3, item 1)
3. **Additional Repositories**: Migrate other DAOs to TypeORM pattern
4. **Connection Pooling**: Configure and monitor TypeORM connection pool
5. **Query Optimization**: Add database indexes for frequently queried columns

---

## 10. Appendix

### A. Environment Variables

```bash
# Database Type Selection
DB_TYPE=mysql|mssql                    # Required: mysql or mssql

# MySQL Configuration (if DB_TYPE=mysql)
DB_MYSQL_HOST=localhost
DB_MYSQL_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_NAME=your_database

# SQL Server Configuration (if DB_TYPE=mssql)
DB_SERVER=localhost
DB_SQLSERVER_PORT=1433
DB_USERNAME=sa
DB_PASSWORD=your_password
DB_NAME=your_database
DB_TRUST_SERVER_CERTIFICATE=yes

# TypeORM Configuration
NODE_ENV=development|production        # Controls TypeORM logging
```

### B. Database Schema

**Table**: `productionContractData_26年压力表合同数据`

| Column Name | Type | Description | Index |
|-------------|------|-------------|-------|
| 总排号 | VARCHAR(50) | Production ID | Primary |
| 生产订单号 | VARCHAR(50) | Production Order Number | Indexed |

### C. File Structure

```
src/main/
├── services/
│   ├── database/
│   │   ├── entities/
│   │   │   └── ProductionContract.ts                    [NEW]
│   │   ├── repositories/
│   │   │   ├── ProductionContractRepository.ts          [NEW]
│   │   │   └── __tests__/
│   │   │       └── ProductionContractRepository.test.ts [NEW]
│   │   ├── data-source.ts                               [MODIFIED]
│   │   ├── mysql.ts                                     [UNCHANGED]
│   │   └── sql-server.ts                                [UNCHANGED]
│   └── erp/
│       ├── order-resolver.ts                            [MODIFIED]
│       └── __tests__/
│           └── order-resolver.test.ts                   [MODIFIED]
└── ipc/
    └── extractor-handler.ts                             [MODIFIED]
```

### D. References

- **Optimization Plan**: `docs/optimization-execution-plan.md` (Phase 2)
- **Existing Repository**: `src/main/services/database/repositories/DiscreteMaterialPlanRepository.ts`
- **TypeORM Docs**: https://typeorm.io/
- **Project Docs**: `CLAUDE.md`

---

## Sign-off

**Design Status**: ✅ Approved

**Implementation Ready**: Yes

**Next Action**: Execute Step 1 - Create Git Worktree

**Expected Timeline**: 2-3 days (including testing and review)

---

*Last Updated: 2026-03-03*
*Document Version: 1.0*
