import type { LogLevel } from '../../shared/ipc-channels'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { ipcRenderer } from '../lib/ipc'

export const loggerApi = {
  log: (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    ipcRenderer.send(IPC_CHANNELS.LOGGER_FORWARD, {
      level,
      message,
      context,
      timestamp: Date.now()
    })
  }
} as const
