import { describe, it, expect, beforeEach } from 'vitest'
import { ErpAuthService } from '../../src/main/services/erp/erp-auth'
import type { ErpConfig } from '../../src/main/types/erp.types'

describe('ERP Authentication Service (Unit)', () => {
  describe('Session Management', () => {
    it('should create service instance with config', () => {
      const config: ErpConfig = {
        url: 'https://test.example.com',
        username: 'testuser',
        password: 'testpass'
      }

      const service = new ErpAuthService(config)

      expect(service).toBeDefined()
      expect(service.isActive()).toBe(false)
    })

    it('should throw error when getting session before login', () => {
      const config: ErpConfig = {
        url: 'https://test.example.com',
        username: 'testuser',
        password: 'testpass'
      }

      const service = new ErpAuthService(config)

      expect(() => service.getSession()).toThrow('Not logged in. Call login() first.')
    })

    it('should report inactive status before login', () => {
      const config: ErpConfig = {
        url: 'https://test.example.com',
        username: 'testuser',
        password: 'testpass'
      }

      const service = new ErpAuthService(config)

      expect(service.isActive()).toBe(false)
    })
  })

  describe('Close Method', () => {
    it('should handle close when no session exists', async () => {
      const config: ErpConfig = {
        url: 'https://test.example.com',
        username: 'testuser',
        password: 'testpass'
      }

      const service = new ErpAuthService(config)

      // Should not throw when closing without session
      await expect(service.close()).resolves.toBeUndefined()
    })
  })
})
