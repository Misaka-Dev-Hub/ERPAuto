/**
 * Operation History Type Definitions
 *
 * Type definitions for the Extractor Operation History feature.
 * Tracks extraction operations with batch and individual order record details.
 */

/**
 * Individual operation history record
 */
export interface OperationHistoryRecord {
  /** Auto-increment ID */
  id?: number
  /** Batch ID - shared among all orders in a single extraction operation */
  batchId: string
  /** User ID who performed the operation */
  userId: number
  /** Username who performed the operation */
  username: string
  /** Original input production ID (e.g., "22A1"), null if input was already an order number */
  productionId: string | null
  /** Resolved order number (e.g., "SC70202602120085") */
  orderNumber: string
  /** When the operation was performed */
  operationTime: Date
  /** Operation status: pending, success, failed, partial */
  status: string
  /** Number of records extracted for this order */
  recordCount: number | null
  /** Error message if operation failed */
  errorMessage: string | null
}

/**
 * Batch statistics - aggregated view of a batch operation
 */
export interface BatchStats {
  /** Unique batch identifier */
  batchId: string
  /** User ID who performed the operation */
  userId: number
  /** Username who performed the operation */
  username: string
  /** When the operation started */
  operationTime: string
  /** Overall batch status: pending, success, failed, partial */
  status: string
  /** Total number of orders in the batch */
  totalOrders: number
  /** Total records extracted across all orders */
  totalRecords: number
  /** Number of orders that succeeded */
  successCount: number
  /** Number of orders that failed */
  failedCount: number
}

/**
 * Input for inserting batch records
 */
export interface InsertBatchRecordInput {
  /** Original input production ID (e.g., "22A1") */
  productionId: string | null
  /** Resolved order number (e.g., "SC70202602120085") */
  orderNumber: string
}

/**
 * Result for batch status update
 */
export interface UpdateBatchStatusResult {
  /** Whether the update was successful */
  success: boolean
  /** Number of records updated */
  updatedCount: number
}

/**
 * Options for querying batches
 */
export interface GetBatchesOptions {
  /** Maximum number of batches to return */
  limit?: number
  /** Number of batches to skip (for pagination) */
  offset?: number
}
