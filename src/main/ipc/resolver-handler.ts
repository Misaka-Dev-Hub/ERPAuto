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
import type { OrderMapping, ResolutionStats } from '../services/erp/order-resolver'

const log = createLogger('ResolverHandler')

/**
 * Resolver input from renderer
 */
export interface ResolverInput {
  /** List of order numbers/productionIDs to resolve */
  inputs: string[]
}

/**
 * Resolver response to renderer
 */
export interface ResolverResponse {
  /** Whether the resolution was successful */
  success: boolean
  /** Resolved order mappings */
  mappings?: OrderMapping[]
  /** Valid production order numbers ready for use */
  validOrderNumbers?: string[]
  /** Warning messages for invalid inputs */
  warnings?: string[]
  /** Resolution statistics */
  stats?: ResolutionStats
  /** Error message if failed */
  error?: string
}

/**
 * Register IPC handlers for order number resolver
 */
export function registerResolverHandlers(): void {
  /**
   * Resolve order numbers
   * Converts productionIDs and 生产订单号 to production order numbers
   */
  ipcMain.handle(
    'resolver:resolve',
    async (_event, input: ResolverInput): Promise<ResolverResponse> => {
      let dbService: IDatabaseService | null = null

      try {
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
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Resolution failed', { error: message })
        return {
          success: false,
          error: `解析失败：${message}`
        }
      } finally {
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
      }
    }
  )

  /**
   * Validate input format only (without database lookup)
   */
  ipcMain.handle(
    'resolver:validateFormat',
    async (
      _event,
      inputs: string[]
    ): Promise<{
      success: boolean
      results?: Array<{ input: string; type: 'productionId' | 'orderNumber' | 'unknown' }>
      error?: string
    }> => {
      try {
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

        return { success: true, results }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Format validation failed', { error: message })
        return {
          success: false,
          error: `验证失败：${message}`
        }
      }
    }
  )
}
