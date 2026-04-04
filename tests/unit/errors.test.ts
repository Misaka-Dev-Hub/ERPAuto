/**
 * Error Types Unit Tests
 */

import { describe, it, expect } from 'vitest'
import {
  BaseError,
  ErpConnectionError,
  DatabaseQueryError,
  ValidationError,
  ERP_ERROR_CODES,
  DATABASE_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  isBaseError,
  isErpConnectionError,
  isDatabaseQueryError,
  isValidationError,
  getErrorMessage,
  getErrorCode
} from '../../src/main/types/errors'

// Concrete implementation for testing abstract BaseError
class TestError extends BaseError {
  constructor(message: string, code: string, cause?: Error) {
    super('TestError', message, code, cause)
  }
}

describe('Error Types', () => {
  describe('BaseError', () => {
    it('should create an error with name, message, and code', () => {
      const error = new TestError('Test message', 'TEST_CODE')

      expect(error.name).toBe('TestError')
      expect(error.message).toBe('Test message')
      expect(error.code).toBe('TEST_CODE')
      expect(error.cause).toBeUndefined()
    })

    it('should capture cause when provided', () => {
      const cause = new Error('Original error')
      const error = new TestError('Test message', 'TEST_CODE', cause)

      expect(error.cause).toBe(cause)
    })

    it('should serialize to JSON correctly', () => {
      const error = new TestError('Test message', 'TEST_CODE')
      const json = error.toJSON()

      expect(json).toEqual({
        name: 'TestError',
        message: 'Test message',
        code: 'TEST_CODE',
        cause: undefined
      })
    })

    it('should be an instance of Error', () => {
      const error = new TestError('Test message', 'TEST_CODE')

      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('ErpConnectionError', () => {
    it('should create with default code', () => {
      const error = new ErpConnectionError('Connection failed')

      expect(error.name).toBe('ErpConnectionError')
      expect(error.code).toBe(ERP_ERROR_CODES.CONNECTION_FAILED)
    })

    it('should create with specific code', () => {
      const error = new ErpConnectionError('Login failed', ERP_ERROR_CODES.LOGIN_FAILED)

      expect(error.code).toBe(ERP_ERROR_CODES.LOGIN_FAILED)
    })

    it('should accept cause', () => {
      const cause = new Error('Network timeout')
      const error = new ErpConnectionError('Timeout', ERP_ERROR_CODES.TIMEOUT, cause)

      expect(error.cause).toBe(cause)
    })
  })

  describe('DatabaseQueryError', () => {
    it('should create with default code', () => {
      const error = new DatabaseQueryError('Query failed')

      expect(error.name).toBe('DatabaseQueryError')
      expect(error.code).toBe(DATABASE_ERROR_CODES.QUERY_FAILED)
    })

    it('should create with specific code', () => {
      const error = new DatabaseQueryError(
        'Connection failed',
        DATABASE_ERROR_CODES.CONNECTION_FAILED
      )

      expect(error.code).toBe(DATABASE_ERROR_CODES.CONNECTION_FAILED)
    })
  })

  describe('ValidationError', () => {
    it('should create with default code', () => {
      const error = new ValidationError('Invalid input')

      expect(error.name).toBe('ValidationError')
      expect(error.code).toBe(VALIDATION_ERROR_CODES.INVALID_INPUT)
    })

    it('should create with specific code', () => {
      const error = new ValidationError('Missing field', VALIDATION_ERROR_CODES.MISSING_REQUIRED)

      expect(error.code).toBe(VALIDATION_ERROR_CODES.MISSING_REQUIRED)
    })
  })

  describe('Type Guards', () => {
    it('isBaseError should return true for BaseError instances', () => {
      const error = new ValidationError('Test')

      expect(isBaseError(error)).toBe(true)
      expect(isBaseError(new Error('Test'))).toBe(false)
      expect(isBaseError('string')).toBe(false)
    })

    it('isErpConnectionError should return true only for ErpConnectionError', () => {
      const erpError = new ErpConnectionError('Test')
      const dbError = new DatabaseQueryError('Test')

      expect(isErpConnectionError(erpError)).toBe(true)
      expect(isErpConnectionError(dbError)).toBe(false)
    })

    it('isDatabaseQueryError should return true only for DatabaseQueryError', () => {
      const dbError = new DatabaseQueryError('Test')
      const valError = new ValidationError('Test')

      expect(isDatabaseQueryError(dbError)).toBe(true)
      expect(isDatabaseQueryError(valError)).toBe(false)
    })

    it('isValidationError should return true only for ValidationError', () => {
      const valError = new ValidationError('Test')
      const erpError = new ErpConnectionError('Test')

      expect(isValidationError(valError)).toBe(true)
      expect(isValidationError(erpError)).toBe(false)
    })
  })

  describe('Helper Functions', () => {
    it('getErrorMessage should return message from BaseError', () => {
      const error = new ValidationError('Invalid input')

      expect(getErrorMessage(error)).toBe('Invalid input')
    })

    it('getErrorMessage should return message from standard Error', () => {
      const error = new Error('Standard error')

      // In non-production, it returns the actual message
      expect(getErrorMessage(error)).toBe('Standard error')
    })

    it('getErrorMessage should handle unknown types', () => {
      // Non-Error types return the safe default message
      // This is intentional to avoid leaking sensitive information
      expect(getErrorMessage('string error')).toBe('An unknown error occurred')
      expect(getErrorMessage(null)).toBe('An unknown error occurred')
      expect(getErrorMessage(undefined)).toBe('An unknown error occurred')
      expect(getErrorMessage(123)).toBe('An unknown error occurred')
      expect(getErrorMessage({ message: 'obj' })).toBe('An unknown error occurred')
    })

    it('getErrorCode should return code from BaseError', () => {
      const error = new ValidationError('Test', VALIDATION_ERROR_CODES.MISSING_REQUIRED)

      expect(getErrorCode(error)).toBe(VALIDATION_ERROR_CODES.MISSING_REQUIRED)
    })

    it('getErrorCode should return UNKNOWN_ERROR for non-BaseError', () => {
      const error = new Error('Test')

      expect(getErrorCode(error)).toBe('UNKNOWN_ERROR')
    })
  })

  describe('Error Codes', () => {
    it('ERP_ERROR_CODES should have all expected codes', () => {
      expect(ERP_ERROR_CODES.CONNECTION_FAILED).toBe('ERP_CONNECTION_FAILED')
      expect(ERP_ERROR_CODES.LOGIN_FAILED).toBe('ERP_LOGIN_FAILED')
      expect(ERP_ERROR_CODES.TIMEOUT).toBe('ERP_TIMEOUT')
      expect(ERP_ERROR_CODES.SESSION_EXPIRED).toBe('ERP_SESSION_EXPIRED')
    })

    it('DATABASE_ERROR_CODES should have all expected codes', () => {
      expect(DATABASE_ERROR_CODES.CONNECTION_FAILED).toBe('DB_CONNECTION_FAILED')
      expect(DATABASE_ERROR_CODES.QUERY_FAILED).toBe('DB_QUERY_FAILED')
      expect(DATABASE_ERROR_CODES.TIMEOUT).toBe('DB_TIMEOUT')
    })

    it('VALIDATION_ERROR_CODES should have all expected codes', () => {
      expect(VALIDATION_ERROR_CODES.INVALID_INPUT).toBe('VAL_INVALID_INPUT')
      expect(VALIDATION_ERROR_CODES.MISSING_REQUIRED).toBe('VAL_MISSING_REQUIRED')
      expect(VALIDATION_ERROR_CODES.INVALID_FORMAT).toBe('VAL_INVALID_FORMAT')
    })
  })
})
