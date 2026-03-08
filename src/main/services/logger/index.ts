/**
 * Unified logging system using Winston
 * Console + File transports with daily rotation
 */

import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

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

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
    const contextStr = context ? `[${context}]` : ''
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
    return `${timestamp} [${level}]${contextStr} ${message}${metaStr}`
  })
)

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
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

// Export the main logger for direct use
export default logger

// Export log level types for convenience
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose'
