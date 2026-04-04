/**
 * Error Logging Utilities
 *
 * Provides comprehensive error serialization and formatting for logging.
 * Captures full error context including stack traces, causes, and custom properties.
 *
 * Enhanced with request context tracking for distributed tracing support.
 */

import type { ErrorLike, SerializedError } from '../../types/errors'
import { isProduction } from './shared'
import { getRequestId } from './request-context'

/**
 * Check if value is an Error or Error-like object
 */
export function isError(value: unknown): value is Error | ErrorLike {
  return (
    value instanceof Error ||
    (typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      'message' in value &&
      typeof (value as any).message === 'string')
  )
}

/**
 * Serialize an error into a plain object for logging
 * Captures all enumerable and non-enumerable properties
 */
export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const serialized: SerializedError = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause ? serializeError(error.cause) : undefined
    }

    // Capture custom properties from Error subclasses
    const props = Object.getOwnPropertyNames(error)
    for (const prop of props) {
      if (!['name', 'message', 'stack', 'cause'].includes(prop)) {
        const value = (error as any)[prop]
        if (value !== undefined) {
          serialized[prop] = isError(value) ? serializeError(value) : value
        }
      }
    }

    return serialized
  }

  if (isError(error)) {
    return {
      name: (error as any).name || 'UnknownError',
      message: (error as any).message || String(error),
      stack: (error as any).stack,
      cause: (error as any).cause ? serializeError((error as any).cause) : undefined
    }
  }

  // Non-error values
  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : JSON.stringify(error) || 'Unknown error occurred'
  }
}

/**
 * Sanitize error for production logging
 * Removes sensitive information while preserving error structure
 */
export function sanitizeError(error: SerializedError): SerializedError {
  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'credentials',
    'authorization',
    'privateKey',
    'secretKey'
  ]

  const sanitized: SerializedError = { ...error }

  // Sanitize message in production
  if (isProduction()) {
    // Keep error name and structure, but sanitize message
    if (sensitiveKeys.some((key) => error.message?.toLowerCase().includes(key))) {
      sanitized.message = 'An error occurred due to invalid credentials or configuration'
    }
  }

  // Recursively sanitize cause
  if (sanitized.cause && typeof sanitized.cause === 'object') {
    sanitized.cause = sanitizeError(sanitized.cause)
  }

  // Sanitize any custom properties that might contain sensitive data
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]'
    }
  }

  return sanitized
}

/**
 * Extract context from error for logging
 * Includes file, line, column from stack trace when available
 */
export function extractErrorContext(error: SerializedError): {
  fileName?: string
  lineNumber?: number
  columnName?: number
  functionName?: string
} {
  if (!error.stack) {
    return {}
  }

  const stackLines = error.stack.split('\n')
  // Skip first line (error name and message), get first stack frame
  const stackLine = stackLines[1] || stackLines[0]

  // Parse stack frame: "at Function.module.exports (path/to/file.js:123:45)"
  const match = stackLine.match(/at(?:\s+(.+?)\s+)?\((.+):(\d+):(\d+)\)/)
  if (match) {
    return {
      functionName: match[1],
      fileName: match[2],
      lineNumber: parseInt(match[3], 10),
      columnName: parseInt(match[4], 10)
    }
  }

  // Alternative format: "at path/to/file.js:123:45"
  const altMatch = stackLine.match(/at\s+(.+):(\d+):(\d+)/)
  if (altMatch) {
    return {
      fileName: altMatch[1],
      lineNumber: parseInt(altMatch[2], 10),
      columnName: parseInt(altMatch[3], 10)
    }
  }

  return {}
}

/**
 * Format error for console/file logging
 * Returns a formatted string with all error details
 *
 * @param error - The error to format (Error object or Error-like)
 * @param context - Optional context for logging
 * @param context.operation - Business operation being performed (e.g., 'extract', 'clean', 'validate')
 * @param context.module - Module/Service name where error occurred
 * @param context.userId - User ID performing the operation
 * @param context.requestId - Request/trace ID for distributed tracing (auto-injected if not provided)
 * @param context.batchId - Batch identifier for batch operations
 * @param context.duration - Operation duration in milliseconds
 * @param context.orderNumbers - Order numbers related to the operation
 * @param context.materialCodes - Material codes related to the operation
 * @returns Object with formatted message and metadata for logging
 *
 * @example
 * ```typescript
 * const { message, metadata } = formatErrorForLogging(error, {
 *   operation: 'extract',
 *   userId: 'user123',
 *   batchId: 'batch-001',
 *   duration: 1500
 * })
 * logger.error(message, metadata)
 * ```
 */
export function formatErrorForLogging(
  error: unknown,
  context?: {
    operation?: string
    module?: string
    userId?: string
    requestId?: string
    batchId?: string
    duration?: number
    orderNumbers?: string[]
    materialCodes?: string[]
    [key: string]: unknown
  }
): {
  message: string
  metadata: Record<string, unknown>
} {
  const serialized = serializeError(error)
  const isProd = isProduction()
  const errorToLog = isProd ? sanitizeError(serialized) : serialized
  const errorContext = extractErrorContext(errorToLog)

  // Auto-inject requestId from async context if not explicitly provided
  const autoRequestId = getRequestId()
  const requestId = context?.requestId || autoRequestId

  const metadata: Record<string, unknown> = {
    error: errorToLog,
    ...(requestId && { requestId }),
    ...context
  }

  // Remove undefined context fields to keep logs clean
  if (context) {
    const cleanMetadata: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined) {
        cleanMetadata[key] = value
      }
    }
    Object.assign(metadata, cleanMetadata)
  }

  // Add error location context if available
  if (errorContext.fileName) {
    metadata.errorLocation = {
      file: errorContext.fileName.split('/').pop() || errorContext.fileName,
      line: errorContext.lineNumber,
      column: errorContext.columnName,
      function: errorContext.functionName
    }
  }

  // Add environment info in development
  if (!isProd) {
    metadata.environment = {
      NODE_ENV: process.env.NODE_ENV,
      platform: process.platform,
      nodeVersion: process.version
    }
  }

  const message = `[${errorToLog.name}] ${errorToLog.message}`

  return { message, metadata }
}

/**
 * Log error with full context
 * Wrapper for logger.error that ensures complete error information is captured
 *
 * @param logger - Logger instance with error method
 * @param error - The error to log (Error object or Error-like)
 * @param options - Logging options
 * @param options.message - Custom message to prepend to error message
 * @param options.operation - Business operation being performed
 * @param options.module - Module/Service name
 * @param options.userId - User ID performing the operation
 * @param options.requestId - Request/trace ID (auto-injected if not provided)
 * @param options.batchId - Batch identifier for batch operations
 * @param options.duration - Operation duration in milliseconds
 * @param options.context - Additional custom context fields
 *
 * @example
 * ```typescript
 * logError(logger, error, {
 *   operation: 'extract',
 *   userId: 'user123',
 *   message: 'Failed to process order',
 *   duration: 1500
 * })
 * ```
 */
export function logError(
  logger: { error: (message: string, meta?: Record<string, unknown>) => void },
  error: unknown,
  options: {
    message?: string
    operation?: string
    module?: string
    userId?: string
    requestId?: string
    batchId?: string
    duration?: number
    context?: Record<string, unknown>
  } = {}
): void {
  const {
    message: customMessage,
    operation,
    module: moduleName,
    userId,
    requestId,
    batchId,
    duration,
    context
  } = options
  const { message, metadata } = formatErrorForLogging(error, {
    operation,
    module: moduleName,
    userId,
    requestId,
    batchId,
    duration,
    ...context
  })

  const finalMessage = customMessage || message
  logger.error(finalMessage, metadata)
}

/**
 * Re-throw error after logging, preserving original stack
 */
export function throwAfterLogging(
  logger: { error: (message: string, meta?: Record<string, unknown>) => void },
  error: unknown,
  options: {
    message?: string
    operation?: string
    module?: string
  } = {}
): never {
  logError(logger, error, options)
  throw error
}

/**
 * Enhanced error logging helper with automatic context injection
 *
 * Simplifies error logging by automatically injecting requestId from async context
 * and providing a concise API for common logging scenarios.
 *
 * @param logger - Logger instance with error method
 * @param error - The error to log (Error object or Error-like)
 * @param context - Business context for the error
 * @param context.operation - Business operation (REQUIRED for enhanced logging)
 * @param context.userId - User ID performing the operation
 * @param context.batchId - Batch identifier for batch operations
 * @param context.duration - Operation duration in milliseconds (e.g., from performance monitoring)
 * @param context.orderNumbers - Order numbers related to the operation
 * @param context.materialCodes - Material codes related to the operation
 * @param context.module - Module/Service name (defaults to 'unknown' if not provided)
 * @param customMessage - Optional custom message to prepend (if not provided, uses error message)
 *
 * @example
 * ```typescript
 * import { enhancedLogError } from './error-utils'
 *
 * // Simple usage with auto-injected requestId
 * enhancedLogError(logger, error, { operation: 'extract', userId: 'user123' })
 *
 * // With performance metrics
 * const duration = Date.now() - startTime
 * enhancedLogError(logger, error, {
 *   operation: 'clean',
 *   userId: 'user456',
 *   batchId: 'batch-001',
 *   duration,
 *   orderNumbers: ['ORD-123', 'ORD-124']
 * })
 * ```
 */
export function enhancedLogError(
  logger: { error: (message: string, meta?: Record<string, unknown>) => void },
  error: unknown,
  context: {
    operation: string
    userId?: string
    batchId?: string
    duration?: number
    orderNumbers?: string[]
    materialCodes?: string[]
    module?: string
  },
  customMessage?: string
): void {
  const {
    operation,
    userId,
    batchId,
    duration,
    orderNumbers,
    materialCodes,
    module: moduleName
  } = context

  logError(logger, error, {
    message: customMessage,
    operation,
    module: moduleName,
    userId,
    batchId,
    duration,
    context: {
      ...(orderNumbers && { orderNumbers }),
      ...(materialCodes && { materialCodes })
    }
  })
}
