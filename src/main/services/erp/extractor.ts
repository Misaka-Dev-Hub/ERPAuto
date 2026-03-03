import path from 'path'
import fs from 'fs/promises'
import { ERP_LOCATORS } from './locators'
import { ErpAuthService } from './erp-auth'
import { ExcelParser } from '../excel/excel-parser'
import type { ExtractorInput, ExtractorResult } from '../../types/extractor.types'
import type { ErpSession } from '../../types/erp.types'
import type { DiscreteMaterialPlan } from '../../types/excel.types'

/**
 * ERP Data Extractor Service
 * Downloads material plan data for given order numbers
 *
 * Reference: playwrite/utils/discrete_material_plan_extractor.py
 */
export class ExtractorService {
  private authService: ErpAuthService
  private downloadDir: string

  constructor(authService: ErpAuthService, downloadDir = './downloads') {
    this.authService = authService
    this.downloadDir = downloadDir

    // Ensure download directory exists
    fs.mkdir(downloadDir, { recursive: true }).catch(() => {})
  }

  /**
   * Extract data for given order numbers
   */
  async extract(input: ExtractorInput): Promise<ExtractorResult> {
    const result: ExtractorResult = {
      downloadedFiles: [],
      mergedFile: null,
      recordCount: 0,
      errors: []
    }

    try {
      const session = this.authService.getSession()

      // Navigate to extractor page and get popup page + work frame
      const { popupPage, workFrame } = await this.navigateToExtractorPage(session)

      // Process orders in batches
      const batchSize = input.batchSize || 100
      const batches = this.createBatches(input.orderNumbers, batchSize)

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        const progress = ((i + 1) / batches.length) * 100

        input.onProgress?.(`Processing batch ${i + 1}/${batches.length}`, progress)

        try {
          const filePath = await this.downloadBatch(
            session,
            popupPage,
            workFrame,
            batch,
            i,
            batches.length
          )
          result.downloadedFiles.push(filePath)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          result.errors.push(`Batch ${i + 1}: ${message}`)
        }
      }

      // Merge downloaded files into a single Excel file
      if (result.downloadedFiles.length > 0) {
        input.onProgress?.('正在合并文件...', 95)
        const mergeResult = await this.mergeFiles(result.downloadedFiles)
        result.mergedFile = mergeResult.mergedFile
        result.recordCount = mergeResult.recordCount
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push(`Extraction failed: ${message}`)
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
    totalBatches: number
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
    const downloadPath = path.join(this.downloadDir, `temp_batch_${batchIndex + 1}.xlsx`)

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

  /**
   * Merge downloaded Excel files into a single file
   * Uses ExcelParser to parse and combine all material plans
   *
   * @param filePaths - Array of downloaded Excel file paths
   * @returns Merged file path and total record count
   */
  private async mergeFiles(
    filePaths: string[]
  ): Promise<{ mergedFile: string | null; recordCount: number }> {
    if (filePaths.length === 0) {
      return { mergedFile: null, recordCount: 0 }
    }

    const parser = new ExcelParser({ verbose: false })

    // Collect all orders with full order info and materials
    // Each order has: { orderInfo: OrderHeader, materials: MaterialRow[] }
    const allOrders: Array<{ orderInfo: any; materials: any[] }> = []

    // Parse each downloaded file and collect orders
    for (const filePath of filePaths) {
      try {
        await parser.parse(filePath)
        // After parse(), the parser stores orders internally as lastOrders
        const orders = (parser as any).lastOrders
        if (orders && Array.isArray(orders)) {
          allOrders.push(...orders)
        }
      } catch (error) {
        console.error(`Failed to parse file ${filePath}:`, error)
      }
    }

    // Calculate total record count (total material rows)
    let recordCount = 0
    for (const order of allOrders) {
      recordCount += order.materials.length
    }

    if (recordCount === 0) {
      return { mergedFile: null, recordCount: 0 }
    }

    // Generate output filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, '')
      .replace(/\..+/, '')
      .slice(0, 14)
    const outputPath = path.join(this.downloadDir, `merged_${timestamp}.xlsx`)

    // Save with full 31 columns matching ExcelParser.saveAsExcel format
    await this.saveMergedOrders(allOrders, outputPath)

    return { mergedFile: outputPath, recordCount }
  }

  /**
   * Save merged orders to a new Excel file with full 31 columns
   * Matches the output format of ExcelParser.saveAsExcel()
   */
  private async saveMergedOrders(
    orders: Array<{ orderInfo: any; materials: any[] }>,
    outputPath: string
  ): Promise<void> {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    // Define all 31 columns matching ExcelParser.saveAsExcel output format
    worksheet.columns = [
      { header: '工厂', key: 'factory', width: 25 },
      { header: '备料状态', key: 'materialStatus', width: 15 },
      { header: '备料计划单号', key: 'planNumber', width: 25 },
      { header: '来源单号', key: 'productionOrder', width: 20 },
      { header: '备料类型', key: 'materialType', width: 15 },
      { header: '产品编码', key: 'productCode', width: 15 },
      { header: '产品名称', key: 'productName', width: 30 },
      { header: '产品计划数量', key: 'productPlannedQuantity', width: 15 },
      { header: '单位', key: 'productUnit', width: 10 },
      { header: '用料部门', key: 'department', width: 15 },
      { header: '备注', key: 'remark', width: 20 },
      { header: '制单人', key: 'creator', width: 15 },
      { header: '制单日期', key: 'createDate', width: 15 },
      { header: '审批人', key: 'approver', width: 15 },
      { header: '审批日期', key: 'approveDate', width: 15 },
      { header: '序号', key: 'sequence', width: 10 },
      { header: '材料编码', key: 'materialCode', width: 15 },
      { header: '材料名称', key: 'materialName', width: 30 },
      { header: '规格', key: 'specification', width: 30 },
      { header: '型号', key: 'model', width: 20 },
      { header: '图号', key: 'drawingNumber', width: 20 },
      { header: '物料材质', key: 'material', width: 15 },
      { header: '计划数量', key: 'quantity', width: 12 },
      { header: '单位', key: 'unit', width: 10 },
      { header: '需用日期', key: 'requiredDate', width: 15 },
      { header: '发料仓库', key: 'warehouse', width: 15 },
      { header: '单位用量', key: 'unitUsage', width: 12 },
      { header: '累计出库数量', key: 'cumulativeOutboundQty', width: 15 },
      { header: '打印人', key: 'printer', width: 15 },
      { header: '打印日期', key: 'printDate', width: 20 }
    ]

    // Add data rows - merge orderInfo with each material
    for (const order of orders) {
      const { orderInfo, materials } = order

      for (const material of materials) {
        worksheet.addRow({
          // Order info (first 15 columns)
          factory: orderInfo.factory || '',
          materialStatus: orderInfo.materialStatus || '',
          planNumber: orderInfo.planNumber || '',
          productionOrder: orderInfo.productionOrder || '',
          materialType: orderInfo.materialType || '',
          productCode: orderInfo.productCode || '',
          productName: orderInfo.productName || '',
          productPlannedQuantity: orderInfo.plannedQuantity || '',
          productUnit: orderInfo.unit || '',
          department: orderInfo.department || '',
          remark: orderInfo.remark || '',
          creator: orderInfo.creator || '',
          createDate: orderInfo.createDate || '',
          approver: orderInfo.approver || '',
          approveDate: orderInfo.approveDate || '',
          // Material data (columns 16-28)
          sequence: material.sequence || '',
          materialCode: material.materialCode || '',
          materialName: material.materialName || '',
          specification: material.specification || '',
          model: material.model || '',
          drawingNumber: material.drawingNumber || '',
          material: material.material || '',
          quantity: material.quantity || 0,
          unit: material.unit || '',
          requiredDate: material.requiredDate || '',
          warehouse: material.warehouse || '',
          unitUsage: material.unitUsage || 0,
          cumulativeOutboundQty: material.cumulativeOutboundQty || 0,
          // Footer info (last 2 columns)
          printer: orderInfo.printer || '',
          printDate: orderInfo.printDate || ''
        })
      }
    }

    await workbook.xlsx.writeFile(outputPath)
    console.log(`Merged ${orders.length} orders to ${outputPath}`)
  }
}
