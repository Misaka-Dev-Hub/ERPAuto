import { app } from 'electron'
import logger from '../services/logger/index'
import { logAudit, closeAuditLogger, cachedHostname } from '../services/logger/audit-logger'
import { AuditAction, AuditStatus } from '../types/audit.types'
import { serializeError } from '../services/logger/error-utils'

export function setupProcessGuards(): void {
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err })
    try {
      logAudit(AuditAction.SYSTEM_CRASH, 'system', {
        username: 'system',
        computerName: cachedHostname,
        resource: 'main-process',
        status: AuditStatus.FAILURE,
        metadata: { error: err.message, stack: err.stack }
      })
    } catch (auditError) {
      logger.error('Failed to write crash audit log', { error: auditError })
    } finally {
      setTimeout(() => process.exit(1), 1000)
    }
  })

  process.on('unhandledRejection', (reason) => {
    const errorMeta =
      reason instanceof Error ? { error: serializeError(reason) } : { reason: String(reason) }
    logger.error('Unhandled Rejection', errorMeta)
    try {
      logAudit(AuditAction.SYSTEM_ERROR, 'system', {
        username: 'system',
        computerName: cachedHostname,
        resource: 'main-process',
        status: AuditStatus.FAILURE,
        metadata: errorMeta
      })
    } catch (auditError) {
      logger.error('Failed to write unhandled rejection audit log', { error: auditError })
    }
  })

  app.on('render-process-gone', (_, webContents, details) => {
    logger.error('Render process gone', { details, webContentsId: webContents.id })
  })

  app.on('child-process-gone', (_, details) => {
    logger.error('Child process gone', { details })
  })

  // Flush and close loggers on will-quit (fires after all windows are closed,
  // but before the event loop stops). Using will-quit instead of before-quit
  // ensures the logger remains available for uncaughtException handlers that
  // may fire between before-quit and actual process exit.
  app.on('will-quit', () => {
    logger.close()
    closeAuditLogger()
  })
}
