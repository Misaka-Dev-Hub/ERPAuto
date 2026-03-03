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
    'materialType:getAll',
    async (): Promise<{ success: boolean; data?: MaterialTypeRecord[]; error?: string }> => {
      try {
        const records = await dao.getAllMaterials()
        return { success: true, data: records }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Get all material types error', { error: message })
        return { success: false, error: message }
      }
    }
  )

  /**
   * Get material types by manager
   */
  ipcMain.handle(
    'materialType:getByManager',
    async (
      _event,
      managerName: string
    ): Promise<{ success: boolean; data?: MaterialTypeRecord[]; error?: string }> => {
      try {
        const records = await dao.getMaterialsByManager(managerName)
        return { success: true, data: records }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Get material types by manager error', { error: message })
        return { success: false, error: message }
      }
    }
  )

  /**
   * Get list of managers
   */
  ipcMain.handle(
    'materialType:getManagers',
    async (): Promise<{ success: boolean; data?: string[]; error?: string }> => {
      try {
        const managers = await dao.getManagers()
        return { success: true, data: managers }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Get managers error', { error: message })
        return { success: false, error: message }
      }
    }
  )

  /**
   * Upsert (insert or update) a material type record
   */
  ipcMain.handle(
    'materialType:upsert',
    async (
      _event,
      { materialName, managerName }: { materialName: string; managerName: string }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await dao.upsertMaterial(materialName, managerName)
        if (!result) {
          return { success: false, error: 'Failed to upsert material type' }
        }
        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Upsert material type error', { error: message })
        return { success: false, error: message }
      }
    }
  )

  /**
   * Delete a material type record
   */
  ipcMain.handle(
    'materialType:delete',
    async (
      _event,
      { materialName, managerName }: { materialName: string; managerName: string }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await dao.deleteMaterial(materialName, managerName)
        if (!result) {
          return { success: false, error: 'Failed to delete material type' }
        }
        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Delete material type error', { error: message })
        return { success: false, error: message }
      }
    }
  )

  /**
   * Batch operation for material types (insert, update, delete)
   */
  ipcMain.handle(
    'materialType:upsertBatch',
    async (
      _event,
      request: MaterialTypeBatchRequest
    ): Promise<{
      success: boolean
      stats?: { total: number; success: number; failed: number }
      error?: string
    }> => {
      try {
        const stats = await dao.upsertBatch(request)
        return { success: true, stats }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Batch upsert material types error', { error: message })
        return { success: false, error: message }
      }
    }
  )

  log.info('Material type handlers registered')
}
