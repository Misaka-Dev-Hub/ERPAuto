/**
 * Unit tests for MySqlDialect
 */

import { describe, it, expect } from 'vitest'
import { MySqlDialect } from '@services/database/dialects/mysql-dialect'

describe('MySqlDialect', () => {
  const dialect = new MySqlDialect()

  describe('dbType', () => {
    it('should return mysql', () => {
      expect(dialect.dbType).toBe('mysql')
    })
  })

  describe('quoteTableName', () => {
    it('should join schema and table with underscore', () => {
      expect(dialect.quoteTableName('dbo', 'Table')).toBe('dbo_Table')
    })

    it('should handle arbitrary schema and table names', () => {
      expect(dialect.quoteTableName('my_schema', 'my_table')).toBe(
        'my_schema_my_table'
      )
    })
  })

  describe('param', () => {
    it('should return ? for any index', () => {
      expect(dialect.param(0)).toBe('?')
      expect(dialect.param(1)).toBe('?')
      expect(dialect.param(5)).toBe('?')
      expect(dialect.param(100)).toBe('?')
    })
  })

  describe('params', () => {
    it('should return comma-separated question marks', () => {
      expect(dialect.params(1)).toBe('?')
      expect(dialect.params(3)).toBe('?,?,?')
      expect(dialect.params(5)).toBe('?,?,?,?,?')
    })

    it('should return empty string for count 0', () => {
      expect(dialect.params(0)).toBe('')
    })
  })

  describe('currentTimestamp', () => {
    it('should return NOW()', () => {
      expect(dialect.currentTimestamp()).toBe('NOW()')
    })
  })

  describe('upsert', () => {
    it('should generate ON DUPLICATE KEY UPDATE SQL', () => {
      const result = dialect.upsert({
        table: 'dbo_Table',
        keyColumns: ['id'],
        allColumns: ['id', 'name', 'value'],
        startParamIndex: 0
      })

      expect(result.sql).toBe(
        'INSERT INTO dbo_Table (id, name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), value = VALUES(value)'
      )
      expect(result.nextParamIndex).toBe(3)
    })

    it('should handle composite key columns', () => {
      const result = dialect.upsert({
        table: 'dbo_Table',
        keyColumns: ['id', 'code'],
        allColumns: ['id', 'code', 'name', 'value'],
        startParamIndex: 0
      })

      expect(result.sql).toContain('ON DUPLICATE KEY UPDATE')
      expect(result.sql).toContain('name = VALUES(name)')
      expect(result.sql).toContain('value = VALUES(value)')
      // key columns should NOT appear in the UPDATE SET clause
      expect(result.sql).not.toContain('id = VALUES(id)')
      expect(result.sql).not.toContain('code = VALUES(code)')
      expect(result.nextParamIndex).toBe(4)
    })

    it('should advance nextParamIndex from non-zero start', () => {
      const result = dialect.upsert({
        table: 'dbo_Table',
        keyColumns: ['id'],
        allColumns: ['id', 'name'],
        startParamIndex: 5
      })

      expect(result.nextParamIndex).toBe(7)
    })
  })

  describe('paginate', () => {
    it('should append LIMIT and OFFSET with literal values', () => {
      const result = dialect.paginate({
        sql: 'SELECT * FROM dbo_Table',
        limit: 10,
        offset: 20,
        paramIndex: 0
      })

      expect(result.sql).toBe('SELECT * FROM dbo_Table LIMIT 10 OFFSET 20')
      expect(result.nextParamIndex).toBe(0)
    })

    it('should use 0 as default offset', () => {
      const result = dialect.paginate({
        sql: 'SELECT * FROM dbo_Table',
        limit: 50,
        paramIndex: 3
      })

      expect(result.sql).toBe('SELECT * FROM dbo_Table LIMIT 50 OFFSET 0')
      expect(result.nextParamIndex).toBe(3)
    })

    it('should not change nextParamIndex (no params added)', () => {
      const result = dialect.paginate({
        sql: 'SELECT * FROM dbo_Table',
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
