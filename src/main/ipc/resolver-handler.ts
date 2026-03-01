/**
 * IPC handlers for Order Number Resolver
 *
 * Provides APIs for the renderer process to:
 * - Resolve productionIDs and 生产订单号 to production order numbers
 * - Validate input formats
 */

import { ipcMain } from 'electron'
import { MySqlService } from '../services/database/mysql'
import { OrderNumberResolver } from '../services/erp/order-resolver'
import type { OrderMapping, ResolutionStats } from '../services/erp/order-resolver'

/**
 * Resolver input from renderer
 */
export interface ResolverInput {
  /** List of order numbers/productionIDs to resolve */
  inputs: string[]
  /** MySQL configuration (optional, uses default if not provided) */
  mysqlConfig?: {
    host: string
    port: number
    user: string
    password: string
    database: string
  }
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
      let mysqlService: MySqlService | null = null

      try {
        // Use provided config or environment variables
        const mysqlConfig = input.mysqlConfig || {
          host: process.env.DB_MYSQL_HOST || 'localhost',
          port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
          user: process.env.DB_USERNAME || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || ''
        }

        // Create MySQL service
        mysqlService = new MySqlService(mysqlConfig)
        await mysqlService.connect()

        // Create resolver and resolve inputs
        const resolver = new OrderNumberResolver(mysqlService)
        const mappings = await resolver.resolve(input.inputs)

        // Get valid order numbers and warnings
        const validOrderNumbers = resolver.getValidOrderNumbers(mappings)
        const warnings = resolver.getWarnings(mappings)
        const stats = resolver.getStats(mappings)

        return {
          success: true,
          mappings,
          validOrderNumbers,
          warnings,
          stats
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return {
          success: false,
          error: `解析失败：${message}`
        }
      } finally {
        // Clean up MySQL connection
        if (mysqlService) {
          try {
            await mysqlService.disconnect()
          } catch (closeError) {
            console.warn('[Resolver] Error disconnecting MySQL:', closeError)
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
    async (_event, inputs: string[]): Promise<{
      success: boolean
      results?: Array<{ input: string; type: 'productionId' | 'orderNumber' | 'unknown' }>
      error?: string
    }> => {
      try {
        const resolver = new OrderNumberResolver({
          isConnected: () => false
        } as MySqlService)

        const results = inputs.map(input => ({
          input,
          type: resolver.recognizeType(input)
        }))

        return { success: true, results }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return {
          success: false,
          error: `验证失败：${message}`
        }
      }
    }
  )
}
