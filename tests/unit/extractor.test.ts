import { describe, it, expect, beforeEach } from 'vitest'
import { ExtractorService } from '../../src/main/services/erp/extractor'
import { ErpAuthService } from '../../src/main/services/erp/erp-auth'
import type { ErpConfig } from '../../src/main/types/erp.types'

describe('Extractor Service (Unit)', () => {
  let authService: ErpAuthService
  let extractor: ExtractorService
  const mockConfig: ErpConfig = {
    url: 'https://test.erp.com',
    username: 'test_user',
    password: 'test_pass'
  }

  beforeEach(() => {
    authService = new ErpAuthService(mockConfig)
    extractor = new ExtractorService(authService, './test-downloads')
  })

  describe('Service Initialization', () => {
    it('should create service instance as ExtractorService', () => {
      expect(extractor).toBeInstanceOf(ExtractorService)
    })

    it('should create service with default download directory', () => {
      const defaultExtractor = new ExtractorService(authService)
      expect(defaultExtractor).toBeInstanceOf(ExtractorService)
    })

    it('should create service with custom download directory', () => {
      const customExtractor = new ExtractorService(authService, './custom-downloads')
      expect(customExtractor).toBeInstanceOf(ExtractorService)
    })
  })

  describe('Error Handling', () => {
    it('should handle extraction with no auth session', async () => {
      const result = await extractor.extract({
        orderNumbers: ['ORDER1']
      })

      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.downloadedFiles).toHaveLength(0)
    })

    it('should include error message when session is missing', async () => {
      const result = await extractor.extract({
        orderNumbers: ['ORD-001', 'ORD-002']
      })

      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Not logged in')])
      )
    })

    it('should return empty result structure even on failure', async () => {
      const result = await extractor.extract({
        orderNumbers: ['ORDER1']
      })

      expect(result).toHaveProperty('downloadedFiles')
      expect(result).toHaveProperty('mergedFile')
      expect(result).toHaveProperty('recordCount')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('orderRecordCounts')
      expect(result.mergedFile).toBeNull()
      expect(result.recordCount).toBe(0)
    })
  })
})
