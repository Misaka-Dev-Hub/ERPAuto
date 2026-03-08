/**
 * Audit Logger Service
 * Writes audit logs in JSONL format with 30-day rotation using winston-daily-rotate-file
 */

import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

/**
 * Audit log entry structure
 * All 8 required fields for comprehensive audit tracking
 */
export interface AuditEntry {
  /** ISO 8601 timestamp of the audit event */
  timestamp: string
  /** The action that was performed (e.g., 'LOGIN', 'EXTRACT', 'DELETE') */
  action: string
  /** User ID who performed the action */
  userId: string
  /** Username of the user who performed the action */
  username: string
  /** Computer name from which the action was performed */
  computerName: string
  /** The resource that was affected (e.g., table name, file path) */
  resource: string
  /** Status of the action: 'success' | 'failure' | 'partial' */
  status: 'success' | 'failure' | 'partial'
  /** Additional metadata about the audit event */
  metadata: Record<string, unknown>
}

/**
 * Get the log directory for audit logs
 * Uses app.getPath('logs') in production, local logs dir in development
 */
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

/**
 * JSONL formatter - outputs one JSON object per line
 * This is the key difference from the standard JSON formatter
 */
const jsonlFormat = winston.format.printf(({ message }) => {
  // Message should already be a JSON string
  return typeof message === 'string' ? message : JSON.stringify(message)
})

/**
 * Create the audit logger instance with daily rotation
 * Configured for 30-day retention as per requirements
 */
const auditLogger = winston.createLogger({
  level: 'info',
  silent: false,
  transports: [
    new DailyRotateFile({
      filename: path.join(getLogDir(), 'audit-%DATE%.jsonl'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d', // 30-day retention
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
        jsonlFormat
      )
    })
  ]
})

/**
 * Log an audit event
 *
 * @param action - The action that was performed
 * @param userId - User ID who performed the action
 * @param details - Additional details including username, computerName, resource, status, and optional metadata
 * @returns Promise that resolves when the log is written (non-blocking)
 */
export async function logAudit(
  action: string,
  userId: string,
  details: {
    username: string
    computerName: string
    resource: string
    status: 'success' | 'failure' | 'partial'
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    action,
    userId,
    username: details.username,
    computerName: details.computerName,
    resource: details.resource,
    status: details.status,
    metadata: details.metadata || {}
  }

  // Write as JSONL - one JSON object per line
  // Using info level with the entry stringified as the message
  auditLogger.info(JSON.stringify(entry))
}

/**
 * Flush and close the audit logger (call on app shutdown)
 */
export async function closeAuditLogger(): Promise<void> {
  // Winston logger.close() is synchronous
  auditLogger.close()
}

export default auditLogger
