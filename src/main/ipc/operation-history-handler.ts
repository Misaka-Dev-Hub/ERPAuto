/**
 * IPC Handler for Extractor Operation History
 *
 * Handles IPC requests for operation history management:
 * - Get batch list (filtered by user for non-admin users)
 * - Get batch details
 * - Delete batches
 */

import { ipcMain } from 'electron'
import { ExtractorOperationHistoryDAO } from '../services/database/extractor-operation-history-dao'
import { SessionManager } from '../services/user/session-manager'
import { withErrorHandling, type IpcResult } from './index'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { createLogger } from '../services/logger'
import type {
  BatchStats,
  OperationHistoryRecord,
  GetBatchesOptions
} from '../types/operation-history.types'

const log = createLogger('OperationHistoryHandler')

/**
 * Register IPC handlers for operation history
 */
export function registerOperationHistoryHandlers(): void {
  const dao = new ExtractorOperationHistoryDAO()

  /**
   * Get batches list
   * Admin users get all batches, regular users get only their own
   */
  ipcMain.handle(
    IPC_CHANNELS.OPERATION_HISTORY_GET_BATCHES,
    async (event, options?: GetBatchesOptions): Promise<IpcResult<BatchStats[]>> => {
      return withErrorHandling(async () => {
        const currentUser = SessionManager.getInstance().getUserInfo()

        if (!currentUser) {
          throw new Error('用户未登录')
        }

        // Admin gets all batches, User gets only their own
        const userId = currentUser.userType === 'Admin' ? undefined : currentUser.id

        log.info('Getting operation history batches', {
          userId: currentUser.id,
          userType: currentUser.userType,
          filtered: userId !== undefined
        })

        const batches = await dao.getBatches(userId, options)
        return batches
      }, 'operationHistory:getBatches')
    }
  )

  /**
   * Get batch details
   * Users can only view their own batch details, admins can view all
   */
  ipcMain.handle(
    IPC_CHANNELS.OPERATION_HISTORY_GET_BATCH_DETAILS,
    async (event, batchId: string): Promise<IpcResult<OperationHistoryRecord[]>> => {
      return withErrorHandling(async () => {
        const currentUser = SessionManager.getInstance().getUserInfo()

        if (!currentUser) {
          throw new Error('用户未登录')
        }

        log.info('Getting batch details', { batchId, userId: currentUser.id })

        const details = await dao.getBatchDetails(batchId)

        // For non-admin users, verify they own this batch
        if (currentUser.userType !== 'Admin' && details.length > 0) {
          const batchOwnerId = details[0].userId
          if (batchOwnerId !== currentUser.id) {
            throw new Error('没有权限查看此批次详情')
          }
        }

        return details
      }, 'operationHistory:getBatchDetails')
    }
  )

  /**
   * Delete a batch
   * Users can only delete their own batches, admins can delete any
   */
  ipcMain.handle(
    IPC_CHANNELS.OPERATION_HISTORY_DELETE_BATCH,
    async (event, batchId: string): Promise<IpcResult<{ deleted: boolean }>> => {
      return withErrorHandling(async () => {
        const currentUser = SessionManager.getInstance().getUserInfo()

        if (!currentUser) {
          throw new Error('用户未登录')
        }

        const isAdmin = currentUser.userType === 'Admin'

        log.info('Deleting batch', {
          batchId,
          userId: currentUser.id,
          isAdmin
        })

        const result = await dao.deleteBatch(batchId, currentUser.id, isAdmin)

        if (!result.success) {
          throw new Error(result.error || '删除批次失败')
        }

        return { deleted: true }
      }, 'operationHistory:deleteBatch')
    }
  )

  log.info('Operation history IPC handlers registered')
}
