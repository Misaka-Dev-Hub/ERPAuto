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
import os from 'os'
import { app, BrowserWindow } from 'electron'
import { serializeError, sanitizeError } from './error-utils'
import { getLogDir, isProduction, cleanupOldScreenshots } from './shared'
import { IPC_CHANNELS } from '../../../shared/ipc-channels'
import { getContext, run } from './request-context'
import { createSeqTransportSync } from './seq-transport'
import type { SeqConfig } from '../../types/config.schema'

// Custom log levels matching project semantics:
// verbose (most detailed) → error (most severe)
// Winston rule: logs with level value <= threshold are emitted.
const PROJECT_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4
} as const

// Cache isProduction() at module load — app.isPackaged never changes at runtime
const IS_PROD = isProduction()
const SEQ_TRANSPORT_MARKER = '__erpautoSeqTransport'

/**
 * Check if an IPv4 address is an RFC 1918 private address.
 * Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return false
  // 10.0.0.0/8
  if (parts[0] === 10) return true
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true
  return false
}

/**
 * Get the primary local IPv4 address (RFC 1918 private address).
 *
 * Strategy:
 * 1. Collect all non-internal, non-APIPA IPv4 addresses from physical adapters
 * 2. Return the first private (LAN) address found
 * 3. Fallback to any remaining non-internal address
 * 4. Returns 'N/A' if none found
 */
function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces()
  const candidates: string[] = []

  for (const [, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue
    for (const iface of addrs) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        candidates.push(iface.address)
      }
    }
  }

  // Prefer private (LAN) addresses
  const privateIp = candidates.find(isPrivateIpv4)
  if (privateIp) return privateIp

  // Fallback: any non-internal address
  return candidates[0] || 'N/A'
}

/**
 * Check if an error has already been serialized (plain object with name/message but not an Error instance).
 * Prevents double-serialization when logError() output passes through the format pipeline.
 */
function isSerializedError(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Error) &&
    'name' in value &&
    'message' in value
  )
}

// Custom format for console output - includes full error details
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  // Auto-inject requestId from async context
  winston.format((info) => {
    const context = getContext()
    if (context) {
      info.requestId = context.requestId
      if (context.userId) {
        info.userId = context.userId
      }
      if (context.operation) {
        info.operation = context.operation
      }
    }
    return info
  })(),
  winston.format.printf(
    ({ timestamp, level, message, context, error, requestId, userId, operation, ...meta }) => {
      const contextStr = context ? `[${context}]` : ''
      const requestIdStr = requestId ? ` [${requestId}]` : ''
      const userStr = userId ? ` (user:${userId})` : ''
      const opStr = operation ? ` op:${operation}` : ''

      // Format error with full stack trace
      let errorStr = ''
      if (error) {
        // Skip re-serialization if already a serialized error object
        const serialized: { stack?: string; message: string } = isSerializedError(error)
          ? (error as { stack?: string; message: string })
          : IS_PROD
            ? sanitizeError(serializeError(error))
            : serializeError(error)
        if (serialized.stack) {
          errorStr = `\n${serialized.stack}`
        } else {
          errorStr = ` ${serialized.message}`
        }
      }

      let metaStr = ''
      if (Object.keys(meta).length > 0) {
        try {
          metaStr = ` ${JSON.stringify(meta, null, 2)}`
        } catch {
          // Fallback for circular references: stringify primitives, replace complex objects with placeholder
          metaStr = ` ${JSON.stringify(
            Object.fromEntries(
              Object.entries(meta).map(([k, v]) => [
                k,
                v !== null && typeof v === 'object' ? `[Object]` : v
              ])
            ),
            null,
            2
          )}`
        }
      }
      return `${timestamp} [${level}]${contextStr}${requestIdStr}${userStr}${opStr} ${message}${errorStr}${metaStr}`
    }
  )
)

// Custom format for file output - JSON with full error details
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  // Auto-inject requestId from async context for file logs
  winston.format((info) => {
    const context = getContext()
    if (context) {
      info.requestId = context.requestId
      if (context.userId) {
        info.userId = context.userId
      }
      if (context.operation) {
        info.operation = context.operation
      }
    }
    return info
  })(),
  winston.format((info) => {
    // Serialize errors in metadata (skip if already serialized)
    if (info.error) {
      if (!isSerializedError(info.error)) {
        info.error = IS_PROD
          ? sanitizeError(serializeError(info.error))
          : serializeError(info.error)
      }
    }

    // Serialize any error in meta fields (skip if already serialized)
    for (const key of Object.keys(info)) {
      if (key !== 'error' && info[key] instanceof Error) {
        info[key] = IS_PROD ? sanitizeError(serializeError(info[key])) : serializeError(info[key])
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

function isSeqTransport(transport: winston.transport): boolean {
  const candidate = transport as winston.transport & {
    [SEQ_TRANSPORT_MARKER]?: boolean
    name?: string
  }

  return (
    candidate[SEQ_TRANSPORT_MARKER] === true ||
    candidate.name === 'seq' ||
    candidate.constructor?.name?.toLowerCase().includes('seqtransport') === true
  )
}

function markSeqTransport<T>(transport: T): T {
  if (transport && typeof transport === 'object') {
    Object.defineProperty(transport, SEQ_TRANSPORT_MARKER, {
      value: true,
      configurable: true,
      enumerable: false,
      writable: false
    })
  }

  return transport
}

// Create the logger instance with default level - Console only initially
// File transports are added after config is loaded via applyLoggingConfig()
const logger = winston.createLogger({
  levels: PROJECT_LEVELS,
  level: 'info', // Default level, can be updated via setLogLevel()
  defaultMeta: {
    service: 'erpauto',
    appVersion: app.getVersion(),
    computerName: os.hostname(),
    ipAddress: getLocalIpAddress()
  },
  transports: [
    // Console transport - always enabled
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
})

/**
 * Update the logger level dynamically and notify renderer processes
 * @param level - The new log level
 */
export function setLogLevel(level: string): void {
  logger.level = level

  // Broadcast level change to all renderer windows so they update their cached level
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.LOGGER_LEVEL_CHANGED, level)
    }
  }
}

/**
 * Apply logging configuration from config file
 * Removes existing DailyRotateFile transports and recreates them with config values
 * Also configures Seq transport if enabled
 *
 * @param config - Logging configuration from config.yaml
 * @param seqConfig - Optional Seq configuration from config.yaml
 */
export function applyLoggingConfig(
  config: { level: string; appRetention: number },
  seqConfig?: SeqConfig
): void {
  // Update log level
  setLogLevel(config.level)

  // Remove existing DailyRotateFile transports
  const existingFileTransports = logger.transports.filter((t) => t instanceof DailyRotateFile)
  for (const transport of existingFileTransports) {
    logger.remove(transport)
  }

  // Remove any previously registered Seq transports so config reloads do not duplicate them.
  const existingSeqTransports = logger.transports.filter(isSeqTransport)
  for (const transport of existingSeqTransports) {
    logger.remove(transport)
  }

  // Add app log transport with configured retention
  const retentionStr = `${config.appRetention}d`
  logger.add(createFileTransport(undefined, retentionStr))

  // Add error-specific file transport in production
  if (IS_PROD) {
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

  // Add Seq transport if configured and enabled
  // Note: Uses sync wrapper which initializes asynchronously
  if (seqConfig && seqConfig.enabled && seqConfig.serverUrl) {
    try {
      const seqTransport = createSeqTransportSync(seqConfig)
      if (seqTransport) {
        logger.add(markSeqTransport(seqTransport))
        logger.info('Seq transport added successfully', {
          serverUrl: seqConfig.serverUrl,
          batchPostingLimit: seqConfig.batchPostingLimit,
          period: seqConfig.period,
          context: 'seq-transport'
        })
      } else {
        // Transport not ready yet, will be initialized on next call
        logger.debug('Seq transport initialization in progress', {
          serverUrl: seqConfig.serverUrl,
          context: 'seq-transport'
        })
        // Initialize and add when ready
        import('./seq-transport').then(({ createSeqTransport }) => {
          createSeqTransport(seqConfig).then((transport) => {
            if (transport) {
              logger.add(markSeqTransport(transport))
              logger.info('Seq transport added (async init complete)', {
                serverUrl: seqConfig.serverUrl,
                context: 'seq-transport'
              })
            }
          })
        })
      }
    } catch (error) {
      logger.error('Failed to add Seq transport', {
        error: error instanceof Error ? error.message : String(error),
        context: 'seq-transport'
      })
      // Don't throw - allow app to continue without Seq
    }
  }

  // Clean up old screenshot files beyond the retention window
  cleanupOldScreenshots(config.appRetention)
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
 * Execute a function with automatic request-scoped logging
 *
 * This wrapper ensures all logging within the function has access to the request context.
 * It's a convenience wrapper around RequestContext.run() that also ensures the logger
 * properly captures the context.
 *
 * @param fn - The async function to execute within the context
 * @param context - Optional business context (userId, operation)
 * @returns Promise resolving to the function's return value
 *
 * @example
 * ```typescript
 * await withRequestContext(async () => {
 *   logger.info('Processing order') // Will include requestId, userId, operation
 *   await processOrder()
 * }, { userId: 'user123', operation: 'process-order' })
 * ```
 */
export async function withRequestContext<T>(
  fn: () => Promise<T>,
  context?: { userId?: string; operation?: string }
): Promise<T> {
  return run(fn, context)
}

// Re-export error utilities for convenience
export { logError, formatErrorForLogging, serializeError, extractErrorContext } from './error-utils'

// Export request context management for async-context logging
export { run, getRequestId, getContext, withContext, type LoggerContext } from './request-context'

// Export the main logger for direct use
export default logger

// Export performance monitoring utilities
export {
  trackDuration,
  PerformanceTracker,
  createPerformanceTracker,
  DEFAULT_SLOW_THRESHOLD_MS
} from './performance-monitor'

// Export log level types for convenience
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose'
