import { ErpAuthService } from './erp-auth'
import type { DeletionErrorCategory, DeletionOutcome } from '../../types/cleaner.types'
import type { CleanerInput, CleanerResult, OrderCleanDetail } from '../../types/cleaner.types'
import type { ErpSession } from '../../types/erp.types'
import type { BrowserContext, FrameLocator, Page } from 'playwright'
import { createLogger, run, trackDuration } from '../logger'
import { capturePageContext } from './erp-error-context'
import { capturePageState } from './page-state'
import { AsyncMutex, ConcurrencyTracker } from './cleaner/concurrency'
import { evaluateDeletionSignals as evaluateDeletionSignalsHelper } from './cleaner/deletion-signals'
import { MaterialDeletionVerifier } from './cleaner/material-deletion-verifier'
import { CleanerNavigation } from './cleaner/navigation'
import { CleanerOrderDetailProcessor } from './cleaner/order-detail-processor'
import { CleanerRetryHandler } from './cleaner/retry-handler'
import { getSkipReason, shouldDeleteMaterial } from './cleaner/rules'
import { clampNumber, createBatches, getMissingOrders, runWithConcurrency } from './cleaner/utils'
import type {
  CleanerOptions,
  ProgressState,
  QueryResultRow,
  RetryResult,
  ShouldDeleteParams
} from './cleaner/types'

const log = createLogger('CleanerService')

const DEFAULT_QUERY_BATCH_SIZE = 100
const MAX_QUERY_BATCH_SIZE = 100
const DEFAULT_PROCESS_CONCURRENCY = 1
const MAX_PROCESS_CONCURRENCY = 20
const DEFAULT_SESSION_REFRESH_ORDER_THRESHOLD = 160

export type { CleanerOptions, ShouldDeleteParams } from './cleaner/types'
export { createBatches, getMissingOrders, runWithConcurrency } from './cleaner/utils'

/**
 * ERP Cleaner Service
 * Deletes specified materials from production orders in ERP system
 */
export class CleanerService {
  private authService: ErpAuthService
  private dryRun: boolean
  private deletionVerifier: MaterialDeletionVerifier
  private navigation: CleanerNavigation
  private orderDetailProcessor: CleanerOrderDetailProcessor
  private retryHandler: CleanerRetryHandler

  constructor(authService: ErpAuthService, options: CleanerOptions = {}) {
    this.authService = authService
    this.dryRun = options.dryRun ?? false
    this.deletionVerifier = new MaterialDeletionVerifier(log)
    this.navigation = new CleanerNavigation(log, (page, step, snapshotOptions) =>
      this.logPageStateSnapshot(page, step, snapshotOptions)
    )
    this.orderDetailProcessor = new CleanerOrderDetailProcessor(log, this.deletionVerifier, () =>
      this.getBrowserContext()
    )
    this.retryHandler = new CleanerRetryHandler(log, {
      queryOrders: (workFrame, popupPage, orderNumbers) =>
        this.queryOrders(workFrame, popupPage, orderNumbers),
      waitForLoading: (workFrame) => this.waitForLoading(workFrame),
      openDetailPageFromCurrentQuery: (workFrame, popupPage, orderNumber) =>
        this.openDetailPageFromCurrentQuery(workFrame, popupPage, orderNumber),
      processDetailPage: (params) => this.processDetailPage(params)
    })
  }

  /**
   * Check if dry-run mode is enabled
   */
  isDryRun(): boolean {
    return this.dryRun
  }

  /**
   * Determine if a material should be deleted
   */
  shouldDeleteMaterial(params: ShouldDeleteParams): boolean {
    return shouldDeleteMaterial(params)
  }

  getSkipReason(params: ShouldDeleteParams): string {
    return getSkipReason(params)
  }

  async clean(input: CleanerInput): Promise<CleanerResult> {
    return run(
      async () => {
        return await this.performCleanup(input)
      },
      { operation: 'cleaner' }
    )
  }

  private async performCleanup(input: CleanerInput): Promise<CleanerResult> {
    const result: CleanerResult = {
      ordersProcessed: 0,
      materialsDeleted: 0,
      materialsSkipped: 0,
      errors: [],
      details: [],
      retriedOrders: 0,
      successfulRetries: 0,
      materialsFailed: 0,
      uncertainDeletions: 0
    }

    const totalOrders = input.orderNumbers.length
    const totalMaterials = input.materialCodes.length
    const dryRun = input.dryRun ?? this.dryRun
    const queryBatchSize = clampNumber(
      input.queryBatchSize,
      DEFAULT_QUERY_BATCH_SIZE,
      1,
      MAX_QUERY_BATCH_SIZE
    )
    const processConcurrency = clampNumber(
      input.processConcurrency,
      DEFAULT_PROCESS_CONCURRENCY,
      1,
      MAX_PROCESS_CONCURRENCY
    )
    const sessionRefreshOrderThreshold =
      input.sessionRefreshOrderThreshold && input.sessionRefreshOrderThreshold > 0
        ? Math.trunc(input.sessionRefreshOrderThreshold)
        : DEFAULT_SESSION_REFRESH_ORDER_THRESHOLD

    log.info('Starting cleaner', {
      totalOrders,
      totalMaterials,
      dryRun,
      queryBatchSize,
      processConcurrency,
      sessionRefreshOrderThreshold,
      orderNumbers: input.orderNumbers,
      materialCodes: input.materialCodes
    })

    const deleteSet = new Set(input.materialCodes)

    let popupPage: Page | null = null

    try {
      const session = this.authService.getSession()
      const navigation = await this.navigateToCleanerPage(session)
      popupPage = navigation.popupPage
      let { workFrame } = navigation

      await this.setupQueryInterface(workFrame, popupPage)

      const orderBatches = createBatches(input.orderNumbers, queryBatchSize)
      const popupMutex = new AsyncMutex()
      let ordersProcessedSinceLogin = 0
      const progressState: ProgressState = {
        ordersStarted: 0,
        ordersCompleted: 0,
        totalOrders
      }

      for (let batchIndex = 0; batchIndex < orderBatches.length; batchIndex++) {
        const batchOrders = orderBatches[batchIndex]

        log.info('Processing cleaner batch', {
          batchIndex: batchIndex + 1,
          totalBatches: orderBatches.length,
          batchSize: batchOrders.length,
          totalOrders,
          totalMaterials
        })

        // [新增] 健康检查定时器 - 检测长时间无进展
        let lastActivityTime = Date.now()
        progressState.lastActivityTime = lastActivityTime
        const healthCheckInterval = setInterval(() => {
          const secondsSinceLastActivity = (Date.now() - lastActivityTime) / 1000

          if (secondsSinceLastActivity > 60) {
            log.warn('[HEALTH_CHECK] 长时间无进展', {
              ordersCompleted: progressState.ordersCompleted,
              totalOrders: progressState.totalOrders,
              lastCompletedOrder: progressState.lastCompletedOrder,
              noProgressSeconds: secondsSinceLastActivity,
              suspectedStuck: secondsSinceLastActivity > 180,
              healthStatus: secondsSinceLastActivity > 180 ? 'critical' : 'warning'
            })
          }
        }, 30000) // 每 30 秒检查一次

        // [新增] 为每个 batch 创建并发追踪器
        const tracker = new ConcurrencyTracker(log)

        try {
          // Track batch processing duration with 5s slow threshold
          await trackDuration(
            async () => {
              // Phase 1: Query orders
              await trackDuration(
                async () => await this.queryOrders(workFrame, popupPage!, batchOrders),
                {
                  operationName: 'query',
                  message: '执行订单查询',
                  slowThresholdMs: 3000,
                  context: { orderCount: batchOrders.length }
                }
              )

              // Phase 2: Wait for loading complete
              await trackDuration(async () => await this.waitForLoading(workFrame), {
                operationName: 'wait_loading',
                message: '等待加载完成',
                slowThresholdMs: 5000
              })

              // Phase 3: Collect query results
              const collectResult = await trackDuration(
                async () => await this.collectQueryResultRows(workFrame, popupPage!),
                {
                  operationName: 'collect_results',
                  message: '收集查询结果',
                  slowThresholdMs: 2000
                }
              )
              const queriedRows = collectResult.result
              const queriedOrderNumbersInBatch = new Set(queriedRows.map((row) => row.orderNumber))

              // Phase 4: Process all orders in batch
              await trackDuration(
                async () => {
                  await runWithConcurrency(
                    queriedRows,
                    processConcurrency,
                    async (row, _index, workerId) => {
                      const { rowIndex, orderNumber } = row

                      // [新增] Worker 开始追踪
                      tracker.workerStarted(workerId, orderNumber)

                      try {
                        // [新增] Mutex 等待追踪
                        tracker.waitingForMutex(workerId, orderNumber)
                        const openedDetailPage = await popupMutex.runExclusive(async () => {
                          // [新增] Mutex 获取追踪
                          tracker.acquiredMutex(workerId, orderNumber)
                          try {
                            return await this.openDetailPageFromRow(
                              workFrame,
                              popupPage!,
                              rowIndex,
                              {
                                orderNumber,
                                orderIndex: progressState.ordersStarted,
                                orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
                                workerId
                              }
                            )
                          } finally {
                            tracker.releasedMutex(workerId, orderNumber)
                          }
                        })

                        let detail: OrderCleanDetail
                        try {
                          detail = await this.processDetailPage({
                            detailPage: openedDetailPage,
                            deleteSet,
                            dryRun,
                            expectedOrderNumber: orderNumber,
                            progressState,
                            onProgress: input.onProgress
                          })
                        } catch (error) {
                          const message = error instanceof Error ? error.message : 'Unknown error'
                          detail = this.createErrorDetail(orderNumber, message)
                        } finally {
                          progressState.ordersStarted += 1
                          progressState.ordersCompleted += 1
                          progressState.lastCompletedOrder = orderNumber
                          lastActivityTime = Date.now() // [新增] 健康检查：更新活动时间
                        }

                        result.details.push(detail)

                        if (detail.errors.length > 0) {
                          result.errors.push(
                            `Order ${detail.orderNumber}: ${detail.errors.join('; ')}`
                          )
                          return
                        }

                        result.ordersProcessed += 1
                        result.materialsDeleted += detail.materialsDeleted
                        result.materialsSkipped += detail.materialsSkipped
                        result.materialsFailed += detail.materialsFailed
                        result.uncertainDeletions += detail.uncertainDeletions
                      } finally {
                        // [新增] Worker 完成追踪
                        tracker.workerCompleted(workerId, orderNumber)
                      }
                    }
                  )

                  // Handle missing orders
                  const missingOrders = getMissingOrders(batchOrders, queriedOrderNumbersInBatch)
                  for (const missingOrder of missingOrders) {
                    const missingMessage = '订单未出现在查询结果中'
                    result.errors.push(`Order ${missingOrder}: ${missingMessage}`)
                    result.details.push(this.createErrorDetail(missingOrder, missingMessage, true))
                  }
                },
                {
                  operationName: 'process_all_orders_in_batch',
                  message: `处理批次中所有${queriedRows.length}个订单`,
                  slowThresholdMs: 10000
                }
              )

              // Phase 5: Save batch results (already included in process_all_orders_in_batch)
              // No separate save step needed as results are accumulated in result object
            },
            {
              operationName: `batch-${batchIndex + 1}-${orderBatches[batchIndex].length}-orders`,
              message: `Batch ${batchIndex + 1}/${orderBatches.length}`,
              slowThresholdMs: 5000,
              context: {
                batchIndex: batchIndex + 1,
                totalBatches: orderBatches.length,
                batchSize: batchOrders.length,
                totalOrders,
                totalMaterials
              }
            }
          )
        } finally {
          // [新增] 清理健康检查定时器
          clearInterval(healthCheckInterval)
        }

        ordersProcessedSinceLogin += batchOrders.length
        const remainingBatches = orderBatches.length - (batchIndex + 1)
        log.info('[SESSION_REFRESH_CHECK] 批次完成，检查是否需要重建会话', {
          batchIndex: batchIndex + 1,
          totalBatches: orderBatches.length,
          batchSize: batchOrders.length,
          ordersProcessedSinceLogin,
          threshold: sessionRefreshOrderThreshold,
          remainingBatches
        })

        if (remainingBatches > 0 && ordersProcessedSinceLogin >= sessionRefreshOrderThreshold) {
          log.info('[SESSION_REFRESH_TRIGGERED] 达到阈值，准备重建会话', {
            batchIndex: batchIndex + 1,
            totalBatches: orderBatches.length,
            batchSize: batchOrders.length,
            ordersProcessedSinceLogin,
            threshold: sessionRefreshOrderThreshold,
            remainingBatches
          })

          const refreshedNavigation = await this.refreshSessionAtBatchBoundary({
            batchIndex: batchIndex + 1,
            totalBatches: orderBatches.length,
            batchSize: batchOrders.length,
            threshold: sessionRefreshOrderThreshold,
            ordersProcessedSinceLogin,
            totalOrders,
            completedOrders: progressState.ordersCompleted
          })

          popupPage = refreshedNavigation.popupPage
          workFrame = refreshedNavigation.workFrame
          ordersProcessedSinceLogin = 0
        } else if (
          remainingBatches === 0 &&
          ordersProcessedSinceLogin >= sessionRefreshOrderThreshold
        ) {
          log.info('[SESSION_REFRESH_SKIPPED] 已达到阈值但无剩余批次，跳过重建', {
            batchIndex: batchIndex + 1,
            totalBatches: orderBatches.length,
            batchSize: batchOrders.length,
            ordersProcessedSinceLogin,
            threshold: sessionRefreshOrderThreshold,
            remainingBatches
          })
        }
      }

      const retryResult = await this.retryFailedOrders({
        workFrame,
        popupPage,
        failedDetails: result.details.filter(
          (d) => d.errors.length > 0 && this.isOrderNumber(d.orderNumber)
        ),
        deleteSet,
        dryRun,
        onProgress: input.onProgress
      })

      result.retriedOrders = retryResult.retriedOrders
      result.successfulRetries = retryResult.successfulRetries

      retryResult.updatedDetails.forEach((updatedDetail) => {
        const index = result.details.findIndex((d) => d.orderNumber === updatedDetail.orderNumber)
        if (index !== -1) {
          const previousDetail = result.details[index]
          if (updatedDetail.retrySuccess && previousDetail.errors.length > 0) {
            result.ordersProcessed += 1
            result.materialsDeleted += updatedDetail.materialsDeleted
            result.materialsSkipped += updatedDetail.materialsSkipped
            result.materialsFailed += updatedDetail.materialsFailed
            result.uncertainDeletions += updatedDetail.uncertainDeletions
          }
          result.details[index] = updatedDetail
        }
      })

      const successfulRetryOrders = new Set(
        retryResult.updatedDetails.filter((d) => d.retrySuccess).map((d) => d.orderNumber)
      )
      result.errors = result.errors.filter(
        (err) => !successfulRetryOrders.has(err.split(':')[0].replace('Order ', ''))
      )

      log.info('Cleaner completed', {
        ordersProcessed: result.ordersProcessed,
        materialsDeleted: result.materialsDeleted,
        materialsSkipped: result.materialsSkipped,
        materialsFailed: result.materialsFailed,
        uncertainDeletions: result.uncertainDeletions,
        errorCount: result.errors.length,
        totalOrders,
        totalMaterials,
        dryRun
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('Cleaner failed', {
        error: message,
        totalOrders,
        totalMaterials,
        dryRun,
        orderNumbers: input.orderNumbers,
        materialCodes: input.materialCodes,
        ...(popupPage
          ? await capturePageContext(
              popupPage,
              undefined,
              'cleaner.outerCatch',
              undefined,
              undefined,
              'outer_catch'
            )
          : {})
      })
      result.errors.push(`Clean failed: ${message}`)
      result.crashed = true
    } finally {
      if (popupPage) {
        try {
          await popupPage.close()
        } catch {
          // Ignore close errors
        }
      }
    }

    return result
  }

  async navigateToCleanerPage(
    session: ErpSession
  ): Promise<{ popupPage: Page; workFrame: FrameLocator }> {
    return this.navigation.navigateToCleanerPage(session)
  }

  private async setupQueryInterface(innerFrame: FrameLocator, popupPage: Page): Promise<void> {
    await this.navigation.setupQueryInterface(innerFrame, popupPage)
  }

  private async queryOrders(
    workFrame: FrameLocator,
    popupPage: Page,
    orderNumbers: string[]
  ): Promise<void> {
    await this.navigation.queryOrders(workFrame, popupPage, orderNumbers)
  }

  private async collectQueryResultRows(
    workFrame: FrameLocator,
    popupPage: Page
  ): Promise<QueryResultRow[]> {
    return this.navigation.collectQueryResultRows(workFrame, popupPage)
  }

  private async openDetailPageFromRow(
    workFrame: FrameLocator,
    popupPage: Page,
    rowIndex: number,
    options?: {
      orderNumber?: string
      orderIndex?: number
      orderPosition?: string
      workerId?: number
    }
  ): Promise<Page> {
    return this.navigation.openDetailPageFromRow(workFrame, popupPage, rowIndex, options)
  }

  private async openDetailPageFromCurrentQuery(
    workFrame: FrameLocator,
    popupPage: Page,
    orderNumber?: string
  ): Promise<Page> {
    return this.navigation.openDetailPageFromCurrentQuery(workFrame, popupPage, orderNumber)
  }

  private getBrowserContext(): BrowserContext | undefined {
    try {
      return this.authService.getSession().context
    } catch {
      return undefined
    }
  }

  private async logPageStateSnapshot(
    page: Page,
    step: string,
    options: {
      level?: 'info' | 'warn' | 'error' | 'debug'
      orderNumber?: string
      orderIndex?: number
      orderPosition?: string
      workerId?: number
      elapsedMs?: number
      includeFrameHierarchy?: boolean
      includeBodyTextPreview?: boolean
    } = {}
  ) {
    const pageState = await capturePageState(page, this.getBrowserContext(), {
      includeFrameHierarchy: options.includeFrameHierarchy,
      includeBodyTextPreview: options.includeBodyTextPreview
    })

    const payload = {
      step,
      orderNumber: options.orderNumber,
      orderIndex: options.orderIndex,
      orderPosition: options.orderPosition,
      workerId: options.workerId,
      elapsedMs: options.elapsedMs,
      ...pageState
    }

    const level = options.level ?? 'info'
    log[level]('[PAGE_STATE] 页面状态快照', payload)
    return payload
  }

  private async refreshSessionAtBatchBoundary(params: {
    batchIndex: number
    totalBatches: number
    batchSize: number
    threshold: number
    ordersProcessedSinceLogin: number
    totalOrders: number
    completedOrders: number
  }): Promise<{ popupPage: Page; workFrame: FrameLocator }> {
    const refreshStartTime = Date.now()

    log.info('[SESSION_REFRESH_START] 开始关闭浏览器并重新登录', {
      ...params
    })

    await this.authService.close()

    const session = await this.authService.login()
    const navigation = await this.navigateToCleanerPage(session)
    await this.setupQueryInterface(navigation.workFrame, navigation.popupPage)

    log.info('[SESSION_REFRESH_SUCCESS] 会话重建成功', {
      ...params,
      elapsedMs: Date.now() - refreshStartTime
    })

    return navigation
  }

  private async processDetailPage(params: {
    detailPage: Page
    deleteSet: Set<string>
    dryRun: boolean
    progressState: ProgressState
    expectedOrderNumber?: string
    onProgress?: (
      message: string,
      progress?: number,
      extra?: Partial<import('../../types/cleaner.types').CleanerProgress>
    ) => void
  }): Promise<OrderCleanDetail> {
    return this.orderDetailProcessor.processDetailPage(params)
  }
  private isOrderNumber(value: string): boolean {
    return /^SC\d{14}$/.test(value)
  }

  private createErrorDetail(
    orderNumber: string,
    message: string,
    notFound: boolean = false
  ): OrderCleanDetail {
    return {
      orderNumber,
      materialsDeleted: 0,
      materialsSkipped: 0,
      errors: [message],
      skippedMaterials: [],
      deletedMaterials: [],
      retryCount: 0,
      retryAttempts: [],
      retriedAt: undefined,
      retrySuccess: false,
      materialsFailed: 0,
      failedMaterials: [],
      uncertainDeletions: 0,
      notFound
    }
  }

  private async waitForLoading(frame: FrameLocator): Promise<void> {
    await this.navigation.waitForLoading(frame)
  }

  /**
   * Pure logic: evaluate deletion signals and determine outcome.
   * No Playwright dependencies — easy to unit test.
   */
  evaluateDeletionSignals(params: {
    rowChanged: boolean
    countDecreased: boolean | null
    hasError: boolean
    errorText?: string
  }): {
    outcome: DeletionOutcome
    errorCategory?: DeletionErrorCategory
    errorMessage?: string
  } {
    return evaluateDeletionSignalsHelper(params)
  }

  private async retryFailedOrders(params: {
    workFrame: FrameLocator
    popupPage: Page
    failedDetails: OrderCleanDetail[]
    deleteSet: Set<string>
    dryRun: boolean
    onProgress?: (
      message: string,
      progress?: number,
      extra?: Partial<import('../../types/cleaner.types').CleanerProgress>
    ) => void
  }): Promise<RetryResult> {
    return this.retryHandler.retryFailedOrders(params)
  }
}
