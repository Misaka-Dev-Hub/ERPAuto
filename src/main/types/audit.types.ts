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
  SETTINGS_CHANGE = 'SETTINGS_CHANGE',
  SYSTEM_CRASH = 'SYSTEM_CRASH',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  DATA_IMPORT = 'DATA_IMPORT',
  RESULT_EXPORT = 'RESULT_EXPORT',
  APP_UPDATE = 'APP_UPDATE',
  ERP_CREDENTIALS_UPDATE = 'ERP_CREDENTIALS_UPDATE'
}

/**
 * Audit status enumeration
 * Note: Values are lowercase to match JSON logging conventions
 */
export enum AuditStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  PARTIAL = 'partial'
}

/**
 * Audit entry interface
 */
export interface AuditEntry {
  /** ISO timestamp of the action */
  timestamp: string
  /** Action performed */
  action: AuditAction
  /** User ID who performed the action */
  userId: string
  /** Username who performed the action */
  username: string
  /** Computer name where action was performed */
  computerName: string
  /** Application version when action was performed */
  appVersion: string
  /** Resource affected by the action */
  resource: string
  /** Status of the action */
  status: AuditStatus
  /** Additional metadata */
  metadata: Record<string, unknown>
}
