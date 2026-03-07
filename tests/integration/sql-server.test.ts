/**
 * Integration tests for SqlServerService
 * These tests require a running SQL Server instance
 * Skip if SQL Server is not available
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SqlServerService, SqlServerConfig } from '@main/services/database/sql-server'
import * as sql from 'mssql'

// SQL Server test configuration
// For integration tests, use fixed test credentials or configure via config.yaml
const testConfig: SqlServerConfig = {
  server: 'localhost',
  port: 1433,
  user: 'sa',
  password: 'password',
  database: 'testdb',
  options: {
    encrypt: false, // Set to true for Azure SQL
    trustServerCertificate: true // Set to false in production with valid cert
  }
}

describe('SqlServerService Integration Tests', () => {
  let service: SqlServerService
  let isSqlServerAvailable = true

  beforeAll(async () => {
    service = new SqlServerService(testConfig)

    // Try to connect, skip tests if SQL Server is not available
    try {
      await service.connect()
    } catch (error) {
      console.warn('SQL Server not available, skipping integration tests')
      isSqlServerAvailable = false
    }
  })

  afterAll(async () => {
    if (service && isSqlServerAvailable) {
      await service.disconnect()
    }
  })

  describe('connect()', () => {
    it('should connect to SQL Server database', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      expect(service.isConnected()).toBe(true)
    })

    it('should throw error when already connected', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      // Already connected in beforeAll
      await expect(service.connect()).rejects.toThrow('Already connected')
    })
  })

  describe('isConnected()', () => {
    it('should return true when connected', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      expect(service.isConnected()).toBe(true)
    })

    it('should return false when not connected', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      const newService = new SqlServerService(testConfig)
      expect(newService.isConnected()).toBe(false)
    })
  })

  describe('disconnect()', () => {
    it('should disconnect from SQL Server database', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      await service.disconnect()
      expect(service.isConnected()).toBe(false)

      // Reconnect for other tests
      await service.connect()
    })

    it('should not throw when already disconnected', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      const newService = new SqlServerService(testConfig)
      await expect(newService.disconnect()).resolves.not.toThrow()
    })
  })

  describe('query()', () => {
    beforeAll(async () => {
      if (!isSqlServerAvailable) {
        return
      }

      // Ensure connected
      if (!service.isConnected()) {
        await service.connect()
      }

      // Create test table
      await service.query(`
        IF OBJECT_ID('dbo.TestUsers', 'U') IS NOT NULL
          DROP TABLE dbo.TestUsers;

        CREATE TABLE dbo.TestUsers (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(100) NOT NULL,
          email NVARCHAR(100),
          created_at DATETIME DEFAULT GETDATE()
        )
      `)

      // Clean up test data
      await service.query('DELETE FROM dbo.TestUsers WHERE email LIKE @email', {
        email: { value: '%test%', type: sql.NVarChar }
      })
    })

    afterAll(async () => {
      if (!isSqlServerAvailable) {
        return
      }

      // Drop test table
      try {
        await service.query('DROP TABLE IF EXISTS dbo.TestUsers')
      } catch {
        // Ignore cleanup errors
      }
    })

    it('should execute SELECT 1', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      const result = await service.query('SELECT 1 as value')

      expect(result.columns).toContain('value')
      expect(result.rowCount).toBe(1)
      expect(result.rows[0]).toEqual({ value: 1 })
    })

    it('should execute INSERT with parameters', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      const result = await service.query(
        'INSERT INTO dbo.TestUsers (name, email) VALUES (@name, @email)',
        {
          name: { value: 'Test User', type: sql.NVarChar },
          email: { value: 'test@example.com', type: sql.NVarChar }
        }
      )

      expect(result.rowCount).toBe(1)
    })

    it('should execute SELECT with parameters', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      const result = await service.query(
        'SELECT id, name, email FROM dbo.TestUsers WHERE email = @email',
        {
          email: { value: 'test@example.com', type: sql.NVarChar }
        }
      )

      expect(result.columns).toEqual(['id', 'name', 'email'])
      expect(result.rowCount).toBeGreaterThanOrEqual(0)
      expect(result.rows[0]?.name).toBe('Test User')
    })

    it('should throw error when not connected', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      const newService = new SqlServerService(testConfig)
      await expect(newService.query('SELECT 1')).rejects.toThrow('Not connected to SQL Server')
    })
  })

  describe('transaction()', () => {
    beforeAll(async () => {
      if (!isSqlServerAvailable) {
        return
      }

      // Ensure connected and table exists
      if (!service.isConnected()) {
        await service.connect()
      }

      await service.query(`
        IF OBJECT_ID('dbo.TestAccounts', 'U') IS NOT NULL
          DROP TABLE dbo.TestAccounts;

        CREATE TABLE dbo.TestAccounts (
          id INT IDENTITY(1,1) PRIMARY KEY,
          balance DECIMAL(10, 2) NOT NULL DEFAULT 0
        )
      `)

      // Clean up and initialize
      await service.query('DELETE FROM dbo.TestAccounts')
      await service.query('INSERT INTO dbo.TestAccounts (balance) VALUES (100), (50)')
    })

    afterAll(async () => {
      if (!isSqlServerAvailable) {
        return
      }

      try {
        await service.query('DROP TABLE IF EXISTS dbo.TestAccounts')
      } catch {
        // Ignore cleanup errors
      }
    })

    it('should execute multiple queries in a transaction', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      // Transfer 20 from account 1 to account 2
      await service.transaction([
        {
          sql: 'UPDATE dbo.TestAccounts SET balance = balance - @amount WHERE id = @id',
          params: { amount: { value: 20, type: sql.Decimal }, id: { value: 1, type: sql.Int } }
        },
        {
          sql: 'UPDATE dbo.TestAccounts SET balance = balance + @amount WHERE id = @id',
          params: { amount: { value: 20, type: sql.Decimal }, id: { value: 2, type: sql.Int } }
        }
      ])

      const result = await service.query('SELECT balance FROM dbo.TestAccounts ORDER BY id')

      expect(result.rows[0]?.balance).toBeDefined()
      expect(result.rows[1]?.balance).toBeDefined()
    })

    it('should rollback on error', async () => {
      if (!isSqlServerAvailable) {
        console.log('Skipped: SQL Server not available')
        return
      }

      // Get initial balances
      const initial = await service.query('SELECT balance FROM dbo.TestAccounts ORDER BY id')

      // Try invalid transaction (syntax error)
      await expect(service.transaction([{ sql: 'INVALID SQL STATEMENT' }])).rejects.toThrow()

      // Verify balances unchanged
      const result = await service.query('SELECT balance FROM dbo.TestAccounts ORDER BY id')
      expect(result.rows).toEqual(initial.rows)
    })
  })
})
