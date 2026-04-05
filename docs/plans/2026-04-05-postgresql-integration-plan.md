# PostgreSQL Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate PostgreSQL as a third database option by introducing a SqlDialect abstraction layer that unifies SQL dialect differences across MySQL, SQL Server, and PostgreSQL.

**Architecture:** Create a `SqlDialect` interface with implementations for each database. Refactor all 4 DAOs to delegate dialect-specific logic (placeholders, table names, UPSERT, pagination, timestamps) to their dialect object. Add a `PostgreSqlService` implementing `IDatabaseService` using the `pg` driver. Extend config schemas and factory to support the new database type.

**Tech Stack:** TypeScript, `pg` (node-postgres), TypeORM, Zod, Vitest

---

## Task 1: SqlDialect Interface & Type Definitions

**Files:**

- Create: `src/main/types/sql-dialect.types.ts`
- Modify: `src/main/types/database.types.ts:11` (extend `DatabaseType`)
- Modify: `src/main/types/config.schema.ts:15` (extend Zod enum)

**Step 1: Add `'postgresql'` to `DatabaseType`**

In `src/main/types/database.types.ts:11`, change:

```typescript
export type DatabaseType = 'mysql' | 'sqlserver' | 'postgresql'
```

Add after line 104 (after `SqlServerConfig`):

```typescript
/**
 * PostgreSQL-specific configuration
 */
export interface PostgreSqlConfig extends DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  maxPoolSize?: number
}
```

**Step 2: Add PostgreSQL to Zod config schema**

In `src/main/types/config.schema.ts`:

Change line 15:

```typescript
export const databaseTypeSchema = z.enum(['mysql', 'sqlserver', 'postgresql'])
```

Add after `sqlServerConfigSchema` (after line 58):

```typescript
/**
 * PostgreSQL 配置 Schema
 */
export const postgresqlConfigSchema = z.object({
  host: z.string().min(1, 'PostgreSQL host is required'),
  port: z.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1, 'PostgreSQL database is required'),
  username: z.string().min(1, 'PostgreSQL username is required'),
  password: z.string(),
  maxPoolSize: z.number().int().min(1).max(100).default(10)
})
export type PostgreSqlConfig = z.infer<typeof postgresqlConfigSchema>
```

Change `databaseConfigSchema` (line 63):

```typescript
export const databaseConfigSchema = z.object({
  activeType: databaseTypeSchema.default('mysql'),
  mysql: mysqlConfigSchema,
  sqlserver: sqlServerConfigSchema,
  postgresql: postgresqlConfigSchema
})
```

**Step 3: Create `SqlDialect` interface**

Create `src/main/types/sql-dialect.types.ts`:

```typescript
/**
 * SQL Dialect Abstraction
 *
 * Provides a unified interface for database-specific SQL syntax differences.
 * Each database type implements this interface to encapsulate:
 * - Parameter placeholder format
 * - Table name quoting
 * - UPSERT syntax
 * - Pagination syntax
 * - Current timestamp function
 * - Batch size limits
 */

import type { DatabaseType } from './database.types'

export interface SqlDialect {
  /** Database type identifier */
  readonly dbType: DatabaseType

  /**
   * Quote a table name with schema prefix
   * MySQL: dbo_TableName
   * SQL Server: [dbo].[TableName]
   * PostgreSQL: "dbo"."TableName"
   */
  quoteTableName(schema: string, table: string): string

  /**
   * Get placeholder for parameter at given index (0-based)
   * MySQL: ?
   * SQL Server: @p0
   * PostgreSQL: $1
   */
  param(index: number): string

  /**
   * Get comma-separated placeholders for count parameters
   */
  params(count: number): string

  /**
   * Get current timestamp SQL function
   * MySQL: NOW()
   * SQL Server: GETDATE()
   * PostgreSQL: CURRENT_TIMESTAMP
   */
  currentTimestamp(): string

  /**
   * Generate UPSERT SQL for a single row
   * MySQL: INSERT ... ON DUPLICATE KEY UPDATE
   * SQL Server: MERGE ... USING ...
   * PostgreSQL: INSERT ... ON CONFLICT ... DO UPDATE SET
   *
   * @param table - Quoted table name
   * @param keyColumns - Columns that identify the unique key
   * @param allColumns - All columns to insert/update
   * @param startParamIndex - Starting parameter index (0-based)
   * @returns Object with sql string and next param index
   */
  upsert(params: {
    table: string
    keyColumns: string[]
    allColumns: string[]
    startParamIndex: number
  }): { sql: string; nextParamIndex: number }

  /**
   * Append pagination clause to SQL
   * MySQL/PostgreSQL: LIMIT x OFFSET y
   * SQL Server: OFFSET x ROWS FETCH NEXT y ROWS ONLY
   *
   * @returns Object with modified sql and next param index
   */
  paginate(params: { sql: string; limit: number; offset?: number; paramIndex: number }): {
    sql: string
    nextParamIndex: number
  }

  /**
   * Maximum rows per batch given columns per row
   * SQL Server: ~71 (due to 2100 param limit)
   * MySQL/PostgreSQL: 1000
   */
  maxBatchRows(columnsPerRow: number): number
}
```

**Step 4: Run typecheck to verify no breakage**

Run: `npx vitest typecheck` or `npm run typecheck`
Expected: May have errors in config-manager.ts due to new required `postgresql` field in schema — this is expected and will be fixed in Task 6.

**Step 5: Commit**

```bash
git add src/main/types/sql-dialect.types.ts src/main/types/database.types.ts src/main/types/config.schema.ts
git commit -m "feat(db): add SqlDialect interface and PostgreSQL type definitions"
```

---

## Task 2: Implement Three Dialect Classes

**Files:**

- Create: `src/main/services/database/dialects/mysql-dialect.ts`
- Create: `src/main/services/database/dialects/sqlserver-dialect.ts`
- Create: `src/main/services/database/dialects/postgresql-dialect.ts`
- Create: `src/main/services/database/dialects/index.ts`
- Test: `tests/unit/dialects/mysql-dialect.test.ts`
- Test: `tests/unit/dialects/sqlserver-dialect.test.ts`
- Test: `tests/unit/dialects/postgresql-dialect.test.ts`

**Step 1: Write tests for all three dialects**

Create `tests/unit/dialects/mysql-dialect.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { MySqlDialect } from '@main/services/database/dialects/mysql-dialect'

describe('MySqlDialect', () => {
  const dialect = new MySqlDialect()

  it('should have dbType mysql', () => {
    expect(dialect.dbType).toBe('mysql')
  })

  it('quoteTableName should use underscore notation', () => {
    expect(dialect.quoteTableName('dbo', 'TableName')).toBe('dbo_TableName')
  })

  it('param should return ? for any index', () => {
    expect(dialect.param(0)).toBe('?')
    expect(dialect.param(5)).toBe('?')
  })

  it('params should return comma-separated question marks', () => {
    expect(dialect.params(3)).toBe('?,?,?')
    expect(dialect.params(1)).toBe('?')
  })

  it('currentTimestamp should return NOW()', () => {
    expect(dialect.currentTimestamp()).toBe('NOW()')
  })

  it('upsert should generate ON DUPLICATE KEY UPDATE', () => {
    const result = dialect.upsert({
      table: 'dbo_MaterialsToBeDeleted',
      keyColumns: ['MaterialCode'],
      allColumns: ['MaterialCode', 'ManagerName'],
      startParamIndex: 0
    })
    expect(result.sql).toContain('INSERT INTO dbo_MaterialsToBeDeleted')
    expect(result.sql).toContain('ON DUPLICATE KEY UPDATE')
    expect(result.nextParamIndex).toBe(2)
  })

  it('paginate should append LIMIT OFFSET', () => {
    const result = dialect.paginate({
      sql: 'SELECT * FROM t ORDER BY id',
      limit: 10,
      offset: 20,
      paramIndex: 5
    })
    expect(result.sql).toContain('LIMIT 10 OFFSET 20')
    expect(result.nextParamIndex).toBe(5)
  })

  it('maxBatchRows should return 1000', () => {
    expect(dialect.maxBatchRows(28)).toBe(1000)
  })
})
```

Create `tests/unit/dialects/sqlserver-dialect.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { SqlServerDialect } from '@main/services/database/dialects/sqlserver-dialect'

describe('SqlServerDialect', () => {
  const dialect = new SqlServerDialect()

  it('should have dbType sqlserver', () => {
    expect(dialect.dbType).toBe('sqlserver')
  })

  it('quoteTableName should use bracket notation', () => {
    expect(dialect.quoteTableName('dbo', 'TableName')).toBe('[dbo].[TableName]')
  })

  it('param should return @pN', () => {
    expect(dialect.param(0)).toBe('@p0')
    expect(dialect.param(3)).toBe('@p3')
  })

  it('params should return comma-separated @pN', () => {
    expect(dialect.params(3)).toBe('@p0,@p1,@p2')
  })

  it('currentTimestamp should return GETDATE()', () => {
    expect(dialect.currentTimestamp()).toBe('GETDATE()')
  })

  it('upsert should generate MERGE statement', () => {
    const result = dialect.upsert({
      table: '[dbo].[MaterialsToBeDeleted]',
      keyColumns: ['MaterialCode'],
      allColumns: ['MaterialCode', 'ManagerName'],
      startParamIndex: 0
    })
    expect(result.sql).toContain('MERGE')
    expect(result.sql).toContain('WHEN MATCHED THEN UPDATE')
    expect(result.sql).toContain('WHEN NOT MATCHED THEN INSERT')
    expect(result.nextParamIndex).toBe(2)
  })

  it('paginate should append OFFSET/FETCH with param placeholders', () => {
    const result = dialect.paginate({
      sql: 'SELECT * FROM t ORDER BY id',
      limit: 10,
      offset: 20,
      paramIndex: 5
    })
    expect(result.sql).toContain('OFFSET @p5 ROWS')
    expect(result.sql).toContain('FETCH NEXT @p6 ROWS ONLY')
    expect(result.nextParamIndex).toBe(7)
  })

  it('paginate without offset should use OFFSET 0', () => {
    const result = dialect.paginate({
      sql: 'SELECT * FROM t ORDER BY id',
      limit: 10,
      paramIndex: 5
    })
    expect(result.sql).toContain('OFFSET 0 ROWS')
    expect(result.sql).toContain('FETCH NEXT @p5 ROWS ONLY')
    expect(result.nextParamIndex).toBe(6)
  })

  it('maxBatchRows should respect 2100 param limit', () => {
    expect(dialect.maxBatchRows(28)).toBe(Math.floor(2000 / 28))
    expect(dialect.maxBatchRows(28)).toBeLessThanOrEqual(75)
  })
})
```

Create `tests/unit/dialects/postgresql-dialect.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { PostgreSqlDialect } from '@main/services/database/dialects/postgresql-dialect'

describe('PostgreSqlDialect', () => {
  const dialect = new PostgreSqlDialect()

  it('should have dbType postgresql', () => {
    expect(dialect.dbType).toBe('postgresql')
  })

  it('quoteTableName should use double-quote notation', () => {
    expect(dialect.quoteTableName('dbo', 'TableName')).toBe('"dbo"."TableName"')
  })

  it('param should return $N (1-based)', () => {
    expect(dialect.param(0)).toBe('$1')
    expect(dialect.param(3)).toBe('$4')
  })

  it('params should return comma-separated $N', () => {
    expect(dialect.params(3)).toBe('$1,$2,$3')
  })

  it('currentTimestamp should return CURRENT_TIMESTAMP', () => {
    expect(dialect.currentTimestamp()).toBe('CURRENT_TIMESTAMP')
  })

  it('upsert should generate ON CONFLICT DO UPDATE', () => {
    const result = dialect.upsert({
      table: '"dbo"."MaterialsToBeDeleted"',
      keyColumns: ['MaterialCode'],
      allColumns: ['MaterialCode', 'ManagerName'],
      startParamIndex: 0
    })
    expect(result.sql).toContain('INSERT INTO "dbo"."MaterialsToBeDeleted"')
    expect(result.sql).toContain('ON CONFLICT ("MaterialCode")')
    expect(result.sql).toContain('DO UPDATE SET')
    expect(result.nextParamIndex).toBe(2)
  })

  it('paginate should append LIMIT OFFSET (literal, not param)', () => {
    const result = dialect.paginate({
      sql: 'SELECT * FROM t ORDER BY id',
      limit: 10,
      offset: 20,
      paramIndex: 5
    })
    expect(result.sql).toContain('LIMIT 10 OFFSET 20')
    expect(result.nextParamIndex).toBe(5)
  })

  it('maxBatchRows should return 1000', () => {
    expect(dialect.maxBatchRows(28)).toBe(1000)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/dialects/`
Expected: FAIL — modules not found

**Step 3: Implement MySqlDialect**

Create `src/main/services/database/dialects/mysql-dialect.ts`:

```typescript
import type { SqlDialect } from '../../../types/sql-dialect.types'
import type { DatabaseType } from '../../../types/database.types'

export class MySqlDialect implements SqlDialect {
  readonly dbType: DatabaseType = 'mysql'

  quoteTableName(schema: string, table: string): string {
    return `${schema}_${table}`
  }

  param(_index: number): string {
    return '?'
  }

  params(count: number): string {
    return Array.from({ length: count }, () => '?').join(',')
  }

  currentTimestamp(): string {
    return 'NOW()'
  }

  upsert(p: {
    table: string
    keyColumns: string[]
    allColumns: string[]
    startParamIndex: number
  }): { sql: string; nextParamIndex: number } {
    const placeholders = this.params(p.allColumns.length)
    const columns = p.allColumns.join(', ')
    const updateSet = p.allColumns
      .filter((col) => !p.keyColumns.includes(col))
      .map((col) => `${col} = VALUES(${col})`)
      .join(', ')

    const sql = `
      INSERT INTO ${p.table} (${columns})
      VALUES (${placeholders})
      ON DUPLICATE KEY UPDATE ${updateSet}
    `
    return { sql, nextParamIndex: p.startParamIndex + p.allColumns.length }
  }

  paginate(p: { sql: string; limit: number; offset?: number; paramIndex: number }): {
    sql: string
    nextParamIndex: number
  } {
    let sql = p.sql
    if (p.offset !== undefined) {
      sql += ` LIMIT ${p.limit} OFFSET ${p.offset}`
    } else {
      sql += ` LIMIT ${p.limit}`
    }
    return { sql, nextParamIndex: p.paramIndex }
  }

  maxBatchRows(_columnsPerRow: number): number {
    return 1000
  }
}
```

**Step 4: Implement SqlServerDialect**

Create `src/main/services/database/dialects/sqlserver-dialect.ts`:

```typescript
import type { SqlDialect } from '../../../types/sql-dialect.types'
import type { DatabaseType } from '../../../types/database.types'

export class SqlServerDialect implements SqlDialect {
  readonly dbType: DatabaseType = 'sqlserver'

  quoteTableName(schema: string, table: string): string {
    return `[${schema}].[${table}]`
  }

  param(index: number): string {
    return `@p${index}`
  }

  params(count: number): string {
    return Array.from({ length: count }, (_, i) => `@p${i}`).join(',')
  }

  currentTimestamp(): string {
    return 'GETDATE()'
  }

  upsert(p: {
    table: string
    keyColumns: string[]
    allColumns: string[]
    startParamIndex: number
  }): { sql: string; nextParamIndex: number } {
    const sourceValues = p.allColumns.map((_, i) => `@p${p.startParamIndex + i}`).join(', ')
    const sourceColumns = p.allColumns.join(', ')
    const keyMatch = p.keyColumns.map((col) => `target.${col} = source.${col}`).join(' AND ')
    const updateSet = p.allColumns
      .filter((col) => !p.keyColumns.includes(col))
      .map((col) => `${col} = source.${col}`)
      .join(', ')
    const insertColumns = p.allColumns.join(', ')
    const insertValues = p.allColumns.map((col) => `source.${col}`).join(', ')

    const sql = `
      MERGE ${p.table} AS target
      USING (VALUES (${sourceValues})) AS source (${sourceColumns})
      ON ${keyMatch}
      WHEN MATCHED THEN UPDATE SET ${updateSet}
      WHEN NOT MATCHED THEN INSERT (${insertColumns}) VALUES (${insertValues});
    `
    return { sql, nextParamIndex: p.startParamIndex + p.allColumns.length }
  }

  paginate(p: { sql: string; limit: number; offset?: number; paramIndex: number }): {
    sql: string
    nextParamIndex: number
  } {
    let sql = p.sql
    let nextIndex = p.paramIndex

    if (p.offset !== undefined) {
      sql += ` OFFSET @p${nextIndex} ROWS FETCH NEXT @p${nextIndex + 1} ROWS ONLY`
      nextIndex += 2
    } else {
      sql += ` OFFSET 0 ROWS FETCH NEXT @p${nextIndex} ROWS ONLY`
      nextIndex += 1
    }
    return { sql, nextParamIndex: nextIndex }
  }

  maxBatchRows(columnsPerRow: number): number {
    // SQL Server has a limit of ~2100 parameters per query
    // Leave margin for query overhead
    const maxParams = 2000
    return Math.floor(maxParams / columnsPerRow)
  }
}
```

**Step 5: Implement PostgreSqlDialect**

Create `src/main/services/database/dialects/postgresql-dialect.ts`:

```typescript
import type { SqlDialect } from '../../../types/sql-dialect.types'
import type { DatabaseType } from '../../../types/database.types'

export class PostgreSqlDialect implements SqlDialect {
  readonly dbType: DatabaseType = 'postgresql'

  quoteTableName(schema: string, table: string): string {
    return `"${schema}"."${table}"`
  }

  param(index: number): string {
    // PostgreSQL uses 1-based parameter placeholders
    return `$${index + 1}`
  }

  params(count: number): string {
    return Array.from({ length: count }, (_, i) => `$${i + 1}`).join(',')
  }

  currentTimestamp(): string {
    return 'CURRENT_TIMESTAMP'
  }

  upsert(p: {
    table: string
    keyColumns: string[]
    allColumns: string[]
    startParamIndex: number
  }): { sql: string; nextParamIndex: number } {
    const placeholders = p.allColumns.map((_, i) => `$${p.startParamIndex + i + 1}`).join(', ')
    const columns = p.allColumns.join(', ')
    const conflictKeys = p.keyColumns.map((k) => `"${k}"`).join(', ')
    const updateSet = p.allColumns
      .filter((col) => !p.keyColumns.includes(col))
      .map((col) => `"${col}" = EXCLUDED."${col}"`)
      .join(', ')

    const sql = `
      INSERT INTO ${p.table} (${columns})
      VALUES (${placeholders})
      ON CONFLICT (${conflictKeys}) DO UPDATE SET ${updateSet}
    `
    return { sql, nextParamIndex: p.startParamIndex + p.allColumns.length }
  }

  paginate(p: { sql: string; limit: number; offset?: number; paramIndex: number }): {
    sql: string
    nextParamIndex: number
  } {
    let sql = p.sql
    if (p.offset !== undefined) {
      sql += ` LIMIT ${p.limit} OFFSET ${p.offset}`
    } else {
      sql += ` LIMIT ${p.limit}`
    }
    return { sql, nextParamIndex: p.paramIndex }
  }

  maxBatchRows(_columnsPerRow: number): number {
    return 1000
  }
}
```

**Step 6: Create dialect factory index**

Create `src/main/services/database/dialects/index.ts`:

```typescript
export { MySqlDialect } from './mysql-dialect'
export { SqlServerDialect } from './sqlserver-dialect'
export { PostgreSqlDialect } from './postgresql-dialect'

import type { SqlDialect } from '../../../types/sql-dialect.types'
import type { DatabaseType } from '../../../types/database.types'
import { MySqlDialect } from './mysql-dialect'
import { SqlServerDialect } from './sqlserver-dialect'
import { PostgreSqlDialect } from './postgresql-dialect'

export function createDialect(type: DatabaseType): SqlDialect {
  switch (type) {
    case 'sqlserver':
      return new SqlServerDialect()
    case 'postgresql':
      return new PostgreSqlDialect()
    default:
      return new MySqlDialect()
  }
}
```

**Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/unit/dialects/`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add src/main/services/database/dialects/ tests/unit/dialects/
git commit -m "feat(db): implement SqlDialect abstraction with MySQL, SQL Server, PostgreSQL dialects"
```

---

## Task 3: PostgreSqlService Implementation

**Files:**

- Create: `src/main/services/database/postgresql.ts`
- Test: `tests/unit/postgresql.test.ts`

**Step 1: Write tests**

Create `tests/unit/postgresql.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { PostgreSqlService } from '@main/services/database/postgresql'

const mockConfig = {
  host: 'localhost',
  port: 5432,
  user: 'test',
  password: 'test',
  database: 'testdb'
}

describe('PostgreSqlService Unit Tests', () => {
  let service: PostgreSqlService

  beforeEach(() => {
    service = new PostgreSqlService(mockConfig)
  })

  describe('constructor', () => {
    it('should create service with config', () => {
      expect(service).toBeDefined()
      expect(service.isConnected()).toBe(false)
    })
  })

  describe('type', () => {
    it('should return postgresql', () => {
      expect(service.type).toBe('postgresql')
    })
  })

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(service.isConnected()).toBe(false)
    })
  })

  describe('query', () => {
    it('should throw error when not connected', async () => {
      await expect(service.query('SELECT 1')).rejects.toThrow('Not connected to PostgreSQL')
    })
  })

  describe('transaction', () => {
    it('should throw error when not connected', async () => {
      await expect(service.transaction([{ sql: 'SELECT 1' }])).rejects.toThrow(
        'Not connected to PostgreSQL'
      )
    })
  })

  describe('connect', () => {
    it('should throw error with invalid host', async () => {
      const invalidConfig = {
        ...mockConfig,
        host: 'invalid-host-that-does-not-exist'
      }
      const invalidService = new PostgreSqlService(invalidConfig)

      await expect(invalidService.connect()).rejects.toThrow('Failed to connect to PostgreSQL')
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/postgresql.test.ts`
Expected: FAIL — module not found

**Step 3: Install pg dependency**

Run: `npm install pg && npm install -D @types/pg`

**Step 4: Implement PostgreSqlService**

Create `src/main/services/database/postgresql.ts`:

```typescript
import { Pool } from 'pg'
import type {
  IDatabaseService,
  DatabaseType,
  QueryResult,
  PostgreSqlConfig
} from '../../types/database.types'
import { createLogger, trackDuration } from '../logger'

const log = createLogger('PostgreSqlService')

export class PostgreSqlService implements IDatabaseService {
  readonly type: DatabaseType = 'postgresql'

  private pool: Pool | null = null
  private config: PostgreSqlConfig

  constructor(config: PostgreSqlConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    if (this.pool) {
      log.warn('Already connected to PostgreSQL')
      throw new Error('Already connected to PostgreSQL')
    }

    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        max: this.config.maxPoolSize ?? 10
      })

      // Test connection
      const client = await this.pool.connect()
      client.release()

      log.info('Connected to PostgreSQL', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database
      })
    } catch (error) {
      this.pool = null
      log.error('Failed to connect to PostgreSQL', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        error
      })
      throw new Error(`Failed to connect to PostgreSQL: ${(error as Error).message}`)
    }
  }

  async disconnect(): Promise<void> {
    if (!this.pool) {
      return
    }

    try {
      await this.pool.end()
      this.pool = null
      log.info('Disconnected from PostgreSQL')
    } catch (error) {
      log.error('Failed to disconnect from PostgreSQL', { error })
      throw new Error(`Failed to disconnect from PostgreSQL: ${(error as Error).message}`)
    }
  }

  isConnected(): boolean {
    return this.pool !== null
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to PostgreSQL. Call connect() first.')
    }

    const sqlPreview = sql.substring(0, 100)
    const paramCount = params?.length ?? 0

    try {
      const { result: queryResult } = await trackDuration(
        async () => {
          const result = await this.pool!.query(sql, params)

          const rows = result.rows as Record<string, unknown>[]
          const columns = result.fields.map((f) => f.name)

          return {
            rows,
            columns,
            rowCount: result.rowCount ?? rows.length
          }
        },
        { operationName: 'PostgreSqlService.query' }
      )

      log.debug('Query executed', { sqlPreview, rowCount: queryResult.rowCount, paramCount })
      return queryResult
    } catch (error) {
      log.error('PostgreSQL query failed', { sqlPreview, paramCount, error })
      throw new Error(`PostgreSQL query failed: ${(error as Error).message}`)
    }
  }

  async transaction(queries: { sql: string; params?: any[] }[]): Promise<void> {
    if (!this.pool) {
      throw new Error('Not connected to PostgreSQL. Call connect() first.')
    }

    const queryCount = queries.length
    const client = await this.pool.connect()
    log.info('Transaction started', { queryCount })

    try {
      await client.query('BEGIN')

      for (let i = 0; i < queries.length; i++) {
        const { sql, params } = queries[i]
        await client.query(sql, params)
        log.debug('Transaction query executed', { index: i, sqlPreview: sql.substring(0, 100) })
      }

      await client.query('COMMIT')
      log.info('Transaction committed', { queryCount })
    } catch (error) {
      await client.query('ROLLBACK')
      log.warn('Transaction rolled back', { queryCount, error })
      throw new Error(`PostgreSQL transaction failed: ${(error as Error).message}`)
    } finally {
      client.release()
    }
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/postgresql.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/main/services/database/postgresql.ts tests/unit/postgresql.test.ts package.json package-lock.json
git commit -m "feat(db): add PostgreSqlService with pg driver"
```

---

## Task 4: Refactor DiscreteMaterialPlanDAO

**Files:**

- Modify: `src/main/services/database/discrete-material-plan-dao.ts`
- Modify: `src/main/services/database/materials-to-be-deleted-dao.ts`
- Modify: `src/main/services/database/materials-type-to-be-deleted-dao.ts`
- Modify: `src/main/services/database/extractor-operation-history-dao.ts`

This is the largest task. Each DAO follows the same pattern — replace `isSqlServer` checks with dialect calls.

### DiscreteMaterialPlanDAO changes:

**Step 1: Add dialect import and member**

At top of file, add import:

```typescript
import { createDialect, type SqlDialect } from './dialects'
```

In class body, add:

```typescript
private dialect: SqlDialect | null = null

private getDialect(): SqlDialect {
  if (!this.dialect) {
    this.dialect = createDialect(this.dbService!.type)
  }
  return this.dialect
}
```

**Step 2: Remove `getTableName()` and `buildPlaceholders()` methods**

Replace with:

```typescript
private getTableName(): string {
  return this.getDialect().quoteTableName('dbo', 'DiscreteMaterialPlanData')
}
```

Delete `buildPlaceholders()` entirely — replaced by `dialect.params()`.

**Step 3: Replace all `isSqlServer` local variables**

Replace patterns like:

```typescript
const isSqlServer = dbService.type === 'sqlserver'
const placeholder = isSqlServer ? '@p0' : '?'
```

With:

```typescript
const dialect = this.getDialect()
const placeholder = dialect.param(0)
```

Replace `this.buildPlaceholders(batch.length, isSqlServer)` with `dialect.params(batch.length)`.

Replace `isSqlServer ? '@p0' : '?'` single placeholders with `dialect.param(0)`.

**Step 4: Refactor `buildRowValues()`**

Change from:

```typescript
if (isSqlServer) {
  return `@p${values.length - 1}`
} else {
  return '?'
}
```

To:

```typescript
return this.getDialect().param(values.length - 1)
```

**Step 5: Refactor `batchInsert()` batch size**

Change from:

```typescript
const isSqlServer = dbService.type === 'sqlserver'
const effectiveBatchSize = isSqlServer
  ? Math.min(batchSize, Math.floor(sqlServerMaxParams / columnsPerRow))
  : batchSize
```

To:

```typescript
const dialect = this.getDialect()
const effectiveBatchSize = Math.min(batchSize, dialect.maxBatchRows(columnsPerRow))
```

### MaterialsToBeDeletedDAO changes:

Same pattern as above, plus refactor UPSERT methods:

**Step 6: Replace MERGE/ON DUPLICATE KEY with `dialect.upsert()`**

In `upsertMaterial()`, replace the entire if/else block:

```typescript
if (isSqlServer) {
  // MERGE ...
} else {
  // ON DUPLICATE KEY UPDATE ...
}
```

With:

```typescript
const dialect = this.getDialect()
const { sql: sqlString } = dialect.upsert({
  table: tableName,
  keyColumns: ['MaterialCode'],
  allColumns: ['MaterialCode', 'ManagerName'],
  startParamIndex: 0
})
await trackDuration(async () => await dbService.query(sqlString, [code, manager]), {
  operationName: 'MaterialsToBeDeletedDAO.upsertMaterial',
  context: { tableName, operationType: 'UPSERT' }
})
```

Same for `upsertBatch()` — each iteration calls `dialect.upsert()`.

### MaterialsTypeToBeDeletedDAO changes:

**Step 7: Same pattern as MaterialsToBeDeletedDAO**

Replace `getTableName()`, `buildPlaceholders()`, `isSqlServer` checks, and `upsertMaterial()` UPSERT logic.

Additionally, refactor `updateMaterial()` — the entire if/else block that duplicates SQL just for placeholder differences becomes one SQL string using `dialect.param()`.

### ExtractorOperationHistoryDAO changes:

**Step 8: Replace `getTableName()`, `buildPlaceholders()`, `isSqlServer` checks**

Plus specific changes:

In `insertBatchRecords()`, replace the if/else with:

```typescript
const dialect = this.getDialect()
const sqlString = `
  INSERT INTO ${tableName}
    (BatchId, UserId, Username, ProductionId, OrderNumber, OperationTime, Status)
  VALUES
    (${dialect.param(0)}, ${dialect.param(1)}, ${dialect.param(2)}, ${dialect.param(3)}, ${dialect.param(4)}, ${dialect.currentTimestamp()}, 'pending')
`
```

In `getBatches()`, replace pagination logic with:

```typescript
if (options?.limit) {
  const result = dialect.paginate({
    sql: sqlString,
    limit: safeLimit,
    offset: safeOffset,
    paramIndex: params.length
  })
  sqlString = result.sql
  // Note: SQL Server's paginate adds params to the params array; PostgreSQL/MySQL don't
}
```

**Step 9: Run existing tests to verify no regressions**

Run: `npx vitest run`
Expected: ALL PASS (existing tests should still pass since dialects produce same SQL for MySQL/SQL Server)

**Step 10: Commit**

```bash
git add src/main/services/database/discrete-material-plan-dao.ts src/main/services/database/materials-to-be-deleted-dao.ts src/main/services/database/materials-type-to-be-deleted-dao.ts src/main/services/database/extractor-operation-history-dao.ts
git commit -m "refactor(db): replace isSqlServer checks with SqlDialect abstraction in all DAOs"
```

---

## Task 5: Database Factory & Config Integration

**Files:**

- Modify: `src/main/services/database/index.ts`
- Modify: `src/main/services/config/config-manager.ts:47-69,302-308`
- Modify: `src/main/services/database/data-source.ts`
- Modify: `config.template.yaml`

**Step 1: Update database factory**

In `src/main/services/database/index.ts`:

Add imports:

```typescript
import { PostgreSqlService } from './postgresql'
import type { PostgreSqlConfig } from '../../types/database.types'
```

Add config factory:

```typescript
export function createPostgreSqlConfig(): PostgreSqlConfig {
  const configManager = ConfigManager.getInstance()
  const dbConfig = configManager.getConfig().database.postgresql
  return {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    maxPoolSize: dbConfig.maxPoolSize
  }
}
```

Update `create()` function (line 89):

```typescript
if (dbType === 'postgresql') {
  log.info('Creating PostgreSQL database service')
  service = new PostgreSqlService(createPostgreSqlConfig())
} else if (dbType === 'sqlserver') {
  log.info('Creating SQL Server database service')
  service = new SqlServerService(createSqlServerConfig())
} else {
  log.info('Creating MySQL database service')
  service = new MySqlService(createMySqlConfig())
}
```

Add to re-exports:

```typescript
export { PostgreSqlService } from './postgresql'
```

**Step 2: Update ConfigManager defaults**

In `src/main/services/config/config-manager.ts`, add to `DEFAULT_CONFIG.database` (after line 69):

```typescript
postgresql: {
  host: 'localhost',
  port: 5432,
  database: 'erp_db',
  username: 'postgres',
  password: '',
  maxPoolSize: 10
}
```

Update `getActiveDatabaseConfig()` (line 302-308):

```typescript
public getActiveDatabaseConfig(): MySqlConfig | SqlServerConfig | PostgreSqlConfig {
  const { activeType, mysql, sqlserver, postgresql } = this.config.database
  switch (activeType) {
    case 'postgresql': return postgresql
    case 'sqlserver': return sqlserver
    default: return mysql
  }
}
```

**Step 3: Update TypeORM data-source**

In `src/main/services/database/data-source.ts`:

Update `getDatabaseType()`:

```typescript
function getDatabaseType(): 'mysql' | 'mssql' | 'postgres' {
  const configManager = ConfigManager.getInstance()
  const dbType = configManager.getDatabaseType()
  switch (dbType) {
    case 'sqlserver':
      return 'mssql'
    case 'postgresql':
      return 'postgres'
    default:
      return 'mysql'
  }
}
```

Add postgres branch in `buildDataSourceOptions()`:

```typescript
if (type === 'mssql') {
  // ... existing mssql config
} else if (type === 'postgres') {
  const dbConfig = config.database.postgresql
  return {
    type: 'postgres',
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    ...commonOptions
  } as DataSourceOptions
} else {
  // ... existing mysql config
}
```

**Step 4: Update config template**

In `config.template.yaml`, add after sqlserver section:

```yaml
postgresql:
  host: <PG_HOST>
  port: 5432
  database: <DATABASE_NAME>
  username: <USERNAME>
  password: <PASSWORD>
  maxPoolSize: 10
```

Update header comment to mention postgresql:

```yaml
# 3. 设置 database.activeType 为 mysql、sqlserver 或 postgresql
```

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (all type errors from Task 1 should now be resolved)

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/main/services/database/index.ts src/main/services/database/data-source.ts src/main/services/config/config-manager.ts config.template.yaml
git commit -m "feat(db): integrate PostgreSQL into factory, config, and TypeORM data source"
```

---

## Task 6: Verification & Smoke Test

**Files:**

- Test: Manual integration verification

**Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 2: Run all unit tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 3: Run linter**

Run: `npm run lint`
Expected: No new errors

**Step 4: Format code**

Run: `npm run format`

**Step 5: Verify config.yaml can be parsed with postgresql section**

Create a temporary test that validates the config schema accepts postgresql:

```typescript
// In a scratch test file
import { validateConfig } from '../../src/main/types/config.schema'

const config = {
  erp: { url: 'https://example.com' },
  database: {
    activeType: 'postgresql',
    mysql: { host: 'localhost', port: 3306, database: 'test', username: 'root', password: '' },
    sqlserver: { server: 'localhost', port: 1433, database: 'test', username: 'sa', password: '' },
    postgresql: {
      host: '192.168.31.83',
      port: 5432,
      database: 'CompanyDB',
      username: 'admin',
      password: 'test'
    }
  },
  paths: { dataDir: './data/' },
  extraction: {},
  validation: {},
  cleaner: {},
  orderResolution: {},
  logging: {}
}

const result = validateConfig(config)
expect(result.success).toBe(true)
```

**Step 6: Final commit if formatting changed**

```bash
git add -A
git commit -m "chore: format and verify PostgreSQL integration"
```

---

## Summary

| Task | Description                           | New Files   | Modified Files   |
| ---- | ------------------------------------- | ----------- | ---------------- |
| 1    | Types & SqlDialect interface          | 1           | 2                |
| 2    | Three dialect implementations + tests | 4 + 3 tests | 0                |
| 3    | PostgreSqlService + test              | 1 + 1 test  | 1 (package.json) |
| 4    | Refactor all 4 DAOs                   | 0           | 4                |
| 5    | Factory, config, TypeORM integration  | 0           | 4                |
| 6    | Verification                          | 0           | 0                |

**Total:** 6 tasks, ~14 files touched (9 new, 10 modified), 5 commits
