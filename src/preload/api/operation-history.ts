import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { invokeIpc } from '../lib/ipc'
import type {
  BatchStats,
  OperationHistoryRecord,
  GetBatchesOptions
} from '../../main/types/operation-history.types'
import type { IpcResult } from '../../main/types/ipc.types'

export const operationHistoryApi = {
  /**
   * Get list of operation batches
   * Admin users receive all batches, regular users only their own
   */
  getBatches: (options?: GetBatchesOptions): Promise<IpcResult<BatchStats[]>> =>
    invokeIpc(IPC_CHANNELS.OPERATION_HISTORY_GET_BATCHES, options),

  /**
   * Get detailed records for a specific batch
   */
  getBatchDetails: (batchId: string): Promise<IpcResult<OperationHistoryRecord[]>> =>
    invokeIpc(IPC_CHANNELS.OPERATION_HISTORY_GET_BATCH_DETAILS, batchId),

  /**
   * Delete a batch
   * Admin users can delete any batch, regular users only their own
   */
  deleteBatch: (batchId: string): Promise<IpcResult<{ deleted: boolean }>> =>
    invokeIpc(IPC_CHANNELS.OPERATION_HISTORY_DELETE_BATCH, batchId)
} as const
