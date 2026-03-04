# Implementation Plan: Auto-import Extracted Data to Database

## Overview
Implement automatic database import after ERP data extraction completes. The merged Excel file will be read and written to the `dbo_DiscreteMaterialPlanData` table.

## Requirements
- **Trigger**: Automatic after extraction completes
- **Delete Strategy**: Batch delete by `SourceNumber` before insert
- **Batch Insert**: 1000 records per batch
- **Field Mapping**: 28 Excel fields → database columns (skip 打印人, 打印日期, BOMVersion)

## Architecture

```
ExtractorService
    │
    ├── extract() → download + merge Excel
    │
    └── NEW: importToDatabase(mergedFile)
            │
            ▼
        DataImportService
            │
            ├── readExcelFile() → records + sourceNumbers
            ├── deleteExistingRecords(sourceNumbers)
            └── batchInsert(records, batchSize=1000)
                    │
                    ▼
                DiscreteMaterialPlanDAO
                    ├── deleteBySourceNumbers()
                    └── batchInsert()
```

## Field Mapping

| Excel Header | Database Column | Notes |
|-------------|-----------------|-------|
| 工厂 | Factory | |
| 备料状态 | MaterialStatus | |
| 备料计划单号 | PlanNumber | |
| 来源单号 | SourceNumber | **Deletion key** |
| 备料类型 | MaterialType | |
| 产品编码 | ProductCode | |
| 产品名称 | ProductName | |
| 产品计划数量 | ProductPlanQuantity | decimal |
| 产品单位 | ProductUnit | |
| 用料部门 | UseDepartment | |
| 备注 | Remark | |
| 制单人 | Creator | |
| 制单日期 | CreateDate | date |
| 审批人 | Approver | |
| 审批日期 | ApproveDate | date |
| 序号 | SequenceNumber | int |
| 材料编码 | MaterialCode | |
| 材料名称 | MaterialName | |
| 规格 | Specification | |
| 型号 | Model | |
| 图号 | DrawingNumber | |
| 物料材质 | MaterialQuality | |
| 计划数量 | PlanQuantity | decimal |
| 单位 | Unit | |
| 需用日期 | RequiredDate | date |
| 发料仓库 | Warehouse | |
| 单位用量 | UnitUsage | decimal |
| 累计出库数量 | CumulativeOutputQuantity | decimal |
| 打印人 | ❌ SKIP | Not in DB |
| 打印日期 | ❌ SKIP | Not in DB |
| - | BOMVersion | SKIP (no source) |

## Files to Create/Modify

### 1. NEW: `src/main/services/database/data-importer.ts`
Main import service with:
- `importFromExcel(filePath)` - Main entry point
- `readExcelFile(filePath)` - Parse Excel using ExcelJS
- Map Excel columns to database fields
- Return records and unique SourceNumbers

### 2. MODIFY: `src/main/services/database/discrete-material-plan-dao.ts`
Add methods:
- `deleteBySourceNumbers(sourceNumbers: string[])` - Batch delete
- `batchInsert(records: MaterialPlanRecord[], batchSize: number)` - Batch insert

### 3. MODIFY: `src/main/services/erp/extractor.ts`
- After successful merge, call `importToDatabase(mergedFile)`
- Add import results to `ExtractorResult`

### 4. MODIFY: `src/main/types/extractor.types.ts`
Add types:
```typescript
export interface ImportResult {
  success: boolean
  recordsImported: number
  recordsDeleted: number
  errors: string[]
}

export interface ExtractorResult {
  // existing fields...
  importResult?: ImportResult
}
```

### 5. MODIFY: `src/renderer/src/pages/ExtractorPage.tsx`
- Display import results
- Show records deleted/imported counts

## Implementation Order

1. Extend `DiscreteMaterialPlanDAO` with insert/delete methods
2. Create `DataImportService`
3. Integrate into `ExtractorService`
4. Update types
5. Update UI

## Testing Plan
1. Unit test DAO methods
2. Integration test with sample Excel file
3. E2E test extraction → import flow