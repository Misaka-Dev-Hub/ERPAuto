/**
 * IPC handlers for Order Number Resolver
 *
 * Provides APIs for the renderer process to:
 * - Resolve productionIDs and 生产订单号 to production order numbers
 * - Validate input formats
 */

import { ipcMain } from 'electron'
import { ProductionContractRepository } from '../services/database/repositories/ProductionContractRepository'
import { OrderNumberResolver } from '../services/erp/order-resolver'
import { createLogger } from '../services/logger'
import { DatabaseQueryError } from '../types/errors'
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
      try {
        // Create repository
        log.info('Creating repository for resolution', { inputCount: input.inputs.length })
        const contractRepo = new ProductionContractRepository()

        // Create resolver and resolve inputs
        const resolver = new OrderNumberResolver(contractRepo)
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
        const resolver = new OrderNumberResolver(null as any)

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
