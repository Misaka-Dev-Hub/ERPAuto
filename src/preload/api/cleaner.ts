import type {
  CleanerInput,
  CleanerProgress,
  ExportResultItem
} from '../../main/types/cleaner.types'
import type {
  CleanerBatchStats,
  CleanerExecutionRecord,
  CleanerOrderRecord,
  CleanerMaterialRecord,
  GetCleanerBatchesOptions
} from '../../main/types/cleaner-history.types'
import type { IpcResult } from '../../main/types/ipc.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { invokeIpc, ipcRenderer } from '../lib/ipc'

export const cleanerApi = {
  runCleaner: (input: CleanerInput) => invokeIpc(IPC_CHANNELS.CLEANER_RUN, input),
  exportResults: (items: ExportResultItem[]) =>
    invokeIpc(IPC_CHANNELS.CLEANER_EXPORT_RESULTS, items),
  onProgress: (callback: (data: CleanerProgress) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: CleanerProgress) =>
      callback(data)
    ipcRenderer.on(IPC_CHANNELS.CLEANER_PROGRESS, subscription)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CLEANER_PROGRESS, subscription)
  },

  // Cleaner operation history
  getHistoryBatches: (
    options?: GetCleanerBatchesOptions
  ): Promise<IpcResult<CleanerBatchStats[]>> =>
    invokeIpc(IPC_CHANNELS.CLEANER_HISTORY_GET_BATCHES, options),

  getHistoryBatchDetails: (
    batchId: string
  ): Promise<
    IpcResult<{
      executions: CleanerExecutionRecord[]
      orders: CleanerOrderRecord[]
    }>
  > => invokeIpc(IPC_CHANNELS.CLEANER_HISTORY_GET_BATCH_DETAILS, batchId),

  getHistoryMaterialDetails: (
    batchId: string,
    attemptNumber: number,
    orderNumber: string
  ): Promise<IpcResult<CleanerMaterialRecord[]>> =>
    invokeIpc(
      IPC_CHANNELS.CLEANER_HISTORY_GET_MATERIAL_DETAILS,
      batchId,
      attemptNumber,
      orderNumber
    ),

  deleteHistoryBatch: (batchId: string): Promise<IpcResult<{ deleted: boolean }>> =>
    invokeIpc(IPC_CHANNELS.CLEANER_HISTORY_DELETE_BATCH, batchId)
} as const
