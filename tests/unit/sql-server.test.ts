/**
 * Unit tests for SqlServerService
 * Covers both unconnected state and connected-path operations using mocked mssql driver.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SqlServerService } from '@main/services/database/sql-server'

// ---- Hoisted mock functions ----
const {
  mockPoolConnect,
  mockPoolClose,
  mockRequestInput,
  mockRequestQuery,
  mockTransactionBegin,
  mockTransactionCommit,
  mockTransactionRollback,
  mockPool,
  mockRequest,
  mockTransaction
} = vi.hoisted(() => {
  const request = {
    input: vi.fn(),
    query: vi.fn()
  }
  const transaction = {
    begin: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn()
  }
  const pool = {
    connect: vi.fn(),
    request: vi.fn(() => request),
    close: vi.fn(),
    connected: true
  }
  return {
    mockPoolConnect: pool.connect,
    mockPoolClose: pool.close,
    mockRequestInput: request.input,
    mockRequestQuery: request.query,
    mockTransactionBegin: transaction.begin,
    mockTransactionCommit: transaction.commit,
    mockTransactionRollback: transaction.rollback,
    mockPool: pool,
    mockRequest: request,
    mockTransaction: transaction
  }
})

// Mock mssql driver (must use regular functions because source uses `new`)
vi.mock('mssql', () => ({
  default: {
    ConnectionPool: vi.fn(function () {
      return mockPool
    }),
    Transaction: vi.fn(function () {
      return mockTransaction
    }),
    Request: vi.fn(function () {
      return mockRequest
    })
  }
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
  server: 'localhost',
  port: 1433,
  user: 'test',
  password: 'test',
  database: 'testdb',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
}

describe('SqlServerService Unit Tests', () => {
  let service: SqlServerService

  beforeEach(() => {
    vi.clearAllMocks()
    mockPool.connected = true
    mockPoolConnect.mockResolvedValue(undefined)
    mockPoolClose.mockResolvedValue(undefined)
    mockRequestInput.mockReturnThis()
    mockRequestQuery.mockResolvedValue({
      recordset: [],
      rowsAffected: [0]
    })
    mockTransactionBegin.mockResolvedValue(undefined)
    mockTransactionCommit.mockResolvedValue(undefined)
    mockTransactionRollback.mockResolvedValue(undefined)
    service = new SqlServerService(mockConfig)
  })

  describe('constructor', () => {
    it('should create service with config', () => {
      expect(service).toBeDefined()
      expect(service.isConnected()).toBe(false)
    })
  })

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(service.isConnected()).toBe(false)
    })
  })

  describe('connect', () => {
    it('should throw error when connection fails', async () => {
      mockPool.connected = false
      mockPoolConnect.mockRejectedValue(new Error('connection refused'))
      const svc = new SqlServerService(mockConfig)
      await expect(svc.connect()).rejects.toThrow('Failed to connect to SQL Server')
    })

    it('should establish connection via pool', async () => {
      await service.connect()
      expect(mockPoolConnect).toHaveBeenCalled()
      expect(service.isConnected()).toBe(true)
    })

    it('should throw when already connected', async () => {
      await service.connect()
      await expect(service.connect()).rejects.toThrow('Already connected to SQL Server')
    })
  })

  describe('query', () => {
    it('should throw error when not connected', async () => {
      await expect(service.query('SELECT 1')).rejects.toThrow('Not connected to SQL Server')
    })

    it('should execute SELECT and return rows with columns', async () => {
      await service.connect()
      mockRequestQuery.mockResolvedValue({
        recordset: [
          { ID: 1, Name: 'test' },
          { ID: 2, Name: 'foo' }
        ],
        rowsAffected: [2]
      })

      const result = await service.query('SELECT ID, Name FROM Users')

      expect(mockRequestQuery).toHaveBeenCalledWith('SELECT ID, Name FROM Users')
      expect(result.rows).toEqual([
        { ID: 1, Name: 'test' },
        { ID: 2, Name: 'foo' }
      ])
      expect(result.columns).toEqual(['ID', 'Name'])
      expect(result.rowCount).toBe(2)
    })

    it('should convert array params to @p0, @p1, ... format', async () => {
      await service.connect()
      mockRequestQuery.mockResolvedValue({ recordset: [], rowsAffected: [0] })

      await service.query('SELECT * FROM Users WHERE ID = @p0 AND Name = @p1', [42, 'test'])

      expect(mockRequestInput).toHaveBeenCalledWith('p0', 42)
      expect(mockRequestInput).toHaveBeenCalledWith('p1', 'test')
    })

    it('should handle INSERT/UPDATE with rowsAffected', async () => {
      await service.connect()
      mockRequestQuery.mockResolvedValue({
        recordset: undefined,
        rowsAffected: [5]
      })

      const result = await service.query('DELETE FROM Users WHERE Active = 0')

      expect(result.rows).toEqual([])
      expect(result.columns).toEqual([])
      expect(result.rowCount).toBe(5)
    })

    it('should fallback to rows.length when rowsAffected is missing', async () => {
      await service.connect()
      mockRequestQuery.mockResolvedValue({
        recordset: [{ ID: 1 }, { ID: 2 }],
        rowsAffected: undefined
      })

      const result = await service.query('SELECT ID FROM Users')
      expect(result.rowCount).toBe(2)
    })

    it('should wrap query errors with context', async () => {
      await service.connect()
      mockRequestQuery.mockRejectedValue(new Error('syntax error'))

      await expect(service.query('INVALID SQL')).rejects.toThrow('SQL Server query failed')
    })
  })

  describe('queryWithParams', () => {
    it('should throw error when not connected', async () => {
      await expect(service.queryWithParams('SELECT @p0', { p0: { value: 1 } })).rejects.toThrow(
        'Not connected to SQL Server'
      )
    })

    it('should add typed params via request.input', async () => {
      await service.connect()
      mockRequestQuery.mockResolvedValue({ recordset: [{ ID: 1 }], rowsAffected: [1] })

      await service.queryWithParams('SELECT @id', {
        id: { value: 42 },
        name: { value: 'test', type: 'NVarChar' as any }
      })

      expect(mockRequestInput).toHaveBeenCalledWith('id', 42)
      expect(mockRequestInput).toHaveBeenCalledWith('name', 'NVarChar', 'test')
    })
  })

  describe('transaction', () => {
    it('should throw error when not connected', async () => {
      await expect(service.transaction([{ sql: 'SELECT 1' }])).rejects.toThrow(
        'Not connected to SQL Server'
      )
    })

    it('should execute all queries and commit', async () => {
      await service.connect()
      mockRequestQuery.mockResolvedValue({ recordset: [], rowsAffected: [1] })

      await service.transaction([
        { sql: 'INSERT INTO t VALUES (@p0)', params: [1] },
        { sql: 'UPDATE t SET x = 1' }
      ])

      expect(mockTransactionBegin).toHaveBeenCalled()
      expect(mockRequestQuery).toHaveBeenCalledTimes(2)
      expect(mockRequestInput).toHaveBeenCalledWith('p0', 1)
      expect(mockTransactionCommit).toHaveBeenCalled()
      expect(mockTransactionRollback).not.toHaveBeenCalled()
    })

    it('should rollback on query failure', async () => {
      await service.connect()
      mockRequestQuery.mockRejectedValue(new Error('constraint violation'))

      await expect(
        service.transaction([{ sql: 'INSERT INTO t VALUES (@p0)', params: [1] }])
      ).rejects.toThrow('SQL Server transaction failed')

      expect(mockTransactionRollback).toHaveBeenCalled()
      expect(mockTransactionCommit).not.toHaveBeenCalled()
    })
  })

  describe('disconnect', () => {
    it('should resolve when not connected', async () => {
      await expect(service.disconnect()).resolves.not.toThrow()
    })

    it('should close pool and reset state', async () => {
      await service.connect()
      expect(service.isConnected()).toBe(true)

      await service.disconnect()

      expect(mockPoolClose).toHaveBeenCalled()
      expect(service.isConnected()).toBe(false)
    })

    it('should wrap disconnect errors', async () => {
      await service.connect()
      mockPoolClose.mockRejectedValue(new Error('pool close failed'))

      await expect(service.disconnect()).rejects.toThrow('Failed to disconnect from SQL Server')
    })
  })
})
