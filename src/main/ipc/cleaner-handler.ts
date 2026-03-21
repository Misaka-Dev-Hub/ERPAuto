import { ipcMain } from 'electron'
import { withErrorHandling, type IpcResult } from './index'
import type {
  CleanerInput,
  CleanerResult,
  ExportResultItem,
  ExportResultResponse
} from '../types/cleaner.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { CleanerApplicationService } from '../services/cleaner/cleaner-application-service'

export function registerCleanerHandlers(): void {
  const cleanerService = new CleanerApplicationService()

  ipcMain.handle(
    IPC_CHANNELS.CLEANER_RUN,
    async (event, input: CleanerInput): Promise<IpcResult<CleanerResult>> => {
      return withErrorHandling(
        async () => cleanerService.runCleaner(event.sender, input),
        'cleaner:run'
      )
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CLEANER_EXPORT_RESULTS,
    async (_event, items: ExportResultItem[]): Promise<IpcResult<ExportResultResponse>> => {
      return withErrorHandling(
        async () => cleanerService.exportResults(items),
        'cleaner:exportResults'
      )
    }
  )
}
