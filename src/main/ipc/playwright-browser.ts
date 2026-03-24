/**
 * Playwright Browser IPC Handlers
 * Handles browser download requests from renderer process
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { withErrorHandling, type IpcResult } from './index'
import { DownloadService } from '../services/playwright-browser'
import { ConfigManager } from '../services/config/config-manager'
import { S3Client } from '@aws-sdk/client-s3'
import type { DownloadProgress } from '../services/playwright-browser'

/**
 * Create S3 client from config
 */
function createS3Client(): S3Client {
  const config = ConfigManager.getInstance().getConfig().update
  if (!config) {
    throw new Error('Update config is not available')
  }

  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey
    },
    forcePathStyle: true
  })
}

/**
 * Track active download for cancellation
 */
let activeDownload: { service: DownloadService; cancelled: boolean } | null = null

export function registerPlaywrightBrowserHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.PLAYWRIGHT_BROWSER_DOWNLOAD,
    async (event: IpcMainInvokeEvent): Promise<IpcResult<void>> => {
      return withErrorHandling(async () => {
        const s3Client = createS3Client()
        const service = new DownloadService({ s3Client })

        activeDownload = { service, cancelled: false }

        await service.downloadAll((progress: DownloadProgress) => {
          if (activeDownload?.cancelled) {
            throw new Error('Download cancelled by user')
          }

          event.sender.send(IPC_CHANNELS.PLAYWRIGHT_BROWSER_PROGRESS, progress)
        })

        activeDownload = null
      }, 'playwright-browser:download')
    }
  )

  ipcMain.handle(IPC_CHANNELS.PLAYWRIGHT_BROWSER_CANCEL, async (): Promise<IpcResult<void>> => {
    return withErrorHandling(async () => {
      if (activeDownload) {
        activeDownload.cancelled = true
        activeDownload = null
      }
    }, 'playwright-browser:cancel')
  })
}
