/**
 * Data Import Service
 *
 * Reads Excel files and imports data to the DiscreteMaterialPlanData table.
 * Workflow:
 * 1. Read Excel file
 * 2. Extract unique SourceNumbers
 * 3. Delete existing records by SourceNumber
 * 4. Batch insert new records
 */

import { createLogger } from '../logger'
import { DiscreteMaterialPlanDAO, type MaterialPlanRecord } from './discrete-material-plan-dao'

const log = createLogger('DataImportService')

/**
 * Excel column header to database field mapping
 */
const EXCEL_TO_DB_MAPPING: Record<string, keyof MaterialPlanRecord> = {
  工厂: 'factory',
  备料状态: 'materialStatus',
  备料计划单号: 'planNumber',
  来源单号: 'sourceNumber',
  备料类型: 'materialType',
  产品编码: 'productCode',
  产品名称: 'productName',
  产品计划数量: 'productPlanQuantity',
  产品单位: 'productUnit',
  用料部门: 'useDepartment',
  备注: 'remark',
  制单人: 'creator',
  制单日期: 'createDate',
  审批人: 'approver',
  审批日期: 'approveDate',
  序号: 'sequenceNumber',
  材料编码: 'materialCode',
  材料名称: 'materialName',
  规格: 'specification',
  型号: 'model',
  图号: 'drawingNumber',
  物料材质: 'materialQuality',
  计划数量: 'planQuantity',
  单位: 'unit',
  需用日期: 'requiredDate',
  发料仓库: 'warehouse',
  单位用量: 'unitUsage',
  累计出库数量: 'cumulativeOutputQuantity'
  // Note: '打印人', '打印日期' are skipped (not in DB)
  // Note: 'BOMVersion' is skipped (not in Excel)
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean
  recordsRead: number
  recordsDeleted: number
  recordsImported: number
  uniqueSourceNumbers: number
  errors: string[]
}

/**
 * DataImportService class
 */
export class DataImportService {
  private dao: DiscreteMaterialPlanDAO

  constructor() {
    this.dao = new DiscreteMaterialPlanDAO()
  }

  /**
   * Import data from Excel file to database
   * @param filePath - Path to the Excel file
   * @param batchSize - Number of records per insert batch (default: 1000)
   * @returns Import result with statistics
   */
  async importFromExcel(filePath: string, batchSize = 1000): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      recordsRead: 0,
      recordsDeleted: 0,
      recordsImported: 0,
      uniqueSourceNumbers: 0,
      errors: []
    }

    try {
      log.info('Starting import from Excel', { filePath, batchSize })

      // Step 1: Read Excel file
      log.info('Reading Excel file...')
      const { records, sourceNumbers } = await this.readExcelFile(filePath)
      result.recordsRead = records.length
      result.uniqueSourceNumbers = sourceNumbers.size

      log.info('Excel read completed', {
        recordsRead: result.recordsRead,
        uniqueSourceNumbers: result.uniqueSourceNumbers
      })

      if (records.length === 0) {
        result.success = true
        result.errors.push('Excel file contains no data records')
        return result
      }

      // Step 2: Delete existing records by SourceNumber
      log.info('Deleting existing records...', {
        sourceNumberCount: sourceNumbers.size
      })

      const sourceNumberArray = Array.from(sourceNumbers)
      result.recordsDeleted = await this.dao.deleteBySourceNumbers(sourceNumberArray)

      log.info('Existing records deleted', {
        recordsDeleted: result.recordsDeleted
      })

      // Step 3: Batch insert new records
      log.info('Inserting new records...', {
        recordCount: records.length,
        batchSize
      })

      result.recordsImported = await this.dao.batchInsert(records, batchSize)

      log.info('Records imported successfully', {
        recordsImported: result.recordsImported
      })

      result.success = true
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.errors.push(`Import failed: ${errorMsg}`)
      log.error('Import failed', { error: errorMsg })
    } finally {
      // Disconnect DAO
      try {
        await this.dao.disconnect()
      } catch (e) {
        log.warn('Error disconnecting DAO', {
          error: e instanceof Error ? e.message : String(e)
        })
      }
    }

    return result
  }

  /**
   * Read Excel file and extract records
   * @param filePath - Path to the Excel file
   * @returns Records and unique SourceNumbers
   */
  private async readExcelFile(
    filePath: string
  ): Promise<{ records: MaterialPlanRecord[]; sourceNumbers: Set<string> }> {
    const records: MaterialPlanRecord[] = []
    const sourceNumbers = new Set<string>()

    // Dynamic import ExcelJS
    const ExcelJSModule = await import('exceljs')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ExcelJS = (ExcelJSModule as any).default || ExcelJSModule

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)

    // Get first worksheet
    const worksheet = workbook.worksheets[0]
    if (!worksheet) {
      throw new Error('Excel file has no worksheets')
    }

    // Get header row to map column indices
    const headerRow = worksheet.getRow(1)
    const columnMapping = this.buildColumnMapping(headerRow)

    log.debug('Column mapping built', {
      columnCount: Object.keys(columnMapping).length
    })

    // Iterate through data rows (starting from row 2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    worksheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber === 1) return // Skip header row

      try {
        const record = this.buildRecordFromRow(row, columnMapping)
        if (record) {
          records.push(record)
          if (record.sourceNumber) {
            sourceNumbers.add(record.sourceNumber)
          }
        }
      } catch (error) {
        log.warn('Failed to parse row', {
          rowNumber,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })

    return { records, sourceNumbers }
  }

  /**
   * Build column index to field name mapping from header row
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildColumnMapping(headerRow: any): Map<number, keyof MaterialPlanRecord> {
    const mapping = new Map<number, keyof MaterialPlanRecord>()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    headerRow.eachCell((cell: any, colNumber: number) => {
      const headerText = cell.text?.toString().trim()
      if (headerText && EXCEL_TO_DB_MAPPING[headerText]) {
        mapping.set(colNumber, EXCEL_TO_DB_MAPPING[headerText])
      }
    })

    return mapping
  }

  /**
   * Build a MaterialPlanRecord from an Excel row
   */
  private buildRecordFromRow(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row: any,
    columnMapping: Map<number, keyof MaterialPlanRecord>
  ): MaterialPlanRecord | null {
    const record: Partial<MaterialPlanRecord> = {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row.eachCell((cell: any, colNumber: number) => {
      const fieldName = columnMapping.get(colNumber)
      if (!fieldName) return

      const value = this.parseCellValue(cell, fieldName)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      record[fieldName] = value as any
    })

    // Validate required fields
    if (!record.planNumber) {
      return null // Skip records without PlanNumber
    }

    return record as MaterialPlanRecord
  }

  /**
   * Parse cell value based on field type
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseCellValue(cell: any, fieldName: keyof MaterialPlanRecord): any {
    const text = cell.text?.toString().trim()
    const value = cell.value

    // Return null for empty cells
    if (!text || text === '') {
      return null
    }

    // Handle numeric fields
    const numericFields: (keyof MaterialPlanRecord)[] = [
      'productPlanQuantity',
      'sequenceNumber',
      'planQuantity',
      'unitUsage',
      'cumulativeOutputQuantity'
    ]

    if (numericFields.includes(fieldName)) {
      const num = parseFloat(text)
      return isNaN(num) ? null : num
    }

    // Handle date fields
    const dateFields: (keyof MaterialPlanRecord)[] = ['createDate', 'approveDate', 'requiredDate']

    if (dateFields.includes(fieldName)) {
      // ExcelJS returns date as Date object if recognized
      if (value instanceof Date) {
        return value
      }
      // Try to parse date string
      const date = new Date(text)
      return isNaN(date.getTime()) ? null : date
    }

    // Handle string fields
    return text
  }
}

/**
 * Create a DataImportService instance
 */
export function createDataImportService(): DataImportService {
  return new DataImportService()
}
