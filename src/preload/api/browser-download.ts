import { ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { IpcResult } from '../../main/types/ipc.types'
import type { DownloadProgress } from '../index.d'

export const playwrightBrowserApi = {
  check: async (): Promise<IpcResult<boolean>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.PLAYWRIGHT_BROWSER_CHECK)
  },

  download: async (): Promise<IpcResult<void>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.PLAYWRIGHT_BROWSER_DOWNLOAD)
  },

  cancel: async (): Promise<IpcResult<void>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.PLAYWRIGHT_BROWSER_CANCEL)
  },

  onProgress: (callback: (data: DownloadProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: DownloadProgress) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.PLAYWRIGHT_BROWSER_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PLAYWRIGHT_BROWSER_PROGRESS, listener)
  }
} as const
