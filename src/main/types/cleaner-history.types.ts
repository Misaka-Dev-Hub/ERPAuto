// src/main/types/cleaner-history.types.ts

/**
 * Cleaner 操作历史类型定义
 */

/** 执行级记录 */
export interface CleanerExecutionRecord {
  id?: number
  batchId: string
  attemptNumber: number
  userId: number
  username: string
  operationTime: Date
  endTime: Date | null
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

/** 订单级记录 */
export interface CleanerOrderRecord {
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

/** 物料级记录 */
export interface CleanerMaterialRecord {
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

/** 批次统计（前端列表展示用） */
export interface CleanerBatchStats {
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

/** 插入执行记录的输入 */
export interface InsertCleanerExecutionInput {
  batchId: string
  attemptNumber: number
  userId: number
  username: string
  isDryRun: boolean
  totalOrders: number
  appVersion: string
}

/** 插入订单记录的输入 */
export interface InsertOrderInput {
  orderNumber: string
}

/** 插入物料明细的输入 */
export interface InsertMaterialDetailInput {
  orderNumber: string
  materialCode: string
  materialName: string
  rowNumber: number
  result: string
  reason: string | null
  attemptCount: number
  finalErrorCategory: string | null
}

/** 查询批次的选项 */
export interface GetCleanerBatchesOptions {
  limit?: number
  offset?: number
  usernames?: string[]
}
