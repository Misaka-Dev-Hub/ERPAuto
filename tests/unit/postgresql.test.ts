/**
 * Unit tests for PostgreSqlService
 * These tests do not require a PostgreSQL instance
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PostgreSqlService, prepareSql } from '@main/services/database/postgresql'

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
      const invalidConfig = { ...mockConfig, host: 'invalid-host-that-does-not-exist' }
      const invalidService = new PostgreSqlService(invalidConfig)
      await expect(invalidService.connect()).rejects.toThrow('Failed to connect to PostgreSQL')
    })
  })

  describe('disconnect', () => {
    it('should resolve when not connected', async () => {
      await expect(service.disconnect()).resolves.not.toThrow()
    })
  })
})

describe('prepareSql', () => {
  it('should quote unquoted column names in SELECT', () => {
    const sql = 'SELECT ID, UserName, UserType FROM "dbo"."BIPUsers"'
    const result = prepareSql(sql)
    expect(result).toBe('SELECT "ID", "UserName", "UserType" FROM "dbo"."BIPUsers"')
  })

  it('should quote column names in WHERE clause', () => {
    const sql = 'WHERE UserName = $1 AND Password = $2'
    const result = prepareSql(sql)
    expect(result).toBe('WHERE "UserName" = $1 AND "Password" = $2')
  })

  it('should quote column names in INSERT', () => {
    const sql = 'INSERT INTO "dbo"."BIPUsers" (UserName, Password, UserType) VALUES ($1, $2, $3)'
    const result = prepareSql(sql)
    expect(result).toBe(
      'INSERT INTO "dbo"."BIPUsers" ("UserName", "Password", "UserType") VALUES ($1, $2, $3)'
    )
  })

  it('should quote column names in UPDATE SET', () => {
    const sql = 'UPDATE "dbo"."BIPUsers" SET UserType = $1 WHERE UserName = $2'
    const result = prepareSql(sql)
    expect(result).toBe('UPDATE "dbo"."BIPUsers" SET "UserType" = $1 WHERE "UserName" = $2')
  })

  it('should quote column names in DELETE', () => {
    const sql = 'DELETE FROM "dbo"."BIPUsers" WHERE UserName = $1'
    const result = prepareSql(sql)
    expect(result).toBe('DELETE FROM "dbo"."BIPUsers" WHERE "UserName" = $1')
  })

  it('should quote column names in ORDER BY', () => {
    const sql = 'SELECT UserName FROM "dbo"."BIPUsers" ORDER BY UserName'
    const result = prepareSql(sql)
    expect(result).toBe('SELECT "UserName" FROM "dbo"."BIPUsers" ORDER BY "UserName"')
  })

  it('should not quote SQL keywords', () => {
    const sql = 'SELECT ID FROM "dbo"."BIPUsers" WHERE UserName = $1'
    const result = prepareSql(sql)
    expect(result).not.toContain('"SELECT"')
    expect(result).not.toContain('"FROM"')
    expect(result).not.toContain('"WHERE"')
    expect(result).not.toContain('"AND"')
  })

  it('should not quote already-quoted identifiers', () => {
    const sql = 'SELECT "ID" FROM "dbo"."BIPUsers"'
    const result = prepareSql(sql)
    expect(result).toBe('SELECT "ID" FROM "dbo"."BIPUsers"')
  })

  it('should preserve string literals', () => {
    const sql = "WHERE Status = 'active'"
    const result = prepareSql(sql)
    expect(result).toBe('WHERE "Status" = \'active\'')
  })

  it('should preserve string literals with escaped quotes', () => {
    const sql = "WHERE UserName = 'O''Brien'"
    const result = prepareSql(sql)
    expect(result).toBe("WHERE \"UserName\" = 'O''Brien'")
  })

  it('should preserve $N parameter placeholders', () => {
    const sql = 'WHERE UserName = $1 AND Password = $2'
    const result = prepareSql(sql)
    expect(result).toContain('$1')
    expect(result).toContain('$2')
  })

  it('should handle COUNT(*) correctly', () => {
    const sql = 'SELECT COUNT(*) as count FROM "dbo"."BIPUsers" WHERE UserName = $1'
    const result = prepareSql(sql)
    expect(result).toBe('SELECT COUNT(*) as count FROM "dbo"."BIPUsers" WHERE "UserName" = $1')
  })

  it('should quote underscore-containing column names', () => {
    const sql = 'SELECT ERP_URL, ERP_Username, ERP_Password FROM "dbo"."BIPUsers"'
    const result = prepareSql(sql)
    expect(result).toBe('SELECT "ERP_URL", "ERP_Username", "ERP_Password" FROM "dbo"."BIPUsers"')
  })

  it('should handle ON CONFLICT DO UPDATE SET with EXCLUDED', () => {
    const sql =
      'INSERT INTO "dbo"."Materials" (MaterialCode, ManagerName) VALUES ($1, $2) ON CONFLICT ("MaterialCode") DO UPDATE SET "ManagerName" = EXCLUDED."ManagerName"'
    const result = prepareSql(sql)
    expect(result).toBe(
      'INSERT INTO "dbo"."Materials" ("MaterialCode", "ManagerName") VALUES ($1, $2) ON CONFLICT ("MaterialCode") DO UPDATE SET "ManagerName" = EXCLUDED."ManagerName"'
    )
  })

  it('should handle CURRENT_TIMESTAMP without quoting', () => {
    const sql = 'INSERT INTO t (OperationTime) VALUES (CURRENT_TIMESTAMP)'
    const result = prepareSql(sql)
    expect(result).toBe('INSERT INTO "t" ("OperationTime") VALUES (CURRENT_TIMESTAMP)')
  })

  it('should handle LIMIT OFFSET without quoting', () => {
    const sql = 'SELECT UserName FROM "dbo"."BIPUsers" LIMIT 10 OFFSET 20'
    const result = prepareSql(sql)
    expect(result).toBe('SELECT "UserName" FROM "dbo"."BIPUsers" LIMIT 10 OFFSET 20')
  })

  it('should return empty string for empty input', () => {
    expect(prepareSql('')).toBe('')
  })

  it('should handle full BIPUsersDAO authenticate query', () => {
    const sql = `
        SELECT ID, UserName, UserType
        FROM "dbo"."BIPUsers"
        WHERE UserName = $1 AND Password = $2
      `
    const result = prepareSql(sql)
    expect(result).toContain('"ID"')
    expect(result).toContain('"UserName"')
    expect(result).toContain('"UserType"')
    expect(result).toContain('"Password"')
    expect(result).toContain('$1')
    expect(result).toContain('$2')
    expect(result).toContain('"dbo"."BIPUsers"')
  })

  it('should handle full BIPUsersDAO userExists query', () => {
    const sql = `
        SELECT COUNT(*) as count
        FROM "dbo"."BIPUsers"
        WHERE UserName = $1
      `
    const result = prepareSql(sql)
    expect(result).toContain('COUNT(*)')
    expect(result).toContain('as count')
    expect(result).toContain('"UserName"')
  })
})
