import type { LogLevel } from '../../shared/ipc-channels'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { ipcRenderer } from '../lib/ipc'

// Cached log level for client-side filtering (avoids IPC for filtered-out messages)
let cachedLevel: LogLevel = 'info'

/**
 * Check if a message at the given level should be logged
 * Based on level priority: error > warn > info > debug > verbose
 */
function shouldLog(level: LogLevel): boolean {
  const priorities: Record<LogLevel, number> = {
    verbose: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4
  }
  return (priorities[level] ?? 0) >= (priorities[cachedLevel] ?? 2)
}

// Listener for level change broadcasts from main process
function onLevelChanged(_event: Electron.IpcRendererEvent, level: LogLevel): void {
  cachedLevel = level
}

export const loggerApi = {
  log: (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    // Drop messages below the configured log level
    if (!shouldLog(level)) return

    ipcRenderer.send(IPC_CHANNELS.LOGGER_FORWARD, {
      level,
      message,
      context,
      timestamp: Date.now()
    })
  },

  /**
   * Fetch the current log level from main process and cache it.
   * Also registers a listener for future level changes.
   * Should be called early in renderer initialization.
   */
  fetchLevel: async (): Promise<void> => {
    cachedLevel = (await ipcRenderer.invoke(IPC_CHANNELS.LOGGER_GET_LEVEL)) as LogLevel
    ipcRenderer.on(IPC_CHANNELS.LOGGER_LEVEL_CHANGED, onLevelChanged)
  },

  /**
   * Remove the level change listener (call on cleanup/unmount)
   */
  cleanup: (): void => {
    ipcRenderer.removeListener(IPC_CHANNELS.LOGGER_LEVEL_CHANGED, onLevelChanged)
  }
} as const
