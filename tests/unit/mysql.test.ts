/**
 * Unit tests for MySqlService
 * Covers both unconnected state and connected-path operations using mocked mysql2/promise.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MySqlService } from '@services/database/mysql'

// ---- Hoisted mock functions ----
const {
  mockCreateConnection,
  mockPing,
  mockExecute,
  mockBeginTransaction,
  mockCommit,
  mockRollback,
  mockEnd
} = vi.hoisted(() => ({
  mockCreateConnection: vi.fn(),
  mockPing: vi.fn(),
  mockExecute: vi.fn(),
  mockBeginTransaction: vi.fn(),
  mockCommit: vi.fn(),
  mockRollback: vi.fn(),
  mockEnd: vi.fn()
}))

// Mock mysql2/promise driver
vi.mock('mysql2/promise', () => ({
  default: {
    createConnection: mockCreateConnection
  }
}))

// Mock logger
vi.mock('@services/logger', () => ({
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
  port: 3306,
  user: 'test',
  password: 'test',
  database: 'testdb'
}

function createMockConnection() {
  return {
    ping: mockPing,
    execute: mockExecute,
    beginTransaction: mockBeginTransaction,
    commit: mockCommit,
    rollback: mockRollback,
    end: mockEnd
  }
}

describe('MySqlService Unit Tests', () => {
  let service: MySqlService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new MySqlService(mockConfig)
    mockCreateConnection.mockResolvedValue(createMockConnection())
    mockPing.mockResolvedValue(undefined)
    mockExecute.mockResolvedValue([[], []])
    mockBeginTransaction.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockRollback.mockResolvedValue(undefined)
    mockEnd.mockResolvedValue(undefined)
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
      mockCreateConnection.mockRejectedValue(new Error('connect ECONNREFUSED'))
      await expect(service.connect()).rejects.toThrow('Failed to connect to MySQL')
    })

    it('should establish connection and ping server', async () => {
      await service.connect()
      expect(mockCreateConnection).toHaveBeenCalledWith({
        host: 'localhost',
        port: 3306,
        user: 'test',
        password: 'test',
        database: 'testdb'
      })
      expect(mockPing).toHaveBeenCalled()
      expect(service.isConnected()).toBe(true)
    })

    it('should throw when already connected', async () => {
      await service.connect()
      await expect(service.connect()).rejects.toThrow('Already connected to MySQL')
    })

    it('should throw when ping fails after connection created', async () => {
      mockPing.mockRejectedValue(new Error('ping failed'))
      await expect(service.connect()).rejects.toThrow('Failed to connect to MySQL')
      // Note: source sets connection before ping, so it remains non-null after ping failure
    })
  })

  describe('query', () => {
    it('should throw error when not connected', async () => {
      await expect(service.query('SELECT 1')).rejects.toThrow('Not connected to MySQL')
    })

    it('should execute SELECT and return rows with columns', async () => {
      await service.connect()
      mockExecute.mockResolvedValue([
        [
          { id: 1, name: 'test' },
          { id: 2, name: 'foo' }
        ],
        [{ name: 'id' }, { name: 'name' }]
      ])

      const result = await service.query('SELECT id, name FROM users')

      expect(mockExecute).toHaveBeenCalledWith('SELECT id, name FROM users', undefined)
      expect(result.rows).toEqual([
        { id: 1, name: 'test' },
        { id: 2, name: 'foo' }
      ])
      expect(result.columns).toEqual(['id', 'name'])
      expect(result.rowCount).toBe(2)
    })

    it('should execute INSERT/UPDATE and return affected rows', async () => {
      await service.connect()
      mockExecute.mockResolvedValue([{ affectedRows: 3, changedRows: 2 }, []])

      const result = await service.query('UPDATE users SET active = ?', [true])

      expect(mockExecute).toHaveBeenCalledWith('UPDATE users SET active = ?', [true])
      expect(result.rows).toEqual([])
      expect(result.rowCount).toBe(3)
    })

    it('should use changedRows when affectedRows is zero', async () => {
      await service.connect()
      mockExecute.mockResolvedValue([{ affectedRows: 0, changedRows: 5 }, []])

      const result = await service.query('UPDATE users SET x = 1')

      expect(result.rowCount).toBe(5)
    })

    it('should wrap query errors with context', async () => {
      await service.connect()
      mockExecute.mockRejectedValue(new Error('syntax error'))

      await expect(service.query('INVALID SQL')).rejects.toThrow('MySQL query failed')
    })
  })

  describe('transaction', () => {
    it('should throw error when not connected', async () => {
      await expect(service.transaction([{ sql: 'SELECT 1' }])).rejects.toThrow(
        'Not connected to MySQL'
      )
    })

    it('should execute all queries and commit', async () => {
      await service.connect()

      await service.transaction([
        { sql: 'INSERT INTO t VALUES (?)', params: [1] },
        { sql: 'UPDATE t SET x = ?' }
      ])

      expect(mockBeginTransaction).toHaveBeenCalled()
      expect(mockExecute).toHaveBeenCalledTimes(2)
      expect(mockExecute).toHaveBeenNthCalledWith(1, 'INSERT INTO t VALUES (?)', [1])
      expect(mockExecute).toHaveBeenNthCalledWith(2, 'UPDATE t SET x = ?', undefined)
      expect(mockCommit).toHaveBeenCalled()
      expect(mockRollback).not.toHaveBeenCalled()
    })

    it('should rollback on query failure', async () => {
      await service.connect()
      mockExecute.mockRejectedValueOnce(new Error('constraint violation'))

      await expect(
        service.transaction([{ sql: 'INSERT INTO t VALUES (?)', params: [1] }])
      ).rejects.toThrow('MySQL transaction failed')

      expect(mockRollback).toHaveBeenCalled()
      expect(mockCommit).not.toHaveBeenCalled()
    })
  })

  describe('disconnect', () => {
    it('should resolve when not connected', async () => {
      await expect(service.disconnect()).resolves.not.toThrow()
    })

    it('should end connection and reset state', async () => {
      await service.connect()
      expect(service.isConnected()).toBe(true)

      await service.disconnect()

      expect(mockEnd).toHaveBeenCalled()
      expect(service.isConnected()).toBe(false)
    })

    it('should wrap disconnect errors', async () => {
      await service.connect()
      mockEnd.mockRejectedValue(new Error('connection lost'))

      await expect(service.disconnect()).rejects.toThrow('Failed to disconnect from MySQL')
    })
  })
})
