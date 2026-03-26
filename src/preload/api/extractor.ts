import type { ExtractorInput, ExtractionProgress } from '../../main/types/extractor.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { invokeIpc, ipcRenderer } from '../lib/ipc'

export const extractorApi = {
  runExtractor: (input: ExtractorInput) => invokeIpc(IPC_CHANNELS.EXTRACTOR_RUN, input),
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
} as const
