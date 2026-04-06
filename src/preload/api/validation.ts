import type { ValidationRequest } from '../../main/types/validation.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { invokeIpc } from '../lib/ipc'

export const validationApi = {
  validate: (request: ValidationRequest) => invokeIpc(IPC_CHANNELS.VALIDATION_VALIDATE, request),
  setSharedProductionIds: (productionIds: string[]) =>
    invokeIpc(IPC_CHANNELS.VALIDATION_SET_SHARED_PRODUCTION_IDS, productionIds),
  getSharedProductionIds: () => invokeIpc(IPC_CHANNELS.VALIDATION_GET_SHARED_PRODUCTION_IDS),
  clearSharedProductionIds: () => invokeIpc(IPC_CHANNELS.VALIDATION_CLEAR_SHARED_PRODUCTION_IDS),
  getCleanerData: (params?: { selectedManagers?: string[] }) =>
    invokeIpc(IPC_CHANNELS.VALIDATION_GET_CLEANER_DATA, params ?? { selectedManagers: [] })
} as const
