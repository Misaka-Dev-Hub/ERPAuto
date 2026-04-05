/**
 * Unit tests for PostgreSqlDialect
 */

import { describe, it, expect } from 'vitest'
import { PostgreSqlDialect } from '@services/database/dialects/postgresql-dialect'

describe('PostgreSqlDialect', () => {
  const dialect = new PostgreSqlDialect()

  describe('dbType', () => {
    it('should return postgresql', () => {
      expect(dialect.dbType).toBe('postgresql')
    })
  })

  describe('quoteTableName', () => {
    it('should wrap schema and table in double quotes', () => {
      expect(dialect.quoteTableName('dbo', 'Table')).toBe('"dbo"."Table"')
    })

    it('should handle arbitrary names', () => {
      expect(dialect.quoteTableName('my_schema', 'my_table')).toBe(
        '"my_schema"."my_table"'
      )
    })
  })

  describe('param', () => {
    it('should return $N with 1-based index ($1 for param(0))', () => {
      expect(dialect.param(0)).toBe('$1')
      expect(dialect.param(1)).toBe('$2')
      expect(dialect.param(3)).toBe('$4')
      expect(dialect.param(10)).toBe('$11')
    })
  })

  describe('params', () => {
    it('should return comma-separated $N placeholders (1-based)', () => {
      expect(dialect.params(1)).toBe('$1')
      expect(dialect.params(3)).toBe('$1,$2,$3')
      expect(dialect.params(5)).toBe('$1,$2,$3,$4,$5')
    })

    it('should return empty string for count 0', () => {
      expect(dialect.params(0)).toBe('')
    })
  })

  describe('currentTimestamp', () => {
    it('should return CURRENT_TIMESTAMP', () => {
      expect(dialect.currentTimestamp()).toBe('CURRENT_TIMESTAMP')
    })
  })

  describe('upsert', () => {
    it('should generate ON CONFLICT DO UPDATE SQL', () => {
      const result = dialect.upsert({
        table: '"dbo"."Table"',
        keyColumns: ['id'],
        allColumns: ['id', 'name', 'value'],
        startParamIndex: 0
      })

      expect(result.sql).toContain('INSERT INTO "dbo"."Table" (id, name, value)')
      expect(result.sql).toContain('VALUES ($1, $2, $3)')
      expect(result.sql).toContain('ON CONFLICT ("id")')
      expect(result.sql).toContain('DO UPDATE SET')
      expect(result.sql).toContain('"name" = EXCLUDED."name"')
      expect(result.sql).toContain('"value" = EXCLUDED."value"')
      // key column should NOT appear in DO UPDATE SET
      expect(result.sql).not.toContain('"id" = EXCLUDED."id"')
      expect(result.nextParamIndex).toBe(3)
    })

    it('should handle composite key columns with all double-quoted', () => {
      const result = dialect.upsert({
        table: '"dbo"."Table"',
        keyColumns: ['id', 'code'],
        allColumns: ['id', 'code', 'name'],
        startParamIndex: 0
      })

      expect(result.sql).toContain('ON CONFLICT ("id", "code")')
      expect(result.sql).toContain('"name" = EXCLUDED."name"')
      expect(result.nextParamIndex).toBe(3)
    })

    it('should use startParamIndex for parameter numbering', () => {
      const result = dialect.upsert({
        table: '"dbo"."Table"',
        keyColumns: ['id'],
        allColumns: ['id', 'name'],
        startParamIndex: 5
      })

      // startParamIndex=5 means $6, $7 (1-based: index+1)
      expect(result.sql).toContain('$6')
      expect(result.sql).toContain('$7')
      expect(result.nextParamIndex).toBe(7)
    })
  })

  describe('paginate', () => {
    it('should append LIMIT and OFFSET with literal values', () => {
      const result = dialect.paginate({
        sql: 'SELECT * FROM "dbo"."Table"',
        limit: 10,
        offset: 20,
        paramIndex: 0
      })

      expect(result.sql).toBe('SELECT * FROM "dbo"."Table" LIMIT 10 OFFSET 20')
      expect(result.nextParamIndex).toBe(0)
    })

    it('should use 0 as default offset', () => {
      const result = dialect.paginate({
        sql: 'SELECT * FROM "dbo"."Table"',
        limit: 50,
        paramIndex: 3
      })

      expect(result.sql).toBe('SELECT * FROM "dbo"."Table" LIMIT 50 OFFSET 0')
      expect(result.nextParamIndex).toBe(3)
    })

    it('should not change nextParamIndex (no params added)', () => {
      const result = dialect.paginate({
        sql: 'SELECT * FROM "dbo"."Table"',
        limit: 100,
        offset: 50,
        paramIndex: 10
      })

      expect(result.nextParamIndex).toBe(10)
    })
  })

  describe('maxBatchRows', () => {
    it('should return 1000 regardless of columns', () => {
      expect(dialect.maxBatchRows(1)).toBe(1000)
      expect(dialect.maxBatchRows(10)).toBe(1000)
      expect(dialect.maxBatchRows(100)).toBe(1000)
    })
  })
})
