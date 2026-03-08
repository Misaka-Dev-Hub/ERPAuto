import { contextBridge, ipcRenderer } from 'electron'
import type { MySqlConfig, SqlServerConfig } from '../main/types/ipc-api.types'
import type { ExtractorInput, ExtractionProgress } from '../main/types/extractor.types'
import type { CleanerInput, CleanerProgress, ExportResultItem } from '../main/types/cleaner.types'
import type { ResolverInput } from '../main/ipc/resolver-handler'
import type { LoginRequest } from '../main/ipc/auth-handler'
import type { UserInfo } from '../main/types/user.types'
import type {
  ValidationRequest,
  MaterialTypeRecord,
  MaterialTypeBatchRequest
} from '../main/types/validation.types'
import type { IpcResult } from '../main/ipc'
import { IPC_CHANNELS, type LogLevel } from '../shared/ipc-channels'

type ErpSettingsPayload = {
  erp?: {
    username?: string
    password?: string
  }
}

const processApi = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
}

function invokeIpc<T = unknown>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, ...args).then((result: unknown) => {
    if (result && typeof result === 'object' && 'success' in (result as Record<string, unknown>)) {
      const typed = result as Record<string, unknown>
      const hasIpcShape = 'data' in typed || 'code' in typed || 'error' in typed

      if (hasIpcShape) {
        return typed as unknown as IpcResult<T>
      }

      if (typed.success === true) {
        return { success: true, data: result as T }
      }

      return {
        success: false,
        error: typeof typed.error === 'string' ? typed.error : 'IPC operation failed'
      }
    }

    return { success: true, data: result as T }
  })
}

const api = {
  process: processApi,

  file: {
    readFile: (filePath: string) => invokeIpc(IPC_CHANNELS.FILE_READ, filePath),
    writeFile: (filePath: string, content: string) =>
      invokeIpc(IPC_CHANNELS.FILE_WRITE, filePath, content),
    fileExists: (filePath: string) => invokeIpc(IPC_CHANNELS.FILE_EXISTS, filePath),
    listFiles: (dirPath: string) => invokeIpc(IPC_CHANNELS.FILE_LIST, dirPath),
    openPath: (filePath: string) => invokeIpc(IPC_CHANNELS.FILE_OPEN_PATH, filePath)
  },

  extractor: {
    runExtractor: (input: ExtractorInput): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.EXTRACTOR_RUN, input),
    onProgress: (callback: (data: ExtractionProgress) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: ExtractionProgress) =>
        callback(data)
      ipcRenderer.on(IPC_CHANNELS.EXTRACTOR_PROGRESS, subscription)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EXTRACTOR_PROGRESS, subscription)
    },
    onLog: (callback: (data: { level: string; message: string }) => void) => {
      const subscription = (
        _event: Electron.IpcRendererEvent,
        data: { level: string; message: string }
      ) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.EXTRACTOR_LOG, subscription)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EXTRACTOR_LOG, subscription)
    }
  },

  cleaner: {
    runCleaner: (input: CleanerInput): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.CLEANER_RUN, input),
    exportResults: (items: ExportResultItem[]): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.CLEANER_EXPORT_RESULTS, items),
    onProgress: (callback: (data: CleanerProgress) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: CleanerProgress) =>
        callback(data)
      ipcRenderer.on(IPC_CHANNELS.CLEANER_PROGRESS, subscription)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLEANER_PROGRESS, subscription)
    }
  },

  resolver: {
    resolve: (input: ResolverInput): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.RESOLVER_RESOLVE, input),
    validateFormat: (inputs: string[]): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.RESOLVER_VALIDATE_FORMAT, inputs)
  },

  auth: {
    getComputerName: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.AUTH_GET_COMPUTER_NAME),
    silentLogin: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.AUTH_SILENT_LOGIN),
    login: (request: LoginRequest): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.AUTH_LOGIN, request),
    logout: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.AUTH_LOGOUT),
    getCurrentUser: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.AUTH_GET_CURRENT_USER),
    getAllUsers: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.AUTH_GET_ALL_USERS),
    switchUser: (userInfo: UserInfo): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.AUTH_SWITCH_USER, userInfo),
    isAdmin: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.AUTH_IS_ADMIN)
  },

  database: {
    connectMySql: (config: MySqlConfig): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.DATABASE_MYSQL_CONNECT, config),
    disconnectMySql: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.DATABASE_MYSQL_DISCONNECT),
    isMySqlConnected: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.DATABASE_MYSQL_IS_CONNECTED),
    queryMySql: (sql: string, params?: any[]): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.DATABASE_MYSQL_QUERY, sql, params),
    connectSqlServer: (config: SqlServerConfig): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.DATABASE_SQLSERVER_CONNECT, config),
    disconnectSqlServer: (): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.DATABASE_SQLSERVER_DISCONNECT),
    isSqlServerConnected: (): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.DATABASE_SQLSERVER_IS_CONNECTED),
    querySqlServer: (sql: string, params?: Record<string, unknown>): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.DATABASE_SQLSERVER_QUERY, sql, params)
  },

  validation: {
    validate: (request: ValidationRequest): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.VALIDATION_VALIDATE, request),
    setSharedProductionIds: (productionIds: string[]): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.VALIDATION_SET_SHARED_PRODUCTION_IDS, productionIds),
    getSharedProductionIds: (): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.VALIDATION_GET_SHARED_PRODUCTION_IDS),
    clearSharedProductionIds: (): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.VALIDATION_CLEAR_SHARED_PRODUCTION_IDS),
    getCleanerData: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.VALIDATION_GET_CLEANER_DATA)
  },

  materials: {
    upsertBatch: (materials: { materialCode: string; managerName: string }[]): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.MATERIALS_UPSERT_BATCH, { materials }),
    delete: (materialCodes: string[]): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.MATERIALS_DELETE, { materialCodes }),
    getManagers: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.MATERIALS_GET_MANAGERS),
    getByManager: (managerName: string): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.MATERIALS_GET_BY_MANAGER, managerName),
    getAll: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.MATERIALS_GET_ALL),
    getStatistics: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.MATERIALS_GET_STATISTICS),
    updateManager: (materialCode: string, managerName: string): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.MATERIALS_UPDATE_MANAGER, { materialCode, managerName })
  },

  settings: {
    getUserType: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.SETTINGS_GET_USER_TYPE),
    getSettings: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.SETTINGS_GET_SETTINGS),
    saveSettings: (settings: ErpSettingsPayload): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.SETTINGS_SAVE_SETTINGS, settings),
    resetDefaults: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.SETTINGS_RESET_DEFAULTS),
    testDbConnection: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.SETTINGS_TEST_DB_CONNECTION)
  },

  materialType: {
    getAll: (): Promise<IpcResult<MaterialTypeRecord[]>> =>
      invokeIpc(IPC_CHANNELS.MATERIAL_TYPE_GET_ALL),
    getByManager: (managerName: string): Promise<IpcResult<MaterialTypeRecord[]>> =>
      invokeIpc(IPC_CHANNELS.MATERIAL_TYPE_GET_BY_MANAGER, managerName),
    getManagers: (): Promise<IpcResult<string[]>> =>
      invokeIpc(IPC_CHANNELS.MATERIAL_TYPE_GET_MANAGERS),
    upsert: (materialName: string, managerName: string): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.MATERIAL_TYPE_UPSERT, { materialName, managerName }),
    delete: (materialName: string, managerName: string): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.MATERIAL_TYPE_DELETE, { materialName, managerName }),
    upsertBatch: (request: MaterialTypeBatchRequest): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.MATERIAL_TYPE_UPSERT_BATCH, request)
  },

  userErpConfig: {
    getCurrent: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.USER_ERP_CONFIG_GET_CURRENT),
    update: (config: { url: string; username: string; password: string }): Promise<IpcResult> =>
      invokeIpc(IPC_CHANNELS.USER_ERP_CONFIG_UPDATE, config),
    testConnection: (config: {
      url: string
      username: string
      password: string
    }): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.USER_ERP_CONFIG_TEST_CONNECTION, config),
    getAll: (): Promise<IpcResult> => invokeIpc(IPC_CHANNELS.USER_ERP_CONFIG_GET_ALL)
  },

  logger: {
    log: (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
      ipcRenderer.send(IPC_CHANNELS.LOGGER_FORWARD, {
        level,
        message,
        context,
        timestamp: Date.now()
      })
    }
  }
} as const

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', api)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = api
  // @ts-ignore (define in dts)
  window.api = api
}
