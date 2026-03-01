/**
 * Unit tests for MySqlService
 * These tests do not require a MySQL instance
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MySqlService } from '@services/database/mysql'

const mockConfig = {
  host: 'localhost',
  port: 3306,
  user: 'test',
  password: 'test',
  database: 'testdb'
}

describe('MySqlService Unit Tests', () => {
  let service: MySqlService

  beforeEach(() => {
    service = new MySqlService(mockConfig)
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
    it('should throw error with invalid credentials', async () => {
      // This tests error handling without needing a real server
      const invalidConfig = {
        ...mockConfig,
        host: 'invalid-host-that-does-not-exist'
      }
      const invalidService = new MySqlService(invalidConfig)

      await expect(invalidService.connect()).rejects.toThrow('Failed to connect to MySQL')
    })
  })

  describe('query', () => {
    it('should throw error when not connected', async () => {
      await expect(service.query('SELECT 1')).rejects.toThrow('Not connected to MySQL')
    })
  })

  describe('transaction', () => {
    it('should throw error when not connected', async () => {
      await expect(service.transaction([{ sql: 'SELECT 1' }])).rejects.toThrow(
        'Not connected to MySQL'
      )
    })
  })

  describe('disconnect', () => {
    it('should resolve when not connected', async () => {
      await expect(service.disconnect()).resolves.not.toThrow()
    })
  })
})
