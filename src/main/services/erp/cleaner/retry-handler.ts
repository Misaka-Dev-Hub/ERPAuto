import type { FrameLocator, Page } from 'playwright'
import type { CleanerProgress, OrderCleanDetail, RetryAttempt } from '../../../types/cleaner.types'
import { trackDuration } from '../../logger'
import type { ProgressState, RetryResult } from './types'

type CleanerLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => void
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

export interface CleanerRetryDependencies {
  queryOrders: (workFrame: FrameLocator, popupPage: Page, orderNumbers: string[]) => Promise<void>
  waitForLoading: (workFrame: FrameLocator) => Promise<void>
  openDetailPageFromCurrentQuery: (
    workFrame: FrameLocator,
    popupPage: Page,
    orderNumber?: string
  ) => Promise<Page>
  processDetailPage: (params: {
    detailPage: Page
    deleteSet: Set<string>
    dryRun: boolean
    progressState: ProgressState
    expectedOrderNumber?: string
    onProgress?: (message: string, progress?: number, extra?: Partial<CleanerProgress>) => void
  }) => Promise<OrderCleanDetail>
}

export class CleanerRetryHandler {
  private static readonly MAX_RETRIES = 2

  constructor(
    private readonly log: CleanerLogger,
    private readonly dependencies: CleanerRetryDependencies
  ) {}

  async retryFailedOrders(params: {
    workFrame: FrameLocator
    popupPage: Page
    failedDetails: OrderCleanDetail[]
    deleteSet: Set<string>
    dryRun: boolean
    onProgress?: (message: string, progress?: number, extra?: Partial<CleanerProgress>) => void
  }): Promise<RetryResult> {
    const { workFrame, popupPage, failedDetails, deleteSet, dryRun, onProgress } = params

    const result: RetryResult = {
      retriedOrders: 0,
      successfulRetries: 0,
      updatedDetails: []
    }

    if (failedDetails.length === 0) {
      this.log.info('[重试机制] 没有需要重试的订单', { checkedCount: failedDetails.length })
      return result
    }

    const retryStartTime = Date.now()
    this.log.info('[重试机制开始] 准备重试失败的订单', {
      totalFailures: failedDetails.length,
      failedOrders: failedDetails
        .map((detail) => detail.orderNumber)
        .slice(0, 5)
        .concat(failedDetails.length > 5 ? [`... (${failedDetails.length - 5} more)`] : [])
    })

    const trackedResult = await trackDuration(
      async () => {
        const retryResult: RetryResult = {
          retriedOrders: 0,
          successfulRetries: 0,
          updatedDetails: []
        }

        for (let detailIndex = 0; detailIndex < failedDetails.length; detailIndex++) {
          const failedDetail = failedDetails[detailIndex]
          const orderNumber = failedDetail.orderNumber
          const retryAttempts: RetryAttempt[] = []
          const retryLoopStartTime = Date.now()

          this.log.info('[重试订单] 开始处理失败订单的重试', {
            orderNumber,
            failureReason: failedDetail.errors.join('; '),
            index: detailIndex + 1,
            total: failedDetails.length
          })

          for (let attempt = 1; attempt <= CleanerRetryHandler.MAX_RETRIES; attempt++) {
            const attemptStartTime = Date.now()
            this.log.info('[重试尝试] 开始第 {attempt} 次重试', {
              orderNumber,
              attempt,
              maxRetries: CleanerRetryHandler.MAX_RETRIES,
              elapsedMs: attemptStartTime - retryLoopStartTime,
              interpolatedAttempt: attempt
            })

            try {
              this.log.debug('[重试查询] 重新查询订单', { orderNumber, attempt })
              await this.dependencies.queryOrders(workFrame, popupPage, [orderNumber])
              await this.dependencies.waitForLoading(workFrame)
              this.log.debug('[重试查询完成] 查询加载完成', {
                orderNumber,
                attempt,
                elapsedMs: Date.now() - attemptStartTime
              })

              const rows = workFrame.locator('tbody tr')
              const rowCount = await rows.count()
              if (rowCount === 0) {
                const errorMsg = '订单重试查询无结果'
                this.log.error('[重试失败] 重试查询返回空结果', {
                  orderNumber,
                  attempt,
                  rowCount,
                  elapsedMs: Date.now() - attemptStartTime
                })
                throw new Error(errorMsg)
              }
              this.log.debug('[重试查询] 查询到 {rowCount} 行结果', {
                orderNumber,
                attempt,
                rowCount
              })

              this.log.debug('[重试详情] 打开订单详情页', { orderNumber, attempt })
              const detailPage = await this.dependencies.openDetailPageFromCurrentQuery(
                workFrame,
                popupPage,
                orderNumber
              )
              this.log.debug('[重试详情] 详情页已打开', {
                orderNumber,
                attempt,
                elapsedMs: Date.now() - attemptStartTime
              })

              this.log.debug('[重试处理] 开始处理详情页', { orderNumber, attempt })
              const retryDetail = await this.dependencies.processDetailPage({
                detailPage,
                deleteSet,
                dryRun,
                expectedOrderNumber: orderNumber,
                progressState: {
                  ordersStarted: detailIndex,
                  ordersCompleted: 0,
                  totalOrders: failedDetails.length
                },
                onProgress: (message, progress, extra) => {
                  onProgress?.(
                    `[重试 ${attempt}/${CleanerRetryHandler.MAX_RETRIES}] ${message}`,
                    progress,
                    extra ? { ...extra, phase: 'processing' as const } : undefined
                  )
                }
              })
              this.log.info('[重试处理完成] 详情页处理完毕', {
                orderNumber,
                attempt,
                deleted: retryDetail.materialsDeleted,
                skipped: retryDetail.materialsSkipped,
                elapsedMs: Date.now() - attemptStartTime
              })

              retryResult.successfulRetries += 1
              retryResult.updatedDetails.push({
                ...retryDetail,
                retryCount: attempt,
                retriedAt: Date.now(),
                retrySuccess: true,
                retryAttempts
              })
              retryResult.retriedOrders += 1

              this.log.info('[重试成功] 订单重试成功', {
                orderNumber,
                attempt,
                cumulativeSuccesses: retryResult.successfulRetries,
                cumulativeRetried: retryResult.retriedOrders,
                deletedMaterials: retryDetail.materialsDeleted,
                elapsedMs: Date.now() - retryLoopStartTime
              })
              break
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown error'
              const attemptElapsed = Date.now() - attemptStartTime

              this.log.warn('[重试失败] 当前重试尝试失败', {
                orderNumber,
                attempt,
                maxRetries: CleanerRetryHandler.MAX_RETRIES,
                error: message,
                elapsedMs: attemptElapsed,
                remainingAttempts: CleanerRetryHandler.MAX_RETRIES - attempt
              })

              retryAttempts.push({
                attempt,
                error: message,
                timestamp: Date.now()
              })

              if (attempt === CleanerRetryHandler.MAX_RETRIES) {
                this.log.error('[重试彻底失败] 所有重试均已失败', {
                  orderNumber,
                  totalAttempts: CleanerRetryHandler.MAX_RETRIES,
                  errors: retryAttempts.map((retryAttempt) => retryAttempt.error),
                  elapsedMs: Date.now() - retryLoopStartTime,
                  finalOutcome: 'exhausted_all_retries',
                  successRate: `${((retryResult.successfulRetries / (detailIndex + 1)) * 100).toFixed(1)}%`
                })

                retryResult.updatedDetails.push({
                  ...failedDetail,
                  retryCount: CleanerRetryHandler.MAX_RETRIES,
                  retryAttempts,
                  retriedAt: Date.now(),
                  retrySuccess: false
                })
                retryResult.retriedOrders += 1
              }
            }
          }
        }

        const totalRetryTime = Date.now() - retryStartTime
        const finalSuccessRate =
          failedDetails.length > 0
            ? `${((retryResult.successfulRetries / failedDetails.length) * 100).toFixed(1)}%`
            : 'N/A'
        const avgTimePerRetry = totalRetryTime / (failedDetails.length || 1)

        this.log.info('[重试机制完成] 所有重试订单处理完毕', {
          totalRetryOrders: failedDetails.length,
          successfulRetries: retryResult.successfulRetries,
          failedRetries: failedDetails.length - retryResult.successfulRetries,
          successRate: finalSuccessRate,
          totalElapsedTimeMs: totalRetryTime,
          avgTimePerRetry,
          isSlow: totalRetryTime > 30000
        })

        return retryResult
      },
      {
        operationName: 'retry-failed-orders',
        message: 'Retry failed orders',
        slowThresholdMs: 5000,
        context: {
          totalRetryOrders: failedDetails.length,
          dryRun
        }
      }
    )

    return trackedResult.result
  }
}
