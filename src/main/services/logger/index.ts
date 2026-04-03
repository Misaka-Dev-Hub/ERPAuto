/**
 * Unified logging system using Winston
 * Console + File transports with daily rotation
 *
 * Features:
 * - Full error serialization with stack traces
 * - Development/Production environment differentiation
 * - Structured logging with context
 */

import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import { serializeError, sanitizeError } from './error-utils'
import { getLogDir, isProduction } from './shared'

// Custom format for console output - includes full error details
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, context, error, ...meta }) => {
    const contextStr = context ? `[${context}]` : ''

    // Format error with full stack trace
    let errorStr = ''
    if (error) {
      const serialized = isProduction()
        ? sanitizeError(serializeError(error))
        : serializeError(error)
      if (serialized.stack) {
        errorStr = `\n${serialized.stack}`
      } else {
        errorStr = ` ${serialized.message}`
      }
    }

    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, null, 2)}` : ''
    return `${timestamp} [${level}]${contextStr} ${message}${errorStr}${metaStr}`
  })
)

// Custom format for file output - JSON with full error details
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format((info) => {
    // Serialize errors in metadata
    if (info.error) {
      info.error = isProduction()
        ? sanitizeError(serializeError(info.error))
        : serializeError(info.error)
    }

    // Serialize any error in meta fields
    for (const key of Object.keys(info)) {
      if (key !== 'error' && info[key] instanceof Error) {
        info[key] = isProduction()
          ? sanitizeError(serializeError(info[key]))
          : serializeError(info[key])
      }
    }

    return info
  })(),
  winston.format.json()
)

// Daily rotate file transport configuration
const createFileTransport = (level?: string, maxFiles?: string): DailyRotateFile => {
  return new DailyRotateFile({
    filename: path.join(getLogDir(), 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: maxFiles || '14d',
    level,
    format: fileFormat
  })
}

// Create the logger instance with default level - Console only initially
// File transports are added after config is loaded via applyLoggingConfig()
const logger = winston.createLogger({
  level: 'info', // Default level, can be updated via setLogLevel()
  defaultMeta: { service: 'erpauto' },
  transports: [
    // Console transport - always enabled
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
})

/**
 * Update the logger level dynamically
 * @param level - The new log level
 */
export function setLogLevel(level: string): void {
  logger.level = level
}

/**
 * Apply logging configuration from config file
 * Removes existing DailyRotateFile transports and recreates them with config values
 *
 * @param config - Logging configuration from config.yaml
 */
export function applyLoggingConfig(config: { level: string; appRetention: number }): void {
  // Update log level
  setLogLevel(config.level)

  // Remove existing DailyRotateFile transports
  const existingFileTransports = logger.transports.filter((t) => t instanceof DailyRotateFile)
  for (const transport of existingFileTransports) {
    logger.remove(transport)
  }

  // Add app log transport with configured retention
  const retentionStr = `${config.appRetention}d`
  logger.add(createFileTransport(undefined, retentionStr))

  // Add error-specific file transport in production
  if (isProduction()) {
    logger.add(
      new DailyRotateFile({
        filename: path.join(getLogDir(), 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: retentionStr,
        level: 'error',
        format: fileFormat
      })
    )
  }
}

/**
 * Create a child logger with a specific context
 * @param context - The context/module name for the logger
 * @returns A child logger instance
 */
export function createLogger(context: string): winston.Logger {
  return logger.child({ context })
}

// Re-export error utilities for convenience
export { logError, formatErrorForLogging, serializeError, extractErrorContext } from './error-utils'

// Export the main logger for direct use
export default logger

// Export log level types for convenience
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose'
