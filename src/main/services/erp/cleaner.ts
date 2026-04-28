import { ERP_LOCATORS } from './locators'
import { ErpAuthService } from './erp-auth'
import { DeletionErrorCategory, DeletionOutcome } from '../../types/cleaner.types'
import type { CleanerInput, CleanerResult, OrderCleanDetail } from '../../types/cleaner.types'
import type { ErpSession } from '../../types/erp.types'
import type { BrowserContext, FrameLocator, Locator, Page } from 'playwright'
import { createLogger, run, trackDuration } from '../logger'
import { capturePageContext } from './erp-error-context'
import { capturePageState } from './page-state'
import { AsyncMutex, ConcurrencyTracker } from './cleaner/concurrency'
import { evaluateDeletionSignals as evaluateDeletionSignalsHelper } from './cleaner/deletion-signals'
import { MaterialDeletionVerifier } from './cleaner/material-deletion-verifier'
import { getSkipReason, shouldDeleteMaterial } from './cleaner/rules'
import {
  clampNumber,
  createBatches,
  delay,
  getMissingOrders,
  runWithConcurrency
} from './cleaner/utils'
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

  constructor(authService: ErpAuthService, options: CleanerOptions = {}) {
    this.authService = authService
    this.dryRun = options.dryRun ?? false
    this.deletionVerifier = new MaterialDeletionVerifier(log)
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
    const { page, mainFrame } = session
    const navStartTime = Date.now()

    log.info('开始导航到清理页面', {
      sessionAvailable: !!session,
      hasPage: !!page,
      hasMainFrame: !!mainFrame
    })

    // Step 1: Click menu icon
    log.debug('[导航 Step 1] 准备点击菜单图标')
    await mainFrame.locator('i').first().click()
    log.debug('[导航 Step 1 完成] 菜单图标已点击', { elapsedMs: Date.now() - navStartTime })

    // Step 2: Wait for popup and click menu item
    log.debug('[导航 Step 2] 等待弹出窗口并点击菜单项')
    const popupPromise = page.waitForEvent('popup')
    await mainFrame.getByTitle('离散生产订单维护', { exact: true }).first().click()
    const popupPage = await popupPromise
    log.debug('[导航 Step 2 完成] 弹出窗口已打开', {
      elapsedMs: Date.now() - navStartTime,
      popupOpened: !!popupPage
    })
    await this.logPageStateSnapshot(popupPage, 'nav.popup_opened', {
      level: 'info',
      elapsedMs: Date.now() - navStartTime
    })

    // Step 3: Get forward frame
    log.debug('[导航 Step 3] 获取 forwardFrame 框架')
    const forwardFrameLocator = popupPage.locator('#forwardFrame')
    const fFrame = forwardFrameLocator.contentFrame()
    log.debug('[导航 Step 3 完成] forwardFrame 已获取', {
      elapsedMs: Date.now() - navStartTime,
      frameExists: !!fFrame
    })

    if (!fFrame) {
      log.error('[导航失败] forwardFrame 为空', {
        elapsedMs: Date.now() - navStartTime,
        pageUrl: popupPage.url(),
        contextData: await capturePageContext(
          popupPage,
          undefined,
          'nav.forwardFrame',
          undefined,
          undefined,
          'nav_forward_frame'
        )
      })
      throw new Error('无法访问弹出窗口的 forwardFrame')
    }

    // Step 4: Get inner work frame
    log.debug('[导航 Step 4] 等待并获取 mainiframe 内部框架', { timeout: 30000 })
    const innerFrameLocator = fFrame.locator('#mainiframe')
    await innerFrameLocator.waitFor({ state: 'visible', timeout: 30000 })
    const workFrame = innerFrameLocator.contentFrame()
    log.debug('[导航 Step 4 完成] 内部工作框架已获取', {
      elapsedMs: Date.now() - navStartTime,
      frameExists: !!workFrame
    })

    if (!workFrame) {
      log.error('[导航失败] workFrame 为空', {
        elapsedMs: Date.now() - navStartTime,
        pageUrl: popupPage.url(),
        contextData: await capturePageContext(
          popupPage,
          undefined,
          'nav.workFrame',
          undefined,
          undefined,
          'nav_work_frame'
        )
      })
      throw new Error('无法访问内部工作框架')
    }

    // Step 5: Wait for page ready
    log.debug('[导航 Step 5] 等待页面就绪标志', { selector: '#hot-key-head_list', timeout: 30000 })
    await workFrame.locator('#hot-key-head_list').waitFor({ state: 'visible', timeout: 30000 })
    const totalNavTime = Date.now() - navStartTime
    await this.logPageStateSnapshot(popupPage, 'nav.cleaner_page_ready', {
      level: 'info',
      elapsedMs: totalNavTime
    })
    log.info('[导航完成] 已导航到清理页面', {
      totalNavTimeMs: totalNavTime,
      isSlow: totalNavTime > 5000
    })

    return { popupPage, workFrame }
  }

  private async setupQueryInterface(innerFrame: FrameLocator, popupPage: Page): Promise<void> {
    const setupStartTime = Date.now()
    log.debug('[查询界面设置开始] 准备配置查询界面')
    await this.logPageStateSnapshot(popupPage, 'query.setup.start', {
      level: 'debug',
      elapsedMs: 0
    })

    // Step 1: Click search icon
    log.debug('[查询设置 Step 1] 点击搜索图标')
    await innerFrame.locator('.search-name-wrapper > .iconfont').click()
    log.debug('[查询设置 Step 1 完成] 搜索图标已点击', { elapsedMs: Date.now() - setupStartTime })

    // Step 2: Select order number query mode
    log.debug('[查询设置 Step 2] 选择订单号查询模式')
    await innerFrame.getByText('订单号查询').click()
    log.debug('[查询设置 Step 2 完成] 已切换到订单号查询', {
      elapsedMs: Date.now() - setupStartTime
    })

    // Step 3: Switch to "All" tab
    log.debug('[查询设置 Step 3] 切换到全部标签页')
    await innerFrame.getByRole('tab', { name: '全部' }).click()
    log.debug('[查询设置 Step 3 完成] 已全部标签页激活', { elapsedMs: Date.now() - setupStartTime })

    // Step 4: Set query limit to 5000
    log.debug('[查询设置 Step 4] 设置查询数量限制为 5000')
    const inputEl = innerFrame.locator('#rc_select_0')
    await inputEl.fill('5000')
    await inputEl.press('Enter')
    const totalSetupTime = Date.now() - setupStartTime
    await this.logPageStateSnapshot(popupPage, 'query.setup.ready', {
      level: 'info',
      elapsedMs: totalSetupTime
    })
    log.debug('[查询设置完成] 查询界面配置完毕', {
      totalSetupTimeMs: totalSetupTime,
      queryLimit: 5000,
      isSlow: totalSetupTime > 2000
    })
  }

  private async queryOrders(
    workFrame: FrameLocator,
    popupPage: Page,
    orderNumbers: string[]
  ): Promise<void> {
    const queryStartTime = Date.now()
    log.debug('[订单查询开始]', {
      orderCount: orderNumbers.length,
      orderNumbers: orderNumbers
        .slice(0, 5)
        .concat(orderNumbers.length > 5 ? [`... (${orderNumbers.length - 5} more)`] : []),
      isPreview: orderNumbers.length > 5
    })
    await this.logPageStateSnapshot(popupPage, 'query.before_submit', {
      level: 'debug',
      elapsedMs: 0
    })

    const textbox = workFrame.getByRole('textbox', { name: '生产订单号' })
    log.debug('[订单查询] 准备填入订单号')
    await textbox.fill(orderNumbers.join(','))
    log.debug('[订单查询] 订单号已填入', {
      elapsedMs: Date.now() - queryStartTime,
      charCount: orderNumbers.join(',').length
    })

    log.debug('[订单查询] 点击搜索按钮')
    await workFrame.locator('.search-component-searchBtn').click()
    log.info('[订单查询完成] 查询请求已发送', {
      elapsedMs: Date.now() - queryStartTime,
      orderCount: orderNumbers.length
    })
    await this.logPageStateSnapshot(popupPage, 'query.after_submit', {
      level: 'info',
      elapsedMs: Date.now() - queryStartTime
    })
  }

  private async collectQueryResultRows(
    workFrame: FrameLocator,
    popupPage: Page
  ): Promise<QueryResultRow[]> {
    const collectStartTime = Date.now()
    log.debug('[查询结果收集开始] 准备读取查询结果表格')

    const rows = workFrame.locator('tbody tr')
    const rowCount = await rows.count()
    log.debug('[查询结果收集] 检测到表格行数', { rowCount })

    const result: QueryResultRow[] = []
    let validOrderCount = 0
    let invalidOrderCount = 0

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const row = rows.nth(rowIndex)
      const orderNumber = await this.extractOrderNumberFromQueryRow(row)
      if (!this.isOrderNumber(orderNumber)) {
        invalidOrderCount++
        if (invalidOrderCount <= 3) {
          log.warn('[查询结果] 跳过无效订单号行', { rowIndex, extractedValue: orderNumber })
        }
        continue
      }
      validOrderCount++
      result.push({ rowIndex, orderNumber })
    }

    const totalCollectTime = Date.now() - collectStartTime
    await this.logPageStateSnapshot(popupPage, 'query.results.collected', {
      level: 'info',
      elapsedMs: totalCollectTime
    })
    log.info('[查询结果收集完成]', {
      totalRowsScanned: rowCount,
      validOrderCount,
      invalidOrderCount,
      elapsedMs: totalCollectTime,
      isSlow: totalCollectTime > 3000
    })

    return result
  }

  private async extractOrderNumberFromQueryRow(row: Locator): Promise<string> {
    try {
      const cell = row.locator('td[colkey="vbillcode"]')
      const codeLink = cell.locator('.code-detail-link').first()
      const linkCount = await codeLink.count()

      log.verbose('[提取订单号] 尝试从行提取订单号', {
        hasLink: linkCount > 0,
        extractionMethod: linkCount > 0 ? 'link' : 'cellText'
      })

      const rawValue = linkCount > 0 ? await codeLink.innerText() : await cell.innerText()
      const value = rawValue.trim()
      const match = value.match(/SC\d{14}/)
      const extracted = match ? match[0] : value

      log.verbose('[提取订单号完成]', {
        rawValue,
        extracted,
        matched: !!match
      })

      return extracted
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.warn('[提取订单号失败] 提取过程发生错误', {
        error: message,
        fallback: 'empty string'
      })
      return ''
    }
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
    const openStartTime = Date.now()
    const row = workFrame.locator('tbody tr').nth(rowIndex)
    await row.waitFor({ state: 'visible', timeout: 15000 })
    log.info('[NAV_EVENT] 准备从查询结果打开详情页', {
      step: 'detail.open.from_query_row',
      rowIndex,
      orderNumber: options?.orderNumber,
      orderIndex: options?.orderIndex,
      orderPosition: options?.orderPosition,
      workerId: options?.workerId
    })
    await this.logPageStateSnapshot(popupPage, 'detail.open.from_query_row.before_click', {
      level: 'debug',
      orderNumber: options?.orderNumber,
      orderIndex: options?.orderIndex,
      orderPosition: options?.orderPosition,
      workerId: options?.workerId,
      elapsedMs: Date.now() - openStartTime
    })

    const moreButton = row.locator('a.row-more').first()
    await moreButton.scrollIntoViewIfNeeded()

    const detailPagePromise = popupPage.waitForEvent('popup')
    await moreButton.click()
    await this.clickMaterialPlanMenu(workFrame, popupPage, options)

    const detailPage = await detailPagePromise
    log.info('[POPUP_EVENT] 详情页弹窗已创建', {
      step: 'detail.popup.opened',
      rowIndex,
      orderNumber: options?.orderNumber,
      orderIndex: options?.orderIndex,
      orderPosition: options?.orderPosition,
      workerId: options?.workerId,
      popupUrl: detailPage.url(),
      elapsedMs: Date.now() - openStartTime
    })
    await this.logPageStateSnapshot(detailPage, 'detail.popup.opened', {
      level: 'info',
      orderNumber: options?.orderNumber,
      orderIndex: options?.orderIndex,
      orderPosition: options?.orderPosition,
      workerId: options?.workerId,
      elapsedMs: Date.now() - openStartTime
    })
    return detailPage
  }

  private async openDetailPageFromCurrentQuery(
    workFrame: FrameLocator,
    popupPage: Page,
    orderNumber?: string
  ): Promise<Page> {
    const openStartTime = Date.now()
    const firstRow = workFrame.locator('tbody tr').first()
    await firstRow.waitFor({ state: 'visible', timeout: 10000 })
    log.info('[NAV_EVENT] 准备从当前查询结果打开详情页', {
      step: 'detail.open.from_current_query',
      orderNumber
    })
    await this.logPageStateSnapshot(popupPage, 'detail.open.from_current_query.before_click', {
      level: 'debug',
      orderNumber,
      elapsedMs: Date.now() - openStartTime
    })

    const moreButton = firstRow.locator('a.row-more').first()
    const detailPagePromise = popupPage.waitForEvent('popup')
    await moreButton.click()
    await this.clickMaterialPlanMenu(workFrame, popupPage, { orderNumber })

    const detailPage = await detailPagePromise
    log.info('[POPUP_EVENT] 详情页弹窗已创建', {
      step: 'detail.popup.opened.retry',
      orderNumber,
      popupUrl: detailPage.url(),
      elapsedMs: Date.now() - openStartTime
    })
    await this.logPageStateSnapshot(detailPage, 'detail.popup.opened.retry', {
      level: 'info',
      orderNumber,
      elapsedMs: Date.now() - openStartTime
    })
    return detailPage
  }

  private async clickMaterialPlanMenu(
    workFrame: FrameLocator,
    popupPage: Page,
    options?: {
      orderNumber?: string
      orderIndex?: number
      orderPosition?: string
      workerId?: number
    }
  ): Promise<void> {
    const candidates = [
      workFrame.locator('li:visible, a:visible, span:visible, div:visible').filter({
        hasText: /^备料计划$/
      }),
      workFrame.getByRole('menuitem', { name: '备料计划' }),
      workFrame.getByText('备料计划', { exact: true }),
      workFrame.getByText('备料计划')
    ]

    for (const candidate of candidates) {
      const target = candidate.last()
      try {
        await target.waitFor({ state: 'visible', timeout: 2000 })
        log.info('[NAV_EVENT] 点击备料计划菜单', {
          step: 'detail.menu.material_plan',
          orderNumber: options?.orderNumber,
          orderIndex: options?.orderIndex,
          orderPosition: options?.orderPosition,
          workerId: options?.workerId
        })
        await target.click()
        await this.logPageStateSnapshot(popupPage, 'detail.menu.material_plan.clicked', {
          level: 'debug',
          orderNumber: options?.orderNumber,
          orderIndex: options?.orderIndex,
          orderPosition: options?.orderPosition,
          workerId: options?.workerId
        })
        return
      } catch {
        // Try next locator candidate
      }
    }

    log.error('Failed to locate material plan menu item', {
      selectorsAttempted: candidates.length
    })
    throw new Error('无法定位”备料计划”菜单项（可能菜单结构已变化）')
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

  private async ensureNotRedirectedToLoginPage(
    page: Page,
    step: string,
    expectedOrderNumber: string | undefined,
    progressState: ProgressState,
    elapsedMs: number
  ): Promise<void> {
    const pageState = await capturePageState(page, this.getBrowserContext(), {
      includeFrameHierarchy: true,
      includeBodyTextPreview: true
    })

    if (!pageState.isCasLoginRedirect && pageState.pageKind !== 'login') {
      return
    }

    log.error('[SESSION_LOST] 会话跳转到 CAS 登录页', {
      step,
      orderNumber: expectedOrderNumber,
      orderIndex: progressState.ordersStarted,
      orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
      elapsedMs,
      detectedBy: pageState.isCasLoginRedirect ? 'url_match' : 'login_form_detected',
      ...pageState
    })

    throw new Error('ERP 会话已跳转到登录页')
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
    const { detailPage, deleteSet, dryRun, progressState, expectedOrderNumber, onProgress } = params
    const processStartTime = Date.now()

    log.info('[ORDER_START] 开始处理订单', {
      orderIndex: progressState.ordersStarted,
      orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
      orderNumber: expectedOrderNumber,
      phase: 'starting',
      elapsedMs: Date.now() - processStartTime
    })

    log.info('[订单详情处理开始]', {
      expectedOrderNumber,
      dryRun,
      deleteSetSize: deleteSet.size,
      ordersStarted: progressState.ordersStarted,
      ordersCompleted: progressState.ordersCompleted,
      totalOrders: progressState.totalOrders
    })

    let detailCount = 0
    const detail: OrderCleanDetail = {
      orderNumber: expectedOrderNumber || 'UNKNOWN',
      materialsDeleted: 0,
      materialsSkipped: 0,
      errors: [],
      skippedMaterials: [],
      deletedMaterials: [],
      retryCount: 0,
      retryAttempts: [],
      retriedAt: undefined,
      retrySuccess: false,
      materialsFailed: 0,
      failedMaterials: [],
      uncertainDeletions: 0
    }

    try {
      await this.logPageStateSnapshot(detailPage, 'detail.page.opened', {
        level: 'debug',
        orderNumber: expectedOrderNumber,
        orderIndex: progressState.ordersStarted,
        orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
        elapsedMs: Date.now() - processStartTime
      })

      // Step 1: Access forward frame
      log.debug('[详情页面 Step 1] 准备访问 forwardFrame')
      await this.ensureNotRedirectedToLoginPage(
        detailPage,
        'detail.step1.forwardFrame',
        expectedOrderNumber,
        progressState,
        Date.now() - processStartTime
      )
      const detailMainFrame = detailPage.locator('#forwardFrame')
      const dFrame = await detailMainFrame.contentFrame()

      if (!dFrame) {
        const pageState = await this.logPageStateSnapshot(detailPage, 'detail.step1.forwardFrame', {
          level: 'error',
          orderNumber: expectedOrderNumber,
          orderIndex: progressState.ordersStarted,
          orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
          elapsedMs: Date.now() - processStartTime,
          includeFrameHierarchy: true,
          includeBodyTextPreview: true
        })
        const errorMsg = '无法访问详情页面的 forwardFrame'
        log.error('[DETAIL_PAGE_INVALID] 详情页未建立', {
          failureKind: 'forward_frame_missing',
          ...pageState,
          contextData: await capturePageContext(
            detailPage,
            undefined,
            'processDetail.forwardFrame',
            expectedOrderNumber,
            undefined,
            'process_detail_forward_frame'
          )
        })
        throw new Error(errorMsg)
      }
      log.debug('[详情页面 Step 1 完成] forwardFrame 已获取', {
        elapsedMs: Date.now() - processStartTime
      })

      // Step 2: Access inner frame
      log.debug('[详情页面 Step 2] 等待并获取 mainiframe 内部框架', { timeout: 30000 })
      await this.ensureNotRedirectedToLoginPage(
        detailPage,
        'detail.step2.mainiframe',
        expectedOrderNumber,
        progressState,
        Date.now() - processStartTime
      )
      const detailInnerLocator = dFrame.locator('#mainiframe')
      try {
        await detailInnerLocator.waitFor({ state: 'visible', timeout: 30000 })
      } catch (error) {
        const pageState = await this.logPageStateSnapshot(detailPage, 'detail.step2.mainiframe', {
          level: 'error',
          orderNumber: expectedOrderNumber,
          orderIndex: progressState.ordersStarted,
          orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
          elapsedMs: Date.now() - processStartTime,
          includeFrameHierarchy: true,
          includeBodyTextPreview: true
        })
        log.error('[DETAIL_PAGE_TIMEOUT] 详情页等待超时', {
          failureKind: pageState.isCasLoginRedirect ? 'redirected_to_cas' : 'mainiframe_missing',
          ...pageState,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      }
      const detailInnerFrame = await detailInnerLocator.contentFrame()

      if (!detailInnerFrame) {
        const pageState = await this.logPageStateSnapshot(
          detailPage,
          'detail.step2.detailInnerFrame',
          {
            level: 'error',
            orderNumber: expectedOrderNumber,
            orderIndex: progressState.ordersStarted,
            orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
            elapsedMs: Date.now() - processStartTime,
            includeFrameHierarchy: true,
            includeBodyTextPreview: true
          }
        )
        const errorMsg = '无法访问详情页面的内部框架'
        log.error('[DETAIL_PAGE_INVALID] 详情页未建立', {
          failureKind: 'mainiframe_missing',
          ...pageState,
          contextData: await capturePageContext(
            detailPage,
            undefined,
            'processDetail.detailInnerFrame',
            expectedOrderNumber,
            undefined,
            'process_detail_inner_frame'
          )
        })
        throw new Error(errorMsg)
      }
      log.debug('[详情页面 Step 2 完成] 内部框架已获取', {
        elapsedMs: Date.now() - processStartTime
      })

      // Step 3: Wait for page header
      log.debug('[详情页面 Step 3] 等待页面标题显示', {
        selector: '离散备料计划维护',
        timeout: 30000
      })
      await this.ensureNotRedirectedToLoginPage(
        detailPage,
        'detail.step3.header',
        expectedOrderNumber,
        progressState,
        Date.now() - processStartTime
      )
      try {
        await detailInnerFrame.getByText(/^离散备料计划维护：/).waitFor({
          state: 'visible',
          timeout: 30000
        })
      } catch (error) {
        const pageState = await this.logPageStateSnapshot(detailPage, 'detail.step3.header', {
          level: 'error',
          orderNumber: expectedOrderNumber,
          orderIndex: progressState.ordersStarted,
          orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
          elapsedMs: Date.now() - processStartTime,
          includeFrameHierarchy: true,
          includeBodyTextPreview: true
        })
        log.error('[DETAIL_PAGE_TIMEOUT] 详情页等待超时', {
          failureKind: pageState.isCasLoginRedirect ? 'redirected_to_cas' : 'detail_header_missing',
          expectedMarker: '离散备料计划维护：',
          ...pageState,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      }
      log.debug('[详情页面 Step 3 完成] 页面标题已显示', {
        elapsedMs: Date.now() - processStartTime
      })

      // Step 4: Extract order number
      log.debug('[详情页面 Step 4] 提取源订单号')
      const sourceOrderNumber = await this.extractSourceOrderNumber(detailInnerFrame)
      const orderNumber = sourceOrderNumber || expectedOrderNumber || 'UNKNOWN_ORDER'
      log.debug('[详情页面 Step 4 完成] 订单号已确认', {
        extractedOrderNumber: orderNumber,
        sourceOrderNumber,
        usedFallback: !sourceOrderNumber && !!expectedOrderNumber
      })

      // 更新 orderNumber 为实际提取的值或 fallback
      detail.orderNumber = orderNumber

      // Step 5: Get material counts and status
      log.debug('[详情页面 Step 5] 读取物料数量和状态')
      const detailCountText = await detailInnerFrame.getByText(/^详细信息 \(\d+\)$/).innerText()
      const detailCountMatch = detailCountText.match(/\((\d+)\)/)
      const detailCount = detailCountMatch ? parseInt(detailCountMatch[1], 10) : 0

      const statusText = await detailInnerFrame.getByText(/^备料状态:.+$/).innerText()
      const statusMatch = statusText.replace(/\n/g, '').match(/备料状态:(.+)$/)
      const detailStatus = statusMatch ? statusMatch[1].trim() : ''

      log.info('[详情页面] 订单状态已读取', {
        orderNumber,
        detailStatus,
        totalMaterials: detailCount,
        elapsedMs: Date.now() - processStartTime
      })

      onProgress?.(
        `开始处理订单：${orderNumber}`,
        this.calculateProgress(
          progressState.ordersStarted,
          0,
          detailCount,
          progressState.totalOrders
        ),
        {
          currentOrderIndex: progressState.ordersStarted + 1,
          totalOrders: progressState.totalOrders,
          currentMaterialIndex: 0,
          totalMaterialsInOrder: detailCount,
          currentOrderNumber: orderNumber
        }
      )

      // Step 6: Process materials if status is "审批通过"
      if (detailStatus === '审批通过' && detailCount > 0) {
        log.debug('[详情页面 Step 6] 订单状态为"审批通过"，开始修改流程', {
          materialCount: detailCount
        })
        await detailInnerFrame.getByRole('button', { name: '修改' }).click()
        log.debug('[详情页面 Step 6.1] 已点击"修改"按钮', {
          elapsedMs: Date.now() - processStartTime
        })

        const saveButtonLocator = detailInnerFrame.getByRole('button', { name: '保存' })
        await saveButtonLocator.waitFor({ state: 'visible', timeout: 30000 })
        log.debug('[详情页面 Step 6.2] "保存"按钮已就绪', {
          elapsedMs: Date.now() - processStartTime
        })

        await detailInnerFrame.getByText('展开').first().click()
        log.debug('[详情页面 Step 6.3] 已展开明细卡片', {
          elapsedMs: Date.now() - processStartTime
        })

        const childForm = detailInnerFrame.locator('.card-table-side-box')
        const buttonWrapper = childForm.locator('.button-wrapper')
        const deleteRowBtn = buttonWrapper.getByRole('button', { name: '删行' })
        const nextBtn = buttonWrapper.locator('.icon-jiantouyou')
        const collapseBtn = buttonWrapper.locator('.icon-celashouqi')

        let lastRowNumber = ''
        let materialIdx = 0
        const processingStartTime = Date.now()

        log.info('[物料循环开始] 准备遍历物料明细', {
          orderNumber,
          totalMaterials: detailCount,
          deleteSetSize: deleteSet.size
        })

        while (true) {
          materialIdx += 1
          const materialStartTime = Date.now()

          const currentRow = await this.getInputValue(childForm, /^行号$/)
          const rowNumInt = parseInt(currentRow, 10)

          if (currentRow === lastRowNumber) {
            log.debug('[物料循环] 检测到重复行号，等待 500ms', {
              orderNumber,
              materialIdx,
              rowNumber: currentRow,
              elapsedMs: Date.now() - processingStartTime
            })
            await this.delay(500)
          }

          const materialCode = await this.getInputValue(childForm, /^材料编码/)
          const materialName = await this.getInputValue(childForm, /^材料名称/)
          const pendingQty = await this.getInputValue(childForm, /^累计待发数量$/)

          const progress = this.calculateProgress(
            progressState.ordersStarted,
            materialIdx,
            detailCount,
            progressState.totalOrders
          )

          onProgress?.(
            `订单 ${orderNumber} - 物料 ${materialIdx}/${detailCount}: ${materialName}`,
            progress,
            {
              currentOrderIndex: progressState.ordersStarted + 1,
              totalOrders: progressState.totalOrders,
              currentMaterialIndex: materialIdx,
              totalMaterialsInOrder: detailCount,
              currentOrderNumber: orderNumber
            }
          )

          if (deleteSet.has(materialCode)) {
            log.debug('[物料判断] 物料在删除清单中，进行评估', {
              orderNumber,
              materialIdx,
              materialCode,
              materialName,
              rowNumber: rowNumInt,
              pendingQty: pendingQty || '(empty)',
              deleteSetSize: deleteSet.size
            })

            const shouldDelete = this.shouldDeleteMaterial({
              rowNumber: rowNumInt,
              pendingQty,
              materialCode,
              deleteSet
            })

            if (shouldDelete) {
              if (dryRun) {
                detail.materialsDeleted += 1
                detail.deletedMaterials.push({
                  materialCode,
                  materialName,
                  rowNumber: rowNumInt,
                  outcome: 'dry_run'
                })
                log.info('[物料操作预演] 符合删除条件，dry-run 模式不执行删除', {
                  orderNumber,
                  materialIdx,
                  materialCode,
                  materialName,
                  rowNumber: currentRow
                })
                continue
              }

              log.info('[物料操作] 执行删除操作（多信号验证）', {
                orderNumber,
                materialIdx,
                materialCode,
                materialName,
                rowNumber: currentRow,
                materialCount: detailCount,
                dryRun: false
              })

              const currentMaterialCount =
                await this.deletionVerifier.readMaterialCount(detailInnerFrame)
              const deleteResult = await this.deletionVerifier.deleteWithVerification({
                childForm,
                detailInnerFrame,
                deleteRowBtn,
                materialCode,
                materialName,
                currentRowNumber: currentRow,
                materialCountBefore: currentMaterialCount ?? detailCount
              })

              const deleteElapsed = Date.now() - materialStartTime

              if (
                deleteResult.outcome === DeletionOutcome.Success ||
                deleteResult.outcome === DeletionOutcome.Uncertain
              ) {
                detail.materialsDeleted += 1
                detail.deletedMaterials.push({
                  materialCode,
                  materialName,
                  rowNumber: rowNumInt,
                  outcome: deleteResult.outcome
                })
                if (deleteResult.outcome === DeletionOutcome.Uncertain) {
                  detail.uncertainDeletions += 1
                }
                log.info('[物料操作完成] 物料删除结果', {
                  orderNumber,
                  materialCode,
                  outcome: deleteResult.outcome,
                  attempts: deleteResult.attempts.length,
                  elapsedMs: deleteElapsed
                })
              } else {
                detail.materialsFailed += 1
                detail.failedMaterials.push({
                  materialCode,
                  materialName,
                  rowNumber: rowNumInt,
                  attempts: deleteResult.attempts,
                  finalOutcome: deleteResult.outcome,
                  finalErrorCategory: deleteResult.errorCategory
                })
                log.error('[物料操作失败] 物料删除失败', {
                  orderNumber,
                  materialCode,
                  outcome: deleteResult.outcome,
                  errorCategory: deleteResult.errorCategory,
                  errorMessage: deleteResult.errorMessage,
                  attempts: deleteResult.attempts.length,
                  elapsedMs: deleteElapsed
                })
              }
              continue
            }

            if (!shouldDelete) {
              detail.materialsSkipped += 1
              const reason = this.getSkipReason({
                rowNumber: rowNumInt,
                pendingQty,
                materialCode,
                deleteSet
              })
              log.debug('[物料跳过] 物料不满足删除条件', {
                orderNumber,
                materialIdx,
                materialCode,
                materialName,
                rowNumber: rowNumInt,
                reason,
                elapsedMs: Date.now() - materialStartTime
              })
              detail.skippedMaterials.push({
                materialCode,
                materialName,
                rowNumber: rowNumInt,
                reason
              })
            }
          } else {
            // 物料不在删除清单中，记录为 skipped
            detail.materialsSkipped += 1
            detail.skippedMaterials.push({
              materialCode,
              materialName,
              rowNumber: rowNumInt,
              reason: '不在删除清单中'
            })
            log.verbose('[物料跳过] 物料不在删除清单中', {
              orderNumber,
              materialIdx,
              materialCode,
              materialName,
              rowNumber: rowNumInt
            })
          }

          const isNextEnabled = await this.isButtonEnabled(nextBtn)
          if (isNextEnabled) {
            lastRowNumber = currentRow
            log.verbose('[物料循环] 点击"下一行"按钮', {
              orderNumber,
              materialIdx,
              currentRow,
              hasNext: true
            })
            await nextBtn.click()
          } else {
            log.info('[物料循环结束] 已到达最后一行', {
              orderNumber,
              totalMaterials: materialIdx,
              deleted: detail.materialsDeleted,
              skipped: detail.materialsSkipped,
              elapsedMs: Date.now() - processingStartTime
            })
            break
          }
        }

        log.debug('[详情页面 Step 7] 折叠明细卡片')
        await collapseBtn.click()

        if (!dryRun && detail.materialsDeleted > 0) {
          log.info('[详情页面 Step 8] 保存订单修改', {
            orderNumber,
            materialsDeleted: detail.materialsDeleted,
            materialsSkipped: detail.materialsSkipped
          })
          await saveButtonLocator.click()
          await saveButtonLocator.waitFor({ state: 'hidden', timeout: 60000 })
          log.info('[详情页面保存完成] 订单修改已保存', {
            orderNumber,
            materialsDeleted: detail.materialsDeleted,
            elapsedMs: Date.now() - processStartTime
          })
        } else if (dryRun) {
          log.info('[详情页面干运行] 模拟模式下不保存修改', {
            orderNumber,
            wouldDeleteMaterials: detail.materialsDeleted
          })
        }
      } else {
        log.info('[详情页面跳过] 订单状态不是"审批通过"或无物料', {
          orderNumber,
          detailStatus,
          detailCount,
          reason: detailStatus !== '审批通过' ? '状态不符' : '无物料明细'
        })
      }

      const totalProcessTime = Date.now() - processStartTime
      log.info('[详情页面处理完成]', {
        orderNumber,
        totalMaterials: detailCount,
        deleted: detail.materialsDeleted,
        skipped: detail.materialsSkipped,
        elapsedMs: totalProcessTime,
        isSlow: totalProcessTime > 30000,
        dryRun
      })

      return detail
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('[详情页面处理失败]', {
        orderNumber: expectedOrderNumber || 'UNKNOWN',
        error: message,
        elapsedMs: Date.now() - processStartTime,
        contextData: await capturePageContext(
          detailPage,
          undefined,
          'processDetail.error',
          expectedOrderNumber,
          undefined,
          'process_detail_error'
        )
      })
      throw error
    } finally {
      const totalOrderTime = Date.now() - processStartTime
      log.info('[ORDER_COMPLETE] 订单处理完成', {
        orderIndex: progressState.ordersStarted,
        orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
        ordersCompleted: progressState.ordersCompleted,
        orderNumber: expectedOrderNumber || 'UNKNOWN',
        totalMaterials: detailCount,
        deleted: detail?.materialsDeleted ?? 0,
        skipped: detail?.materialsSkipped ?? 0,
        failed: detail?.materialsFailed ?? 0,
        totalOrderTimeMs: totalOrderTime,
        isSlow: totalOrderTime > 30000
      })

      log.debug('[详情页面清理] 准备关闭详情页面', { pageUrl: detailPage.url() })
      await detailPage.close()
      log.debug('[详情页面清理完成] 详情页已关闭')
    }
  }

  private calculateProgress(
    completedOrders: number,
    materialIdx: number,
    detailCount: number,
    totalOrders: number
  ): number {
    const materialRatio = detailCount > 0 ? materialIdx / detailCount : 0
    return ((1 + completedOrders + materialRatio) / (1 + totalOrders)) * 100
  }

  private async extractSourceOrderNumber(frame: FrameLocator): Promise<string> {
    try {
      const sourceOrder = await frame
        .locator('.vsourcebillcode .code-detail-link')
        .first()
        .innerText()
      const match = sourceOrder.match(/SC\d{14}/)
      return match ? match[0] : sourceOrder.trim()
    } catch {
      return ''
    }
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
    const loadingLocator = frame
      .locator('div')
      .filter({ hasText: ERP_LOCATORS.extractor.loadingText })
      .nth(1)

    try {
      await loadingLocator.waitFor({ state: 'visible', timeout: 3000 })
      await loadingLocator.waitFor({ state: 'hidden', timeout: 60000 })
    } catch {
      // Loading completed quickly or never appeared
    }
  }

  private async getInputValue(
    container: FrameLocator | Locator,
    labelRegex: RegExp
  ): Promise<string> {
    try {
      return await container
        .locator('div')
        .filter({ hasText: labelRegex })
        .locator('input')
        .first()
        .inputValue()
    } catch {
      return ''
    }
  }

  private async isButtonEnabled(button: Locator): Promise<boolean> {
    try {
      return await button.isEnabled()
    } catch {
      return false
    }
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

  private delay(ms: number): Promise<void> {
    return delay(ms)
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
    const { workFrame, popupPage, failedDetails, deleteSet, dryRun, onProgress } = params

    const result: RetryResult = {
      retriedOrders: 0,
      successfulRetries: 0,
      updatedDetails: []
    }

    if (failedDetails.length === 0) {
      log.info('[重试机制] 没有需要重试的订单', { checkedCount: failedDetails.length })
      return result
    }

    const retryStartTime = Date.now()
    log.info('[重试机制开始] 准备重试失败的订单', {
      totalFailures: failedDetails.length,
      failedOrders: failedDetails
        .map((d) => d.orderNumber)
        .slice(0, 5)
        .concat(failedDetails.length > 5 ? [`... (${failedDetails.length - 5} more)`] : [])
    })

    const MAX_RETRIES = 2

    // Track overall retry process duration
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
          const retryAttempts: import('../../types/cleaner.types').RetryAttempt[] = []
          const retryLoopStartTime = Date.now()

          log.info('[重试订单] 开始处理失败订单的重试', {
            orderNumber,
            failureReason: failedDetail.errors.join('; '),
            index: detailIndex + 1,
            total: failedDetails.length
          })

          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const attemptStartTime = Date.now()
            log.info('[重试尝试] 开始第 {attempt} 次重试', {
              orderNumber,
              attempt,
              maxRetries: MAX_RETRIES,
              elapsedMs: attemptStartTime - retryLoopStartTime,
              interpolatedAttempt: attempt
            })

            try {
              // Step 1: Re-query order
              log.debug('[重试查询] 重新查询订单', { orderNumber, attempt })
              await this.queryOrders(workFrame, popupPage, [orderNumber])
              await this.waitForLoading(workFrame)
              log.debug('[重试查询完成] 查询加载完成', {
                orderNumber,
                attempt,
                elapsedMs: Date.now() - attemptStartTime
              })

              // Step 2: Check query results
              const rows = workFrame.locator('tbody tr')
              const rowCount = await rows.count()
              if (rowCount === 0) {
                const errorMsg = '订单重试查询无结果'
                log.error('[重试失败] 重试查询返回空结果', {
                  orderNumber,
                  attempt,
                  rowCount,
                  elapsedMs: Date.now() - attemptStartTime
                })
                throw new Error(errorMsg)
              }
              log.debug('[重试查询] 查询到 {rowCount} 行结果', { orderNumber, attempt, rowCount })

              // Step 3: Open detail page
              log.debug('[重试详情] 打开订单详情页', { orderNumber, attempt })
              const detailPage = await this.openDetailPageFromCurrentQuery(
                workFrame,
                popupPage,
                orderNumber
              )
              log.debug('[重试详情] 详情页已打开', {
                orderNumber,
                attempt,
                elapsedMs: Date.now() - attemptStartTime
              })

              // Step 4: Process detail page
              log.debug('[重试处理] 开始处理详情页', { orderNumber, attempt })
              const retryDetail = await this.processDetailPage({
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
                    `[重试 ${attempt}/${MAX_RETRIES}] ${message}`,
                    progress,
                    extra ? { ...extra, phase: 'processing' as const } : undefined
                  )
                }
              })
              log.info('[重试处理完成] 详情页处理完毕', {
                orderNumber,
                attempt,
                deleted: retryDetail.materialsDeleted,
                skipped: retryDetail.materialsSkipped,
                elapsedMs: Date.now() - attemptStartTime
              })

              // Success - update counters
              retryResult.successfulRetries += 1
              retryResult.updatedDetails.push({
                ...retryDetail,
                retryCount: attempt,
                retriedAt: Date.now(),
                retrySuccess: true,
                retryAttempts
              })
              retryResult.retriedOrders += 1

              log.info('[重试成功] 订单重试成功', {
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

              log.warn('[重试失败] 当前重试尝试失败', {
                orderNumber,
                attempt,
                maxRetries: MAX_RETRIES,
                error: message,
                elapsedMs: attemptElapsed,
                remainingAttempts: MAX_RETRIES - attempt
              })

              retryAttempts.push({
                attempt,
                error: message,
                timestamp: Date.now()
              })

              if (attempt === MAX_RETRIES) {
                log.error('[重试彻底失败] 所有重试均已失败', {
                  orderNumber,
                  totalAttempts: MAX_RETRIES,
                  errors: retryAttempts.map((a) => a.error),
                  elapsedMs: Date.now() - retryLoopStartTime,
                  finalOutcome: 'exhausted_all_retries',
                  successRate: `${((retryResult.successfulRetries / (detailIndex + 1)) * 100).toFixed(1)}%`
                })

                retryResult.updatedDetails.push({
                  ...failedDetail,
                  retryCount: MAX_RETRIES,
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
            ? ((retryResult.successfulRetries / failedDetails.length) * 100).toFixed(1) + '%'
            : 'N/A'
        const avgTimePerRetry = totalRetryTime / (failedDetails.length || 1)

        log.info('[重试机制完成] 所有重试订单处理完毕', {
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
