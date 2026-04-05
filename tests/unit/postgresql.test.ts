/**
 * Unit tests for PostgreSqlService
 * These tests do not require a PostgreSQL instance
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PostgreSqlService } from '@main/services/database/postgresql'

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
