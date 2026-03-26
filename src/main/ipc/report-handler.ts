import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { withErrorHandling, type IpcResult } from './index'
import { createLogger } from '../services/logger'
import { ConfigManager } from '../services/config/config-manager'
import { RustfsService } from '../services/rustfs'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

const log = createLogger('ReportHandler')

export interface ReportMetadata {
  key: string
  filename: string
  username: string
  lastModified?: Date
  size?: number
}

function getRustfsService(): RustfsService | null {
  const configManager = ConfigManager.getInstance()
  const config = configManager.getConfig()

  if (config.rustfs?.enabled && config.rustfs.endpoint) {
    return new RustfsService({ config: config.rustfs })
  }
  return null
}

export function registerReportHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.REPORT_LIST_ALL, async (): Promise<IpcResult<ReportMetadata[]>> => {
    return withErrorHandling(async () => {
      const rustfs = getRustfsService()
      if (!rustfs) {
        throw new Error('RustFS is not configured or enabled')
      }

      const configManager = ConfigManager.getInstance()
      const config = configManager.getConfig()

      // Create a direct S3Client since RustfsService doesn't expose listObjects natively easily
      const client = new S3Client({
        region: config.rustfs?.region || 'us-east-1',
        endpoint: config.rustfs?.endpoint || '',
        credentials: {
          accessKeyId: config.rustfs?.accessKey || '',
          secretAccessKey: config.rustfs?.secretKey || ''
        },
        forcePathStyle: true
      })

      log.info('Fetching all reports from RustFS')
      const input = {
        Bucket: config.rustfs?.bucket || '',
        Prefix: 'reports/cleaner/'
      }

      const command = new ListObjectsV2Command(input)
      const response = await client.send(command)

      const reports: ReportMetadata[] = []

      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key && item.Key.endsWith('.md')) {
            // reports/cleaner/{username}/{filename}
            const parts = item.Key.split('/')
            if (parts.length >= 4) {
              const username = parts[2]
              const filename = parts.slice(3).join('/')
              reports.push({
                key: item.Key,
                filename,
                username,
                lastModified: item.LastModified,
                size: item.Size
              })
            }
          }
        }
      }

      // Sort by lastModified descending
      reports.sort((a, b) => {
        if (a.lastModified && b.lastModified) {
          return b.lastModified.getTime() - a.lastModified.getTime()
        }
        return 0
      })

      return reports
    }, 'report:listAll')
  })

  ipcMain.handle(
    IPC_CHANNELS.REPORT_LIST_BY_USER,
    async (_event, username: string): Promise<IpcResult<ReportMetadata[]>> => {
      return withErrorHandling(async () => {
        const rustfs = getRustfsService()
        if (!rustfs) {
          throw new Error('RustFS is not configured or enabled')
        }

        const configManager = ConfigManager.getInstance()
        const config = configManager.getConfig()

        const client = new S3Client({
          region: config.rustfs?.region || 'us-east-1',
          endpoint: config.rustfs?.endpoint || '',
          credentials: {
            accessKeyId: config.rustfs?.accessKey || '',
            secretAccessKey: config.rustfs?.secretKey || ''
          },
          forcePathStyle: true
        })

        log.info('Fetching reports from RustFS for user', { username })
        const input = {
          Bucket: config.rustfs?.bucket || '',
          Prefix: `reports/cleaner/${username}/`
        }

        const command = new ListObjectsV2Command(input)
        const response = await client.send(command)

        const reports: ReportMetadata[] = []

        if (response.Contents) {
          for (const item of response.Contents) {
            if (item.Key && item.Key.endsWith('.md')) {
              const parts = item.Key.split('/')
              if (parts.length >= 4) {
                const itemUsername = parts[2]
                const filename = parts.slice(3).join('/')
                reports.push({
                  key: item.Key,
                  filename,
                  username: itemUsername,
                  lastModified: item.LastModified,
                  size: item.Size
                })
              }
            }
          }
        }

        // Sort by lastModified descending
        reports.sort((a, b) => {
          if (a.lastModified && b.lastModified) {
            return b.lastModified.getTime() - a.lastModified.getTime()
          }
          return 0
        })

        return reports
      }, 'report:listByUser')
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.REPORT_DOWNLOAD,
    async (_event, key: string): Promise<IpcResult<string>> => {
      return withErrorHandling(async () => {
        const rustfs = getRustfsService()
        if (!rustfs) {
          throw new Error('RustFS is not configured or enabled')
        }

        log.info('Downloading report from RustFS', { key })
        const result = await rustfs.downloadFile(key)

        if (!result.success) {
          throw new Error(result.error || 'Failed to download report')
        }

        // Convert buffer to string
        return result.content.toString('utf-8')
      }, 'report:download')
    }
  )
}
