import ExcelJS from 'exceljs';
import type {
  DiscreteMaterialPlan,
  ExcelParseOptions,
  OrderHeader,
} from '../../types/excel.types';
import path from 'path';

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
    单位: '产品单位',
  };

  // Mapping from Chinese field names to English property names
  private CHINESE_TO_ENGLISH_MAPPING: Record<string, string> = {
    生产部门: 'productionDepartment',
    生产订单: 'productionOrder',
    产品编码: 'productCode',
    产品名称: 'productName',
    产品规格: 'productSpecification',
    计划数量: 'plannedQuantity',
    单位: 'unit',
    需用日期: 'requiredDate',
    制单人: 'creator',
    打印人: 'printer',
    打印日期: 'printDate',
    // Mapped fields (after FIELD_NAME_MAPPING)
    产品计划数量: 'plannedQuantity',
    产品单位: 'unit',
  };

  private verbose: boolean;

  constructor(options: ExcelParseOptions = {}) {
    this.verbose = options.verbose || false;
  }

  private log(...args: any[]): void {
    if (this.verbose) {
      console.log('[ExcelParser]', ...args);
    }
  }

  /**
   * Parse Excel file and extract material plans
   */
  async parse(filePath: string, options: ExcelParseOptions = {}): Promise<DiscreteMaterialPlan[]> {
    this.log('Parsing Excel file:', filePath);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('No worksheet found in file');
    }

    const plans: DiscreteMaterialPlan[] = [];
    const allRows: any[][] = [];

    // Read all rows into memory
    worksheet.eachRow((row, rowNumber) => {
      allRows.push(row.values as any[]);
    });

    // Parse orders from rows
    const orders = this.parseOrders(allRows);

    // Flatten orders into material plans
    for (const order of orders) {
      const { orderInfo, materials } = order;

      // Skip empty orders if option is set
      if (options.skipEmptyOrders && materials.length === 0) {
        this.log('Skipping empty order:', orderInfo.productionOrder);
        continue;
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
          rowNumber: material.rowNumber,
        };
        plans.push(plan);
      }
    }

    this.log(`Parsed ${plans.length} material plans from ${orders.length} orders`);

    return plans;
  }

  /**
   * Parse orders from all rows
   * Reference: _parse_sheet() in Python code
   */
  private parseOrders(allRows: any[][]): Array<{ orderInfo: OrderHeader; materials: any[] }> {
    const orders: Array<{ orderInfo: OrderHeader; materials: any[] }> = [];
    let i = 0;

    while (i < allRows.length) {
      const row = allRows[i];

      // Check if this is an order title row
      if (row && row[2] && String(row[2]).includes('离散备料计划')) {
        this.log('Found order at row', i + 1);

        // Parse order header info (next 4 rows)
        const orderInfo: OrderHeader = {};
        for (let j = 1; j <= 4; j++) {
          if (i + j < allRows.length && allRows[i + j]) {
            this.parseHeaderRow(allRows[i + j], orderInfo);
          }
        }

        // Skip empty rows to find table header
        let tableRow = i + 5;
        while (
          tableRow < allRows.length &&
          (!allRows[tableRow] || !allRows[tableRow][2])
        ) {
          tableRow++;
        }

        // Check if this is the table header row
        if (
          tableRow < allRows.length &&
          allRows[tableRow] &&
          allRows[tableRow][2] === '序号'
        ) {
          // Check if next row is empty (no data)
          const nextRow = tableRow + 1;
          const isEmptyRow =
            nextRow < allRows.length &&
            allRows[nextRow] &&
            allRows[nextRow].every(
              (cell: any) => cell === null || String(cell).trim() === ''
            );

          if (isEmptyRow) {
            // No data, find footer info
            this.log('Order has no material data');
            const materials: any[] = [];
            const footerInfo: OrderHeader = {};
            let dataRow = nextRow + 1;

            while (dataRow < allRows.length && allRows[dataRow]) {
              if (
                allRows[dataRow][2] &&
                (String(allRows[dataRow][2]).includes('制单人') ||
                  String(allRows[dataRow][2]).includes('打印人'))
              ) {
                this.parseHeaderRow(allRows[dataRow], footerInfo);
                if (dataRow + 1 < allRows.length && allRows[dataRow + 1]) {
                  this.parseHeaderRow(allRows[dataRow + 1], footerInfo);
                }
                break;
              }
              dataRow++;
            }

            orders.push({
              orderInfo: { ...orderInfo, ...footerInfo },
              materials,
            });
          } else {
            // Has data, extract materials
            this.log('Order has material data');
            const materials: any[] = [];
            const footerInfo: OrderHeader = {};
            let dataRow = tableRow + 1;

            while (dataRow < allRows.length && allRows[dataRow]) {
              // Check if CURRENT row is footer info (制单人/打印人)
              const isCurrentRowFooter =
                allRows[dataRow][2] &&
                (String(allRows[dataRow][2]).includes('制单人') ||
                  String(allRows[dataRow][2]).includes('打印人'));

              // Check if NEXT row is footer info (to handle empty row before footer)
              const isNextRowFooter =
                dataRow + 1 < allRows.length &&
                allRows[dataRow + 1] &&
                allRows[dataRow + 1][2] &&
                (String(allRows[dataRow + 1][2]).includes('制单人') ||
                  String(allRows[dataRow + 1][2]).includes('打印人'));

              if (isCurrentRowFooter) {
                // Current row is footer, parse it and next row if exists
                this.parseHeaderRow(allRows[dataRow], footerInfo);
                if (dataRow + 1 < allRows.length && allRows[dataRow + 1]) {
                  this.parseHeaderRow(allRows[dataRow + 1], footerInfo);
                }
                this.log('  Found footer row, stopping material parsing');
                break;
              }

              if (isNextRowFooter) {
                // Next row is footer, parse current row as material first
                const material = this.parseMaterialRow(allRows[dataRow], dataRow + 1);
                if (material) {
                  this.log('  Parsed material:', material.materialCode);
                  materials.push(material);
                }

                // Then parse footer rows
                this.parseHeaderRow(allRows[dataRow + 1], footerInfo);
                if (dataRow + 2 < allRows.length && allRows[dataRow + 2]) {
                  this.parseHeaderRow(allRows[dataRow + 2], footerInfo);
                }
                this.log('  Found footer in next row, stopping material parsing');
                break;
              }

              // Extract material data
              const material = this.parseMaterialRow(allRows[dataRow], dataRow + 1);
              if (material) {
                this.log('  Parsed material:', material.materialCode);
                materials.push(material);
              } else {
                this.log('  Skipped material row at', dataRow + 1);
              }

              dataRow++;
            }

            orders.push({
              orderInfo: { ...orderInfo, ...footerInfo },
              materials,
            });
          }
        }

        // Move to next row after this order
        i = tableRow + 1;
      } else {
        i++;
      }
    }

    return orders;
  }

  /**
   * Parse header row (field names and values interleaved)
   * Reference: _parse_header_row() in Python code
   */
  private parseHeaderRow(row: any[], info: OrderHeader): void {
    let j = 0;
    while (j < row.length) {
      const cell = row[j];
      if (cell && String(cell).trim() && String(cell).includes('：')) {
        // Found field name
        let fieldName = String(cell).replace('：', '').trim();

        // Apply field name mapping (from Python code)
        if (fieldName in this.FIELD_NAME_MAPPING) {
          fieldName = this.FIELD_NAME_MAPPING[fieldName];
        }

        // Map Chinese field name to English property name
        const englishFieldName = this.CHINESE_TO_ENGLISH_MAPPING[fieldName] || fieldName;

        // Skip empty cells to find first non-field-name value
        let k = j + 1;
        while (
          k < row.length &&
          (!row[k] || !String(row[k]).trim() || String(row[k]).includes('：'))
        ) {
          k++;
        }

        if (k < row.length && row[k] && !String(row[k]).includes('：')) {
          info[englishFieldName as keyof OrderHeader] = String(row[k]).trim();
        }

        // Skip processed value, continue to next field name
        j = k + 1;
      } else {
        j++;
      }
    }
  }

  /**
   * Parse material data row
   * Reference: material data extraction in Python code
   * ExcelJS arrays are 1-indexed (index 0 is null), so data starts at index 2
   */
  private parseMaterialRow(row: any[], rowNumber: number): any | null {
    // Extract 13 fields from material row (starting at index 2)
    const material = {
      sequence: row[2],
      materialCode: row[3],
      materialName: row[4],
      specification: row[5],
      model: row[6],
      drawingNumber: row[7],
      material: row[8],
      quantity: this.parseFloat(row[9]),
      unit: row[10],
      requiredDate: row[11],
      warehouse: row[12],
      unitUsage: this.parseFloat(row[13]),
      cumulativeOutboundQty: this.parseFloat(row[14]),
      rowNumber,
    };

    // Skip if no material code
    if (!material.materialCode) {
      return null;
    }

    return material;
  }

  /**
   * Safely parse float from cell value
   */
  private parseFloat(value: any): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? undefined : parsed;
  }
}
