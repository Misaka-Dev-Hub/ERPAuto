/**
 * Unit tests for SqlServerDialect
 */

import { describe, it, expect } from 'vitest'
import { SqlServerDialect } from '@services/database/dialects/sqlserver-dialect'

describe('SqlServerDialect', () => {
  const dialect = new SqlServerDialect()

  describe('dbType', () => {
    it('should return sqlserver', () => {
      expect(dialect.dbType).toBe('sqlserver')
    })
  })

  describe('quoteTableName', () => {
    it('should wrap schema and table in brackets', () => {
      expect(dialect.quoteTableName('dbo', 'Table')).toBe('[dbo].[Table]')
    })

    it('should handle arbitrary names', () => {
      expect(dialect.quoteTableName('my_schema', 'my_table')).toBe(
        '[my_schema].[my_table]'
      )
    })
  })

  describe('param', () => {
    it('should return @pN with 0-based index', () => {
      expect(dialect.param(0)).toBe('@p0')
      expect(dialect.param(1)).toBe('@p1')
      expect(dialect.param(5)).toBe('@p5')
    })
  })

  describe('params', () => {
    it('should return comma-separated @pN placeholders', () => {
      expect(dialect.params(1)).toBe('@p0')
      expect(dialect.params(3)).toBe('@p0,@p1,@p2')
      expect(dialect.params(5)).toBe('@p0,@p1,@p2,@p3,@p4')
    })

    it('should return empty string for count 0', () => {
      expect(dialect.params(0)).toBe('')
    })
  })

  describe('currentTimestamp', () => {
    it('should return GETDATE()', () => {
      expect(dialect.currentTimestamp()).toBe('GETDATE()')
    })
  })

  describe('upsert', () => {
    it('should generate MERGE SQL with single key column', () => {
      const result = dialect.upsert({
        table: '[dbo].[Table]',
        keyColumns: ['id'],
        allColumns: ['id', 'name', 'value'],
        startParamIndex: 0
      })

      // Should contain MERGE ... USING ... ON ... WHEN MATCHED ... WHEN NOT MATCHED ...
      expect(result.sql).toContain('MERGE [dbo].[Table] AS target')
      expect(result.sql).toContain('USING (VALUES (@p0, @p1, @p2)) AS source (id, name, value)')
      expect(result.sql).toContain('ON target.id = source.id')
      expect(result.sql).toContain('WHEN MATCHED THEN UPDATE SET')
      expect(result.sql).toContain('target.name = source.name')
      expect(result.sql).toContain('target.value = source.value')
      expect(result.sql).toContain('WHEN NOT MATCHED THEN INSERT (id, name, value)')
      expect(result.sql).toContain('VALUES (source.id, source.name, source.value)')
      expect(result.nextParamIndex).toBe(3)
    })

    it('should handle composite key columns', () => {
      const result = dialect.upsert({
        table: '[dbo].[Table]',
        keyColumns: ['id', 'code'],
        allColumns: ['id', 'code', 'name'],
        startParamIndex: 0
      })

      expect(result.sql).toContain('ON target.id = source.id AND target.code = source.code')
      // non-key columns in UPDATE SET
      expect(result.sql).toContain('target.name = source.name')
      // key columns should NOT be in UPDATE SET
      expect(result.sql).not.toMatch(/UPDATE SET[\s\S]*target\.id = source\.id/)
      expect(result.nextParamIndex).toBe(3)
    })

    it('should use startParamIndex for parameter names', () => {
      const result = dialect.upsert({
        table: '[dbo].[Table]',
        keyColumns: ['id'],
        allColumns: ['id', 'name'],
        startParamIndex: 5
      })

      expect(result.sql).toContain('@p5')
      expect(result.sql).toContain('@p6')
      expect(result.nextParamIndex).toBe(7)
    })
  })

  describe('paginate', () => {
    it('should append OFFSET/FETCH with parameterized offset when offset is provided', () => {
      const result = dialect.paginate({
        sql: 'SELECT * FROM [dbo].[Table] ORDER BY id',
        limit: 10,
        offset: 20,
        paramIndex: 0
      })

      expect(result.sql).toContain('OFFSET @p0 ROWS')
      expect(result.sql).toContain('FETCH NEXT @p1 ROWS ONLY')
      expect(result.nextParamIndex).toBe(2)
    })

    it('should use literal 0 offset when no offset is provided', () => {
      const result = dialect.paginate({
        sql: 'SELECT * FROM [dbo].[Table] ORDER BY id',
        limit: 50,
        paramIndex: 0
      })

      expect(result.sql).toContain('OFFSET 0 ROWS')
      expect(result.sql).toContain('FETCH NEXT @p0 ROWS ONLY')
      expect(result.nextParamIndex).toBe(1)
    })

    it('should advance paramIndex from non-zero start with offset', () => {
      const result = dialect.paginate({
        sql: 'SELECT * FROM [dbo].[Table] ORDER BY id',
        limit: 10,
        offset: 100,
        paramIndex: 5
      })

      expect(result.sql).toContain('OFFSET @p5 ROWS')
      expect(result.sql).toContain('FETCH NEXT @p6 ROWS ONLY')
      expect(result.nextParamIndex).toBe(7)
    })

    it('should advance paramIndex from non-zero start without offset', () => {
      const result = dialect.paginate({
        sql: 'SELECT * FROM [dbo].[Table] ORDER BY id',
        limit: 10,
        paramIndex: 3
      })

      expect(result.sql).toContain('OFFSET 0 ROWS')
      expect(result.sql).toContain('FETCH NEXT @p3 ROWS ONLY')
      expect(result.nextParamIndex).toBe(4)
    })
  })

  describe('maxBatchRows', () => {
    it('should return floor(2000 / columnsPerRow)', () => {
      expect(dialect.maxBatchRows(10)).toBe(200)
      expect(dialect.maxBatchRows(28)).toBe(71)
      expect(dialect.maxBatchRows(1)).toBe(2000)
      expect(dialect.maxBatchRows(100)).toBe(20)
    })
  })
})
