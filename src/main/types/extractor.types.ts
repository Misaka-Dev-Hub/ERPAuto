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
