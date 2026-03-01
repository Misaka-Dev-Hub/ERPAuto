import { ipcMain } from 'electron'
import { ErpAuthService } from '../services/erp/erp-auth'
import { ExtractorService } from '../services/erp/extractor'
import { OrderNumberResolver } from '../services/erp/order-resolver'
import { MySqlService } from '../services/database/mysql'
import type { ExtractorInput, ExtractorResult } from '../types/extractor.types'

/**
 * Register IPC handlers for extractor service
 */
export function registerExtractorHandlers(): void {
  ipcMain.handle(
    'extractor:run',
    async (
      _event,
      input: ExtractorInput
    ): Promise<{ success: boolean; data?: ExtractorResult; error?: string }> => {
      let authService: ErpAuthService | null = null
      let mysqlService: MySqlService | null = null

      try {
        // Check environment variables
        const erpUrl = process.env.ERP_URL || ''
        const erpUsername = process.env.ERP_USERNAME || ''
        const erpPassword = process.env.ERP_PASSWORD || ''

        console.log('[Extractor] Config:', {
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

        console.log('[Extractor] Connecting to MySQL for order resolution...')
        mysqlService = new MySqlService(mysqlConfig)
        await mysqlService.connect()

        const resolver = new OrderNumberResolver(mysqlService)
        const mappings = await resolver.resolve(input.orderNumbers)

        // Get valid order numbers and warnings
        const validOrderNumbers = resolver.getValidOrderNumbers(mappings)
        const warnings = resolver.getWarnings(mappings)

        if (warnings.length > 0) {
          console.warn('[Extractor] Resolution warnings:', warnings)
        }

        if (validOrderNumbers.length === 0) {
          throw new Error('没有有效的生产订单号可处理。请检查输入的格式或数据库连接。')
        }

        console.log('[Extractor] Resolved order numbers:', validOrderNumbers)

        // Create auth service and login
        authService = new ErpAuthService({
          url: erpUrl,
          username: erpUsername,
          password: erpPassword,
          headless: true
        })

        console.log('[Extractor] Logging in to ERP...')
        await authService.login()
        console.log('[Extractor] Login successful')

        // Create extractor service and run extraction with resolved order numbers
        const extractor = new ExtractorService(authService)
        console.log('[Extractor] Starting extraction for orders:', validOrderNumbers)

        const modifiedInput: ExtractorInput = {
          ...input,
          orderNumbers: validOrderNumbers
        }

        const result = await extractor.extract(modifiedInput)

        // Add warnings to result errors if any
        if (warnings.length > 0) {
          result.errors = [...warnings, ...result.errors]
        }

        console.log('[Extractor] Extraction completed:', result)

        return { success: true, data: result }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[Extractor] Error:', message)
        console.error('[Extractor] Stack:', error instanceof Error ? error.stack : 'N/A')
        return { success: false, error: `提取失败：${message}` }
      } finally {
        // Clean up: close browser
        if (authService) {
          try {
            await authService.close()
            console.log('[Extractor] Browser closed')
          } catch (closeError) {
            console.warn('[Extractor] Error closing browser:', closeError)
          }
        }

        // Clean up: disconnect MySQL
        if (mysqlService) {
          try {
            await mysqlService.disconnect()
            console.log('[Extractor] MySQL disconnected')
          } catch (closeError) {
            console.warn('[Extractor] Error disconnecting MySQL:', closeError)
          }
        }
      }
    }
  )
}
