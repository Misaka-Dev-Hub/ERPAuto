import type {
  MaterialTypeBatchRequest,
  MaterialTypeRecord
} from '../../main/types/validation.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { CleanerConfig } from '../../main/types/config.schema'
import type {
  DownloadReleaseRequest,
  UpdateDialogCatalog,
  UpdateStatus
} from '../../main/types/update.types'
import { invokeIpc, ipcRenderer } from '../lib/ipc'

type ErpSettingsPayload = {
  erp?: {
    username?: string
    password?: string
  }
}

export const materialsApi = {
  upsertBatch: (materials: { materialCode: string; managerName: string }[]) =>
    invokeIpc(IPC_CHANNELS.MATERIALS_UPSERT_BATCH, { materials }),
  delete: (materialCodes: string[]) => invokeIpc(IPC_CHANNELS.MATERIALS_DELETE, { materialCodes }),
  getManagers: () => invokeIpc(IPC_CHANNELS.MATERIALS_GET_MANAGERS),
  getByManager: (managerName: string) =>
    invokeIpc(IPC_CHANNELS.MATERIALS_GET_BY_MANAGER, managerName),
  getAll: () => invokeIpc(IPC_CHANNELS.MATERIALS_GET_ALL),
  getStatistics: () => invokeIpc(IPC_CHANNELS.MATERIALS_GET_STATISTICS),
  updateManager: (materialCode: string, managerName: string) =>
    invokeIpc(IPC_CHANNELS.MATERIALS_UPDATE_MANAGER, { materialCode, managerName })
} as const

export const settingsApi = {
  getUserType: () => invokeIpc(IPC_CHANNELS.SETTINGS_GET_USER_TYPE),
  getSettings: () => invokeIpc(IPC_CHANNELS.SETTINGS_GET_SETTINGS),
  saveSettings: (settings: ErpSettingsPayload) =>
    invokeIpc(IPC_CHANNELS.SETTINGS_SAVE_SETTINGS, settings),
  resetDefaults: () => invokeIpc(IPC_CHANNELS.SETTINGS_RESET_DEFAULTS),
  testDbConnection: () => invokeIpc(IPC_CHANNELS.SETTINGS_TEST_DB_CONNECTION)
} as const

export const materialTypeApi = {
  getAll: () => invokeIpc<MaterialTypeRecord[]>(IPC_CHANNELS.MATERIAL_TYPE_GET_ALL),
  getByManager: (managerName: string) =>
    invokeIpc<MaterialTypeRecord[]>(IPC_CHANNELS.MATERIAL_TYPE_GET_BY_MANAGER, managerName),
  getManagers: () => invokeIpc<string[]>(IPC_CHANNELS.MATERIAL_TYPE_GET_MANAGERS),
  upsert: (materialName: string, managerName: string) =>
    invokeIpc(IPC_CHANNELS.MATERIAL_TYPE_UPSERT, { materialName, managerName }),
  delete: (materialName: string, managerName: string) =>
    invokeIpc(IPC_CHANNELS.MATERIAL_TYPE_DELETE, { materialName, managerName }),
  upsertBatch: (request: MaterialTypeBatchRequest) =>
    invokeIpc(IPC_CHANNELS.MATERIAL_TYPE_UPSERT_BATCH, request)
} as const

export const userErpConfigApi = {
  getCurrent: () => invokeIpc(IPC_CHANNELS.USER_ERP_CONFIG_GET_CURRENT),
  update: (config: { url: string; username: string; password: string }) =>
    invokeIpc(IPC_CHANNELS.USER_ERP_CONFIG_UPDATE, config),
  testConnection: (config: { url: string; username: string; password: string }) =>
    invokeIpc(IPC_CHANNELS.USER_ERP_CONFIG_TEST_CONNECTION, config),
  getAll: () => invokeIpc(IPC_CHANNELS.USER_ERP_CONFIG_GET_ALL)
} as const

export const configApi = {
  getCleaner: () => invokeIpc<CleanerConfig>(IPC_CHANNELS.CONFIG_GET_CLEANER),
  updateCleaner: (updates: Partial<CleanerConfig>) =>
    invokeIpc<CleanerConfig>(IPC_CHANNELS.CONFIG_UPDATE_CLEANER, updates)
} as const

export const reportApi = {
  listAll: () => invokeIpc(IPC_CHANNELS.REPORT_LIST_ALL),
  listByUser: (username: string) => invokeIpc(IPC_CHANNELS.REPORT_LIST_BY_USER, username),
  download: (key: string) => invokeIpc(IPC_CHANNELS.REPORT_DOWNLOAD, key)
} as const

export const updateApi = {
  getStatus: () => invokeIpc<UpdateStatus>(IPC_CHANNELS.UPDATE_GET_STATUS),
  checkNow: () => invokeIpc<UpdateStatus>(IPC_CHANNELS.UPDATE_CHECK_NOW),
  getCatalog: () => invokeIpc<UpdateDialogCatalog>(IPC_CHANNELS.UPDATE_GET_CATALOG),
  getChangelog: (release: DownloadReleaseRequest) =>
    invokeIpc<string>(IPC_CHANNELS.UPDATE_GET_CHANGELOG, release),
  downloadRelease: (release: DownloadReleaseRequest) =>
    invokeIpc<UpdateStatus>(IPC_CHANNELS.UPDATE_DOWNLOAD_RELEASE, release),
  installDownloaded: () => invokeIpc<void>(IPC_CHANNELS.UPDATE_INSTALL_DOWNLOADED),
  onStatusChanged: (callback: (data: UpdateStatus) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: UpdateStatus) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS_CHANGED, subscription)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS_CHANGED, subscription)
  }
} as const
