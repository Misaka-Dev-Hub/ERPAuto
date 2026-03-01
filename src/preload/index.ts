import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { MySqlConfig, SqlServerConfig } from '../main/types/ipc-api.types'
import type { ExtractorInput } from '../main/types/extractor.types'
import type { CleanerInput } from '../main/types/cleaner.types'

// Custom APIs for renderer
const api = {
  // File operations
  file: {
    readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('file:write', filePath, content),
    fileExists: (filePath: string) => ipcRenderer.invoke('file:exists', filePath),
    listFiles: (dirPath: string) => ipcRenderer.invoke('file:list', dirPath)
  },

  // Extractor service
  extractor: {
    runExtractor: (input: ExtractorInput) => ipcRenderer.invoke('extractor:run', input)
  },

  // Cleaner service
  cleaner: {
    runCleaner: (input: CleanerInput) => ipcRenderer.invoke('cleaner:run', input)
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
