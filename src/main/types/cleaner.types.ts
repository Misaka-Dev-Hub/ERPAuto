export interface CleanerInput {
  orderNumbers: string[]
  materialCodes: string[]
  dryRun: boolean
  onProgress?: (message: string, progress?: number) => void
}

export interface CleanerResult {
  ordersProcessed: number
  materialsDeleted: number
  materialsSkipped: number
  errors: string[]
  details: OrderCleanDetail[]
}

export interface OrderCleanDetail {
  orderNumber: string
  materialsDeleted: number
  materialsSkipped: number
  errors: string[]
}

/**
 * Single validation result item for export
 */
export interface ExportResultItem {
  materialName: string
  materialCode: string
  specification: string
  model: string
  managerName: string
  isMarkedForDeletion: boolean
  isSelected: boolean
}

/**
 * Request payload for exporting validation results
 */
export interface ExportResultRequest {
  items: ExportResultItem[]
}

/**
 * Response for export operation
 */
export interface ExportResultResponse {
  success: boolean
  filePath?: string
  error?: string
}
