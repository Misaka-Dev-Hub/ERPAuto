import { ipcMain } from 'electron'
import { ErpAuthService } from '../services/erp/erp-auth'
import { ExtractorService } from '../services/erp/extractor'
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

        // Create extractor service and run extraction
        const extractor = new ExtractorService(authService)
        console.log('[Extractor] Starting extraction for orders:', input.orderNumbers)
        const result = await extractor.extract(input)
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
      }
    }
  )
}
