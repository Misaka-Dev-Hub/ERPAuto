import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { withErrorHandling } from './index'
import { AutoUpdaterService } from '../services/updater/auto-updater-service'

export function registerUpdateHandlers(): void {
  // Check for updates
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, () => {
    return withErrorHandling(async () => {
      const updater = AutoUpdaterService.getInstance()
      await updater.checkForUpdates()
      return { success: true }
    }, 'UpdateHandler.check')
  })

  // Get current status
  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATUS, () => {
    return withErrorHandling(async () => {
      const updater = AutoUpdaterService.getInstance()
      return updater.getStatus()
    }, 'UpdateHandler.getStatus')
  })

  // Get channel info
  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_CHANNEL, () => {
    return withErrorHandling(async () => {
      const updater = AutoUpdaterService.getInstance()
      return updater.getChannelInfo()
    }, 'UpdateHandler.getChannel')
  })

  // Set channel
  ipcMain.handle(IPC_CHANNELS.UPDATE_SET_CHANNEL, (_, data: { channel: 'stable' | 'beta' }) => {
    return withErrorHandling(async () => {
      const updater = AutoUpdaterService.getInstance()
      await updater.switchChannel(data.channel)
      return { success: true }
    }, 'UpdateHandler.setChannel')
  })

  // Download update manually
  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, () => {
    return withErrorHandling(async () => {
      const updater = AutoUpdaterService.getInstance()
      await updater.downloadUpdate()
      return { success: true }
    }, 'UpdateHandler.download')
  })

  // Cancel download (if supported)
  ipcMain.handle(IPC_CHANNELS.UPDATE_CANCEL, () => {
    return withErrorHandling(async () => {
      const updater = AutoUpdaterService.getInstance()
      updater.cancelDownload()
      return { success: true }
    }, 'UpdateHandler.cancel')
  })

  // Install downloaded update
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    return withErrorHandling(async () => {
      const updater = AutoUpdaterService.getInstance()
      updater.installUpdate()
      return { success: true }
    }, 'UpdateHandler.install')
  })
}
