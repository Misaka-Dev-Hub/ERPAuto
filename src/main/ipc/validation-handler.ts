/**
 * IPC handlers for material validation operations
 */

import { ipcMain } from 'electron'
import { MaterialsToBeDeletedDAO } from '../services/database/materials-to-be-deleted-dao'
import { createLogger } from '../services/logger'
import type {
  MaterialDeleteRequest,
  MaterialOperationResponse,
  MaterialRecordSummary,
  MaterialUpsertBatchRequest,
  ValidationRequest,
  ValidationResponse
} from '../types/validation.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { sharedProductionIdsStore } from '../services/validation/shared-production-ids-store'
import { validationApplicationService } from '../services/validation/validation-application-service'

const log = createLogger('ValidationHandler')

export function registerValidationHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.VALIDATION_VALIDATE,
    async (event, request: ValidationRequest): Promise<ValidationResponse> => {
      const sessionManager = (
        await import('../services/user/session-manager')
      ).SessionManager.getInstance()

      const userInfo = sessionManager.getUserInfo()
      if (!userInfo) {
        return {
          success: false,
          error: '用户未登录',
          stats: {
            totalRecords: 0,
            matchedCount: 0,
            markedCount: 0
          }
        }
      }

      return validationApplicationService.validate(request, userInfo, event.sender.id)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MATERIALS_UPSERT_BATCH,
    async (_event, request: MaterialUpsertBatchRequest): Promise<MaterialOperationResponse> => {
      try {
        const dao = new MaterialsToBeDeletedDAO()
        const stats = await dao.upsertBatch(request.materials)

        return {
          success: true,
          stats
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Upsert batch error', { error: message })
        return {
          success: false,
          error: `Upsert failed: ${message}`
        }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MATERIALS_DELETE,
    async (_event, request: MaterialDeleteRequest): Promise<MaterialOperationResponse> => {
      try {
        const dao = new MaterialsToBeDeletedDAO()
        const count = await dao.deleteByMaterialCodes(request.materialCodes)

        return {
          success: true,
          count
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('Delete error', { error: message })
        return {
          success: false,
          error: `Delete failed: ${message}`
        }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.MATERIALS_GET_MANAGERS, async (): Promise<{ managers: string[] }> => {
    try {
      const dao = new MaterialsToBeDeletedDAO()
      const managers = await dao.getManagers()
      return { managers }
    } catch (error) {
      log.error('Get managers error', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { managers: [] }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.MATERIALS_UPDATE_MANAGER,
    async (
      _event,
      request: { materialCode: string; managerName: string }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const dao = new MaterialsToBeDeletedDAO()
        return await dao.updateManager(request.materialCode, request.managerName)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error('Update manager error', { error: message })
        return {
          success: false,
          error: message
        }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MATERIALS_GET_BY_MANAGER,
    async (_event, managerName: string): Promise<{ materials: MaterialRecordSummary[] }> => {
      try {
        const materials = await validationApplicationService.getMaterialsByManager(managerName)
        return { materials }
      } catch (error) {
        log.error('Get by manager error', {
          error: error instanceof Error ? error.message : String(error)
        })
        return { materials: [] }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MATERIALS_GET_ALL,
    async (): Promise<{ materials: MaterialRecordSummary[] }> => {
      try {
        const materials = await validationApplicationService.getAllMaterials()
        return { materials }
      } catch (error) {
        log.error('Get all error', {
          error: error instanceof Error ? error.message : String(error)
        })
        return { materials: [] }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.MATERIALS_GET_STATISTICS, async (): Promise<{ stats: any }> => {
    try {
      const dao = new MaterialsToBeDeletedDAO()
      const stats = await dao.getStatistics()
      return { stats }
    } catch (error) {
      log.error('Get statistics error', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { stats: null }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.VALIDATION_SET_SHARED_PRODUCTION_IDS,
    async (event, productionIds: string[]): Promise<void> => {
      log.info(`Received ${productionIds.length} shared Production IDs`)
      sharedProductionIdsStore.set(event.sender.id, productionIds)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.VALIDATION_GET_SHARED_PRODUCTION_IDS,
    async (event): Promise<{ productionIds: string[] }> => {
      return { productionIds: sharedProductionIdsStore.get(event.sender.id) }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.VALIDATION_CLEAR_SHARED_PRODUCTION_IDS,
    async (event): Promise<void> => {
      log.info('Clearing shared Production IDs')
      sharedProductionIdsStore.clear(event.sender.id)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.VALIDATION_GET_CLEANER_DATA,
    async (
      event
    ): Promise<{
      success: boolean
      orderNumbers?: string[]
      materialCodes?: string[]
      error?: string
    }> => {
      const sessionManager = (
        await import('../services/user/session-manager')
      ).SessionManager.getInstance()
      const userInfo = sessionManager.getUserInfo()

      if (!userInfo) {
        return {
          success: false,
          error: '用户未登录'
        }
      }

      return validationApplicationService.getCleanerData(userInfo, event.sender.id)
    }
  )
}
