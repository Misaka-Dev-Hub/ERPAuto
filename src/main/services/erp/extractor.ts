import path from 'path';
import fs from 'fs/promises';
import { ERP_LOCATORS } from './locators';
import { ErpAuthService } from './erp-auth';
import type { ExtractorInput, ExtractorResult } from '../../types/extractor.types';
import type { ErpSession } from '../../types/erp.types';

/**
 * ERP Data Extractor Service
 * Downloads material plan data for given order numbers
 *
 * Reference: playwrite/utils/discrete_material_plan_extractor.py
 */
export class ExtractorService {
  private authService: ErpAuthService;
  private downloadDir: string;

  constructor(authService: ErpAuthService, downloadDir = './downloads') {
    this.authService = authService;
    this.downloadDir = downloadDir;

    // Ensure download directory exists
    fs.mkdir(downloadDir, { recursive: true }).catch(() => {});
  }

  /**
   * Extract data for given order numbers
   */
  async extract(input: ExtractorInput): Promise<ExtractorResult> {
    const result: ExtractorResult = {
      downloadedFiles: [],
      mergedFile: null,
      recordCount: 0,
      errors: [],
    };

    try {
      const session = this.authService.getSession();

      // Navigate to extractor page and get popup page + work frame
      const { popupPage, workFrame } = await this.navigateToExtractorPage(session);

      // Process orders in batches
      const batchSize = input.batchSize || 100;
      const batches = this.createBatches(input.orderNumbers, batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const progress = ((i + 1) / batches.length) * 100;

        input.onProgress?.(`Processing batch ${i + 1}/${batches.length}`, progress);

        try {
          const filePath = await this.downloadBatch(session, popupPage, workFrame, batch, i, batches.length);
          result.downloadedFiles.push(filePath);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Batch ${i + 1}: ${message}`);
        }
      }

      // TODO: Merge files (implement in separate task)
      // result.mergedFile = await this.mergeFiles(result.downloadedFiles);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Extraction failed: ${message}`);
    }

    return result;
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
  private async navigateToExtractorPage(session: ErpSession): Promise<{ popupPage: any; workFrame: any }> {
    const { page, mainFrame } = session;

    // Step 1: Click menu icon (Python line 266)
    // main_frame is #forwardFrame.content_frame returned from login
    await mainFrame.locator('i').first().click();

    // Step 2: Click discrete material plan menu item and expect popup (Python lines 267-271)
    const popupPromise = page.waitForEvent('popup');
    await mainFrame.getByTitle('离散备料计划维护', { exact: true }).first().click();
    const popupPage = await popupPromise;

    // Step 3 & 4: Get nested frame structure in popup window (Python lines 273-276)
    // popup page contains #forwardFrame, which contains #mainiframe
    const forwardFrameLocator = popupPage.locator('#forwardFrame');
    const fFrame = await forwardFrameLocator.contentFrame();

    if (!fFrame) {
      throw new Error('Failed to access popup forward frame');
    }

    const innerFrameLocator = fFrame.locator('#mainiframe');
    await innerFrameLocator.waitFor({ state: 'visible', timeout: 15000 });
    const workFrame = await innerFrameLocator.contentFrame();

    if (!workFrame) {
      throw new Error('Failed to access inner work frame');
    }

    // Step 5: Setup query interface (Python line 278)
    await this.setupQueryInterface(workFrame);

    return { popupPage, workFrame };
  }

  /**
   * Setup query interface
   * Reference: Python setup_query_interface() method lines 231-239
   */
  private async setupQueryInterface(innerFrame: any): Promise<void> {
    // Click search icon (Python line 233)
    await innerFrame.locator('.search-name-wrapper > .iconfont').click();

    // Click "订单号查询" menu item (Python line 234)
    await innerFrame.getByText('订单号查询').click();

    // Click "全部" tab (Python line 235)
    await innerFrame.getByRole('tab', { name: '全部' }).click();

    // Set limit to 5000 (Python lines 237-239)
    const inputBox = innerFrame.locator('#rc_select_0');
    await inputBox.fill('5000');
    await inputBox.press('Enter');
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
    totalBatches: number
  ): Promise<string> {
    // Fill order numbers (Python lines 143-145)
    const textbox = workFrame.getByRole('textbox', { name: '来源生产订单号' });
    await textbox.fill('');
    await textbox.fill(orderNumbers.join(','));

    // Click search button (Python line 147)
    await workFrame.locator('.search-component-searchBtn').click();

    // Wait for loading (Python lines 148-153)
    await this.waitForLoading(workFrame);

    // Click first row checkbox (Python line 155)
    await workFrame.getByRole('row', { name: '序号' }).getByLabel('').click();

    // Hover and click "更多" button (Python lines 156-157)
    await workFrame.getByRole('button', { name: '更多' }).hover();
    await workFrame.getByText('输出', { exact: true }).click();

    // Set threshold (Python lines 159-164)
    const thresholdBox = workFrame
      .locator('div')
      .filter({ hasText: /^行数阈值$/ })
      .locator('input[type="text"]');
    await thresholdBox.fill('300000');

    // Setup download handler and click confirm (Python lines 166-172)
    const downloadPath = path.join(
      this.downloadDir,
      `temp_batch_${batchIndex + 1}.xlsx`
    );

    const downloadPromise = popupPage.waitForEvent('download');
    await workFrame.getByRole('button', { name: '确定(Y)' }).click();

    const download = await downloadPromise;
    await download.saveAs(downloadPath);

    return downloadPath;
  }

  /**
   * Wait for loading overlay to disappear
   * Reference: Python lines 148-153
   */
  private async waitForLoading(workFrame: any): Promise<void> {
    const loadingLocator = workFrame.locator('div').filter({ hasText: ERP_LOCATORS.extractor.loadingText }).nth(1);

    try {
      await loadingLocator.waitFor({ state: 'visible', timeout: 3000 });
      await loadingLocator.waitFor({ state: 'hidden', timeout: 0 });
    } catch {
      // Loading completed quickly or never appeared
    }
  }

  /**
   * Split array into batches
   * Reference: Python group_order_ids() method lines 128-131
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}
