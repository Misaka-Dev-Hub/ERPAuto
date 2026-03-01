/**
 * Unit tests for SqlServerService
 * These tests do not require a SQL Server instance
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SqlServerService } from '@main/services/database/sql-server'

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
    it('should throw error with invalid credentials', async () => {
      // This tests error handling without needing a real server
      const invalidConfig = {
        ...mockConfig,
        server: 'invalid-host-that-does-not-exist'
      }
      const invalidService = new SqlServerService(invalidConfig)

      await expect(invalidService.connect()).rejects.toThrow('Failed to connect to SQL Server')
    })
  })

  describe('query', () => {
    it('should throw error when not connected', async () => {
      await expect(service.query('SELECT 1')).rejects.toThrow('Not connected to SQL Server')
    })
  })

  describe('transaction', () => {
    it('should throw error when not connected', async () => {
      await expect(service.transaction([{ sql: 'SELECT 1' }])).rejects.toThrow(
        'Not connected to SQL Server'
      )
    })
  })

  describe('disconnect', () => {
    it('should resolve when not connected', async () => {
      await expect(service.disconnect()).resolves.not.toThrow()
    })
  })
})
