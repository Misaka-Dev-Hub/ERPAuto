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

      // Navigate to extractor page
      const popupPage = await this.navigateToExtractorPage(session);

      // Process orders in batches
      const batchSize = input.batchSize || 100;
      const batches = this.createBatches(input.orderNumbers, batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const progress = ((i + 1) / batches.length) * 100;

        input.onProgress?.(`Processing batch ${i + 1}/${batches.length}`, progress);

        try {
          const filePath = await this.downloadBatch(session, popupPage, batch, i, batches.length);
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
   * Reference: Python extract() method lines 266-276
   */
  private async navigateToExtractorPage(session: ErpSession): Promise<any> {
    const { page } = session;

    // Wait for main iframe
    await page.waitForSelector(ERP_LOCATORS.main.mainIframe);

    // Get main frame
    const mainFrame = page.frameLocator(ERP_LOCATORS.main.mainIframe);

    // Click icon to open menu (line 266)
    await mainFrame.locator('i').first().click();

    // Click discrete material plan menu item and expect popup (lines 267-271)
    const popupPromise = page.waitForEvent('popup');
    await mainFrame.getByTitle('离散备料计划维护', { exact: true }).first().click();
    const popupPage = await popupPromise;

    // Get nested frame structure (lines 273-276)
    const forwardFrameLocator = popupPage.locator(ERP_LOCATORS.main.forwardFrame);
    const innerFrameLocator = forwardFrameLocator.frameLocator(ERP_LOCATORS.main.innerIframe);

    // Wait for inner iframe to be visible
    await innerFrameLocator.waitFor({ state: 'visible', timeout: 15000 });

    // Setup query interface (line 278)
    await this.setupQueryInterface(innerFrameLocator);

    return popupPage;
  }

  /**
   * Setup query interface
   * Reference: Python setup_query_interface() method lines 231-239
   */
  private async setupQueryInterface(innerFrame: any): Promise<void> {
    // Click search icon (line 233)
    await innerFrame.locator(ERP_LOCATORS.menu.searchIcon).click();

    // Click "订单号查询" menu item (line 234)
    await innerFrame.locator(ERP_LOCATORS.menu.orderQuery).click();

    // Click "全部" tab (line 235)
    await innerFrame.getByRole('tab', { name: '全部' }).click();

    // Set limit to 5000 (lines 237-239)
    const inputBox = innerFrame.locator(ERP_LOCATORS.menu.selectInput);
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
    orderNumbers: string[],
    batchIndex: number,
    totalBatches: number
  ): Promise<string> {
    const forwardFrameLocator = popupPage.locator(ERP_LOCATORS.main.forwardFrame);
    const workFrame = forwardFrameLocator.frameLocator(ERP_LOCATORS.main.innerIframe);

    // Fill order numbers (lines 143-145)
    const textbox = workFrame.getByRole('textbox', { name: ERP_LOCATORS.extractor.orderNumberInputRole });
    await textbox.fill('');
    await textbox.fill(orderNumbers.join(','));

    // Click search button (line 147)
    await workFrame.locator(ERP_LOCATORS.extractor.queryButton).click();

    // Wait for loading (lines 148-153)
    await this.waitForLoading(workFrame);

    // Click first row checkbox (line 155)
    await workFrame
      .locator(ERP_LOCATORS.extractor.firstRowSelector)
      .getByLabel('')
      .click();

    // Hover and click "更多" button (lines 156-157)
    await workFrame.getByRole('button', { name: '更多' }).hover();
    await workFrame.getByText('输出', { exact: true }).click();

    // Set threshold (lines 159-164)
    const thresholdBox = workFrame
      .locator('div')
      .filter({ hasText: /^行数阈值$/ })
      .locator('input[type="text"]');
    await thresholdBox.fill('300000');

    // Setup download handler and click confirm (lines 166-172)
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
