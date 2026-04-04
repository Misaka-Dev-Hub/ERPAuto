/**
 * RustFS Service
 *
 * S3-compatible object storage service for persisting reports and files
 * Uses AWS SDK for S3 protocol compatibility
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type PutObjectCommandInput,
  type GetObjectCommandInput,
  type DeleteObjectCommandInput
} from '@aws-sdk/client-s3'
import { createLogger, run, trackDuration } from '../logger'
import type { RustfsConfig } from '../../types/config.schema'
import * as fs from 'fs'
import * as path from 'path'

const log = createLogger('RustfsService')

export interface UploadResult {
  success: boolean
  key: string
  etag?: string
  error?: string
}

export interface DownloadResult {
  success: boolean
  content: Buffer
  error?: string
}

export interface RustfsServiceOptions {
  config: RustfsConfig
}

export class RustfsService {
  private client: S3Client
  private config: RustfsConfig

  constructor(options: RustfsServiceOptions) {
    const { config } = options

    this.config = config

    // Configure S3 client for RustFS
    // RustFS is fully compatible with S3 protocol
    this.client = new S3Client({
      region: config.region || 'us-east-1',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey
      },
      forcePathStyle: true // Required for some S3-compatible services
    })

    log.info('RustFS service initialized', {
      endpoint: config.endpoint,
      bucket: config.bucket,
      region: config.region
    })
  }

  /**
   * Upload a file to RustFS
   * @param filePath - Local file path to upload
   * @param key - Object key (path) in the bucket
   * @param contentType - Optional MIME type
   */
  async uploadFile(filePath: string, key: string, contentType?: string): Promise<UploadResult> {
    try {
      // Validate configuration
      if (!this.config.enabled) {
        log.warn('RustFS upload skipped - disabled in config', { filePath, key })
        return {
          success: false,
          key,
          error: 'RustFS is not enabled in configuration'
        }
      }

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        log.warn('RustFS upload skipped - file not found', { filePath, key })
        return {
          success: false,
          key,
          error: `File not found: ${filePath}`
        }
      }

      // Read file content
      const fileContent = await fs.promises.readFile(filePath)

      // Determine content type
      const mimeType = contentType || this.getMimeType(filePath) || 'application/octet-stream'

      log.info('Uploading file to RustFS', {
        filePath,
        key,
        contentType: mimeType,
        fileSize: fileContent.length,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      const input: PutObjectCommandInput = {
        Bucket: this.config.bucket,
        Key: key,
        Body: fileContent,
        ContentType: mimeType
      }

      const command = new PutObjectCommand(input)
      const response = await this.client.send(command)

      log.info('File uploaded successfully to RustFS', {
        key,
        fileSize: fileContent.length,
        etag: response.ETag,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      return {
        success: true,
        key,
        etag: response.ETag
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error'
      log.error('Failed to upload file to RustFS', {
        filePath,
        key,
        error: errorMessage,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      return {
        success: false,
        key,
        error: errorMessage
      }
    }
  }

  /**
   * Upload a string content directly to RustFS
   * @param content - String content to upload
   * @param key - Object key (path) in the bucket
   * @param contentType - Optional MIME type
   */
  async uploadString(content: string, key: string, contentType?: string): Promise<UploadResult> {
    try {
      if (!this.config.enabled) {
        log.warn('RustFS string upload skipped - disabled in config', {
          key,
          endpoint: this.config.endpoint
        })
        return {
          success: false,
          key,
          error: 'RustFS is not enabled in configuration'
        }
      }

      const mimeType = contentType || 'text/plain; charset=utf-8'

      log.info('Uploading string content to RustFS', {
        key,
        contentType: mimeType,
        fileSize: content.length,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      const input: PutObjectCommandInput = {
        Bucket: this.config.bucket,
        Key: key,
        Body: Buffer.from(content, 'utf-8'),
        ContentType: mimeType
      }

      const command = new PutObjectCommand(input)
      const response = await this.client.send(command)

      log.info('String content uploaded successfully to RustFS', {
        key,
        fileSize: content.length,
        etag: response.ETag,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      return {
        success: true,
        key,
        etag: response.ETag
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error'
      log.error('Failed to upload string to RustFS', {
        key,
        error: errorMessage,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      return {
        success: false,
        key,
        error: errorMessage
      }
    }
  }

  /**
   * Download a file from RustFS
   * @param key - Object key (path) in the bucket
   */
  async downloadFile(key: string): Promise<DownloadResult> {
    try {
      if (!this.config.enabled) {
        log.warn('RustFS download skipped - disabled in config', {
          key,
          endpoint: this.config.endpoint
        })
        return {
          success: false,
          content: Buffer.alloc(0),
          error: 'RustFS is not enabled in configuration'
        }
      }

      log.info('Downloading file from RustFS', {
        key,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      const input: GetObjectCommandInput = {
        Bucket: this.config.bucket,
        Key: key
      }

      const command = new GetObjectCommand(input)
      const response = await this.client.send(command)

      const chunks: Buffer[] = []
      for await (const chunk of response.Body as any) {
        chunks.push(Buffer.from(chunk))
      }

      const content = Buffer.concat(chunks)

      log.info('File downloaded successfully from RustFS', {
        key,
        fileSize: content.length,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      return {
        success: true,
        content
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown download error'
      log.error('Failed to download file from RustFS', {
        key,
        error: errorMessage,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      return {
        success: false,
        content: Buffer.alloc(0),
        error: errorMessage
      }
    }
  }

  /**
   * Delete a file from RustFS
   * @param key - Object key (path) in the bucket
   */
  async deleteFile(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.config.enabled) {
        log.warn('RustFS delete skipped - disabled in config', {
          key,
          endpoint: this.config.endpoint
        })
        return {
          success: false,
          error: 'RustFS is not enabled in configuration'
        }
      }

      log.info('Deleting file from RustFS', {
        key,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      const input: DeleteObjectCommandInput = {
        Bucket: this.config.bucket,
        Key: key
      }

      const command = new DeleteObjectCommand(input)
      await this.client.send(command)

      log.info('File deleted successfully from RustFS', {
        key,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      return {
        success: true
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown delete error'
      log.error('Failed to delete file from RustFS', {
        key,
        error: errorMessage,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Generate a storage key for cleaner reports
   * @param reportFileName - Original report file name
   * @param username - Username who generated the report
   */
  generateReportKey(reportFileName: string, username: string): string {
    // Organize reports by user for easy access
    // Format: reports/cleaner/{username}/{filename}
    return `reports/cleaner/${username}/${reportFileName}`
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.md': 'text/markdown; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.csv': 'text/csv; charset=utf-8',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif'
    }
    return mimeTypes[ext] || null
  }

  /**
   * Test connection to RustFS
   */
  async testConnection(): Promise<{
    success: boolean
    message: string
    error?: string
  }> {
    try {
      log.info('Testing RustFS connection', {
        endpoint: this.config.endpoint,
        bucket: this.config.bucket,
        region: this.config.region
      })

      // Try to list objects in the bucket (head bucket operation)
      const input = {
        Bucket: this.config.bucket,
        Prefix: '',
        MaxKeys: 1
      }

      const command = new ListObjectsV2Command(input)
      await this.client.send(command)

      log.info('RustFS connection test successful', {
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      return {
        success: true,
        message: '连接成功'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown connection error'
      log.error('RustFS connection test failed', {
        error: errorMessage,
        endpoint: this.config.endpoint,
        bucket: this.config.bucket
      })

      return {
        success: false,
        message: '连接失败',
        error: errorMessage
      }
    }
  }
}
