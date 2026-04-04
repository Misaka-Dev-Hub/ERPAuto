import { describe, it, expect } from 'vitest'
import { ErpAuthService } from '../../src/main/services/erp/erp-auth'
import type { ErpConfig } from '../../src/main/types/erp.types'

const testConfig: ErpConfig = {
  url: 'https://test.example.com',
  username: 'testuser',
  password: 'testpass'
}

describe('ERP Authentication Service (Unit)', () => {
  describe('Initial State', () => {
    it('should report inactive status before login', () => {
      const service = new ErpAuthService(testConfig)
      expect(service.isActive()).toBe(false)
    })

    it('should throw error when getting session before login', () => {
      const service = new ErpAuthService(testConfig)
      expect(() => service.getSession()).toThrow('Not logged in. Call login() first.')
    })

    it('should handle close when no session exists', async () => {
      const service = new ErpAuthService(testConfig)
      await expect(service.close()).resolves.toBeUndefined()
    })
  })
})
