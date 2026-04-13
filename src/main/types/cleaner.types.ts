export type CleanerPhase = 'login' | 'processing' | 'complete' | 'retry'

export interface CleanerProgress {
  message: string
  progress: number
  currentOrderIndex: number
  totalOrders: number
  currentMaterialIndex: number
  totalMaterialsInOrder: number
  currentOrderNumber?: string
  phase: CleanerPhase
}

export interface CleanerInput {
  orderNumbers: string[]
  materialCodes: string[]
  dryRun: boolean
  headless?: boolean
  queryBatchSize?: number
  processConcurrency?: number
  onProgress?: (message: string, progress?: number, extra?: Partial<CleanerProgress>) => void
}

export interface CleanerResult {
  ordersProcessed: number
  materialsDeleted: number
  materialsSkipped: number
  errors: string[]
  details: OrderCleanDetail[]
  // Retry statistics
  retriedOrders: number
  successfulRetries: number
  // Deletion verification statistics
  materialsFailed: number
  uncertainDeletions: number
  // Outer retry: true when outer catch triggered (browser crash / fatal timeout)
  crashed?: boolean
}

export interface SkippedMaterial {
  materialCode: string
  materialName: string
  rowNumber: number
  reason: string
}

export interface RetryAttempt {
  attempt: number
  error: string
  timestamp: number
}

export interface OrderCleanDetail {
  orderNumber: string
  materialsDeleted: number
  materialsSkipped: number
  errors: string[]
  skippedMaterials: SkippedMaterial[]
  // Retry-related fields
  retryCount: number
  retryAttempts?: RetryAttempt[]
  retriedAt?: number
  retrySuccess?: boolean
  // Deletion verification fields
  materialsFailed: number
  failedMaterials: FailedMaterial[]
  uncertainDeletions: number
}

export enum DeletionOutcome {
  Success = 'success',
  FailedErpError = 'failed_erp_error',
  FailedNoChange = 'failed_no_change',
  FailedTimeout = 'failed_timeout',
  FailedButtonDisabled = 'failed_button_disabled',
  Uncertain = 'uncertain'
}

export enum DeletionErrorCategory {
  ErpRejection = 'erp_rejection',
  ErpBusy = 'erp_busy',
  NetworkLag = 'network_lag',
  UiUnexpected = 'ui_unexpected',
  VerificationTimeout = 'verification_timeout',
  Unknown = 'unknown'
}

export interface MaterialDeletionAttempt {
  attempt: number
  outcome: DeletionOutcome
  errorCategory?: DeletionErrorCategory
  errorMessage?: string
  rowNumberBefore: string
  rowNumberAfter: string
  materialCountBefore: number
  materialCountAfter: number
  timestamp: number
  durationMs: number
}

export interface FailedMaterial {
  materialCode: string
  materialName: string
  rowNumber: number
  attempts: MaterialDeletionAttempt[]
  finalOutcome: DeletionOutcome
  finalErrorCategory?: DeletionErrorCategory
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
