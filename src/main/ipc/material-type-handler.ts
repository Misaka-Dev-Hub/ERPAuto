/**
 * IPC handlers for material type management operations
 *
 * Provides endpoints for:
 * - Getting all material type records
 * - Getting records by manager
 * - Getting list of managers
 * - Upserting (insert/update) records
 * - Deleting records
 * - Batch operations
 */

import { ipcMain } from 'electron'
import {
  MaterialsTypeToBeDeletedDAO,
  type MaterialTypeRecord,
  type MaterialTypeBatchRequest
} from '../services/database/materials-type-to-be-deleted-dao'
import { createLogger } from '../services/logger'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { ValidationError } from '../types/errors'
import { withErrorHandling, type IpcResult } from './index'

const log = createLogger('MaterialTypeHandler')

/**
 * Register IPC handlers for material type operations
 */
export function registerMaterialTypeHandlers(): void {
  const dao = new MaterialsTypeToBeDeletedDAO()

  /**
   * Get all material type records
   */
  ipcMain.handle(
    IPC_CHANNELS.MATERIAL_TYPE_GET_ALL,
    async (): Promise<IpcResult<MaterialTypeRecord[]>> => {
      return withErrorHandling(async () => {
        const records = await dao.getAllMaterials()
        return records
      }, 'materialType:getAll')
    }
  )

  /**
   * Get material types by manager
   */
  ipcMain.handle(
    IPC_CHANNELS.MATERIAL_TYPE_GET_BY_MANAGER,
    async (_event, managerName: string): Promise<IpcResult<MaterialTypeRecord[]>> => {
      return withErrorHandling(async () => {
        const records = await dao.getMaterialsByManager(managerName)
        return records
      }, 'materialType:getByManager')
    }
  )

  /**
   * Get list of managers
   */
  ipcMain.handle(
    IPC_CHANNELS.MATERIAL_TYPE_GET_MANAGERS,
    async (): Promise<IpcResult<string[]>> => {
      return withErrorHandling(async () => {
        const managers = await dao.getManagers()
        return managers
      }, 'materialType:getManagers')
    }
  )

  /**
   * Upsert (insert or update) a material type record
   */
  ipcMain.handle(
    IPC_CHANNELS.MATERIAL_TYPE_UPSERT,
    async (
      _event,
      { materialName, managerName }: { materialName: string; managerName: string }
    ): Promise<IpcResult<{ updated: boolean }>> => {
      return withErrorHandling(async () => {
        const result = await dao.upsertMaterial(materialName, managerName)
        if (!result) {
          throw new ValidationError('Failed to upsert material type', 'VAL_INVALID_INPUT')
        }
        return { updated: true }
      }, 'materialType:upsert')
    }
  )

  /**
   * Delete a material type record
   */
  ipcMain.handle(
    IPC_CHANNELS.MATERIAL_TYPE_DELETE,
    async (
      _event,
      { materialName, managerName }: { materialName: string; managerName: string }
    ): Promise<IpcResult<{ deleted: boolean }>> => {
      return withErrorHandling(async () => {
        const result = await dao.deleteMaterial(materialName, managerName)
        if (!result) {
          throw new ValidationError('Failed to delete material type', 'VAL_INVALID_INPUT')
        }
        return { deleted: true }
      }, 'materialType:delete')
    }
  )

  /**
   * Batch operation for material types (insert, update, delete)
   */
  ipcMain.handle(
    IPC_CHANNELS.MATERIAL_TYPE_UPSERT_BATCH,
    async (
      _event,
      request: MaterialTypeBatchRequest
    ): Promise<IpcResult<{ stats: { total: number; success: number; failed: number } }>> => {
      return withErrorHandling(async () => {
        const stats = await dao.upsertBatch(request)
        return { stats }
      }, 'materialType:upsertBatch')
    }
  )

  log.info('Material type handlers registered')
}
