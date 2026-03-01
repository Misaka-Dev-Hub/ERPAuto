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
        // Create auth service and login
        authService = new ErpAuthService({
          url: process.env.ERP_URL || '',
          username: process.env.ERP_USERNAME || '',
          password: process.env.ERP_PASSWORD || '',
          headless: true
        })

        await authService.login()

        // Create extractor service and run extraction
        const extractor = new ExtractorService(authService)
        const result = await extractor.extract(input)

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
