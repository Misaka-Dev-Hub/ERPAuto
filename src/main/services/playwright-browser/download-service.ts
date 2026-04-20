/**
 * Playwright Browser Download Service
 *
 * Downloads Playwright browser files from S3 to local directory
 * with progress tracking and basic validation.
 */

import * as fs from 'fs'
import * as path from 'path'
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import { createLogger } from '../logger'

const log = createLogger('PlaywrightDownloadService')

/**
 * Download progress event
 */
export interface DownloadProgress {
  percent: number
  downloadedBytes: number
  totalBytes: number
  currentFile: string
  speed: number
  eta?: number
}

/**
 * S3 Object information
 */
export interface S3Object {
  key: string
  size?: number
  lastModified?: Date
}

/**
 * Validation result
 */
export interface ValidationResult {
  success: boolean
  message: string
  fileCount?: number
  chromeExeExists?: boolean
  expectedChromePath?: string
  headlessShellExists?: boolean
  ffmpegExists?: boolean
}

/**
 * Download configuration
 */
export interface DownloadConfig {
  s3Client?: S3Client
  bucket?: string
  prefix?: string
  destDir?: string
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<DownloadConfig> = {
  s3Client: null as unknown as S3Client,
  bucket: 'erpauto',
  prefix: 'resources/ms-playwright/', // ✅ Fixed: removed 'erpauto/' prefix
  destDir: path.join(process.env.APPDATA || '', 'erpauto', 'ms-playwright')
}

/**
 * DownloadService class
 * Handles downloading Playwright browser files from S3
 */
export class DownloadService {
  private config: Required<DownloadConfig>
  private s3Client: S3Client

  constructor(config?: DownloadConfig) {
    if (!config?.s3Client) {
      throw new Error('S3Client is required')
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      bucket: config?.bucket || DEFAULT_CONFIG.bucket,
      prefix: config?.prefix || DEFAULT_CONFIG.prefix,
      destDir: config?.destDir || DEFAULT_CONFIG.destDir
    }

    this.s3Client = this.config.s3Client
  }

  /**
   * Execute an operation with retry logic using exponential backoff
   * @param operation - The async operation to execute
   * @param context - Description of the operation for logging
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns The result of the operation
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Check if error is retryable
        const isRetryable = this.isRetryableError(lastError)
        if (!isRetryable || attempt === maxRetries) {
          break
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000
        log.warn(`${context} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`, {
          error: lastError.message
        })

        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw lastError
  }

  /**
   * Determine if an error is retryable based on error type and message
   * @param error - The error to classify
   * @returns true if the error should trigger a retry
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase()
    const code = (error as any).code?.toLowerCase() || ''

    // Retryable: network errors, timeouts
    const retryablePatterns = [
      'etimedout',
      'econnreset',
      'timeout',
      'network',
      'socket hang up',
      'connection reset'
    ]

    // Not retryable: S3 errors, validation errors
    const nonRetryablePatterns = [
      '404',
      '403',
      'not found',
      'access denied',
      'invalid',
      'validation'
    ]

    // Check non-retryable first
    for (const pattern of nonRetryablePatterns) {
      if (message.includes(pattern) || code.includes(pattern)) {
        return false
      }
    }

    // Check retryable
    for (const pattern of retryablePatterns) {
      if (message.includes(pattern) || code.includes(pattern)) {
        return true
      }
    }

    // Default: don't retry unknown errors
    return false
  }

  /**
   * List all S3 objects under the configured prefix
   * Filters to include ALL Chromium files (regular + headless)
   * Simple filter: includes 'chromium' keyword
   */
  async listObjects(): Promise<S3Object[]> {
    log.info('Listing S3 objects', { bucket: this.config.bucket, prefix: this.config.prefix })

    const objects: S3Object[] = []
    let continuationToken: string | undefined

    do {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: this.config.prefix,
          ContinuationToken: continuationToken
        })
      )

      for (const obj of response.Contents || []) {
        if (!obj.Key) continue

        // Only download the exact versions we need
        const relativePath = obj.Key.slice(this.config.prefix.length)
        const dirName = relativePath.split('/')[0]
        const allowedDirs = [
          'chromium-1208',
          'chromium_headless_shell-1208',
          'ffmpeg-1011'
        ]
        if (!allowedDirs.includes(dirName)) {
          continue
        }

        objects.push({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified
        })
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    log.info(`Found ${objects.length} Chromium objects`)
    return objects
  }

  /**
   * Download a single file from S3 with retry logic
   * Skips download if the file already exists locally
   */
  async downloadFile(key: string, destPath: string, expectedSize?: number): Promise<boolean> {
    // Skip if file already exists with matching size
    try {
      const stat = await fs.promises.stat(destPath)
      if (expectedSize !== undefined && stat.size === expectedSize) {
        log.debug('File already exists, skipping', { key, destPath, size: stat.size })
        return false
      }
    } catch {
      // File doesn't exist, proceed with download
    }

    await this.withRetry(async () => {
      log.debug('Downloading file', { key, destPath })

      await fs.promises.mkdir(path.dirname(destPath), { recursive: true })

      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key
        })
      )

      const output = fs.createWriteStream(destPath)
      const body = response.Body as NodeJS.ReadableStream

      await new Promise<void>((resolve, reject) => {
        body.on('error', reject)
        output.on('error', reject)
        output.on('finish', resolve)
        body.pipe(output)
      })

      log.debug('File downloaded', { key, destPath })
    }, `Download ${key}`)

    return true
  }

  /**
   * Download all Chromium browser files from S3
   * Emits progress events during download
   */
  async downloadAll(onProgress: (progress: DownloadProgress) => void): Promise<void> {
    log.info('Starting download of all browser files', { destDir: this.config.destDir })

    const objects = await this.listObjects()
    if (objects.length === 0) {
      throw new Error('No Chromium browser files found in S3')
    }

    // Calculate total bytes
    const totalBytes = objects.reduce((sum, obj) => sum + (obj.size || 0), 0)
    log.info(`Total files: ${objects.length}, Total bytes: ${totalBytes}`)

    let downloadedBytes = 0
    const startTime = Date.now()

    for (const obj of objects) {
      const relativePath = obj.key.replace(this.config.prefix, '')
      const destPath = path.join(this.config.destDir, relativePath)

      // Emit progress for current file
      onProgress({
        percent: Math.round((downloadedBytes / totalBytes) * 100),
        downloadedBytes,
        totalBytes,
        currentFile: relativePath,
        speed: 0,
        eta: undefined
      })

      try {
        const didDownload = await this.downloadFile(obj.key, destPath, obj.size)
        const fileSize = obj.size || 0

        if (didDownload) {
          downloadedBytes += fileSize
        } else {
          // File was skipped, still count bytes for accurate progress
          downloadedBytes += fileSize
        }

        // Calculate speed and ETA
        const elapsedSeconds = (Date.now() - startTime) / 1000
        const speed = Math.round(downloadedBytes / elapsedSeconds)
        const remainingBytes = totalBytes - downloadedBytes
        const eta = speed > 0 ? Math.round(remainingBytes / speed) : undefined

        onProgress({
          percent: Math.round((downloadedBytes / totalBytes) * 100),
          downloadedBytes,
          totalBytes,
          currentFile: relativePath,
          speed,
          eta
        })

        log.debug('Downloaded file', {
          key: obj.key,
          size: fileSize,
          speed: `${speed} bytes/s`
        })
      } catch (error) {
        log.error('Failed to download file', {
          key: obj.key,
          error: error instanceof Error ? error.message : String(error)
        })
        throw new Error(
          `Failed to download ${relativePath}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    const totalElapsed = (Date.now() - startTime) / 1000
    log.info('Download completed', {
      totalFiles: objects.length,
      totalBytes,
      duration: `${totalElapsed.toFixed(1)}s`,
      avgSpeed: `${Math.round(downloadedBytes / totalElapsed)} bytes/s`
    })

    // Final progress event
    onProgress({
      percent: 100,
      downloadedBytes: totalBytes,
      totalBytes,
      currentFile: 'Complete',
      speed: Math.round(downloadedBytes / totalElapsed),
      eta: 0
    })
  }

  /**
   * Validate the downloaded files
   * Checks if the destination directory exists, chrome.exe, headless shell, and ffmpeg are present
   */
  async validateDownload(): Promise<ValidationResult> {
    log.info('Validating download', { destDir: this.config.destDir })

    // Check if destination directory exists
    try {
      await fs.promises.access(this.config.destDir)
    } catch {
      return {
        success: false,
        message: 'Download directory does not exist',
        fileCount: 0,
        chromeExeExists: false,
        headlessShellExists: false,
        ffmpegExists: false
      }
    }

    // Find chrome.exe in chromium-* folders (exclude headless)
    const chromeExePattern = /chromium-\d+[/\\]chrome-win64[/\\]chrome\.exe$/
    let chromeExeExists = false
    let expectedChromePath: string | undefined
    let headlessShellExists = false
    let ffmpegExists = false
    let fileCount = 0

    const scanDir = async (dir: string): Promise<void> => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          await scanDir(fullPath)
        } else if (entry.name.toLowerCase() === 'chrome.exe') {
          const relativePath = path.relative(this.config.destDir, fullPath)
          if (chromeExePattern.test(relativePath.replace(/\\/g, '/'))) {
            chromeExeExists = true
            expectedChromePath = fullPath
          }
        }

        fileCount++
      }
    }

    // Check headless shell directory exists
    const findHeadlessShell = async (): Promise<boolean> => {
      try {
        const entries = await fs.promises.readdir(this.config.destDir)
        for (const entry of entries) {
          if (entry.startsWith('chromium_headless_shell-')) {
            return true
          }
        }
      } catch {
        // Ignore
      }
      return false
    }

    // Check ffmpeg exists
    const ffmpegPath = path.join(this.config.destDir, 'ffmpeg-1011', 'ffmpeg-win64.exe')
    try {
      await fs.promises.access(ffmpegPath)
      ffmpegExists = true
    } catch {
      ffmpegExists = false
    }

    try {
      await scanDir(this.config.destDir)
    } catch (error) {
      log.error('Error scanning download directory', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    headlessShellExists = await findHeadlessShell()

    const allPassed = chromeExeExists && headlessShellExists && ffmpegExists
    const missing: string[] = []
    if (!chromeExeExists) missing.push('chromium')
    if (!headlessShellExists) missing.push('headless shell')
    if (!ffmpegExists) missing.push('ffmpeg')

    const result: ValidationResult = {
      success: allPassed,
      message: allPassed ? 'Validation passed' : `Missing: ${missing.join(', ')}`,
      fileCount,
      chromeExeExists,
      expectedChromePath,
      headlessShellExists,
      ffmpegExists
    }

    log.info('Validation result', result)
    return result
  }
}

export default DownloadService
