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
  phase: 'login' | 'processing' | 'complete'
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
