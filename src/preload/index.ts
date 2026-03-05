import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { MySqlConfig, SqlServerConfig } from '../main/types/ipc-api.types'
import type { ExtractorInput, ExtractionProgress } from '../main/types/extractor.types'
import type { CleanerInput, ExportResultItem } from '../main/types/cleaner.types'
import type { ResolverInput } from '../main/ipc/resolver-handler'
import type { LoginRequest } from '../main/ipc/auth-handler'
import type { UserInfo } from '../main/types/user.types'
import type {
  ValidationRequest,
  MaterialTypeRecord,
  MaterialTypeBatchRequest
} from '../main/types/validation.types'
import type { SettingsData } from '../main/types/settings.types'

// Custom APIs for renderer
const api = {
  // File operations
  file: {
    readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('file:write', filePath, content),
    fileExists: (filePath: string) => ipcRenderer.invoke('file:exists', filePath),
    listFiles: (dirPath: string) => ipcRenderer.invoke('file:list', dirPath),
    openPath: (filePath: string) => ipcRenderer.invoke('file:openPath', filePath)
  },

  // Extractor service
  extractor: {
    runExtractor: (input: ExtractorInput) => ipcRenderer.invoke('extractor:run', input),
    onProgress: (callback: (data: ExtractionProgress) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: ExtractionProgress) =>
        callback(data)
      ipcRenderer.on('extractor:progress', subscription)
      return () => ipcRenderer.removeListener('extractor:progress', subscription)
    },
    onLog: (callback: (data: { level: string; message: string }) => void) => {
      const subscription = (
        _event: Electron.IpcRendererEvent,
        data: { level: string; message: string }
      ) => callback(data)
      ipcRenderer.on('extractor:log', subscription)
      return () => ipcRenderer.removeListener('extractor:log', subscription)
    }
  },

  // Cleaner service
  cleaner: {
    runCleaner: (input: CleanerInput) => ipcRenderer.invoke('cleaner:run', input),
    exportResults: (items: ExportResultItem[]) => ipcRenderer.invoke('cleaner:exportResults', items)
  },

  // Order number resolver
  resolver: {
    resolve: (input: ResolverInput) => ipcRenderer.invoke('resolver:resolve', input),
    validateFormat: (inputs: string[]) => ipcRenderer.invoke('resolver:validateFormat', inputs)
  },

  // Authentication service
  auth: {
    getComputerName: () => ipcRenderer.invoke('auth:getComputerName'),
    silentLogin: () => ipcRenderer.invoke('auth:silentLogin'),
    login: (request: LoginRequest) => ipcRenderer.invoke('auth:login', request),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),
    getAllUsers: () => ipcRenderer.invoke('auth:getAllUsers'),
    switchUser: (userInfo: UserInfo) => ipcRenderer.invoke('auth:switchUser', userInfo),
    isAdmin: () => ipcRenderer.invoke('auth:isAdmin')
  },

  // Database service
  database: {
    connectMySql: (config: MySqlConfig) => ipcRenderer.invoke('database:mysql:connect', config),
    disconnectMySql: () => ipcRenderer.invoke('database:mysql:disconnect'),
    isMySqlConnected: () => ipcRenderer.invoke('database:mysql:isConnected'),
    queryMySql: (sql: string, params?: any[]) =>
      ipcRenderer.invoke('database:mysql:query', sql, params),

    // SQL Server
    connectSqlServer: (config: SqlServerConfig) =>
      ipcRenderer.invoke('database:sqlserver:connect', config),
    disconnectSqlServer: () => ipcRenderer.invoke('database:sqlserver:disconnect'),
    isSqlServerConnected: () => ipcRenderer.invoke('database:sqlserver:isConnected'),
    querySqlServer: (sql: string, params?: Record<string, unknown>) =>
      ipcRenderer.invoke('database:sqlserver:query', sql, params)
  },

  // Validation service
  validation: {
    validate: (request: ValidationRequest) => ipcRenderer.invoke('validation:validate', request),
    setSharedProductionIds: (productionIds: string[]) =>
      ipcRenderer.invoke('validation:setSharedProductionIds', productionIds),
    getSharedProductionIds: () => ipcRenderer.invoke('validation:getSharedProductionIds'),
    getCleanerData: () => ipcRenderer.invoke('validation:getCleanerData')
  },

  // Materials service
  materials: {
    upsertBatch: (materials: { materialCode: string; managerName: string }[]) =>
      ipcRenderer.invoke('materials:upsertBatch', { materials }),
    delete: (materialCodes: string[]) => ipcRenderer.invoke('materials:delete', { materialCodes }),
    getManagers: () => ipcRenderer.invoke('materials:getManagers'),
    getByManager: (managerName: string) =>
      ipcRenderer.invoke('materials:getByManager', managerName),
    getAll: () => ipcRenderer.invoke('materials:getAll'),
    getStatistics: () => ipcRenderer.invoke('materials:getStatistics'),
    updateManager: (materialCode: string, managerName: string) =>
      ipcRenderer.invoke('materials:updateManager', { materialCode, managerName })
  },

  // Settings service
  settings: {
    getUserType: () => ipcRenderer.invoke('settings:getUserType'),
    getSettings: () => ipcRenderer.invoke('settings:getSettings'),
    saveSettings: (settings: SettingsData) => ipcRenderer.invoke('settings:saveSettings', settings),
    resetDefaults: () => ipcRenderer.invoke('settings:resetDefaults'),
    testErpConnection: () => ipcRenderer.invoke('settings:testErpConnection'),
    testDbConnection: () => ipcRenderer.invoke('settings:testDbConnection')
  },

  // Material Type service
  materialType: {
    getAll: () => ipcRenderer.invoke('materialType:getAll'),
    getByManager: (managerName: string) =>
      ipcRenderer.invoke('materialType:getByManager', managerName),
    getManagers: () => ipcRenderer.invoke('materialType:getManagers'),
    upsert: (materialName: string, managerName: string) =>
      ipcRenderer.invoke('materialType:upsert', { materialName, managerName }),
    delete: (materialName: string, managerName: string) =>
      ipcRenderer.invoke('materialType:delete', { materialName, managerName }),
    upsertBatch: (request: MaterialTypeBatchRequest) =>
      ipcRenderer.invoke('materialType:upsertBatch', request)
  }
} as const

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', { ...electronAPI, ...api })
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = { ...electronAPI, ...api }
  // @ts-ignore (define in dts)
  window.api = api
}
