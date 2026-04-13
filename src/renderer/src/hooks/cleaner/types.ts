export interface ValidationRequest {
  mode: 'database_full' | 'database_filtered'
  productionIdFile?: string
  useSharedProductionIds?: boolean
}

export interface ValidationResult {
  materialName: string
  materialCode: string
  specification: string
  model: string
  managerName: string
  isMarkedForDeletion: boolean
  matchedTypeKeyword?: string
}

export interface ValidationStats {
  totalRecords: number
  matchedCount: number
  markedCount: number
}

export interface ValidationResponsePayload {
  success: boolean
  results?: ValidationResult[]
  stats?: ValidationStats
  error?: string
}

export interface CleanerProgress {
  message: string
  progress: number
  currentOrderIndex: number
  totalOrders: number
  currentMaterialIndex: number
  totalMaterialsInOrder: number
  currentOrderNumber?: string
  phase: 'login' | 'processing' | 'complete' | 'retry'
}

export interface CleanerReportData {
  ordersProcessed: number
  materialsDeleted: number
  materialsSkipped: number
  errors: string[]
  retriedOrders?: number
  successfulRetries?: number
  materialsFailed?: number
  uncertainDeletions?: number
  crashed?: boolean
}

export interface CleanerInitializationResult {
  isAdmin: boolean
  currentUsername: string
  managers: string[]
  sharedProductionIdsCount: number
}

export interface CleanerConfigResult {
  queryBatchSize: number
  processConcurrency: number
}

// Cleaner operation history types (mirrors preload/index.d.ts)

export interface CleanerHistoryBatchStats {
  batchId: string
  userId: number
  username: string
  operationTime: string
  status: string
  totalAttempts: number
  totalOrders: number
  ordersProcessed: number
  totalMaterialsDeleted: number
  totalMaterialsFailed: number
  successCount: number
  failedCount: number
  isDryRun: boolean
}

export interface CleanerHistoryExecutionRecord {
  id?: number
  batchId: string
  attemptNumber: number
  userId: number
  username: string
  operationTime: string
  endTime: string | null
  status: string
  isDryRun: boolean
  totalOrders: number
  ordersProcessed: number
  totalMaterialsDeleted: number
  totalMaterialsSkipped: number
  totalMaterialsFailed: number
  totalUncertainDeletions: number
  errorMessage: string | null
  appVersion: string | null
}

export interface CleanerHistoryOrderRecord {
  id?: number
  batchId: string
  attemptNumber: number
  orderNumber: string
  status: string
  materialsDeleted: number
  materialsSkipped: number
  materialsFailed: number
  uncertainDeletions: number
  retryCount: number
  retrySuccess: boolean
  errorMessage: string | null
}

export interface CleanerHistoryMaterialRecord {
  id?: number
  batchId: string
  attemptNumber: number
  orderNumber: string
  materialCode: string
  materialName: string
  rowNumber: number
  result: string
  reason: string | null
  attemptCount: number
  finalErrorCategory: string | null
}
