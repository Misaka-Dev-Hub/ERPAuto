/**
 * Zod Schemas Unit Tests
 */

import { describe, it, expect } from 'vitest'
import {
  ExtractorInputSchema,
  validateExtractorInput
} from '../../src/main/schemas/extractor.schema'
import { CleanerInputSchema, validateCleanerInput } from '../../src/main/schemas/cleaner.schema'
import { LoginRequestSchema, validateLoginRequest } from '../../src/main/schemas/auth.schema'

describe('Extractor Schema', () => {
  describe('ExtractorInputSchema', () => {
    it('should validate valid input', () => {
      const input = {
        orderNumbers: ['SC12345678901234', 'SC98765432109876'],
        batchSize: 10
      }

      const result = ExtractorInputSchema.safeParse(input)

      expect(result.success).toBe(true)
    })

    it('should apply default batchSize', () => {
      const input = {
        orderNumbers: ['SC12345678901234']
      }

      const result = ExtractorInputSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.batchSize).toBe(10)
      }
    })

    it('should reject empty orderNumbers array', () => {
      const input = {
        orderNumbers: []
      }

      const result = ExtractorInputSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('should reject missing orderNumbers', () => {
      const input = {}

      const result = ExtractorInputSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('should reject empty string in orderNumbers', () => {
      const input = {
        orderNumbers: ['', 'SC12345678901234']
      }

      const result = ExtractorInputSchema.safeParse(input)

      expect(result.success).toBe(false)
    })
  })

  describe('validateExtractorInput', () => {
    it('should return success for valid input', () => {
      const input = {
        orderNumbers: ['SC12345678901234']
      }

      const result = validateExtractorInput(input)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('should return error message for invalid input', () => {
      const input = {
        orderNumbers: []
      }

      const result = validateExtractorInput(input)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

describe('Cleaner Schema', () => {
  describe('CleanerInputSchema', () => {
    it('should validate valid input', () => {
      const input = {
        orderNumbers: ['SC12345678901234'],
        materialCodes: ['MAT001', 'MAT002'],
        dryRun: true
      }

      const result = CleanerInputSchema.safeParse(input)

      expect(result.success).toBe(true)
    })

    it('should validate with empty materialCodes', () => {
      const input = {
        orderNumbers: ['SC12345678901234'],
        materialCodes: [],
        dryRun: false
      }

      const result = CleanerInputSchema.safeParse(input)

      expect(result.success).toBe(true)
    })

    it('should reject missing dryRun', () => {
      const input = {
        orderNumbers: ['SC12345678901234'],
        materialCodes: ['MAT001']
      }

      const result = CleanerInputSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('should reject non-boolean dryRun', () => {
      const input = {
        orderNumbers: ['SC12345678901234'],
        materialCodes: [],
        dryRun: 'yes'
      }

      const result = CleanerInputSchema.safeParse(input)

      expect(result.success).toBe(false)
    })
  })

  describe('validateCleanerInput', () => {
    it('should return success for valid input', () => {
      const input = {
        orderNumbers: ['SC12345678901234'],
        materialCodes: ['MAT001'],
        dryRun: false
      }

      const result = validateCleanerInput(input)

      expect(result.success).toBe(true)
    })
  })
})

describe('Auth Schema', () => {
  describe('LoginRequestSchema', () => {
    it('should validate valid input', () => {
      const input = {
        username: 'testuser',
        password: 'testpass'
      }

      const result = LoginRequestSchema.safeParse(input)

      expect(result.success).toBe(true)
    })

    it('should reject empty username', () => {
      const input = {
        username: '',
        password: 'testpass'
      }

      const result = LoginRequestSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('should reject empty password', () => {
      const input = {
        username: 'testuser',
        password: ''
      }

      const result = LoginRequestSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('should reject missing fields', () => {
      const input = {}

      const result = LoginRequestSchema.safeParse(input)

      expect(result.success).toBe(false)
    })
  })

  describe('validateLoginRequest', () => {
    it('should return success for valid input', () => {
      const input = {
        username: 'admin',
        password: 'password123'
      }

      const result = validateLoginRequest(input)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.username).toBe('admin')
    })

    it('should return error for invalid input', () => {
      const input = {
        username: ''
      }

      const result = validateLoginRequest(input)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})
