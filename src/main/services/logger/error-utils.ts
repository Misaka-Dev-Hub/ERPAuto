/**
 * Error Logging Utilities
 *
 * Provides comprehensive error serialization and formatting for logging.
 * Captures full error context including stack traces, causes, and custom properties.
 */

import type { ErrorLike, SerializedError } from '../../types/errors'

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
  if (process.env.NODE_ENV === 'production') {
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
 */
export function formatErrorForLogging(
  error: unknown,
  context?: {
    operation?: string
    module?: string
    userId?: string
    [key: string]: unknown
  }
): {
  message: string
  metadata: Record<string, unknown>
} {
  const serialized = serializeError(error)
  const isProd = process.env.NODE_ENV === 'production'
  const errorToLog = isProd ? sanitizeError(serialized) : serialized
  const errorContext = extractErrorContext(errorToLog)

  const metadata: Record<string, unknown> = {
    error: errorToLog,
    ...context
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
 */
export function logError(
  logger: { error: (message: string, meta?: Record<string, unknown>) => void },
  error: unknown,
  options: {
    message?: string
    operation?: string
    module?: string
    userId?: string
    context?: Record<string, unknown>
  } = {}
): void {
  const { message: customMessage, operation, module: moduleName, userId, context } = options
  const { message, metadata } = formatErrorForLogging(error, {
    operation,
    module: moduleName,
    userId,
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
