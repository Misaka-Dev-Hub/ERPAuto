import ExcelJS from 'exceljs'
import type { DiscreteMaterialPlan, ExcelParseOptions, OrderHeader } from '../../types/excel.types'
import { createLogger } from '../logger'

const log = createLogger('ExcelParser')

/**
 * Excel Parser Service
 * Parses exported ERP Excel files into structured data
 *
 * Reference: playwrite/utils/excel_converter.py
 *
 * Excel Structure:
 * - Multiple orders per file (each starting with "离散备料计划")
 * - Each order has: header info (4 lines) + table header + data rows + footer
 * - Material rows have 13 columns from "序号" to "累计出库数量"
 */
export class ExcelParser {
  // Field name mapping for Python compatibility (from Python code)
  private FIELD_NAME_MAPPING: Record<string, string> = {
    计划数量: '产品计划数量',
    单位: '产品单位'
  }

  // Mapping from Chinese field names to English property names
  private CHINESE_TO_ENGLISH_MAPPING: Record<string, string> = {
    // Header fields (row 2-4)
    工厂: 'factory',
    备料状态: 'materialStatus',
    备料计划单号: 'planNumber',
    备料类型: 'materialType',
    生产部门: 'productionDepartment',
    生产订单: 'productionOrder',
    来源单号: 'productionOrder', // This is the order number we need!
    产品编码: 'productCode',
    产品名称: 'productName',
    产品规格: 'productSpecification',
    计划数量: 'plannedQuantity',
    单位: 'unit',
    用料部门: 'department',
    备注: 'remark',
    需用日期: 'requiredDate',
    // Footer fields (row 14-15)
    制单人: 'creator',
    制单日期: 'createDate',
    审批人: 'approver',
    审批日期: 'approveDate',
    打印人: 'printer',
    打印日期: 'printDate',
    // Mapped fields (after FIELD_NAME_MAPPING)
    产品计划数量: 'plannedQuantity',
    产品单位: 'unit'
  }

  /**
   * Parse Excel file and extract material plans
   */
  async parse(filePath: string, options: ExcelParseOptions = {}): Promise<DiscreteMaterialPlan[]> {
    log.debug('Parsing Excel file:', filePath)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)

    const worksheet = workbook.worksheets[0]
    if (!worksheet) {
      throw new Error('No worksheet found in file')
    }

    const plans: DiscreteMaterialPlan[] = []
    const allRows: any[][] = []

    // Read all rows into memory
    worksheet.eachRow((row, _rowNumber) => {
      allRows.push(row.values as any[])
    })

    log.debug(`Total rows read: ${allRows.length} (worksheet has ${worksheet.rowCount} rows)`)

    // Parse orders from rows
    const orders = this.parseOrders(allRows)

    // Store orders for potential Excel export
    ;(this as any).lastOrders = orders

    // Flatten orders into material plans
    for (const order of orders) {
      const { orderInfo, materials } = order

      // Skip empty orders if option is set
      if (options.skipEmptyOrders && materials.length === 0) {
        log.debug('Skipping empty order:', orderInfo.productionOrder)
        continue
      }

      // Create a material plan for each material row
      for (const material of materials) {
        const plan: DiscreteMaterialPlan = {
          orderNumber: orderInfo.productionOrder || '',
          productionId: orderInfo.productCode || '',
          materialCode: material.materialCode || '',
          materialName: material.materialName || '',
          specification: material.specification,
          model: material.model,
          drawingNumber: material.drawingNumber,
          material: material.material,
          quantity: material.quantity || 0,
          unit: material.unit || '',
          requiredDate: material.requiredDate,
          warehouse: material.warehouse,
          unitUsage: material.unitUsage,
          cumulativeOutboundQty: material.cumulativeOutboundQty,
          rowNumber: material.rowNumber
        }
        plans.push(plan)
      }
    }

    log.debug(`Parsed ${plans.length} material plans from ${orders.length} orders`)

    return plans
  }

  /**
   * Save parsed orders to Excel file
   * Compatible with Python excel_converter.py output format
   * Uses the last parsed orders data
   *
   * @param outputPath - Output Excel file path
   */
  async saveAsExcel(outputPath: string): Promise<void> {
    const orders = (this as any).lastOrders
    if (!orders) {
      throw new Error('No parsed data available. Call parse() first.')
    }

    log.debug('Saving parsed data to Excel:', outputPath)

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    // Define columns matching Python excel_converter output format exactly
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

    // Add data rows - merge orderInfo with each material
    for (const order of orders) {
      const { orderInfo, materials } = order

      for (const material of materials) {
        worksheet.addRow({
          // Order info (first 14 columns)
          factory: orderInfo.factory || '',
          materialStatus: orderInfo.materialStatus || '',
          planNumber: orderInfo.planNumber || '',
          productionOrder: orderInfo.productionOrder || '',
          materialType: orderInfo.materialType || '',
          productCode: orderInfo.productCode || '',
          productName: orderInfo.productName || '',
          productPlannedQuantity: orderInfo.plannedQuantity || '',
          unit: orderInfo.unit || '',
          department: orderInfo.department || '',
          remark: orderInfo.remark || '',
          creator: orderInfo.creator || '',
          createDate: orderInfo.createDate || '',
          approver: orderInfo.approver || '',
          approveDate: orderInfo.approveDate || '',
          // Material data (columns 15-28)
          sequence: material.sequence || '',
          materialCode: material.materialCode || '',
          materialName: material.materialName || '',
          specification: material.specification || '',
          model: material.model || '',
          drawingNumber: material.drawingNumber || '',
          material: material.material || '',
          quantity: material.quantity || 0,
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

    // Save workbook
    await workbook.xlsx.writeFile(outputPath)
    log.debug(
      `Excel file saved: ${outputPath} (${orders.length} orders, ${worksheet.rowCount - 1} data rows)`
    )
  }

  /**
   * Parse orders from all rows
   * Reference: _parse_sheet() in Python code
   */
  private parseOrders(allRows: any[][]): Array<{ orderInfo: OrderHeader; materials: any[] }> {
    const orders: Array<{ orderInfo: OrderHeader; materials: any[] }> = []
    let i = 0

    while (i < allRows.length) {
      const row = allRows[i]

      // Check if this is an order title row
      if (row && row[2] && String(row[2]).includes('离散备料计划')) {
        // Parse order header info (next 4 rows)
        const orderInfo: OrderHeader = {}
        for (let j = 1; j <= 4; j++) {
          if (i + j < allRows.length && allRows[i + j]) {
            this.parseHeaderRow(allRows[i + j], orderInfo)
          }
        }

        // Debug: check productionOrder extraction
        log.debug(`Order ${orders.length + 1}: productionOrder="${orderInfo.productionOrder}"`)

        // Find table header row dynamically (look for "序号" in index 1)
        // Note: worksheet.eachRow() skips empty rows, so we can't use fixed offsets
        let tableRow = i + 1
        while (tableRow < allRows.length && allRows[tableRow] && allRows[tableRow][1] !== '序号') {
          tableRow++
        }

        if (tableRow >= allRows.length || !allRows[tableRow]) {
          log.debug('  ⚠️ Table header not found, skipping this order')
          i++
          continue
        }

        // Check if this is the table header row
        // ExcelJS is 1-indexed: index 0=null, index 1=序号, index 2=材料编码
        if (tableRow < allRows.length && allRows[tableRow] && allRows[tableRow][1] === '序号') {
          // Check if next row is empty (no data)
          const nextRow = tableRow + 1
          const isEmptyRow =
            nextRow < allRows.length &&
            allRows[nextRow] &&
            allRows[nextRow].every((cell: any) => cell === null || String(cell).trim() === '')

          if (isEmptyRow) {
            // No data, find footer info
            log.debug('Order has no material data')
            const materials: any[] = []
            const footerInfo: OrderHeader = {}
            let dataRow = nextRow + 1

            while (dataRow < allRows.length && allRows[dataRow]) {
              if (
                allRows[dataRow][2] &&
                (String(allRows[dataRow][2]).includes('制单人') ||
                  String(allRows[dataRow][2]).includes('打印人'))
              ) {
                this.parseHeaderRow(allRows[dataRow], footerInfo)
                if (dataRow + 1 < allRows.length && allRows[dataRow + 1]) {
                  this.parseHeaderRow(allRows[dataRow + 1], footerInfo)
                }
                break
              }
              dataRow++
            }

            orders.push({
              orderInfo: { ...orderInfo, ...footerInfo },
              materials
            })
          } else {
            // Has data, extract materials
            log.debug('Order has material data')
            const materials: any[] = []
            const footerInfo: OrderHeader = {}
            let dataRow = tableRow + 1

            while (dataRow < allRows.length && allRows[dataRow]) {
              // Check if CURRENT row is footer info (制单人/打印人)
              const isCurrentRowFooter =
                allRows[dataRow][2] &&
                (String(allRows[dataRow][2]).includes('制单人') ||
                  String(allRows[dataRow][2]).includes('打印人'))

              // Check if NEXT row is footer info (to handle empty row before footer)
              const isNextRowFooter =
                dataRow + 1 < allRows.length &&
                allRows[dataRow + 1] &&
                allRows[dataRow + 1][2] &&
                (String(allRows[dataRow + 1][2]).includes('制单人') ||
                  String(allRows[dataRow + 1][2]).includes('打印人'))

              if (isCurrentRowFooter) {
                // Current row is footer, parse it and next row if exists
                this.parseHeaderRow(allRows[dataRow], footerInfo)
                if (dataRow + 1 < allRows.length && allRows[dataRow + 1]) {
                  this.parseHeaderRow(allRows[dataRow + 1], footerInfo)
                }
                log.debug('  Found footer row, stopping material parsing')
                break
              }

              if (isNextRowFooter) {
                // Next row is footer, parse current row as material first
                const material = this.parseMaterialRowInternal(allRows[dataRow], dataRow + 1)
                if (material) {
                  log.debug('  Parsed material:', material.materialCode)
                  materials.push(material)
                }

                // Then parse footer rows
                this.parseHeaderRow(allRows[dataRow + 1], footerInfo)
                if (dataRow + 2 < allRows.length && allRows[dataRow + 2]) {
                  this.parseHeaderRow(allRows[dataRow + 2], footerInfo)
                }
                log.debug('  Found footer in next row, stopping material parsing')
                break
              }

              // Extract material data
              const material = this.parseMaterialRowInternal(allRows[dataRow], dataRow + 1)
              if (material) {
                //log.debug('  Parsed material:', material.materialCode)
                materials.push(material)
              } else {
                log.debug('  Skipped material row at', dataRow + 1)
              }

              dataRow++
            }

            orders.push({
              orderInfo: { ...orderInfo, ...footerInfo },
              materials
            })
          }
        } else {
          log.debug(
            `  ⚠️ Table header check failed at row ${tableRow + 1}, value="${allRows[tableRow] ? allRows[tableRow][1] : 'null'}"`
          )
        }

        // Move to next row after this order
        i = tableRow + 1
      } else {
        i++
      }
    }

    log.debug(`parseOrders: Returning ${orders.length} orders`)
    return orders
  }

  /**
   * Parse header row (field names and values interleaved)
   * Reference: _parse_header_row() in Python code
   */
  private parseHeaderRow(row: any[], info: OrderHeader): void {
    let j = 0
    while (j < row.length) {
      const cell = row[j]
      if (cell && String(cell).trim() && String(cell).includes('：')) {
        // Found field name
        let fieldName = String(cell).replace('：', '').trim()

        // Apply field name mapping (from Python code)
        if (fieldName in this.FIELD_NAME_MAPPING) {
          fieldName = this.FIELD_NAME_MAPPING[fieldName]
        }

        // Map Chinese field name to English property name
        const englishFieldName = this.CHINESE_TO_ENGLISH_MAPPING[fieldName] || fieldName

        // Skip empty cells to find first non-field-name value
        let k = j + 1
        while (
          k < row.length &&
          (!row[k] || !String(row[k]).trim() || String(row[k]).includes('：'))
        ) {
          k++
        }

        if (k < row.length && row[k] && !String(row[k]).includes('：')) {
          info[englishFieldName as keyof OrderHeader] = String(row[k]).trim()
        }

        // Skip processed value, continue to next field name
        j = k + 1
      } else {
        j++
      }
    }
  }

  /**
   * Parse material data row
   * Reference: material data extraction in Python code
   * ExcelJS row.values arrays are 1-indexed:
   * - Index 0: null
   * - Index 1: 序号 (sequence)
   * - Index 2: 材料编码 (materialCode)
   * - Index 3: 材料名称 (materialName)
   * - etc.
   * NOTE: This is an internal method that returns raw data structure
   */
  private parseMaterialRowInternal(row: any[], rowNumber: number): any | null {
    // Extract 13 fields from material row (ExcelJS is 1-indexed, so data starts at index 1)
    const material = {
      sequence: row[1],
      materialCode: row[2],
      materialName: row[3],
      specification: row[4],
      model: row[5],
      drawingNumber: row[6],
      material: row[7],
      quantity: this.parseFloat(row[8]),
      unit: row[9],
      requiredDate: row[10],
      warehouse: row[11],
      unitUsage: this.parseFloat(row[12]),
      cumulativeOutboundQty: this.parseFloat(row[13]),
      rowNumber
    }

    // Skip if no material code
    if (!material.materialCode) {
      return null
    }

    return material
  }

  /**
   * Safely parse float from cell value
   */
  private parseFloat(value: any): number | undefined {
    if (value === null || value === undefined) {
      return undefined
    }
    const parsed = parseFloat(String(value))
    return isNaN(parsed) ? undefined : parsed
  }

  /**
   * Check if row contains order information
   * (Spec-compliant method for detecting order rows)
   *
   * @param values - Row values array from ExcelJS
   * @returns true if row contains "离散备料计划" (order title)
   */
  public isOrderRow(values: any[]): boolean {
    // ExcelJS arrays are 1-indexed, check index 2 for order title
    const firstCell = values[2]
    return typeof firstCell === 'string' && firstCell.includes('离散备料计划')
  }

  /**
   * Extract order number from row
   * (Spec-compliant method for extracting order number)
   *
   * Parses a row containing order header information and extracts
   * the production order number (生产订单).
   *
   * @param values - Row values array from ExcelJS
   * @returns Order number (e.g., "SC202501001") or empty string
   */
  public extractOrderNumber(values: any[]): string {
    // Parse the row to extract order number using same logic as header parsing
    const orderInfo: OrderHeader = {}
    this.parseHeaderRow(values, orderInfo)
    return orderInfo.productionOrder || ''
  }

  /**
   * Parse material row
   * (Spec-compliant method for parsing material data)
   *
   * @param values - Row values array from ExcelJS (1-indexed, index 0 is null)
   * @param orderNumber - Order number for this material
   * @param productionId - Production ID for this material
   * @param rowNumber - Row number in Excel file
   * @returns DiscreteMaterialPlan or null if invalid row
   */
  public parseMaterialRow(
    values: any[],
    orderNumber: string,
    productionId: string,
    rowNumber: number
  ): DiscreteMaterialPlan | null {
    // ExcelJS arrays are 1-indexed:
    // Index 0: null
    // Index 1: 序号
    // Index 2: 材料编码
    // Index 3: 材料名称
    // Index 4: 规格
    // etc.
    const materialCode = values[2]?.toString().trim()
    const materialName = values[3]?.toString().trim()
    const specification = values[4]?.toString().trim()
    const model = values[5]?.toString().trim()
    const drawingNumber = values[6]?.toString().trim()
    const material = values[7]?.toString().trim()
    const quantity = this.parseFloat(values[8]) || 0
    const unit = values[9]?.toString().trim() || ''
    const requiredDate = values[10]?.toString().trim()
    const warehouse = values[11]?.toString().trim()
    const unitUsage = this.parseFloat(values[12])
    const cumulativeOutboundQty = this.parseFloat(values[13])

    // Skip if no material code
    if (!materialCode) {
      return null
    }

    return {
      orderNumber,
      productionId,
      materialCode,
      materialName,
      specification,
      model,
      drawingNumber,
      material,
      quantity,
      unit,
      requiredDate,
      warehouse,
      unitUsage,
      cumulativeOutboundQty,
      rowNumber
    }
  }
}
