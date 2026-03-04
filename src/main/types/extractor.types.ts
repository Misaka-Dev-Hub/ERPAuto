import type { ErpSession } from './erp.types'

export interface ExtractorInput {
  orderNumbers: string[]
  batchSize?: number
  onProgress?: (message: string, progress: number) => void
}

export interface ExtractorResult {
  downloadedFiles: string[]
  mergedFile: string | null
  recordCount: number
  errors: string[]
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
