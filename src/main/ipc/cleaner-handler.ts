import { ipcMain } from 'electron'
import { ErpAuthService } from '../services/erp/erp-auth'
import { CleanerService } from '../services/erp/cleaner'
import { OrderNumberResolver } from '../services/erp/order-resolver'
import { MySqlService } from '../services/database/mysql'
import type { CleanerInput, CleanerResult } from '../types/cleaner.types'

/**
 * Register IPC handlers for cleaner service
 */
export function registerCleanerHandlers(): void {
  ipcMain.handle(
    'cleaner:run',
    async (
      _event,
      input: CleanerInput
    ): Promise<{ success: boolean; data?: CleanerResult; error?: string }> => {
      let authService: ErpAuthService | null = null
      let mysqlService: MySqlService | null = null

      try {
        // Check environment variables
        const erpUrl = process.env.ERP_URL || ''
        const erpUsername = process.env.ERP_USERNAME || ''
        const erpPassword = process.env.ERP_PASSWORD || ''

        console.log('[Cleaner] Config:', {
          url: erpUrl ? '***' : 'EMPTY',
          username: erpUsername ? '***' : 'EMPTY'
        })

        if (!erpUrl || !erpUsername || !erpPassword) {
          throw new Error(
            'ERP 配置不完整。请检查 .env 文件中的 ERP_URL, ERP_USERNAME, ERP_PASSWORD'
          )
        }

        // Resolve order numbers (convert productionIDs to 生产订单号)
        const mysqlConfig = {
          host: process.env.DB_MYSQL_HOST || 'localhost',
          port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
          user: process.env.DB_USERNAME || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || ''
        }

        console.log('[Cleaner] Connecting to MySQL for order resolution...')
        mysqlService = new MySqlService(mysqlConfig)
        await mysqlService.connect()

        const resolver = new OrderNumberResolver(mysqlService)
        const mappings = await resolver.resolve(input.orderNumbers)

        // Get valid order numbers and warnings
        const validOrderNumbers = resolver.getValidOrderNumbers(mappings)
        const warnings = resolver.getWarnings(mappings)

        if (warnings.length > 0) {
          console.warn('[Cleaner] Resolution warnings:', warnings)
        }

        if (validOrderNumbers.length === 0) {
          throw new Error('没有有效的生产订单号可处理。请检查输入的格式或数据库连接。')
        }

        console.log('[Cleaner] Resolved order numbers:', validOrderNumbers)

        // Create auth service and login
        authService = new ErpAuthService({
          url: erpUrl,
          username: erpUsername,
          password: erpPassword,
          headless: true
        })

        console.log('[Cleaner] Logging in to ERP...')
        await authService.login()
        console.log('[Cleaner] Login successful')

        // Create cleaner service and run cleaning with resolved order numbers
        const cleaner = new CleanerService(authService)

        const modifiedInput: CleanerInput = {
          ...input,
          orderNumbers: validOrderNumbers,
          onProgress: input.onProgress
        }

        console.log('[Cleaner] Starting cleaning:', modifiedInput)
        const result = await cleaner.clean(modifiedInput)
        console.log('[Cleaner] Cleaning completed:', result)

        // Add warnings to result errors if any
        if (warnings.length > 0) {
          result.errors = [...warnings, ...result.errors]
        }

        return { success: true, data: result }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[Cleaner] Error:', message)
        console.error('[Cleaner] Stack:', error instanceof Error ? error.stack : 'N/A')
        return { success: false, error: `清理失败：${message}` }
      } finally {
        // Clean up: close browser
        if (authService) {
          try {
            await authService.close()
            console.log('[Cleaner] Browser closed')
          } catch (closeError) {
            console.warn('[Cleaner] Error closing browser:', closeError)
          }
        }

        // Clean up: disconnect MySQL
        if (mysqlService) {
          try {
            await mysqlService.disconnect()
            console.log('[Cleaner] MySQL disconnected')
          } catch (closeError) {
            console.warn('[Cleaner] Error disconnecting MySQL:', closeError)
          }
        }
      }
    }
  )
}
