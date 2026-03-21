import type {
  CleanerInput,
  CleanerProgress,
  ExportResultItem
} from '../../main/types/cleaner.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { invokeIpc, ipcRenderer } from '../lib/ipc'

export const cleanerApi = {
  runCleaner: (input: CleanerInput) => invokeIpc(IPC_CHANNELS.CLEANER_RUN, input),
  exportResults: (items: ExportResultItem[]) =>
    invokeIpc(IPC_CHANNELS.CLEANER_EXPORT_RESULTS, items),
  onProgress: (callback: (data: CleanerProgress) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: CleanerProgress) =>
      callback(data)
    ipcRenderer.on(IPC_CHANNELS.CLEANER_PROGRESS, subscription)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CLEANER_PROGRESS, subscription)
  }
} as const
