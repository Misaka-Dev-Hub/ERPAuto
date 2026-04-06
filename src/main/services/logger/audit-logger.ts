/**
 * Audit Logger Service
 * Writes audit logs in JSONL format with 30-day rotation using winston-daily-rotate-file
 */

import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import { hostname } from 'os'
import { app } from 'electron'
import { getLogDir } from './shared'
import { SessionManager } from '../user/session-manager'
import type { AuditEntry } from '../../types/audit.types'
import { AuditAction, AuditStatus } from '../../types/audit.types'

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
 * Initially silent (no transports). Call applyAuditConfig() after config is loaded.
 */
const auditLogger = winston.createLogger({
  level: 'info',
  silent: true,
  transports: []
})

/**
 * Apply audit log retention configuration
 * Creates the DailyRotateFile transport with the configured retention period
 *
 * @param retentionDays - Number of days to retain audit logs
 */
export function applyAuditConfig(retentionDays: number): void {
  // Enable logging now that config is loaded
  auditLogger.silent = false

  // Remove existing DailyRotateFile transports
  const existingTransports = auditLogger.transports.filter((t) => t instanceof DailyRotateFile)
  for (const transport of existingTransports) {
    auditLogger.remove(transport)
  }

  // Add audit transport with configured retention
  auditLogger.add(
    new DailyRotateFile({
      filename: path.join(getLogDir(), 'audit-%DATE%.jsonl'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: `${retentionDays}d`,
      level: 'info',
      format: jsonlFormat
    })
  )
}

/**
 * Log an audit event
 *
 * @param action - The action that was performed
 * @param userId - User ID who performed the action
 * @param details - Additional details including username, computerName, resource, status, and optional metadata
 */
export function logAudit(
  action: AuditAction,
  userId: string,
  details: {
    username: string
    computerName: string
    resource: string
    status: AuditStatus
    metadata?: Record<string, unknown>
  }
): void {
  try {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action,
      userId,
      username: details.username,
      computerName: details.computerName,
      appVersion: app.getVersion(),
      resource: details.resource,
      status: details.status,
      metadata: details.metadata ?? {}
    }

    // Write as JSONL - one JSON object per line
    // Using info level with the entry stringified as the message
    auditLogger.info(JSON.stringify(entry))
  } catch (error) {
    console.error('Audit logging failed:', error)
  }
}

/** Cached hostname — invariant for the app lifecycle */
export const cachedHostname = hostname()

/**
 * Audit log shortcut that auto-resolves the current user context.
 * Falls back to 'anonymous' if no user is logged in, so the record is always written.
 */
export function logAuditWithCurrentUser(
  action: AuditAction,
  resource: string,
  status: AuditStatus,
  metadata?: Record<string, unknown>
): void {
  const user = SessionManager.getInstance().getUserInfo()
  logAudit(action, user ? String(user.id) : 'anonymous', {
    username: user?.username ?? 'anonymous',
    computerName: cachedHostname,
    resource,
    status,
    metadata: metadata ?? {}
  })
}

/**
 * Flush and close the audit logger (call on app shutdown)
 */
export function closeAuditLogger(): void {
  auditLogger.close()
}

export default auditLogger
