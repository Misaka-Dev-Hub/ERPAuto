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
import { createLogger } from '../services/logger'
import { getErrorMessage, getErrorCode, isBaseError } from '../types/errors'

const log = createLogger('IPC')

/**
 * Standard result type for all IPC handlers
 */
export interface IpcResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

export function ok<T>(data: T): IpcResult<T> {
  return { success: true, data }
}

export function fail<T = unknown>(error: string, code?: string): IpcResult<T> {
  return { success: false, error, code }
}

/**
 * Higher-order function to wrap IPC handlers with consistent error handling
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

      if (isBaseError(error)) {
        log.error(`[${context}] ${error.name}: ${message}`, { code, cause: error.cause?.message })
      } else {
        log.error(`[${context}] Error: ${message}`, { code })
      }

      // Include stack trace in development
      if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
        log.debug(`[${context}] Stack trace:`, { stack: error.stack })
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
  log.info('All IPC handlers registered')
}
