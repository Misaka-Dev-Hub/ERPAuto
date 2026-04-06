/**
 * Unit tests for PostgreSqlService
 * Covers both unconnected state and connected-path operations using mocked pg driver.
 * Also tests the prepareSql pure function (no mocks needed for those).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PostgreSqlService, prepareSql } from '@main/services/database/postgresql'

// ---- Hoisted mock functions ----
const { mockPgPool, mockPgClient } = vi.hoisted(() => {
  const client = {
    query: vi.fn(),
    release: vi.fn()
  }
  const pool = {
    connect: vi.fn(() => client),
    query: vi.fn(),
    end: vi.fn()
  }
  return { mockPgPool: pool, mockPgClient: client }
})

// Mock pg driver (must use regular function because source uses `new Pool(...)`)
vi.mock('pg', () => ({
  Pool: vi.fn(function () {
    return mockPgPool
  })
}))

// Mock logger
vi.mock('@main/services/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }),
  trackDuration: async <T>(fn: () => Promise<T>) => {
    const result = await fn()
    return { result }
  }
}))

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
    vi.clearAllMocks()
    service = new PostgreSqlService(mockConfig)
    mockPgPool.connect.mockResolvedValue(mockPgClient)
    mockPgPool.query.mockResolvedValue({ rows: [], fields: [], rowCount: 0 })
    mockPgPool.end.mockResolvedValue(undefined)
    mockPgClient.query.mockResolvedValue({ rows: [] })
    mockPgClient.release.mockReturnValue(undefined)
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

  describe('connect', () => {
    it('should throw error when pool creation fails', async () => {
      mockPgPool.connect.mockRejectedValue(new Error('connection refused'))
      const svc = new PostgreSqlService(mockConfig)
      await expect(svc.connect()).rejects.toThrow('Failed to connect to PostgreSQL')
    })

    it('should establish connection and release test client', async () => {
      await service.connect()
      expect(mockPgPool.connect).toHaveBeenCalled()
      expect(mockPgClient.release).toHaveBeenCalled()
      expect(service.isConnected()).toBe(true)
    })

    it('should throw when already connected', async () => {
      await service.connect()
      await expect(service.connect()).rejects.toThrow('Already connected to PostgreSQL')
    })

    it('should reset pool to null on connection failure', async () => {
      mockPgPool.connect.mockRejectedValue(new Error('timeout'))
      await expect(service.connect()).rejects.toThrow('Failed to connect to PostgreSQL')
      expect(service.isConnected()).toBe(false)
    })
  })

  describe('query', () => {
    it('should throw error when not connected', async () => {
      await expect(service.query('SELECT 1')).rejects.toThrow('Not connected to PostgreSQL')
    })

    it('should execute query and return rows with columns', async () => {
      await service.connect()
      mockPgPool.query.mockResolvedValue({
        rows: [{ ID: 1, Name: 'test' }],
        fields: [{ name: 'ID' }, { name: 'Name' }],
        rowCount: 1
      })

      const result = await service.query('SELECT ID, Name FROM Users')

      expect(result.rows).toEqual([{ ID: 1, Name: 'test' }])
      expect(result.columns).toEqual(['ID', 'Name'])
      expect(result.rowCount).toBe(1)
    })

    it('should pass params through to pool.query', async () => {
      await service.connect()
      mockPgPool.query.mockResolvedValue({ rows: [], fields: [], rowCount: 0 })

      await service.query('SELECT * FROM Users WHERE ID = $1', [42])

      expect(mockPgPool.query).toHaveBeenCalledWith(expect.any(String), [42])
    })

    it('should fallback to rows.length when rowCount is null', async () => {
      await service.connect()
      mockPgPool.query.mockResolvedValue({
        rows: [{ ID: 1 }, { ID: 2 }],
        fields: [{ name: 'ID' }],
        rowCount: null
      })

      const result = await service.query('SELECT ID FROM Users')
      expect(result.rowCount).toBe(2)
    })

    it('should wrap query errors with context', async () => {
      await service.connect()
      mockPgPool.query.mockRejectedValue(new Error('syntax error'))

      await expect(service.query('INVALID SQL')).rejects.toThrow('PostgreSQL query failed')
    })
  })

  describe('transaction', () => {
    it('should throw error when not connected', async () => {
      await expect(service.transaction([{ sql: 'SELECT 1' }])).rejects.toThrow(
        'Not connected to PostgreSQL'
      )
    })

    it('should execute all queries within BEGIN/COMMIT and release client', async () => {
      await service.connect()
      mockPgClient.query.mockResolvedValue({ rows: [] })

      await service.transaction([
        { sql: 'SELECT 1', params: [1] },
        { sql: 'SELECT 2' }
      ])

      // BEGIN + 2 queries + COMMIT
      expect(mockPgClient.query).toHaveBeenCalledTimes(4)
      expect(mockPgClient.query).toHaveBeenNthCalledWith(1, 'BEGIN')
      expect(mockPgClient.query).toHaveBeenNthCalledWith(4, 'COMMIT')
      expect(mockPgClient.release).toHaveBeenCalled()
    })

    it('should rollback and release client on query failure', async () => {
      await service.connect()
      mockPgClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('constraint violation')) // query fails
        .mockResolvedValueOnce({ rows: [] }) // ROLLBACK

      await expect(
        service.transaction([{ sql: 'SELECT 1', params: [1] }])
      ).rejects.toThrow('PostgreSQL transaction failed')

      expect(mockPgClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockPgClient.release).toHaveBeenCalled()
    })
  })

  describe('disconnect', () => {
    it('should resolve when not connected', async () => {
      await expect(service.disconnect()).resolves.not.toThrow()
    })

    it('should end pool and reset state', async () => {
      await service.connect()
      expect(service.isConnected()).toBe(true)

      await service.disconnect()

      expect(mockPgPool.end).toHaveBeenCalled()
      expect(service.isConnected()).toBe(false)
    })

    it('should wrap disconnect errors', async () => {
      await service.connect()
      mockPgPool.end.mockRejectedValue(new Error('pool end failed'))

      await expect(service.disconnect()).rejects.toThrow('Failed to disconnect from PostgreSQL')
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
    const sql =
      'INSERT INTO "dbo"."BIPUsers" (UserName, Password, UserType) VALUES ($1, $2, $3)'
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
    expect(result).toBe(
      'SELECT "ERP_URL", "ERP_Username", "ERP_Password" FROM "dbo"."BIPUsers"'
    )
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

  // ==================== Window Functions ====================

  it('should handle ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)', () => {
    const sql = `
      SELECT UserName, ROW_NUMBER() OVER (PARTITION BY UserType ORDER BY CreatedAt DESC) as rn
      FROM "dbo"."BIPUsers"
    `
    const result = prepareSql(sql)
    expect(result).toContain('"UserName"')
    expect(result).toContain('"UserType"')
    expect(result).toContain('"CreatedAt"')
    expect(result).not.toContain('"ROW_NUMBER"')
    expect(result).not.toContain('"OVER"')
    expect(result).not.toContain('"PARTITION"')
    expect(result).not.toContain('"ORDER"')
  })

  it('should handle RANK() and DENSE_RANK()', () => {
    const sql = `
      SELECT MaterialCode, RANK() OVER (ORDER BY Quantity DESC) as rnk, DENSE_RANK() OVER (ORDER BY Quantity DESC) as drnk
      FROM "dbo"."Materials"
    `
    const result = prepareSql(sql)
    expect(result).toContain('"MaterialCode"')
    expect(result).toContain('"Quantity"')
    expect(result).not.toContain('"RANK"')
    expect(result).not.toContain('"DENSE_RANK"')
  })

  it('should handle LAG() and LEAD()', () => {
    const sql = `
      SELECT OrderId, LAG(TotalAmount, 1) OVER (ORDER BY OrderDate) as prevAmount, LEAD(TotalAmount, 1) OVER (ORDER BY OrderDate) as nextAmount
      FROM "dbo"."Orders"
    `
    const result = prepareSql(sql)
    expect(result).toContain('"OrderId"')
    expect(result).toContain('"TotalAmount"')
    expect(result).toContain('"OrderDate"')
    expect(result).not.toContain('"LAG"')
    expect(result).not.toContain('"LEAD"')
  })

  // ==================== CTEs (Common Table Expressions) ====================

  it('should handle WITH clause', () => {
    const sql = `
      WITH UserSummary AS (
        SELECT UserId, COUNT(OrderId) as OrderCount
        FROM "dbo"."Orders"
        GROUP BY UserId
      )
      SELECT UserName, OrderCount
      FROM UserSummary
      JOIN "dbo"."BIPUsers" ON UserSummary.UserId = "dbo"."BIPUsers".ID
    `
    const result = prepareSql(sql)
    expect(result).toContain('"UserId"')
    expect(result).toContain('"OrderId"')
    expect(result).toContain('"UserName"')
    expect(result).not.toContain('"WITH"')
    expect(result).not.toContain('"AS"')
    expect(result).not.toContain('"FROM"')
    expect(result).not.toContain('"JOIN"')
    expect(result).not.toContain('"ON"')
  })

  it('should handle recursive CTE', () => {
    const sql = `
      WITH RECURSIVE CategoryTree AS (
        SELECT CategoryId, ParentCategoryId, CategoryName, 0 as Level
        FROM "dbo"."Categories"
        WHERE ParentCategoryId IS NULL
        UNION ALL
        SELECT c.CategoryId, c.ParentCategoryId, c.CategoryName, ct.Level + 1
        FROM "dbo"."Categories" c
        INNER JOIN CategoryTree ct ON c.ParentCategoryId = ct.CategoryId
      )
      SELECT * FROM CategoryTree
    `
    const result = prepareSql(sql)
    expect(result).toContain('"CategoryId"')
    expect(result).toContain('"ParentCategoryId"')
    expect(result).toContain('"CategoryName"')
    expect(result).not.toContain('"WITH"')
    expect(result).not.toContain('"RECURSIVE"')
    expect(result).not.toContain('"UNION"')
    expect(result).not.toContain('"ALL"')
    expect(result).not.toContain('"INNER"')
    expect(result).not.toContain('"JOIN"')
  })

  // ==================== Advanced Grouping ====================

  it('should handle ROLLUP', () => {
    const sql = `
      SELECT DepartmentId, JobTitle, COUNT(*) as EmployeeCount
      FROM "dbo"."Employees"
      GROUP BY ROLLUP (DepartmentId, JobTitle)
    `
    const result = prepareSql(sql)
    expect(result).toContain('"DepartmentId"')
    expect(result).toContain('"JobTitle"')
    expect(result).not.toContain('"GROUP"')
    expect(result).not.toContain('"BY"')
    expect(result).not.toContain('"ROLLUP"')
  })

  it('should handle CUBE', () => {
    const sql = `
      SELECT Year, Quarter, Region, SUM(SalesAmount) as TotalSales
      FROM "dbo"."Sales"
      GROUP BY CUBE (Year, Quarter, Region)
    `
    const result = prepareSql(sql)
    expect(result).toContain('"Year"')
    expect(result).toContain('"Quarter"')
    expect(result).toContain('"Region"')
    expect(result).toContain('"SalesAmount"')
    expect(result).not.toContain('"CUBE"')
    expect(result).not.toContain('"GROUP"')
    expect(result).not.toContain('"BY"')
  })

  it('should handle GROUPING SETS', () => {
    const sql = `
      SELECT DepartmentId, JobTitle, COUNT(*) as EmployeeCount
      FROM "dbo"."Employees"
      GROUP BY GROUPING SETS ((DepartmentId, JobTitle), (DepartmentId), ())
    `
    const result = prepareSql(sql)
    expect(result).toContain('"DepartmentId"')
    expect(result).toContain('"JobTitle"')
    expect(result).not.toContain('"GROUPING"')
    expect(result).not.toContain('"SETS"')
    expect(result).not.toContain('"GROUP"')
    expect(result).not.toContain('"BY"')
  })

  // ==================== CASE Expressions ====================

  it('should handle simple CASE', () => {
    const sql = `
      SELECT UserName, CASE UserType
        WHEN 'admin' THEN 'Administrator'
        WHEN 'user' THEN 'Regular User'
        ELSE 'Guest'
      END as UserRole
      FROM "dbo"."BIPUsers"
    `
    const result = prepareSql(sql)
    expect(result).toContain('"UserName"')
    expect(result).toContain('"UserType"')
    expect(result).not.toContain('"CASE"')
    expect(result).not.toContain('"WHEN"')
    expect(result).not.toContain('"THEN"')
    expect(result).not.toContain('"ELSE"')
    expect(result).not.toContain('"END"')
  })

  it('should handle searched CASE', () => {
    const sql = `
      SELECT OrderId, TotalAmount,
        CASE
          WHEN TotalAmount > 10000 THEN 'Large'
          WHEN TotalAmount > 1000 THEN 'Medium'
          ELSE 'Small'
        END as OrderSize
      FROM "dbo"."Orders"
    `
    const result = prepareSql(sql)
    expect(result).toContain('"OrderId"')
    expect(result).toContain('"TotalAmount"')
    expect(result).not.toContain('"CASE"')
    expect(result).not.toContain('"WHEN"')
    expect(result).not.toContain('"THEN"')
    expect(result).not.toContain('"ELSE"')
    expect(result).not.toContain('"END"')
  })

  // ==================== Set Operations ====================

  it('should handle UNION, UNION ALL, INTERSECT, EXCEPT', () => {
    const sql = `
      SELECT UserId FROM "dbo"."ActiveUsers"
      UNION
      SELECT UserId FROM "dbo"."PremiumUsers"
      UNION ALL
      SELECT UserId FROM "dbo"."TrialUsers"
      INTERSECT
      SELECT UserId FROM "dbo"."VerifiedUsers"
      EXCEPT
      SELECT UserId FROM "dbo"."BannedUsers"
    `
    const result = prepareSql(sql)
    expect(result).toContain('"UserId"')
    expect(result).not.toContain('"UNION"')
    expect(result).not.toContain('"ALL"')
    expect(result).not.toContain('"INTERSECT"')
    expect(result).not.toContain('"EXCEPT"')
    expect(result).not.toContain('"SELECT"')
    expect(result).not.toContain('"FROM"')
  })

  // ==================== JSON Operators ====================

  it('should handle -> and ->> operators', () => {
    const sql = `
      SELECT UserId, ProfileData->'address'->>'city' as City, ProfileData->'contact'->>'phone' as Phone
      FROM "dbo"."Users"
      WHERE ProfileData->'preferences'->>'newsletter' = 'true'
    `
    const result = prepareSql(sql)
    expect(result).toContain('"UserId"')
    expect(result).toContain('"ProfileData"')
    expect(result).toContain('->')
    expect(result).toContain('->>')
    expect(result).not.toContain('"SELECT"')
    expect(result).not.toContain('"FROM"')
    expect(result).not.toContain('"WHERE"')
  })
})
