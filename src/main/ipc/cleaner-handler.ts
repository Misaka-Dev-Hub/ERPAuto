import { randomUUID } from 'crypto'
import { app } from 'electron'
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
import { CleanerOperationHistoryDAO } from '../services/database/cleaner-operation-history-dao'

export function registerCleanerHandlers(): void {
  const cleanerService = new CleanerApplicationService()

  ipcMain.handle(
    IPC_CHANNELS.CLEANER_RUN,
    async (event, input: CleanerInput): Promise<IpcResult<CleanerResult>> => {
      return withErrorHandling(async () => {
        const batchId = randomUUID()
        const historyDao = new CleanerOperationHistoryDAO()
        const appVersion = app.getVersion()

        const result = await cleanerService.runCleaner(
          event.sender,
          input,
          batchId,
          historyDao,
          appVersion
        )

        return result
      }, 'cleaner:run')
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
