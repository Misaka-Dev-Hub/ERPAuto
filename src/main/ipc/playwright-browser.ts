/**
 * Playwright Browser IPC Handlers
 * Handles browser download requests from renderer process
 */

import { app, ipcMain, IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
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
 * Check if Playwright browsers are installed
 */
async function checkBrowsersExist(): Promise<boolean> {
  const fs = await import('fs')
  const browsersPath = join(app.getPath('userData'), 'ms-playwright')

  // Check ffmpeg
  const ffmpegPath = join(browsersPath, 'ffmpeg-1011', 'ffmpeg-win64.exe')
  if (!fs.default.existsSync(ffmpegPath)) {
    return false
  }

  // Check chromium (exclude headless)
  const newChromiumPath = join(browsersPath, 'chromium-1208', 'chrome-win64', 'chrome.exe')
  const oldChromiumPath = join(browsersPath, 'chromium-win32', 'chrome.exe')
  const chromiumPath = fs.default.existsSync(newChromiumPath) ? newChromiumPath : oldChromiumPath
  let chromiumReady = fs.default.existsSync(chromiumPath)

  if (!chromiumReady) {
    try {
      const entries = fs.default.readdirSync(browsersPath)
      for (const entry of entries) {
        if (entry.startsWith('chromium-') && !entry.includes('headless')) {
          const revisionPath = join(browsersPath, entry, 'chrome-win64', 'chrome.exe')
          if (fs.default.existsSync(revisionPath)) {
            chromiumReady = true
            break
          }
        }
      }
    } catch {
      // Ignore browser directory probing failures
    }
  }

  if (!chromiumReady) return false

  // Check chromium headless shell
  const headlessDir = join(browsersPath, 'chromium_headless_shell-1208')
  let headlessReady = false
  try {
    const entries = fs.default.readdirSync(browsersPath)
    for (const entry of entries) {
      if (entry.startsWith('chromium_headless_shell-')) {
        headlessReady = true
        break
      }
    }
  } catch {
    // Ignore browser directory probing failures
  }

  return headlessReady
}

/**
 * Track active download for cancellation
 */
let activeDownload: { service: DownloadService; cancelled: boolean } | null = null

export function registerPlaywrightBrowserHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PLAYWRIGHT_BROWSER_CHECK, async (): Promise<IpcResult<boolean>> => {
    return withErrorHandling(async () => {
      return checkBrowsersExist()
    }, 'playwright-browser:check')
  })

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
