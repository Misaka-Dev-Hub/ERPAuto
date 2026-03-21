import { ipcRenderer } from 'electron'
import type { IpcResult } from '../../main/types/ipc.types'

export function invokeIpc<T = unknown>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
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

export { ipcRenderer }
