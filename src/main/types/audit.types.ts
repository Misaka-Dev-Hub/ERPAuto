/**
 * Audit log types and interfaces
 */

/**
 * Audit action enumeration
 */
export enum AuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  EXTRACT = 'EXTRACT',
  CLEAN = 'CLEAN',
  SETTINGS_CHANGE = 'SETTINGS_CHANGE'
}

/**
 * Audit status enumeration
 */
export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE'
}

/**
 * Audit entry interface
 */
export interface AuditEntry {
  /** Timestamp of the action */
  timestamp: Date
  /** Action performed */
  action: AuditAction
  /** User ID who performed the action */
  userId: string
  /** Username who performed the action */
  username: string
  /** Computer name where action was performed */
  computerName: string
  /** Resource affected by the action */
  resource?: string
  /** Status of the action */
  status: AuditStatus
  /** Additional metadata in JSON format */
  metadata?: string
}
