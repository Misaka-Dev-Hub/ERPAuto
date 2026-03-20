import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { withErrorHandling, type IpcResult } from './index'
import { UpdateService } from '../services/update/update-service'
import type {
  DownloadReleaseRequest,
  UpdateDialogCatalog,
  UpdateStatus
} from '../types/update.types'

export function registerUpdateHandlers(): void {
  const updateService = UpdateService.getInstance()

  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATUS, async (): Promise<IpcResult<UpdateStatus>> => {
    return withErrorHandling(async () => updateService.getStatus(), 'update:getStatus')
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK_NOW, async (): Promise<IpcResult<UpdateStatus>> => {
    return withErrorHandling(async () => updateService.checkForUpdates(), 'update:checkNow')
  })

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_GET_CATALOG,
    async (): Promise<IpcResult<UpdateDialogCatalog>> => {
      return withErrorHandling(async () => updateService.getCatalog(), 'update:getCatalog')
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_GET_CHANGELOG,
    async (_event, request: DownloadReleaseRequest): Promise<IpcResult<string>> => {
      return withErrorHandling(
        async () => updateService.getChangelog(request),
        'update:getChangelog'
      )
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_DOWNLOAD_RELEASE,
    async (_event, request: DownloadReleaseRequest): Promise<IpcResult<UpdateStatus>> => {
      return withErrorHandling(
        async () => updateService.downloadRelease(request),
        'update:downloadRelease'
      )
    }
  )

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL_DOWNLOADED, async (): Promise<IpcResult<void>> => {
    return withErrorHandling(
      async () => updateService.installDownloadedRelease(),
      'update:installDownloaded'
    )
  })
}
