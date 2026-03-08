import path from 'path'
import { ERP_LOCATORS } from './locators'
import type { ErpSession } from '../../types/erp.types'
import type {
  ExtractorCoreInput,
  ExtractorCoreResult,
  ExtractionProgress
} from '../../types/extractor.types'
import { createLogger } from '../logger'

const log = createLogger('ExtractorCore')

/**
 * ExtractorCore - Handles all web page operations for data extraction
 * This class is responsible only for web interactions, not file processing
 *
 * Note: Uses 'any' for Frame types to maintain compatibility with Playwright's
 * frame handling API, matching the original implementation.
 */
export class ExtractorCore {
  /**
   * Execute all web page operations and return downloaded file paths
   * @param input - Contains session, order numbers, download directory, batch size, and progress callback
   * @returns List of downloaded file paths and any errors encountered
   */
  async downloadAllBatches(input: ExtractorCoreInput): Promise<ExtractorCoreResult> {
    const result: ExtractorCoreResult = {
      downloadedFiles: [],
      errors: []
    }

    const totalBatches = this.createBatches(input.orderNumbers, input.batchSize).length
    const totalPoints = 1 + totalBatches + 2
    const progressPerPoint = 100 / totalPoints

    const { popupPage, workFrame } = await this.navigateToExtractorPage(input.session)

    const batches = this.createBatches(input.orderNumbers, input.batchSize)

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const progress = (1 + (i + 1)) * progressPerPoint

      const progressExtra: Partial<ExtractionProgress> = {
        phase: 'downloading',
        currentBatch: i + 1,
        totalBatches
      }

      input.onProgress?.(`处理批次 ${i + 1}/${totalBatches}`, progress, progressExtra)

      try {
        const filePath = await this.downloadBatch(
          input.session,
          popupPage,
          workFrame,
          batch,
          i,
          batches.length,
          input.downloadDir
        )
        result.downloadedFiles.push(filePath)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        result.errors.push(`Batch ${i + 1}: ${message}`)
      }
    }

    return result
  }

  /**
   * Navigate to extractor/query page
   * Reference: Python extract() method lines 266-278
   *
   * Python workflow:
   * 1. main_frame.locator("i").first.click() - Click menu icon
   * 2. page.expect_popup() + get_by_title("离散备料计划维护").click() - Click menu item and wait for popup
   * 3. page1.locator("#forwardFrame").content_frame - Get popup's forward frame
   * 4. f_frame.locator("#mainiframe").content_frame - Get nested inner frame
   * 5. setup_query_interface(work_frame) - Setup query interface
   */
  private async navigateToExtractorPage(
    session: ErpSession
  ): Promise<{ popupPage: any; workFrame: any }> {
    const { page, mainFrame } = session

    // Step 1: Click menu icon (Python line 266)
    // main_frame is #forwardFrame.content_frame returned from login
    await mainFrame.locator('i').first().click()

    // Step 2: Click discrete material plan menu item and expect popup (Python lines 267-271)
    const popupPromise = page.waitForEvent('popup')
    await mainFrame.getByTitle('离散备料计划维护', { exact: true }).first().click()
    const popupPage = await popupPromise

    // Step 3 & 4: Get nested frame structure in popup window (Python lines 273-276)
    // popup page contains #forwardFrame, which contains #mainiframe
    const forwardFrameLocator = popupPage.locator('#forwardFrame')
    const fFrame = await forwardFrameLocator.contentFrame()

    if (!fFrame) {
      throw new Error('Failed to access popup forward frame')
    }

    const innerFrameLocator = fFrame.locator('#mainiframe')
    await innerFrameLocator.waitFor({ state: 'visible', timeout: 15000 })
    const workFrame = await innerFrameLocator.contentFrame()

    if (!workFrame) {
      throw new Error('Failed to access inner work frame')
    }

    // Step 5: Setup query interface (Python line 278)
    await this.setupQueryInterface(workFrame)

    return { popupPage, workFrame }
  }

  /**
   * Setup query interface
   * Reference: Python setup_query_interface() method lines 231-239
   */
  private async setupQueryInterface(innerFrame: any): Promise<void> {
    // Click search icon (Python line 233)
    await innerFrame.locator('.search-name-wrapper > .iconfont').click()

    // Click "订单号查询" menu item (Python line 234)
    await innerFrame.getByText('订单号查询').click()

    // Click "全部" tab (Python line 235)
    await innerFrame.getByRole('tab', { name: '全部' }).click()

    // Set limit to 5000 (Python lines 237-239)
    const inputBox = innerFrame.locator('#rc_select_0')
    await inputBox.fill('5000')
    await inputBox.press('Enter')
  }

  /**
   * Download a single batch of orders
   * Reference: Python download_batch() method lines 133-175
   */
  private async downloadBatch(
    session: ErpSession,
    popupPage: any,
    workFrame: any,
    orderNumbers: string[],
    batchIndex: number,
    totalBatches: number,
    downloadDir: string
  ): Promise<string> {
    // Fill order numbers (Python lines 143-145)
    const textbox = workFrame.getByRole('textbox', { name: '来源生产订单号' })
    await textbox.fill('')
    await textbox.fill(orderNumbers.join(','))

    // Click search button (Python line 147)
    await workFrame.locator('.search-component-searchBtn').click()

    // Wait for loading (Python lines 148-153)
    await this.waitForLoading(workFrame)

    // Click first row checkbox (Python line 155)
    await workFrame.getByRole('row', { name: '序号' }).getByLabel('').click()

    // Hover and click "更多" button (Python lines 156-157)
    await workFrame.getByRole('button', { name: '更多' }).hover()
    await workFrame.getByText('输出', { exact: true }).click()

    // Set threshold (Python lines 159-164)
    const thresholdBox = workFrame
      .locator('div')
      .filter({ hasText: /^行数阈值$/ })
      .locator('input[type="text"]')
    await thresholdBox.fill('300000')

    // Setup download handler and click confirm (Python lines 166-172)
    const downloadPath = path.join(downloadDir, `temp_batch_${batchIndex + 1}.xlsx`)

    const downloadPromise = popupPage.waitForEvent('download')
    await workFrame.getByRole('button', { name: '确定(Y)' }).click()

    const download = await downloadPromise
    await download.saveAs(downloadPath)

    return downloadPath
  }

  /**
   * Wait for loading overlay to disappear
   * Reference: Python lines 148-153
   */
  private async waitForLoading(workFrame: any): Promise<void> {
    const loadingLocator = workFrame
      .locator('div')
      .filter({ hasText: ERP_LOCATORS.extractor.loadingText })
      .nth(1)

    try {
      await loadingLocator.waitFor({ state: 'visible', timeout: 3000 })
      await loadingLocator.waitFor({ state: 'hidden', timeout: 0 })
    } catch {
      // Loading completed quickly or never appeared
    }
  }

  /**
   * Split array into batches
   * Reference: Python group_order_ids() method lines 128-131
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }
}
