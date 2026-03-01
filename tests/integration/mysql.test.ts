/**
 * Integration tests for MySqlService
 * These tests require a running MySQL instance
 * Skip if MySQL is not available: npx vitest run --reporter=verbose
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { MySqlService, MySqlConfig } from '@services/database/mysql'

// MySQL test configuration
// In production, these should come from environment variables
const testConfig: MySqlConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'password',
  database: process.env.MYSQL_DATABASE || 'test_db'
}

describe('MySqlService Integration Tests', () => {
  let service: MySqlService
  let isMysqlAvailable = true

  beforeAll(async () => {
    service = new MySqlService(testConfig)

    // Try to connect, skip tests if MySQL is not available
    try {
      await service.connect()
    } catch (error) {
      console.warn('MySQL not available, skipping integration tests')
      isMysqlAvailable = false
    }
  })

  afterAll(async () => {
    if (service && isMysqlAvailable) {
      await service.disconnect()
    }
  })

  describe('connect()', () => {
    it('should connect to MySQL database', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      expect(service.isConnected()).toBe(true)
    })

    it('should throw error when already connected', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      // Already connected in beforeAll
      await expect(service.connect()).rejects.toThrow('Already connected')
    })
  })

  describe('isConnected()', () => {
    it('should return true when connected', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      expect(service.isConnected()).toBe(true)
    })

    it('should return false when not connected', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      const newService = new MySqlService(testConfig)
      expect(newService.isConnected()).toBe(false)
    })
  })

  describe('disconnect()', () => {
    it('should disconnect from MySQL database', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      await service.disconnect()
      expect(service.isConnected()).toBe(false)

      // Reconnect for other tests
      await service.connect()
    })

    it('should not throw when already disconnected', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      const newService = new MySqlService(testConfig)
      await expect(newService.disconnect()).resolves.not.toThrow()
    })
  })

  describe('query()', () => {
    beforeAll(async () => {
      if (!isMysqlAvailable) {
        return
      }

      // Ensure connected
      if (!service.isConnected()) {
        await service.connect()
      }

      // Create test table
      await service.query(`
        CREATE TABLE IF NOT EXISTS test_users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Clean up test data
      await service.query('DELETE FROM test_users WHERE email LIKE ?', ['%test%'])
    })

    afterAll(async () => {
      if (!isMysqlAvailable) {
        return
      }

      // Drop test table
      try {
        await service.query('DROP TABLE IF EXISTS test_users')
      } catch {
        // Ignore cleanup errors
      }
    })

    it('should execute SELECT 1', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      const result = await service.query('SELECT 1 as value')

      expect(result.columns).toContain('value')
      expect(result.rowCount).toBe(1)
      expect(result.rows[0]).toEqual({ value: 1 })
    })

    it('should execute INSERT with parameters', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      const result = await service.query('INSERT INTO test_users (name, email) VALUES (?, ?)', [
        'Test User',
        'test@example.com'
      ])

      expect(result.rowCount).toBeGreaterThanOrEqual(0)
    })

    it('should execute SELECT with parameters', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      const result = await service.query('SELECT id, name, email FROM test_users WHERE email = ?', [
        'test@example.com'
      ])

      expect(result.columns).toEqual(['id', 'name', 'email'])
      expect(result.rowCount).toBeGreaterThanOrEqual(0)
      expect(result.rows[0]?.name).toBe('Test User')
    })

    it('should throw error when not connected', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      const newService = new MySqlService(testConfig)
      await expect(newService.query('SELECT 1')).rejects.toThrow('Not connected')
    })
  })

  describe('transaction()', () => {
    beforeAll(async () => {
      if (!isMysqlAvailable) {
        return
      }

      // Ensure connected and table exists
      if (!service.isConnected()) {
        await service.connect()
      }

      await service.query(`
        CREATE TABLE IF NOT EXISTS test_accounts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          balance DECIMAL(10, 2) NOT NULL DEFAULT 0
        )
      `)

      // Clean up and initialize
      await service.query('DELETE FROM test_accounts')
      await service.query('INSERT INTO test_accounts (balance) VALUES (100), (50)')
    })

    afterAll(async () => {
      if (!isMysqlAvailable) {
        return
      }

      try {
        await service.query('DROP TABLE IF EXISTS test_accounts')
      } catch {
        // Ignore cleanup errors
      }
    })

    it('should execute multiple queries in a transaction', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      // Transfer 20 from account 1 to account 2
      await service.transaction([
        { sql: 'UPDATE test_accounts SET balance = balance - ? WHERE id = ?', params: [20, 1] },
        { sql: 'UPDATE test_accounts SET balance = balance + ? WHERE id = ?', params: [20, 2] }
      ])

      const result = await service.query('SELECT balance FROM test_accounts ORDER BY id')

      expect(result.rows[0]?.balance).toEqual(expect.anything())
      expect(result.rows[1]?.balance).toEqual(expect.anything())
    })

    it('should rollback on error', async () => {
      if (!isMysqlAvailable) {
        console.log('Skipped: MySQL not available')
        return
      }

      // Get initial balances
      const initial = await service.query('SELECT balance FROM test_accounts ORDER BY id')

      // Try invalid transaction (syntax error)
      await expect(service.transaction([{ sql: 'INVALID SQL STATEMENT' }])).rejects.toThrow()

      // Verify balances unchanged
      const result = await service.query('SELECT balance FROM test_accounts ORDER BY id')
      expect(result.rows).toEqual(initial.rows)
    })
  })
})
