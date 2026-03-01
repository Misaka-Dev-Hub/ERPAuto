import ExcelJS from 'exceljs';
import path from 'path';

/**
 * Create test fixture Excel files for unit tests
 */

async function createTestFixture() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  // Row 1: Order title
  worksheet.addRow([null, '离散备料计划']);

  // Row 2-5: Order header info
  worksheet.addRow([null, '生产部门：', null, '生产车间', '产品编码：', null, 'P001']);
  worksheet.addRow([null, '生产订单：', null, 'SC202501001', '产品名称：', null, '测试产品A']);
  worksheet.addRow([null, '产品规格：', null, '标准规格', '计划数量：', null, '100']);
  worksheet.addRow([null, '单位：', null, '件', '需用日期：', null, '2025-02-15']);

  // Row 6: Empty row before table header
  worksheet.addRow([]);

  // Row 7: Table header
  worksheet.addRow([
    null,
    '序号',
    '材料编码',
    '材料名称',
    '规格',
    '型号',
    '图号',
    '物料材质',
    '计划数量',
    '单位',
    '需用日期',
    '发料仓库',
    '单位用量',
    '累计出库数量',
  ]);

  // Row 8-10: Material data
  worksheet.addRow([
    null,
    1,
    'M001',
    '钢材A',
    '规格1',
    '型号1',
    '图号1',
    '材质1',
    50,
    'kg',
    '2025-02-10',
    '仓库1',
    0.5,
    0,
  ]);
  worksheet.addRow([
    null,
    2,
    'M002',
    '塑料B',
    '规格2',
    '型号2',
    '图号2',
    '材质2',
    100,
    'kg',
    '2025-02-12',
    '仓库1',
    1.0,
    20,
  ]);
  worksheet.addRow([
    null,
    3,
    'M003',
    '配件C',
    '规格3',
    null,
    null,
    null,
    200,
    '件',
    '2025-02-14',
    '仓库2',
    2.0,
    50,
  ]);

  // Row 11: Footer info
  worksheet.addRow([null, '制单人：', null, '张三', '打印人：', null, '李四']);
  worksheet.addRow([null, '打印日期：', null, '2025-01-15']);

  // Save file
  const filePath = path.resolve(__dirname, 'test-export.xlsx');
  await workbook.xlsx.writeFile(filePath);
  console.log('Created test fixture:', filePath);
}

async function createEmptyOrdersFixture() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  // Row 1: Order title
  worksheet.addRow([null, '离散备料计划']);

  // Row 2-5: Order header info
  worksheet.addRow([null, '生产部门：', null, '生产车间', '产品编码：', null, 'P002']);
  worksheet.addRow([null, '生产订单：', null, 'SC202501002', '产品名称：', null, '测试产品B']);
  worksheet.addRow([null, '产品规格：', null, '特殊规格', '计划数量：', null, '50']);
  worksheet.addRow([null, '单位：', null, '套', '需用日期：', null, '2025-03-01']);

  // Row 6: Empty row before table header
  worksheet.addRow([]);

  // Row 7: Table header
  worksheet.addRow([
    null,
    '序号',
    '材料编码',
    '材料名称',
    '规格',
    '型号',
    '图号',
    '物料材质',
    '计划数量',
    '单位',
    '需用日期',
    '发料仓库',
    '单位用量',
    '累计出库数量',
  ]);

  // Row 8: Empty row (no data)
  worksheet.addRow([]);

  // Row 9: Footer info
  worksheet.addRow([null, '制单人：', null, '王五', '打印人：', null, '赵六']);
  worksheet.addRow([null, '打印日期：', null, '2025-01-16']);

  // Save file
  const filePath = path.resolve(__dirname, 'test-empty-orders.xlsx');
  await workbook.xlsx.writeFile(filePath);
  console.log('Created empty orders fixture:', filePath);
}

async function main() {
  console.log('Creating test fixture Excel files...');
  await createTestFixture();
  await createEmptyOrdersFixture();
  console.log('Done!');
}

main().catch(console.error);
