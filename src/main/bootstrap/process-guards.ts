import { app } from 'electron'
import logger from '../services/logger/index'
import { logAudit, closeAuditLogger } from '../services/logger/audit-logger'

export function setupProcessGuards(): void {
  process.on('uncaughtException', async (err) => {
    logger.error('Uncaught exception', { error: err })
    await logAudit('SYSTEM_CRASH', 'system', {
      username: 'system',
      computerName: process.env.COMPUTERNAME || 'unknown',
      resource: 'main-process',
      status: 'failure',
      metadata: { error: err.message, stack: err.stack }
    })
    console.error('Uncaught exception:', err)
    setTimeout(() => process.exit(1), 1000)
  })

  process.on('unhandledRejection', async (reason) => {
    logger.error('Unhandled Rejection', { reason: String(reason) })
    await logAudit('SYSTEM_ERROR', 'system', {
      username: 'system',
      computerName: process.env.COMPUTERNAME || 'unknown',
      resource: 'main-process',
      status: 'failure',
      metadata: { reason: String(reason) }
    })
    console.error('Unhandled Rejection:', reason)
  })

  app.on('render-process-gone', (_, webContents, details) => {
    logger.error('Render process gone', { details, webContentsId: webContents.id })
    console.error('Render process gone:', details)
  })

  app.on('child-process-gone', (_, details) => {
    logger.error('Child process gone', { details })
    console.error('Child process gone:', details)
  })

  // Flush and close loggers before quit to prevent log loss
  app.on('before-quit', () => {
    logger.close()
    closeAuditLogger()
  })
}
