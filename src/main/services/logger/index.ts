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
import { app } from 'electron'
import fs from 'fs'
import { serializeError, sanitizeError } from './error-utils'

// Get log directory - use app.getPath('logs') in production, or local logs dir in development
function getLogDir(): string {
  if (app && app.isReady()) {
    return app.getPath('logs')
  }
  // Fallback for development or before app is ready
  const devLogDir = path.join(process.cwd(), 'logs')
  if (!fs.existsSync(devLogDir)) {
    fs.mkdirSync(devLogDir, { recursive: true })
  }
  return devLogDir
}

// Check if running in production
const isProduction = app?.isPackaged ?? process.env.NODE_ENV === 'production'

// Custom format for console output - includes full error details
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, context, error, ...meta }) => {
    const contextStr = context ? `[${context}]` : ''

    // Format error with full stack trace
    let errorStr = ''
    if (error) {
      const serialized = isProduction ? sanitizeError(serializeError(error)) : serializeError(error)
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
      info.error = isProduction
        ? sanitizeError(serializeError(info.error))
        : serializeError(info.error)
    }

    // Serialize any error in meta fields
    for (const key of Object.keys(info)) {
      if (key !== 'error' && info[key] instanceof Error) {
        info[key] = isProduction
          ? sanitizeError(serializeError(info[key]))
          : serializeError(info[key])
      }
    }

    return info
  })(),
  winston.format.json()
)

// Daily rotate file transport configuration
const createFileTransport = (level?: string): DailyRotateFile => {
  return new DailyRotateFile({
    filename: path.join(getLogDir(), 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    level,
    format: fileFormat
  })
}

// Create the logger instance with default level
const logger = winston.createLogger({
  level: 'info', // Default level, can be updated via setLogLevel()
  defaultMeta: { service: 'erpauto' },
  transports: [
    // Console transport - always enabled
    new winston.transports.Console({
      format: consoleFormat
    }),
    // File transport for all levels
    createFileTransport()
  ]
})

/**
 * Update the logger level dynamically
 * @param level - The new log level
 */
export function setLogLevel(level: string): void {
  logger.level = level
}

// Add error-specific file transport in production
if (app.isPackaged) {
  logger.add(
    new DailyRotateFile({
      filename: path.join(getLogDir(), 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error',
      format: fileFormat
    })
  )
}

/**
 * Create a child logger with a specific context
 * @param context - The context/module name for the logger
 * @returns A child logger instance
 */
export function createLogger(context: string): winston.Logger {
  return logger.child({ context })
}

/**
 * Log an error with full context and stack trace
 * This is the recommended way to log errors in the application
 *
 * @param log - Logger instance
 * @param message - Error message
 * @param error - The error object (Error, BaseError, or any)
 * @param meta - Additional metadata to include
 */
export function logError(
  log: winston.Logger,
  message: string,
  error: unknown,
  meta?: Record<string, unknown>
): void {
  log.error(message, { error, ...meta })
}

// Export the main logger for direct use
export default logger

// Export log level types for convenience
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose'
