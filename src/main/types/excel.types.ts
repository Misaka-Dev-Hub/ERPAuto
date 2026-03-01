/**
 * Excel Parser Types
 * Defines the structure for parsed Excel data from ERP system
 */

/**
 * Represents a discrete material plan row from Excel
 * Based on the ERP Excel export structure
 */
export interface DiscreteMaterialPlan {
  /** Order number (e.g., SC202501001) */
  orderNumber: string;

  /** Production ID from order header */
  productionId: string;

  /** Material code (材料编码) */
  materialCode: string;

  /** Material name (材料名称) */
  materialName: string;

  /** Specification (规格) */
  specification?: string;

  /** Model (型号) */
  model?: string;

  /** Drawing number (图号) */
  drawingNumber?: string;

  /** Material (物料材质) */
  material?: string;

  /** Planned quantity (计划数量) */
  quantity: number;

  /** Unit (单位) */
  unit: string;

  /** Required date (需用日期) */
  requiredDate?: string;

  /** Warehouse (发料仓库) */
  warehouse?: string;

  /** Unit usage (单位用量) */
  unitUsage?: number;

  /** Cumulative outbound quantity (累计出库数量) */
  cumulativeOutboundQty?: number;

  /** Row number in Excel file */
  rowNumber?: number;
}

/**
 * Options for Excel parsing
 */
export interface ExcelParseOptions {
  /** Skip orders with no material data */
  skipEmptyOrders?: boolean;

  /** Skip footer rows (制单人/打印人) */
  skipFooter?: boolean;

  /** Custom field mapping */
  fieldMapping?: Record<string, string>;

  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Order header information from Excel
 */
export interface OrderHeader {
  /** Order title (离散备料计划) */
  title?: string;

  /** Production department (生产部门) */
  productionDepartment?: string;

  /** Production order (生产订单) */
  productionOrder?: string;

  /** Product code (产品编码) */
  productCode?: string;

  /** Product name (产品名称) */
  productName?: string;

  /** Product specification (产品规格) */
  productSpecification?: string;

  /** Planned quantity (计划数量) */
  plannedQuantity?: string;

  /** Unit (单位) */
  unit?: string;

  /** Required date (需用日期) */
  requiredDate?: string;

  /** Creator (制单人) */
  creator?: string;

  /** Printer (打印人) */
  printer?: string;

  /** Print date (打印日期) */
  printDate?: string;
}
