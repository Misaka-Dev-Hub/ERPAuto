import { ipcMain } from 'electron'
import { ErpAuthService } from '../services/erp/erp-auth'
import { CleanerService } from '../services/erp/cleaner'
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

        // Create cleaner service and run cleaning
        const cleaner = new CleanerService(authService)
        console.log('[Cleaner] Starting cleaning:', input)
        const result = await cleaner.clean(input)
        console.log('[Cleaner] Cleaning completed:', result)

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
      }
    }
  )
}
