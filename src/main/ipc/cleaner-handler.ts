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
        // Create auth service and login
        authService = new ErpAuthService({
          url: process.env.ERP_URL || '',
          username: process.env.ERP_USERNAME || '',
          password: process.env.ERP_PASSWORD || '',
          headless: true
        })

        await authService.login()

        // Create cleaner service and run cleaning
        const cleaner = new CleanerService(authService)
        const result = await cleaner.clean(input)

        return { success: true, data: result }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: message }
      } finally {
        // Clean up: close browser
        if (authService) {
          try {
            await authService.close()
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }
  )
}
