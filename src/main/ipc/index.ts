/**
 * IPC Handler registration
 * Centralized registration for all IPC handlers
 */

import { registerFileHandlers } from './file-handler'
import { registerExtractorHandlers } from './extractor-handler'
import { registerCleanerHandlers } from './cleaner-handler'
import { registerDatabaseHandlers } from './database-handler'
import { registerResolverHandlers } from './resolver-handler'
import { registerAuthHandlers } from './auth-handler'
import { registerValidationHandlers } from './validation-handler'
import { registerSettingsHandlers } from './settings-handler'
import { registerMaterialTypeHandlers } from './material-type-handler'
import { registerUserErpConfigHandlers } from './user-erp-config-handler'
import { registerLoggerHandlers } from './logger-handler'
import { registerReportHandlers } from './report-handler'
import { registerUpdateHandlers } from './update-handler'
import { registerPlaywrightBrowserHandlers } from './playwright-browser'
import { createLogger, logError } from '../services/logger'
import { serializeError, sanitizeError } from '../services/logger/error-utils'
import { getErrorMessage, getErrorCode, isBaseError } from '../types/errors'
import type { IpcResult } from '../types/ipc.types'

export type { IpcResult } from '../types/ipc.types'

const log = createLogger('IPC')

function getErrorCauseMessage(error: { cause?: unknown }): string | undefined {
  const { cause } = error
  return cause instanceof Error ? cause.message : undefined
}

export function ok<T>(data: T): IpcResult<T> {
  return { success: true, data }
}

export function fail<T = unknown>(error: string, code?: string): IpcResult<T> {
  return { success: false, error, code }
}

/**
 * Higher-order function to wrap IPC handlers with consistent error handling
 * Enhanced to capture full error context including stack traces
 * @param handler - The async handler function to wrap
 * @param context - The context name for logging
 * @returns A wrapped handler that returns IpcResult
 */
export function withErrorHandling<T>(
  handler: () => Promise<T>,
  context: string
): Promise<IpcResult<T>> {
  return handler()
    .then((data): IpcResult<T> => {
      log.debug(`[${context}] Handler completed successfully`)
      return ok(data)
    })
    .catch((error: unknown) => {
      const message = getErrorMessage(error)
      const code = getErrorCode(error)

      // Serialize error with full details
      if (process.env.NODE_ENV === 'production') {
        sanitizeError(serializeError(error))
      } else {
        serializeError(error)
      }

      if (isBaseError(error)) {
        logError(log, `[${context}] ${error.name}`, error, {
          code,
          cause: getErrorCauseMessage(error),
          handler: context
        })
      } else {
        logError(log, `[${context}] Error`, error, {
          code,
          handler: context
        })
      }

      // Include stack trace in development
      if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
        log.debug(`[${context}] Stack trace: ${error.stack}`)
      }

      return fail<T>(message, code)
    })
}

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(): void {
  log.info('Registering IPC handlers...')
  registerFileHandlers()
  registerExtractorHandlers()
  registerCleanerHandlers()
  registerDatabaseHandlers()
  registerResolverHandlers()
  registerAuthHandlers()
  registerValidationHandlers()
  registerSettingsHandlers()
  registerMaterialTypeHandlers()
  registerUserErpConfigHandlers()
  registerLoggerHandlers()
  registerReportHandlers()
  registerUpdateHandlers()
  registerPlaywrightBrowserHandlers()
  log.info('All IPC handlers registered')
}
