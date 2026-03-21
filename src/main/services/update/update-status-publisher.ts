import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc-channels'
import type { UpdateStatus } from '../../types/update.types'

export function publishUpdateStatus(status: UpdateStatus): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_CHANNELS.UPDATE_STATUS_CHANGED, status)
  })
}
