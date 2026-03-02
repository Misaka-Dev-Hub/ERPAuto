/**
 * Custom error types for the application
 * Provides structured error handling with codes and context
 */

/**
 * Base error class for all application errors
 */
export abstract class BaseError extends Error {
  public readonly code: string
  public readonly cause?: Error

  constructor(name: string, message: string, code: string, cause?: Error) {
    super(message)
    this.name = name
    this.code = code
    this.cause = cause

    // Maintains proper stack trace for where error was thrown (only in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Get a JSON representation of the error for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      cause: this.cause?.message
    }
  }
}

/**
 * Error codes for ERP connection errors
 */
export const ERP_ERROR_CODES = {
  CONNECTION_FAILED: 'ERP_CONNECTION_FAILED',
  LOGIN_FAILED: 'ERP_LOGIN_FAILED',
  TIMEOUT: 'ERP_TIMEOUT',
  NAVIGATION_ERROR: 'ERP_NAVIGATION_ERROR',
  ELEMENT_NOT_FOUND: 'ERP_ELEMENT_NOT_FOUND',
  SESSION_EXPIRED: 'ERP_SESSION_EXPIRED',
  BROWSER_CRASH: 'ERP_BROWSER_CRASH'
} as const

/**
 * Error thrown when ERP connection, login, or browser automation fails
 */
export class ErpConnectionError extends BaseError {
  constructor(
    message: string,
    code: (typeof ERP_ERROR_CODES)[keyof typeof ERP_ERROR_CODES] = ERP_ERROR_CODES.CONNECTION_FAILED,
    cause?: Error
  ) {
    super('ErpConnectionError', message, code, cause)
  }
}

/**
 * Error codes for database errors
 */
export const DATABASE_ERROR_CODES = {
  CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  QUERY_FAILED: 'DB_QUERY_FAILED',
  TIMEOUT: 'DB_TIMEOUT',
  INVALID_PARAMS: 'DB_INVALID_PARAMS',
  RECORD_NOT_FOUND: 'DB_RECORD_NOT_FOUND',
  TRANSACTION_FAILED: 'DB_TRANSACTION_FAILED'
} as const

/**
 * Error thrown when database operations fail
 */
export class DatabaseQueryError extends BaseError {
  constructor(
    message: string,
    code: (typeof DATABASE_ERROR_CODES)[keyof typeof DATABASE_ERROR_CODES] = DATABASE_ERROR_CODES.QUERY_FAILED,
    cause?: Error
  ) {
    super('DatabaseQueryError', message, code, cause)
  }
}

/**
 * Error codes for validation errors
 */
export const VALIDATION_ERROR_CODES = {
  INVALID_INPUT: 'VAL_INVALID_INPUT',
  MISSING_REQUIRED: 'VAL_MISSING_REQUIRED',
  INVALID_FORMAT: 'VAL_INVALID_FORMAT',
  OUT_OF_RANGE: 'VAL_OUT_OF_RANGE',
  INVALID_TYPE: 'VAL_INVALID_TYPE'
} as const

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends BaseError {
  constructor(
    message: string,
    code: (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES] = VALIDATION_ERROR_CODES.INVALID_INPUT,
    cause?: Error
  ) {
    super('ValidationError', message, code, cause)
  }
}

/**
 * Type guard to check if an error is a BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
  return error instanceof BaseError
}

/**
 * Type guard to check if an error is an ErpConnectionError
 */
export function isErpConnectionError(error: unknown): error is ErpConnectionError {
  return error instanceof ErpConnectionError
}

/**
 * Type guard to check if an error is a DatabaseQueryError
 */
export function isDatabaseQueryError(error: unknown): error is DatabaseQueryError {
  return error instanceof DatabaseQueryError
}

/**
 * Type guard to check if an error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError
}

/**
 * Get a user-friendly error message from any error type
 * In production, generic errors are sanitized to avoid leaking sensitive info
 */
export function getErrorMessage(error: unknown): string {
  if (isBaseError(error)) {
    // BaseError messages are developer-controlled and safe
    return error.message
  }
  if (error instanceof Error) {
    // In production, return a generic message to avoid leaking sensitive info
    // (e.g., database connection strings, file paths, server names)
    if (process.env.NODE_ENV === 'production') {
      return 'An unexpected error occurred'
    }
    return error.message
  }
  return 'An unknown error occurred'
}

/**
 * Get error code from any error type
 */
export function getErrorCode(error: unknown): string {
  if (isBaseError(error)) {
    return error.code
  }
  return 'UNKNOWN_ERROR'
}
