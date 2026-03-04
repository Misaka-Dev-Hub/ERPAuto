import type { ErpSession } from './erp.types'

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'system'

export interface ExtractorInput {
  orderNumbers: string[]
  batchSize?: number
  onProgress?: (message: string, progress: number) => void
  onLog?: (level: LogLevel, message: string) => void
}

/**
 * Result of database import operation
 */
export interface ImportResult {
  success: boolean
  recordsRead: number
  recordsDeleted: number
  recordsImported: number
  uniqueSourceNumbers: number
  errors: string[]
}

export interface ExtractorResult {
  downloadedFiles: string[]
  mergedFile: string | null
  recordCount: number
  errors: string[]
  /** Database import result (only populated if mergedFile was created) */
  importResult?: ImportResult
}

export interface OrderInfo {
  orderNumber: string
  productionId: string
}

/**
 * Input for ExtractorCore - handles web page operations
 */
export interface ExtractorCoreInput {
  session: ErpSession
  orderNumbers: string[]
  downloadDir: string
  batchSize: number
  onProgress?: (message: string, progress: number) => void
}

/**
 * Result from ExtractorCore - list of downloaded file paths
 */
export interface ExtractorCoreResult {
  downloadedFiles: string[]
  errors: string[]
}
