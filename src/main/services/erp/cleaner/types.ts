import type { OrderCleanDetail } from '../../../types/cleaner.types'

export interface RetryResult {
  retriedOrders: number
  successfulRetries: number
  updatedDetails: OrderCleanDetail[]
}

export interface ProgressState {
  ordersStarted: number
  ordersCompleted: number
  totalOrders: number
  progressText?: string
  lastCompletedOrder?: string
  lastActivityTime?: number
}

export interface QueryResultRow {
  rowIndex: number
  orderNumber: string
}

export interface CleanerOptions {
  dryRun?: boolean
  verbose?: boolean
}

export interface ShouldDeleteParams {
  rowNumber: number
  pendingQty: string
  materialCode: string
  deleteSet: Set<string>
}
