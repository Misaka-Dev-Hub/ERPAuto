/**
 * Validation IPC API type definitions
 */

/**
 * Material validation result
 */
export interface ValidationResult {
  materialName: string
  materialCode: string
  specification: string
  model: string
  managerName: string
  isMarkedForDeletion: boolean
  matchedTypeKeyword?: string
}

/**
 * Material validation request
 */
export interface ValidationRequest {
  /** Validation mode: 'database_full' or 'database_filtered' */
  mode: 'database_full' | 'database_filtered'
  /** Production ID file path (for database_filtered mode) */
  productionIdFile?: string
  /** Use shared Production IDs from extractor page */
  useSharedProductionIds?: boolean
}

/**
 * Validation response
 */
export interface ValidationResponse {
  success: boolean
  results?: ValidationResult[]
  error?: string
  stats?: {
    totalRecords: number
    matchedCount: number
    markedCount: number
  }
}

/**
 * Material upsert request
 */
export interface MaterialUpsertRequest {
  materialCode: string
  managerName: string
}

/**
 * Material upsert batch request
 */
export interface MaterialUpsertBatchRequest {
  materials: { materialCode: string; managerName: string }[]
}

/**
 * Material delete request
 */
export interface MaterialDeleteRequest {
  materialCodes: string[]
}

/**
 * Material query by manager request
 */
export interface MaterialQueryByManagerRequest {
  managerName: string
}

/**
 * Material operations response
 */
export interface MaterialOperationResponse {
  success: boolean
  count?: number
  stats?: {
    total: number
    success: number
    failed: number
  }
  error?: string
}

/**
 * Manager filter response
 */
export interface ManagerFilterResponse {
  managers: string[]
  materials?: MaterialRecordSummary[]
}

/**
 * Material record summary
 */
export interface MaterialRecordSummary {
  materialCode: string
  materialName: string
  specification: string
  model: string
  managerName: string
  isMarked: boolean
}
