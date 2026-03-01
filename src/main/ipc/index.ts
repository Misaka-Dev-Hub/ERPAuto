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

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(): void {
  registerFileHandlers()
  registerExtractorHandlers()
  registerCleanerHandlers()
  registerDatabaseHandlers()
  registerResolverHandlers()
  registerAuthHandlers()
}
