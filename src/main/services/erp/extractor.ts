import path from 'path'
import fs from 'fs/promises'
import { ExtractorCore } from './extractor-core'
import { ErpAuthService } from './erp-auth'
import { ExcelParser } from '../excel/excel-parser'
import type {
  ExtractorInput,
  ExtractorResult,
  ImportResult,
  LogLevel
} from '../../types/extractor.types'
import { DataImportService } from '../database/data-importer'

/**
 * ERP Data Extractor Service
 * Downloads material plan data for given order numbers
 *
 * This service orchestrates the extraction process:
 * - Uses ExtractorCore for web page operations
 * - Handles file merging and cleanup
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
   * Orchestrates the extraction process by delegating web operations to ExtractorCore
   * and handling file merging/cleanup
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

      // Call ExtractorCore to execute web page operations
      const core = new ExtractorCore()
      const coreResult = await core.downloadAllBatches({
        session,
        orderNumbers: input.orderNumbers,
        downloadDir: this.downloadDir,
        batchSize: input.batchSize || 100,
        onProgress: input.onProgress
      })

      result.downloadedFiles = coreResult.downloadedFiles
      result.errors = coreResult.errors

      // Merge downloaded files (original logic preserved)
      if (result.downloadedFiles.length > 0) {
        input.onProgress?.('正在合并文件...', 95)
        const mergeResult = await this.mergeFiles(result.downloadedFiles)
        result.mergedFile = mergeResult.mergedFile
        result.recordCount = mergeResult.recordCount

        // Add merge error to result if any
        if (mergeResult.error) {
          result.errors.push(mergeResult.error)
        }

        // Always clean up temporary files regardless of merge success
        await this.cleanupTempFiles(result.downloadedFiles)

        // Auto-import to database if merge was successful
        if (result.mergedFile) {
          input.onProgress?.('正在写入数据库...', 98)
          const importResult = await this.importToDatabaseWithLogging(
            result.mergedFile,
            input.onLog
          )
          result.importResult = importResult

          if (!importResult.success && importResult.errors.length > 0) {
            result.errors.push(...importResult.errors)
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push(`Extraction failed: ${message}`)
    }

    return result
  }

  /**
   * Merge downloaded Excel files into a single file
   * Uses ExcelParser to parse and combine all material plans
   *
   * @param filePaths - Array of downloaded Excel file paths
   * @returns Merged file path, total record count, and optional error message
   */
  private async mergeFiles(
    filePaths: string[]
  ): Promise<{ mergedFile: string | null; recordCount: number; error?: string }> {
    if (filePaths.length === 0) {
      return { mergedFile: null, recordCount: 0 }
    }

    console.log(`[Extractor] Starting merge of ${filePaths.length} files`)
    const parser = new ExcelParser({ verbose: true })

    // Collect all orders with full order info and materials
    // Each order has: { orderInfo: OrderHeader, materials: MaterialRow[] }
    const allOrders: Array<{ orderInfo: any; materials: any[] }> = []

    // Parse each downloaded file and collect orders
    for (const filePath of filePaths) {
      try {
        console.log(`[Extractor] Parsing file: ${filePath}`)
        await parser.parse(filePath)
        // After parse(), the parser stores orders internally as lastOrders
        const orders = (parser as any).lastOrders
        console.log(`[Extractor] Parsed ${orders?.length || 0} orders from ${filePath}`)
        if (orders && Array.isArray(orders)) {
          allOrders.push(...orders)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error(`[Extractor] Failed to parse file ${filePath}:`, errorMsg)
      }
    }

    // Calculate total record count (total material rows)
    let recordCount = 0
    for (const order of allOrders) {
      recordCount += order.materials.length
    }

    console.log(`[Extractor] Total orders: ${allOrders.length}, total records: ${recordCount}`)

    if (recordCount === 0) {
      console.warn('[Extractor] No records found in any of the downloaded files')
      return { mergedFile: null, recordCount: 0 }
    }

    // Generate output filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, '')
      .replace(/\..+/, '')
      .slice(0, 14)
    const outputPath = path.join(this.downloadDir, `merged_${timestamp}.xlsx`)

    // Save with error handling
    try {
      console.log(`[Extractor] Saving merged file to: ${outputPath}`)
      await this.saveMergedOrders(allOrders, outputPath)
      console.log(`[Extractor] Successfully saved merged file with ${recordCount} records`)
      return { mergedFile: outputPath, recordCount }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : ''
      console.error(`[Extractor] Failed to save merged file: ${errorMsg}`)
      console.error(`[Extractor] Error stack: ${errorStack}`)
      // Return parsed record count and error info even if save fails
      return { mergedFile: null, recordCount, error: `保存合并文件失败: ${errorMsg}` }
    }
  }

  /**
   * Save merged orders to a new Excel file with full 31 columns
   * Matches the output format of ExcelParser.saveAsExcel()
   */
  private async saveMergedOrders(
    orders: Array<{ orderInfo: any; materials: any[] }>,
    outputPath: string
  ): Promise<void> {
    console.log(`[Extractor] Loading ExcelJS...`)
    const ExcelJSModule = await import('exceljs')
    // Handle both ESM and CommonJS module formats
    const ExcelJS = ExcelJSModule.default || ExcelJSModule
    console.log(`[Extractor] ExcelJS loaded, creating workbook...`)

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
      { header: '产品单位', key: 'productUnit', width: 10 },
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

    console.log(`[Extractor] Adding ${orders.length} orders to worksheet...`)
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

    console.log(`[Extractor] Writing file to ${outputPath}...`)
    await workbook.xlsx.writeFile(outputPath)
    console.log(`[Extractor] File saved successfully: ${outputPath}`)
  }

  /**
   * Clean up temporary batch files after merging
   * @param filePaths - Array of temporary file paths to delete
   */
  private async cleanupTempFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath)
        console.log(`Deleted temporary file: ${filePath}`)
      } catch (error) {
        // Log error but don't fail the main process
        console.error(`Failed to delete temporary file ${filePath}:`, error)
      }
    }
  }

  /**
   * Import merged Excel data to database
   * @param filePath - Path to the merged Excel file
   * @returns Import result with statistics
   */
  private async importToDatabase(filePath: string): Promise<ImportResult> {
    console.log(`[Extractor] Starting database import from: ${filePath}`)

    const importService = new DataImportService()

    try {
      const result = await importService.importFromExcel(filePath, 1000)

      console.log(`[Extractor] Import completed`, {
        success: result.success,
        recordsRead: result.recordsRead,
        recordsDeleted: result.recordsDeleted,
        recordsImported: result.recordsImported
      })

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[Extractor] Import failed: ${errorMsg}`)

      return {
        success: false,
        recordsRead: 0,
        recordsDeleted: 0,
        recordsImported: 0,
        uniqueSourceNumbers: 0,
        errors: [errorMsg]
      }
    }
  }

  /**
   * Import merged Excel data to database with logging
   * @param filePath - Path to the merged Excel file
   * @param onLog - Optional log callback
   * @returns Import result with statistics
   */
  private async importToDatabaseWithLogging(
    filePath: string,
    onLog?: (level: LogLevel, message: string) => void
  ): Promise<ImportResult> {
    console.log(`[Extractor] Starting database import from: ${filePath}`)
    onLog?.('info', `开始导入数据到数据库...`)

    const importService = new DataImportService()

    try {
      const result = await importService.importFromExcel(filePath, 1000)

      console.log(`[Extractor] Import completed`, {
        success: result.success,
        recordsRead: result.recordsRead,
        recordsDeleted: result.recordsDeleted,
        recordsImported: result.recordsImported
      })

      if (result.success) {
        onLog?.(
          'success',
          `导入完成：读取 ${result.recordsRead} 条，删除 ${result.recordsDeleted} 条，导入 ${result.recordsImported} 条`
        )
      } else if (result.errors.length > 0) {
        result.errors.forEach((err) => onLog?.('error', err))
      }

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[Extractor] Import failed: ${errorMsg}`)
      onLog?.('error', `导入失败：${errorMsg}`)

      return {
        success: false,
        recordsRead: 0,
        recordsDeleted: 0,
        recordsImported: 0,
        uniqueSourceNumbers: 0,
        errors: [errorMsg]
      }
    }
  }
}
