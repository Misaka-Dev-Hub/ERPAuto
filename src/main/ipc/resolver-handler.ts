/**
 * IPC handlers for Order Number Resolver
 *
 * Provides APIs for the renderer process to:
 * - Resolve productionIDs and 生产订单号 to production order numbers
 * - Validate input formats
 */

import { ipcMain } from 'electron'
import { create, type IDatabaseService } from '../services/database'
import { OrderNumberResolver } from '../services/erp/order-resolver'
import { createLogger } from '../services/logger'
import type { ResolverInput, ResolverResponse } from '../types/resolver-ipc.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { withErrorHandling, type IpcResult } from './index'

const log = createLogger('ResolverHandler')

/**
 * Register IPC handlers for order number resolver
 */
export function registerResolverHandlers(): void {
  /**
   * Resolve order numbers
   * Converts productionIDs and 生产订单号 to production order numbers
   */
  ipcMain.handle(
    IPC_CHANNELS.RESOLVER_RESOLVE,
    async (_event, input: ResolverInput): Promise<IpcResult<ResolverResponse>> => {
      let dbService: IDatabaseService | null = null

      return withErrorHandling(async () => {
        // Create database service using factory
        log.info('Connecting to database for resolution', { inputCount: input.inputs.length })
        dbService = await create()

        // Create resolver and resolve inputs
        const resolver = new OrderNumberResolver(dbService)
        const mappings = await resolver.resolve(input.inputs)

        // Get valid order numbers and warnings
        const validOrderNumbers = resolver.getValidOrderNumbers(mappings)
        const warnings = resolver.getWarnings(mappings)
        const stats = resolver.getStats(mappings)

        log.info('Resolution completed', {
          inputCount: input.inputs.length,
          validCount: validOrderNumbers.length,
          warningCount: warnings.length
        })

        return {
          success: true,
          mappings,
          validOrderNumbers,
          warnings,
          stats
        }
      }, 'resolver:resolve').finally(async () => {
        // Clean up database connection
        if (dbService) {
          try {
            await dbService.disconnect()
            log.debug('Database disconnected')
          } catch (closeError) {
            log.warn('Error disconnecting database', {
              error: closeError instanceof Error ? closeError.message : String(closeError)
            })
          }
        }
      })
    }
  )

  /**
   * Validate input format only (without database lookup)
   */
  ipcMain.handle(
    IPC_CHANNELS.RESOLVER_VALIDATE_FORMAT,
    async (
      _event,
      inputs: string[]
    ): Promise<
      IpcResult<Array<{ input: string; type: 'productionId' | 'orderNumber' | 'unknown' }>>
    > => {
      return withErrorHandling(async () => {
        // Create a mock resolver without database connection
        const resolver = new OrderNumberResolver({
          isConnected: () => false,
          type: 'mysql'
        } as IDatabaseService)

        const results = inputs.map((input) => ({
          input,
          type: resolver.recognizeType(input)
        }))

        log.debug('Format validation completed', { inputCount: inputs.length })

        return results
      }, 'resolver:validateFormat')
    }
  )
}
