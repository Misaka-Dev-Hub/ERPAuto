import { ERP_LOCATORS } from './locators'
import { ErpAuthService } from './erp-auth'
import type { CleanerInput, CleanerResult, OrderCleanDetail } from '../../types/cleaner.types'
import type { ErpSession } from '../../types/erp.types'
import type { FrameLocator, Locator, Page } from 'playwright'
import { createLogger } from '../logger'

const log = createLogger('CleanerService')

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

interface PopupTask {
  orderNumber: string
  orderIndex: number
  popupPage: Page
  detailFrame: FrameLocator
}

/**
 * ERP Cleaner Service
 * Deletes specified materials from production orders in ERP system
 *
 * Reference: playwrite/utils/discrete_material_plan_cleaner.py
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
   * Reference: Python lines 284-406
   *
   * Deletion conditions:
   * 1. Material code must be in the delete set
   * 2. Row number must NOT be in range 7000-7999
   * 3. Pending quantity must be empty
   */
  shouldDeleteMaterial(params: ShouldDeleteParams): boolean {
    const { rowNumber, pendingQty, materialCode, deleteSet } = params

    // Check if material is in delete list
    if (!deleteSet.has(materialCode)) {
      return false
    }

    // Check row number range (7000-7999 are protected)
    if (rowNumber >= 7000 && rowNumber < 8000) {
      return false
    }

    // Check pending quantity (must be empty)
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
    if (rowNumber >= 7000 && rowNumber < 8000) {
      return '行号在 7000-7999 范围内（受保护）'
    }
    if (pendingQty && pendingQty.trim() !== '') {
      return '累计待发数量不为空'
    }
    return '未知原因'
  }

  /**
   * Execute the cleaning process
   * Reference: Python clean() method lines 456-525
   */
  async clean(input: CleanerInput): Promise<CleanerResult> {
    const result: CleanerResult = {
      ordersProcessed: 0,
      materialsDeleted: 0,
      materialsSkipped: 0,
      errors: [],
      details: []
    }

    const totalOrders = input.orderNumbers.length
    const dryRun = input.dryRun ?? this.dryRun
    const concurrency = Math.min(Math.max(input.concurrency ?? 1, 1), 20)

    log.info('Starting cleaner', {
      totalOrders,
      materialCount: input.materialCodes.length,
      dryRun,
      concurrency
    })

    // Create delete set for O(1) lookup
    const deleteSet = new Set(input.materialCodes)

    try {
      const session = this.authService.getSession()

      // Navigate to cleaner page
      const { popupPage, workFrame } = await this.navigateToCleanerPage(session)

      // Setup query interface
      await this.setupQueryInterface(workFrame)

      // Task Queue Setup
      const taskQueue: PopupTask[] = []
      let notEmptyResolver: (() => void) | null = null
      let producerFinished = false

      const notifyTaskAdded = () => {
        if (notEmptyResolver) {
          const resolve = notEmptyResolver
          notEmptyResolver = null
          resolve()
        }
      }

      const waitForTask = async (): Promise<PopupTask | null> => {
        while (taskQueue.length === 0 && !producerFinished) {
          await new Promise<void>((resolve) => {
            notEmptyResolver = resolve
          })
        }
        return taskQueue.shift() ?? null
      }

      // Producer logic
      const producerPromise = (async () => {
        for (let i = 0; i < totalOrders; i++) {
          const orderNumber = input.orderNumbers[i]
          try {
            log.debug('Dispatching order', { orderNumber, index: i + 1, total: totalOrders })
            const task = await this.dispatchOrder({
              workFrame,
              popupPage,
              orderNumber,
              orderIndex: i
            })
            taskQueue.push(task)
            notifyTaskAdded()
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            log.error('Order dispatch failed', { orderNumber, error: message })
            result.errors.push(`Order ${orderNumber} dispatch failed: ${message}`)
            result.details.push({
              orderNumber,
              materialsDeleted: 0,
              materialsSkipped: 0,
              errors: [message],
              skippedMaterials: []
            })
            // Still increment ordersProcessed for failures so they count towards progress
            result.ordersProcessed++
          }
        }
        producerFinished = true
        notifyTaskAdded() // Wake up workers so they can exit if queue is empty
      })()

      // Consumer worker logic
      const workerPromises = Array.from({ length: concurrency }).map(async (_, workerId) => {
        while (true) {
          const task = await waitForTask()
          if (!task) break // Queue is empty and producer finished

          try {
            log.debug(`Worker ${workerId} processing order`, { orderNumber: task.orderNumber })
            const detail = await this.processPopupPage({
              popupPage: task.popupPage,
              detailFrame: task.detailFrame,
              orderNumber: task.orderNumber,
              orderIndex: task.orderIndex,
              totalOrders,
              deleteSet,
              dryRun,
              onProgress: input.onProgress
            })

            result.details.push(detail)
            result.ordersProcessed++
            result.materialsDeleted += detail.materialsDeleted
            result.materialsSkipped += detail.materialsSkipped
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            log.error(`Worker ${workerId} order processing failed`, { orderNumber: task.orderNumber, error: message })
            result.errors.push(`Order ${task.orderNumber}: ${message}`)
            result.details.push({
              orderNumber: task.orderNumber,
              materialsDeleted: 0,
              materialsSkipped: 0,
              errors: [message],
              skippedMaterials: []
            })
            result.ordersProcessed++
          }
        }
      })

      // Wait for everything to finish
      await Promise.all([producerPromise, ...workerPromises])

      // Close main popup page
      await popupPage.close()

      log.info('Cleaner completed', {
        ordersProcessed: result.ordersProcessed,
        materialsDeleted: result.materialsDeleted,
        materialsSkipped: result.materialsSkipped,
        errorCount: result.errors.length
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('Cleaner failed', { error: message })
      result.errors.push(`Clean failed: ${message}`)
    }

    return result
  }

  /**
   * Navigate to the discrete production order maintenance page
   * Reference: Python lines 476-486
   */
  async navigateToCleanerPage(
    session: ErpSession
  ): Promise<{ popupPage: Page; workFrame: FrameLocator }> {
    const { page, mainFrame } = session

    // Click menu icon (Python line 476)
    await mainFrame.locator('i').first().click()

    // Click discrete production order menu item and expect popup (Python lines 477-479)
    const popupPromise = page.waitForEvent('popup')
    await mainFrame.getByTitle('离散生产订单维护', { exact: true }).first().click()
    const popupPage = await popupPromise

    // Get nested frame structure (Python lines 482-486)
    const forwardFrameLocator = popupPage.locator('#forwardFrame')
    const fFrame = forwardFrameLocator.contentFrame()

    const innerFrameLocator = fFrame.locator('#mainiframe')
    await innerFrameLocator.waitFor({ state: 'visible', timeout: 30000 })
    const workFrame = innerFrameLocator.contentFrame()

    // Wait for hot-key-head_list to be visible (Python line 484-486)
    await workFrame.locator('#hot-key-head_list').waitFor({ state: 'visible', timeout: 30000 })

    return { popupPage, workFrame }
  }

  /**
   * Setup query interface
   * Reference: Python setup_query_interface() lines 445-454
   */
  private async setupQueryInterface(innerFrame: FrameLocator): Promise<void> {
    // Click search icon (Python line 447)
    await innerFrame.locator('.search-name-wrapper > .iconfont').click()

    // Click "订单号查询" menu item (Python line 448)
    await innerFrame.getByText('订单号查询').click()

    // Click "全部" tab (Python line 449)
    await innerFrame.getByRole('tab', { name: '全部' }).click()

    // Set limit to 5000 (Python lines 451-454)
    const inputEl = innerFrame.locator('#rc_select_0')
    await inputEl.fill('5000')
    await inputEl.press('Enter')
  }

  /**
   * Dispatch an order - search and open the popup page
   */
  private async dispatchOrder(params: {
    workFrame: FrameLocator
    popupPage: Page
    orderNumber: string
    orderIndex: number
  }): Promise<PopupTask> {
    const { workFrame, popupPage, orderNumber, orderIndex } = params

    // Query the order
    const textbox = workFrame.getByRole('textbox', { name: '生产订单号' })
    await textbox.fill(orderNumber)
    await workFrame.locator('.search-component-searchBtn').click()

    // Wait for loading
    await this.waitForLoading(workFrame)

    // Click "更多" to open menu
    await workFrame.locator('#hot-key-head_list').getByText('更多').click()

    // Click "备料计划" and expect popup
    const detailPagePromise = popupPage.waitForEvent('popup')
    await workFrame.getByText('备料计划').click()
    const detailPage = await detailPagePromise

    // Navigate nested frames in detail page
    const detailMainFrame = detailPage.locator('#forwardFrame')
    const dFrame = await detailMainFrame.contentFrame()

    if (!dFrame) {
      throw new Error('Failed to access detail page forward frame')
    }

    const detailInnerLocator = dFrame.locator('#mainiframe')
    await detailInnerLocator.waitFor({ state: 'visible', timeout: 30000 })
    const detailInnerFrame = await detailInnerLocator.contentFrame()

    if (!detailInnerFrame) {
      throw new Error('Failed to access detail inner frame')
    }

    return {
      orderNumber,
      orderIndex,
      popupPage: detailPage,
      detailFrame: detailInnerFrame
    }
  }

  /**
   * Process a popup page for an order
   */
  private async processPopupPage(params: {
    popupPage: Page
    detailFrame: FrameLocator
    orderNumber: string
    orderIndex: number
    totalOrders: number
    deleteSet: Set<string>
    dryRun: boolean
    onProgress?: (
      message: string,
      progress?: number,
      extra?: Partial<import('../../types/cleaner.types').CleanerProgress>
    ) => void
  }): Promise<OrderCleanDetail> {
    const {
      popupPage: detailPage,
      detailFrame: detailInnerFrame,
      orderNumber,
      orderIndex,
      totalOrders,
      deleteSet,
      dryRun,
      onProgress
    } = params

    const detail: OrderCleanDetail = {
      orderNumber,
      materialsDeleted: 0,
      materialsSkipped: 0,
      errors: [],
      skippedMaterials: []
    }

    try {
      // Wait for plan code
      await detailInnerFrame
        .getByText(/^离散备料计划维护：/)
        .waitFor({ state: 'visible', timeout: 30000 })

      // Extract detail count
      const detailCountText = await detailInnerFrame.getByText(/^详细信息 \(\d+\)$/).innerText()
      const detailCountMatch = detailCountText.match(/\((\d+)\)/)
      const detailCount = detailCountMatch ? parseInt(detailCountMatch[1], 10) : 0

      // Extract status
      const statusText = await detailInnerFrame.getByText(/^备料状态:.+$/).innerText()
      const statusMatch = statusText.replace(/\n/g, '').match(/备料状态:(.+)$/)
      const detailStatus = statusMatch ? statusMatch[1].trim() : ''

      // Send progress for order start
      onProgress?.(
        `开始处理订单 ${orderIndex + 1}/${totalOrders}: ${orderNumber}`,
        ((1 + orderIndex) / (1 + totalOrders)) * 100,
        {
          currentOrderIndex: orderIndex + 1,
          totalOrders,
          currentMaterialIndex: 0,
          totalMaterialsInOrder: detailCount,
          currentOrderNumber: orderNumber
        }
      )

      // Process based on status
      if (detailStatus === '审批通过' && detailCount > 0) {
        // Click modify button
        await detailInnerFrame.getByRole('button', { name: '修改' }).click()

        // Wait for save button
        const saveButtonLocator = detailInnerFrame.getByRole('button', { name: '保存' })
        await saveButtonLocator.waitFor({ state: 'visible', timeout: 30000 })

        // Expand the form
        await detailInnerFrame.getByText('展开').first().click()

        // Get form elements
        const childForm = detailInnerFrame.locator('.card-table-side-box')
        const buttonWrapper = childForm.locator('.button-wrapper')
        const deleteRowBtn = buttonWrapper.getByRole('button', { name: '删行' })
        const nextBtn = buttonWrapper.locator('.icon-jiantouyou')
        const collapseBtn = buttonWrapper.locator('.icon-celashouqi')

        let lastRowNumber = ''
        let materialIdx = 0

        // Process each material row
        while (true) {
          materialIdx++

          // Wait for row number to stabilize
          const currentRow = await this.getInputValue(childForm, /^行号$/)
          const rowNumInt = parseInt(currentRow, 10)

          if (currentRow === lastRowNumber) {
            await this.delay(500)
          }

          // Get material data
          const materialCode = await this.getInputValue(childForm, /^材料编码/)
          const materialName = await this.getInputValue(childForm, /^材料名称/)
          const pendingQty = await this.getInputValue(childForm, /^累计待发数量$/)

          // Report progress using formula: (1 + i + j/Mᵢ) / (1 + N) × 100
          const progress = ((1 + orderIndex + materialIdx / detailCount) / (1 + totalOrders)) * 100

          onProgress?.(
            `订单 ${orderIndex + 1}/${totalOrders} - 物料 ${materialIdx}/${detailCount}: ${materialName}`,
            progress,
            {
              currentOrderIndex: orderIndex + 1,
              totalOrders,
              currentMaterialIndex: materialIdx,
              totalMaterialsInOrder: detailCount,
              currentOrderNumber: orderNumber
            }
          )

          // Check if should delete
          if (deleteSet.has(materialCode)) {
            const shouldDelete = this.shouldDeleteMaterial({
              rowNumber: rowNumInt,
              pendingQty,
              materialCode,
              deleteSet
            })

            if (shouldDelete && !dryRun) {
              // Delete the material
              const oldRowNumber = currentRow
              await deleteRowBtn.click()

              // Wait for row number to change
              const deleteSuccess = await this.waitForRowChange(childForm, oldRowNumber, 10000)

              if (deleteSuccess) {
                detail.materialsDeleted++
              }
              continue
            } else if (!shouldDelete) {
              detail.materialsSkipped++
              const reason = this.getSkipReason({
                rowNumber: rowNumInt,
                pendingQty,
                materialCode,
                deleteSet
              })
              detail.skippedMaterials.push({
                materialCode,
                materialName,
                rowNumber: rowNumInt,
                reason
              })
            }
          }

          // Move to next row
          const isNextEnabled = await this.isButtonEnabled(nextBtn)
          if (isNextEnabled) {
            lastRowNumber = currentRow
            await nextBtn.click()
          } else {
            break
          }
        }

        // Collapse form
        await collapseBtn.click()

        // Save changes
        if (!dryRun && detail.materialsDeleted > 0) {
          await saveButtonLocator.click()
          await saveButtonLocator.waitFor({ state: 'hidden', timeout: 60000 })
        }
      }
    } finally {
      // Close detail page
      await detailPage.close()
    }

    return detail
  }

  /**
   * Wait for loading overlay to disappear
   * Reference: Python lines 192-197
   */
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

  /**
   * Get input value by label regex
   * Reference: Python _get_input_value() lines 141-148
   */
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

  /**
   * Check if button is enabled
   * Reference: Python _is_button_enabled() lines 133-139
   */
  private async isButtonEnabled(button: Locator): Promise<boolean> {
    try {
      return await button.isEnabled()
    } catch {
      return false
    }
  }

  /**
   * Wait for row number to change after deletion
   * Reference: Python lines 306-324
   */
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

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
