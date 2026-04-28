import type {
  CleanerConfigResult,
  CleanerInitializationResult,
  CleanerReportData,
  ValidationRequest,
  ValidationResponsePayload
} from './types'
import type { CleanerExportItem, MaterialBatchChange } from './helpers'

interface CleanerDataPayload {
  success?: boolean
  orderNumbers?: string[]
  originalInputs?: string[]
  materialCodes?: string[]
}

interface CleanerRunPayload {
  ordersProcessed: number
  materialsDeleted: number
  materialsSkipped: number
  errors: string[]
  retriedOrders: number
  successfulRetries: number
  materialsFailed?: number
  uncertainDeletions?: number
}

export async function initializeCleanerPage(): Promise<CleanerInitializationResult> {
  const adminResult = await window.electron.auth.isAdmin()
  const userResult = await window.electron.auth.getCurrentUser()
  const isAdmin = adminResult.success && Boolean(adminResult.data)
  const user = userResult.success ? userResult.data : undefined
  const currentUsername = user?.userInfo?.username ?? ''

  let managers: string[] = []
  if (isAdmin) {
    const response = await window.electron.materials.getManagers()
    const payload = response.success
      ? (response.data as { managers?: string[] } | undefined)
      : undefined
    managers = payload?.managers ?? []
  }

  const sharedIdsResult = await window.electron.validation.getSharedProductionIds()
  const sharedIdsPayload = sharedIdsResult.success
    ? (sharedIdsResult.data as { productionIds?: string[] } | undefined)
    : undefined

  return {
    isAdmin,
    currentUsername,
    managers,
    sharedProductionIdsCount: sharedIdsPayload?.productionIds?.length ?? 0
  }
}

export async function loadCleanerConfig(): Promise<CleanerConfigResult | null> {
  const result = await window.electron.config.getCleaner()
  if (!result.success || !result.data) {
    return null
  }

  return {
    queryBatchSize: result.data.queryBatchSize,
    processConcurrency: result.data.processConcurrency,
    sessionRefreshOrderThreshold: result.data.sessionRefreshOrderThreshold
  }
}

export async function runValidationRequest(
  request: ValidationRequest
): Promise<ValidationResponsePayload | null> {
  const response = await window.electron.validation.validate(request)
  if (!response.success || !response.data) {
    return response.success ? null : { success: false, error: response.error }
  }

  return response.data as ValidationResponsePayload
}

export async function saveDeletionPlan(params: {
  materialsToUpsert: MaterialBatchChange[]
  materialsToDelete: string[]
}): Promise<{ upserted: number; deleted: number }> {
  const { materialsToUpsert, materialsToDelete } = params
  let upserted = 0
  let deleted = 0

  if (materialsToUpsert.length > 0) {
    const response = await window.electron.materials.upsertBatch(materialsToUpsert)
    const payload = response.success
      ? (response.data as { stats?: { success?: number } } | undefined)
      : undefined
    if (!response.success) {
      throw new Error(response.error || '写入物料失败')
    }
    upserted = payload?.stats?.success || 0
  }

  if (materialsToDelete.length > 0) {
    const response = await window.electron.materials.delete(materialsToDelete)
    const payload = response.success ? (response.data as { count?: number } | undefined) : undefined
    if (!response.success) {
      throw new Error(response.error || '删除物料失败')
    }
    deleted = payload?.count || 0
  }

  return { upserted, deleted }
}

export async function reloadManagers(): Promise<string[]> {
  const response = await window.electron.materials.getManagers()
  const payload = response.success
    ? (response.data as { managers?: string[] } | undefined)
    : undefined
  return payload?.managers ?? []
}

export async function runCleanerExecution(params: {
  dryRun: boolean
  headless: boolean
  queryBatchSize: number
  processConcurrency: number
  sessionRefreshOrderThreshold: number
  selectedManagers: string[]
}): Promise<CleanerReportData> {
  const cleanerDataResult = await window.electron.validation.getCleanerData({
    selectedManagers: params.selectedManagers
  })
  const cleanerData = cleanerDataResult.success
    ? (cleanerDataResult.data as CleanerDataPayload | null)
    : null

  if (!cleanerDataResult.success || cleanerData?.success === false) {
    throw new Error(cleanerDataResult.error || '获取清理数据失败')
  }

  const orderNumberList = cleanerData?.orderNumbers || []
  const materialCodeList = cleanerData?.materialCodes || []

  if (orderNumberList.length === 0) {
    throw new Error('没有订单号数据。请先到数据提取页面输入 Production ID。')
  }
  if (materialCodeList.length === 0) {
    throw new Error('没有物料代码数据。请确认已在物料清理界面确认要删除的物料。')
  }

  const response = await window.electron.cleaner.runCleaner({
    orderNumbers: orderNumberList,
    originalInputs: cleanerData?.originalInputs,
    materialCodes: materialCodeList,
    dryRun: params.dryRun,
    headless: params.headless,
    queryBatchSize: params.queryBatchSize,
    processConcurrency: params.processConcurrency,
    sessionRefreshOrderThreshold: params.sessionRefreshOrderThreshold
  })

  const cleanerRunData = response.success ? (response.data as CleanerRunPayload | null) : null
  if (!response.success || !cleanerRunData) {
    throw new Error(response.error || '清理失败')
  }

  return {
    ordersProcessed: cleanerRunData.ordersProcessed,
    materialsDeleted: cleanerRunData.materialsDeleted,
    materialsSkipped: cleanerRunData.materialsSkipped,
    errors: cleanerRunData.errors,
    retriedOrders: cleanerRunData.retriedOrders,
    successfulRetries: cleanerRunData.successfulRetries,
    materialsFailed: cleanerRunData.materialsFailed ?? 0,
    uncertainDeletions: cleanerRunData.uncertainDeletions ?? 0
  }
}

export async function exportCleanerResults(items: CleanerExportItem[]): Promise<string> {
  const response = await window.electron.cleaner.exportResults(items)
  const exportData = response.success
    ? (response.data as { success?: boolean; filePath?: string; error?: string } | null)
    : null

  if (!response.success || exportData?.success === false) {
    throw new Error(response.error || exportData?.error || '导出失败')
  }

  return exportData?.filePath ?? ''
}
