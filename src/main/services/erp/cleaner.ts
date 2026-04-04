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

    await mainFrame.locator('i').first().click()
    log.debug('导航: 已点击菜单图标')

    const popupPromise = page.waitForEvent('popup')
    await mainFrame.getByTitle('离散生产订单维护', { exact: true }).first().click()
    const popupPage = await popupPromise
    log.debug('导航: 弹出窗口已打开')

    const forwardFrameLocator = popupPage.locator('#forwardFrame')
    const fFrame = forwardFrameLocator.contentFrame()
    log.debug('导航: 已获取 forwardFrame')

    const innerFrameLocator = fFrame.locator('#mainiframe')
    await innerFrameLocator.waitFor({ state: 'visible', timeout: 30000 })
    const workFrame = innerFrameLocator.contentFrame()
    log.debug('导航: 已获取内部工作框架')

    await workFrame.locator('#hot-key-head_list').waitFor({ state: 'visible', timeout: 30000 })
    log.info('已导航到清理页面')

    return { popupPage, workFrame }
  }

  private async setupQueryInterface(innerFrame: FrameLocator): Promise<void> {
    await innerFrame.locator('.search-name-wrapper > .iconfont').click()
    log.debug('查询界面: 已点击搜索图标')
    await innerFrame.getByText('订单号查询').click()
    log.debug('查询界面: 已点击订单号查询')
    await innerFrame.getByRole('tab', { name: '全部' }).click()
    log.debug('查询界面: 已切换到全部标签页')

    const inputEl = innerFrame.locator('#rc_select_0')
    await inputEl.fill('5000')
    await inputEl.press('Enter')
    log.debug('查询界面: 已设置查询限制为5000')
  }

  private async queryOrders(workFrame: FrameLocator, orderNumbers: string[]): Promise<void> {
    log.debug('开始查询订单', { orderCount: orderNumbers.length })
    const textbox = workFrame.getByRole('textbox', { name: '生产订单号' })
    await textbox.fill(orderNumbers.join(','))
    await workFrame.locator('.search-component-searchBtn').click()
  }

  private async collectQueryResultRows(workFrame: FrameLocator): Promise<QueryResultRow[]> {
    const rows = workFrame.locator('tbody tr')
    const rowCount = await rows.count()
    const result: QueryResultRow[] = []

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const row = rows.nth(rowIndex)
      const orderNumber = await this.extractOrderNumberFromQueryRow(row)
      if (!this.isOrderNumber(orderNumber)) {
        continue
      }
      result.push({ rowIndex, orderNumber })
    }

    log.debug('查询结果收集完成', { rowCount: result.length })

    return result
  }

  private async extractOrderNumberFromQueryRow(row: Locator): Promise<string> {
    try {
      const cell = row.locator('td[colkey="vbillcode"]')
      const codeLink = cell.locator('.code-detail-link').first()
      const rawValue =
        (await codeLink.count()) > 0 ? await codeLink.innerText() : await cell.innerText()
      const value = rawValue.trim()
      const match = value.match(/SC\d{14}/)
      return match ? match[0] : value
    } catch {
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

    try {
      const detailMainFrame = detailPage.locator('#forwardFrame')
      const dFrame = await detailMainFrame.contentFrame()

      if (!dFrame) {
        log.error('Failed to access detail page forward frame', {
          ...(await capturePageContext(detailPage))
        })
        throw new Error('Failed to access detail page forward frame')
      }

      const detailInnerLocator = dFrame.locator('#mainiframe')
      await detailInnerLocator.waitFor({ state: 'visible', timeout: 30000 })
      const detailInnerFrame = await detailInnerLocator.contentFrame()

      if (!detailInnerFrame) {
        log.error('Failed to access detail inner frame', {
          ...(await capturePageContext(detailPage, undefined, 'processDetail.detailInnerFrame'))
        })
        throw new Error('Failed to access detail inner frame')
      }

      await detailInnerFrame
        .getByText(/^离散备料计划维护：/)
        .waitFor({ state: 'visible', timeout: 30000 })

      const sourceOrderNumber = await this.extractSourceOrderNumber(detailInnerFrame)
      const orderNumber = sourceOrderNumber || expectedOrderNumber || 'UNKNOWN_ORDER'

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

      const detailCountText = await detailInnerFrame.getByText(/^详细信息 \(\d+\)$/).innerText()
      const detailCountMatch = detailCountText.match(/\((\d+)\)/)
      const detailCount = detailCountMatch ? parseInt(detailCountMatch[1], 10) : 0

      const statusText = await detailInnerFrame.getByText(/^备料状态:.+$/).innerText()
      const statusMatch = statusText.replace(/\n/g, '').match(/备料状态:(.+)$/)
      const detailStatus = statusMatch ? statusMatch[1].trim() : ''

      onProgress?.(
        `开始处理订单: ${orderNumber}`,
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

      if (detailStatus === '审批通过' && detailCount > 0) {
        await detailInnerFrame.getByRole('button', { name: '修改' }).click()

        const saveButtonLocator = detailInnerFrame.getByRole('button', { name: '保存' })
        await saveButtonLocator.waitFor({ state: 'visible', timeout: 30000 })

        await detailInnerFrame.getByText('展开').first().click()

        const childForm = detailInnerFrame.locator('.card-table-side-box')
        const buttonWrapper = childForm.locator('.button-wrapper')
        const deleteRowBtn = buttonWrapper.getByRole('button', { name: '删行' })
        const nextBtn = buttonWrapper.locator('.icon-jiantouyou')
        const collapseBtn = buttonWrapper.locator('.icon-celashouqi')

        let lastRowNumber = ''
        let materialIdx = 0

        while (true) {
          materialIdx += 1

          const currentRow = await this.getInputValue(childForm, /^行号$/)
          const rowNumInt = parseInt(currentRow, 10)

          if (currentRow === lastRowNumber) {
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
            const shouldDelete = this.shouldDeleteMaterial({
              rowNumber: rowNumInt,
              pendingQty,
              materialCode,
              deleteSet
            })

            if (shouldDelete && !dryRun) {
              const oldRowNumber = currentRow
              await deleteRowBtn.click()

              const deleteSuccess = await this.waitForRowChange(childForm, oldRowNumber, 10000)

              if (deleteSuccess) {
                detail.materialsDeleted += 1
                log.debug('物料已删除', { orderNumber, materialCode, rowNumber: currentRow })
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
              log.debug('物料已跳过', { orderNumber, materialCode, reason })
              detail.skippedMaterials.push({
                materialCode,
                materialName,
                rowNumber: rowNumInt,
                reason
              })
            }
          }

          const isNextEnabled = await this.isButtonEnabled(nextBtn)
          if (isNextEnabled) {
            lastRowNumber = currentRow
            await nextBtn.click()
          } else {
            break
          }
        }

        await collapseBtn.click()

        if (!dryRun && detail.materialsDeleted > 0) {
          await saveButtonLocator.click()
          await saveButtonLocator.waitFor({ state: 'hidden', timeout: 60000 })
          log.info('订单修改已保存', { orderNumber, materialsDeleted: detail.materialsDeleted })
        }
      }

      return detail
    } finally {
      await detailPage.close()
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
      return result
    }

    log.info('Starting retry for failed orders', {
      count: failedDetails.length,
      totalOrders: params.failedDetails.length
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

          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              log.info(`Retrying order ${orderNumber} (attempt ${attempt}/${MAX_RETRIES})`)

              await this.queryOrders(workFrame, [orderNumber])
              await this.waitForLoading(workFrame)

              const rows = workFrame.locator('tbody tr')
              const rowCount = await rows.count()
              if (rowCount === 0) {
                log.error('Retry query returned no results', { orderNumber, rowCount })
                throw new Error('订单重试查询无结果')
              }

              const detailPage = await this.openDetailPageFromCurrentQuery(workFrame, popupPage)
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

              retryResult.successfulRetries += 1
              retryResult.updatedDetails.push({
                ...retryDetail,
                retryCount: attempt,
                retriedAt: Date.now(),
                retrySuccess: true,
                retryAttempts
              })
              retryResult.retriedOrders += 1
              break
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown error'
              log.warn(`Retry attempt ${attempt} failed for order ${orderNumber}: ${message}`)

              retryAttempts.push({
                attempt,
                error: message,
                timestamp: Date.now()
              })

              if (attempt === MAX_RETRIES) {
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

        log.info('Retry process completed', {
          retriedOrders: retryResult.retriedOrders,
          successfulRetries: retryResult.successfulRetries,
          totalRetryOrders: failedDetails.length
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
