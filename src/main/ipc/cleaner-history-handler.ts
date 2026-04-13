/**
 * IPC Handler for Cleaner Operation History
 *
 * Handles IPC requests for cleaner operation history management:
 * - Get batch list (filtered by user for non-admin users)
 * - Get batch details (executions + orders)
 * - Get material details for a specific order
 * - Delete batches
 */

import { ipcMain } from 'electron'
import { CleanerOperationHistoryDAO } from '../services/database/cleaner-operation-history-dao'
import { SessionManager } from '../services/user/session-manager'
import { withErrorHandling, type IpcResult } from './index'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { createLogger } from '../services/logger'
import type {
  CleanerBatchStats,
  CleanerExecutionRecord,
  CleanerOrderRecord,
  CleanerMaterialRecord,
  GetCleanerBatchesOptions
} from '../types/cleaner-history.types'

const log = createLogger('CleanerHistoryHandler')

/**
 * Register IPC handlers for cleaner operation history
 */
export function registerCleanerHistoryHandlers(): void {
  const dao = new CleanerOperationHistoryDAO()

  /**
   * Get batches list
   * Admin users get all batches, regular users get only their own
   */
  ipcMain.handle(
    IPC_CHANNELS.CLEANER_HISTORY_GET_BATCHES,
    async (_event, options?: GetCleanerBatchesOptions): Promise<IpcResult<CleanerBatchStats[]>> => {
      return withErrorHandling(async () => {
        const currentUser = SessionManager.getInstance().getUserInfo()

        if (!currentUser) {
          throw new Error('用户未登录')
        }

        // Admin gets all batches, User gets only their own
        const userId = currentUser.userType === 'Admin' ? undefined : currentUser.id

        log.info('Getting cleaner history batches', {
          userId: currentUser.id,
          userType: currentUser.userType,
          filtered: userId !== undefined
        })

        return await dao.getBatches(userId, options)
      }, 'cleanerHistory:getBatches')
    }
  )

  /**
   * Get batch details (executions + orders)
   * Users can only view their own batch details, admins can view all
   */
  ipcMain.handle(
    IPC_CHANNELS.CLEANER_HISTORY_GET_BATCH_DETAILS,
    async (
      _event,
      batchId: string
    ): Promise<
      IpcResult<{ executions: CleanerExecutionRecord[]; orders: CleanerOrderRecord[] }>
    > => {
      return withErrorHandling(async () => {
        const currentUser = SessionManager.getInstance().getUserInfo()

        if (!currentUser) {
          throw new Error('用户未登录')
        }

        log.info('Getting cleaner batch details', { batchId, userId: currentUser.id })

        const details = await dao.getBatchDetails(batchId)

        // For non-admin users, verify they own this batch
        if (currentUser.userType !== 'Admin' && details.executions.length > 0) {
          const batchOwnerId = details.executions[0].userId
          if (batchOwnerId !== currentUser.id) {
            throw new Error('没有权限查看此批次详情')
          }
        }

        return details
      }, 'cleanerHistory:getBatchDetails')
    }
  )

  /**
   * Get material details for a specific order
   */
  ipcMain.handle(
    IPC_CHANNELS.CLEANER_HISTORY_GET_MATERIAL_DETAILS,
    async (
      _event,
      batchId: string,
      attemptNumber: number,
      orderNumber: string
    ): Promise<IpcResult<CleanerMaterialRecord[]>> => {
      return withErrorHandling(async () => {
        const currentUser = SessionManager.getInstance().getUserInfo()

        if (!currentUser) {
          throw new Error('用户未登录')
        }

        log.info('Getting cleaner material details', { batchId, attemptNumber, orderNumber })

        return await dao.getMaterialDetails(batchId, attemptNumber, orderNumber)
      }, 'cleanerHistory:getMaterialDetails')
    }
  )

  /**
   * Delete a batch
   * Users can only delete their own batches, admins can delete any
   */
  ipcMain.handle(
    IPC_CHANNELS.CLEANER_HISTORY_DELETE_BATCH,
    async (_event, batchId: string): Promise<IpcResult<{ deleted: boolean }>> => {
      return withErrorHandling(async () => {
        const currentUser = SessionManager.getInstance().getUserInfo()

        if (!currentUser) {
          throw new Error('用户未登录')
        }

        const isAdmin = currentUser.userType === 'Admin'

        log.info('Deleting cleaner batch', {
          batchId,
          userId: currentUser.id,
          isAdmin
        })

        const result = await dao.deleteBatch(batchId, currentUser.id, isAdmin)

        if (!result.success) {
          throw new Error(result.error || '删除批次失败')
        }

        return { deleted: true }
      }, 'cleanerHistory:deleteBatch')
    }
  )

  log.info('Cleaner history IPC handlers registered')
}
