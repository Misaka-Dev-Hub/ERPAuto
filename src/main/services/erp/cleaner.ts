import { ERP_LOCATORS } from './locators'
import { ErpAuthService } from './erp-auth'
import type { CleanerInput, CleanerResult, OrderCleanDetail } from '../../types/cleaner.types'
import type { ErpSession } from '../../types/erp.types'
import type { FrameLocator, Locator, Page } from 'playwright'
import { createLogger, run, trackDuration } from '../logger'
import { capturePageContext } from './erp-error-context'

const log = createLogger('CleanerService')

const DEFAULT_QUERY_BATCH_SIZE = 100
const MAX_QUERY_BATCH_SIZE = 100
const DEFAULT_PROCESS_CONCURRENCY = 1
const MAX_PROCESS_CONCURRENCY = 20

interface RetryResult {
  retriedOrders: number
  successfulRetries: number
  updatedDetails: OrderCleanDetail[]
}

interface ProgressState {
  completedOrders: number
  totalOrders: number
}

interface QueryResultRow {
  rowIndex: number
  orderNumber: string
}

class AsyncMutex {
  private queue: Promise<void> = Promise.resolve()

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    let release!: () => void
    const next = new Promise<void>((resolve) => {
      release = resolve
    })

    const previous = this.queue
    this.queue = this.queue.then(() => next)

    await previous
    try {
      return await task()
    } finally {
      release()
    }
  }
}

/**
 * Cleaner Service Options
 */
export interface CleanerOptions {
  dryRun?: boolean
  verbose?: boolean
}

/**
 * Material deletion check parameters
 */
export interface ShouldDeleteParams {
  rowNumber: number
  pendingQty: string
  materialCode: string
  deleteSet: Set<string>
}

function clampNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.trunc(value ?? fallback)))
}

export function createBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize))
  }
  return batches
}

export function getMissingOrders(inputOrders: string[], processedOrders: Set<string>): string[] {
  const uniqueInputOrders = Array.from(new Set(inputOrders))
  return uniqueInputOrders.filter((order) => !processedOrders.has(order))
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const limit = Math.max(1, Math.trunc(concurrency))
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = cursor
      cursor += 1
      if (current >= items.length) {
        return
      }
      results[current] = await worker(items[current], current)
    }
  })

  await Promise.all(runners)
  return results
}

/**
 * ERP Cleaner Service
 * Deletes specified materials from production orders in ERP system
 */
export class CleanerService {
  private authService: ErpAuthService
  private dryRun: boolean

  constructor(authService: ErpAuthService, options: CleanerOptions = {}) {
    this.authService = authService
    this.dryRun = options.dryRun ?? false
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
    const { rowNumber, pendingQty, materialCode, deleteSet } = params

    if (!deleteSet.has(materialCode)) {
      return false
    }

    if (rowNumber >= 2000 && rowNumber < 8000) {
      return false
    }

    if (pendingQty && pendingQty.trim() !== '') {
      return false
    }

    return true
  }

  getSkipReason(params: ShouldDeleteParams): string {
    const { rowNumber, pendingQty, materialCode, deleteSet } = params

    if (!deleteSet.has(materialCode)) {
      return '物料不在删除清单中'
    }
    if (rowNumber >= 2000 && rowNumber < 8000) {
      return '行号在 2000-7999 范围内（受保护）'
    }
    if (pendingQty && pendingQty.trim() !== '') {
      return '累计待发数量不为空'
    }
    return '未知原因'
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
      successfulRetries: 0
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

    log.info('Starting cleaner', {
      totalOrders,
      totalMaterials,
      dryRun,
      queryBatchSize,
      processConcurrency,
      orderNumbers: input.orderNumbers,
      materialCodes: input.materialCodes
    })

    const deleteSet = new Set(input.materialCodes)

    let popupPage: Page | null = null

    try {
      const session = this.authService.getSession()
      const navigation = await this.navigateToCleanerPage(session)
      popupPage = navigation.popupPage
      const { workFrame } = navigation

      await this.setupQueryInterface(workFrame)

      const orderBatches = createBatches(input.orderNumbers, queryBatchSize)
      const popupMutex = new AsyncMutex()
      const progressState: ProgressState = {
        completedOrders: 0,
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

        // Track batch processing duration with 5s slow threshold
        await trackDuration(
          async () => {
            await this.queryOrders(workFrame, batchOrders)
            await this.waitForLoading(workFrame)

            const queriedRows = await this.collectQueryResultRows(workFrame)
            const queriedOrderNumbersInBatch = new Set(queriedRows.map((row) => row.orderNumber))

            await runWithConcurrency(queriedRows, processConcurrency, async (row) => {
              const { rowIndex, orderNumber } = row
              const openedDetailPage = await popupMutex.runExclusive(async () => {
                return await this.openDetailPageFromRow(workFrame, popupPage!, rowIndex)
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
                progressState.completedOrders += 1
              }

              result.details.push(detail)

              if (detail.errors.length > 0) {
                result.errors.push(`Order ${detail.orderNumber}: ${detail.errors.join('; ')}`)
                return
              }

              result.ordersProcessed += 1
              result.materialsDeleted += detail.materialsDeleted
              result.materialsSkipped += detail.materialsSkipped
            })

            const missingOrders = getMissingOrders(batchOrders, queriedOrderNumbersInBatch)
            for (const missingOrder of missingOrders) {
              const missingMessage = '订单未出现在查询结果中'
              result.errors.push(`Order ${missingOrder}: ${missingMessage}`)
              result.details.push(this.createErrorDetail(missingOrder, missingMessage))
            }
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
        ...(popupPage ? await capturePageContext(popupPage, undefined, 'cleaner.outerCatch') : {})
      })
      result.errors.push(`Clean failed: ${message}`)
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
        contextData: await capturePageContext(popupPage, undefined, 'nav.forwardFrame')
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
        contextData: await capturePageContext(popupPage, undefined, 'nav.workFrame')
      })
      throw new Error('无法访问内部工作框架')
    }

    // Step 5: Wait for page ready
    log.debug('[导航 Step 5] 等待页面就绪标志', { selector: '#hot-key-head_list', timeout: 30000 })
    await workFrame.locator('#hot-key-head_list').waitFor({ state: 'visible', timeout: 30000 })
    const totalNavTime = Date.now() - navStartTime
    log.info('[导航完成] 已导航到清理页面', {
      totalNavTimeMs: totalNavTime,
      isSlow: totalNavTime > 5000
    })

    return { popupPage, workFrame }
  }

  private async setupQueryInterface(innerFrame: FrameLocator): Promise<void> {
    const setupStartTime = Date.now()
    log.debug('[查询界面设置开始] 准备配置查询界面')

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
    log.debug('[查询设置完成] 查询界面配置完毕', {
      totalSetupTimeMs: totalSetupTime,
      queryLimit: 5000,
      isSlow: totalSetupTime > 2000
    })
  }

  private async queryOrders(workFrame: FrameLocator, orderNumbers: string[]): Promise<void> {
    const queryStartTime = Date.now()
    log.debug('[订单查询开始]', {
      orderCount: orderNumbers.length,
      orderNumbers: orderNumbers
        .slice(0, 5)
        .concat(orderNumbers.length > 5 ? [`... (${orderNumbers.length - 5} more)`] : []),
      isPreview: orderNumbers.length > 5
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
  }

  private async collectQueryResultRows(workFrame: FrameLocator): Promise<QueryResultRow[]> {
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
    rowIndex: number
  ): Promise<Page> {
    const row = workFrame.locator('tbody tr').nth(rowIndex)
    await row.waitFor({ state: 'visible', timeout: 15000 })

    const moreButton = row.locator('a.row-more').first()
    await moreButton.scrollIntoViewIfNeeded()

    const detailPagePromise = popupPage.waitForEvent('popup')
    await moreButton.click()
    await this.clickMaterialPlanMenu(workFrame)

    return await detailPagePromise
  }

  private async openDetailPageFromCurrentQuery(
    workFrame: FrameLocator,
    popupPage: Page
  ): Promise<Page> {
    const firstRow = workFrame.locator('tbody tr').first()
    await firstRow.waitFor({ state: 'visible', timeout: 10000 })

    const moreButton = firstRow.locator('a.row-more').first()
    const detailPagePromise = popupPage.waitForEvent('popup')
    await moreButton.click()
    await this.clickMaterialPlanMenu(workFrame)

    return await detailPagePromise
  }

  private async clickMaterialPlanMenu(workFrame: FrameLocator): Promise<void> {
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
        await target.click()
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

    log.info('[订单详情处理开始]', {
      expectedOrderNumber,
      dryRun,
      deleteSetSize: deleteSet.size,
      completedOrders: progressState.completedOrders,
      totalOrders: progressState.totalOrders
    })

    try {
      // Step 1: Access forward frame
      log.debug('[详情页面 Step 1] 准备访问 forwardFrame')
      const detailMainFrame = detailPage.locator('#forwardFrame')
      const dFrame = await detailMainFrame.contentFrame()

      if (!dFrame) {
        const errorMsg = '无法访问详情页面的 forwardFrame'
        log.error('[详情页面失败] forwardFrame 访问失败', {
          elapsedMs: Date.now() - processStartTime,
          pageUrl: detailPage.url(),
          contextData: await capturePageContext(detailPage)
        })
        throw new Error(errorMsg)
      }
      log.debug('[详情页面 Step 1 完成] forwardFrame 已获取', {
        elapsedMs: Date.now() - processStartTime
      })

      // Step 2: Access inner frame
      log.debug('[详情页面 Step 2] 等待并获取 mainiframe 内部框架', { timeout: 30000 })
      const detailInnerLocator = dFrame.locator('#mainiframe')
      await detailInnerLocator.waitFor({ state: 'visible', timeout: 30000 })
      const detailInnerFrame = await detailInnerLocator.contentFrame()

      if (!detailInnerFrame) {
        const errorMsg = '无法访问详情页面的内部框架'
        log.error('[详情页面失败] 内部框架访问失败', {
          elapsedMs: Date.now() - processStartTime,
          pageUrl: detailPage.url(),
          contextData: await capturePageContext(
            detailPage,
            undefined,
            'processDetail.detailInnerFrame'
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
      await detailInnerFrame
        .getByText(/^离散备料计划维护：/)
        .waitFor({ state: 'visible', timeout: 30000 })
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

      const detail: OrderCleanDetail = {
        orderNumber,
        materialsDeleted: 0,
        materialsSkipped: 0,
        errors: [],
        skippedMaterials: [],
        retryCount: 0,
        retryAttempts: [],
        retriedAt: undefined,
        retrySuccess: false
      }

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
          progressState.completedOrders,
          0,
          detailCount,
          progressState.totalOrders
        ),
        {
          currentOrderIndex: progressState.completedOrders + 1,
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
            progressState.completedOrders,
            materialIdx,
            detailCount,
            progressState.totalOrders
          )

          onProgress?.(
            `订单 ${orderNumber} - 物料 ${materialIdx}/${detailCount}: ${materialName}`,
            progress,
            {
              currentOrderIndex: progressState.completedOrders + 1,
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

            if (shouldDelete && !dryRun) {
              log.info('[物料操作] 执行删除操作', {
                orderNumber,
                materialIdx,
                materialCode,
                materialName,
                rowNumber: currentRow,
                dryRun: false
              })
              const oldRowNumber = currentRow
              await deleteRowBtn.click()

              const deleteSuccess = await this.waitForRowChange(childForm, oldRowNumber, 10000)
              const deleteElapsed = Date.now() - materialStartTime

              if (deleteSuccess) {
                detail.materialsDeleted += 1
                log.info('[物料操作完成] 物料已成功删除', {
                  orderNumber,
                  materialCode,
                  rowNumber: currentRow,
                  elapsedMs: deleteElapsed
                })
              } else {
                log.warn('[物料操作警告] 删除操作后行号未改变', {
                  orderNumber,
                  materialCode,
                  rowNumber: currentRow,
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
            log.verbose('[物料判断] 物料不在删除清单中，跳过', {
              orderNumber,
              materialIdx,
              materialCode,
              materialName
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
        contextData: await capturePageContext(detailPage, undefined, 'processDetail.error')
      })
      throw error
    } finally {
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

  private createErrorDetail(orderNumber: string, message: string): OrderCleanDetail {
    return {
      orderNumber,
      materialsDeleted: 0,
      materialsSkipped: 0,
      errors: [message],
      skippedMaterials: [],
      retryCount: 0,
      retryAttempts: [],
      retriedAt: undefined,
      retrySuccess: false
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

  private async waitForRowChange(
    childForm: FrameLocator | Locator,
    oldRowNumber: string,
    maxWaitMs: number
  ): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const newRowNumber = await this.getInputValue(childForm, /^行号$/)
        if (newRowNumber !== oldRowNumber) {
          return true
        }
        await this.delay(200)
      } catch {
        await this.delay(200)
      }
    }

    return false
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
              await this.queryOrders(workFrame, [orderNumber])
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
              const detailPage = await this.openDetailPageFromCurrentQuery(workFrame, popupPage)
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
                  completedOrders: detailIndex,
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
