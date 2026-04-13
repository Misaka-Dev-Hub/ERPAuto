# Cleaner 数据库持久化设计

## 背景

Cleaner 当前使用 Markdown 文件做执行记录持久化，通过 RustFS 上传存储。存在以下问题：

- 报告是非结构化文本，无法程序化查询和统计
- 历史记录无法按用户、时间、状态筛选
- 重试时依赖文件名去重，覆盖了首次执行的崩溃信息
- 前端需要通过 RustFS 下载报告再解析展示，链路长且脆弱

Extractor 已有成熟的数据库持久化模式（`ExtractorOperationHistory` 表 + DAO + 前端弹窗），Cleaner 应复用相同模式。

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 表结构 | 独立建表，不与 Extractor 共用 | Cleaner 数据结构差异大（双层、物料级详情），独立更清晰 |
| 记录粒度 | 执行 + 订单 + 物料三层 | 执行表存全局信息，订单表存订单汇总，物料表存操作明细 |
| 批次标识 | `BatchId`（UUID），与 Extractor 一致 | 标准、简洁，不需要嵌入时间戳 |
| 重试记录 | 不覆盖，每次尝试独立写入，用 `AttemptNumber` 区分 | 保留完整审计链，为后续智能跳过提供数据基础 |
| 报告文件 | 移除 Markdown 报告和 RustFS 上传 | 数据库完全替代，报告相关代码（CleanerReportGenerator、generateAndUploadReport）删除 |
| 前端历史 | 独立 CleanerOperationHistoryModal，复用 Extractor 的 UI 模式 | 放在 CleanerPage 上，与 Extractor 的"操作历史"按钮对齐 |

## 数据库表结构

所有表的 schema 为 `ERPAuto`。

### 1. `CleanerExecution`（执行级）

全限定名：`ERPAuto.CleanerExecution`

一次清理操作（含重试）的全局信息。每次尝试一行记录。

| 列名 | 类型 | 说明 |
|------|------|------|
| ID | INT IDENTITY | 自增主键 |
| BatchId | UNIQUEIDENTIFIER | 批次 ID，一次清理操作（含重试）共享 |
| AttemptNumber | INT | 第几次尝试（1=首次，2=外层重试） |
| UserId | INT | 操作用户 ID |
| Username | NVARCHAR(255) | 操作用户名 |
| OperationTime | DATETIME | 操作时间 |
| EndTime | DATETIME | 结束时间 |
| Status | NVARCHAR(50) | pending / success / failed / partial / crashed |
| IsDryRun | BIT | 是否模拟运行 |
| TotalOrders | INT | 订单总数 |
| OrdersProcessed | INT | 已处理订单数 |
| TotalMaterialsDeleted | INT | 总删除物料数 |
| TotalMaterialsSkipped | INT | 总跳过物料数 |
| TotalMaterialsFailed | INT | 总失败物料数 |
| TotalUncertainDeletions | INT | 总不确定删除数 |
| ErrorMessage | NVARCHAR(MAX) | 全局错误信息（如外层崩溃原因） |
| AppVersion | NVARCHAR(20) | 应用版本号 |

### 2. `CleanerOrderHistory`（订单级）

全限定名：`ERPAuto.CleanerOrderHistory`

每个订单在每次尝试中的执行结果。每个订单每次尝试一行记录。

| 列名 | 类型 | 说明 |
|------|------|------|
| ID | INT IDENTITY | 自增主键 |
| BatchId | UNIQUEIDENTIFIER | 关联执行表 BatchId |
| AttemptNumber | INT | 关联执行表 AttemptNumber |
| OrderNumber | NVARCHAR(255) | 订单号 |
| Status | NVARCHAR(50) | pending / success / failed |
| MaterialsDeleted | INT | 删除物料数 |
| MaterialsSkipped | INT | 跳过物料数 |
| MaterialsFailed | INT | 删除失败物料数 |
| UncertainDeletions | INT | 不确定删除数 |
| RetryCount | INT | 内层重试次数 |
| RetrySuccess | BIT | 内层重试是否成功 |
| ErrorMessage | NVARCHAR(MAX) | 错误信息 |

关联方式：`BatchId + AttemptNumber` 关联执行表。

### 3. `CleanerMaterialDetail`（物料级）

全限定名：`ERPAuto.CleanerMaterialDetail`

每个物料在每次尝试中的操作明细。

| 列名 | 类型 | 说明 |
|------|------|------|
| ID | INT IDENTITY | 自增主键 |
| BatchId | UNIQUEIDENTIFIER | 关联执行表 BatchId |
| AttemptNumber | INT | 关联执行表 AttemptNumber |
| OrderNumber | NVARCHAR(255) | 所属订单号 |
| MaterialCode | NVARCHAR(255) | 物料代码 |
| MaterialName | NVARCHAR(255) | 物料名称 |
| RowNumber | INT | 行号 |
| Result | NVARCHAR(50) | deleted / skipped / failed / uncertain |
| Reason | NVARCHAR(MAX) | 跳过/失败原因 |
| AttemptCount | INT | 删除尝试次数 |
| FinalErrorCategory | NVARCHAR(50) | 最终错误分类 |

关联方式：`BatchId + AttemptNumber + OrderNumber` 关联订单表。

### 数据示例

首次执行到第 80 个订单时崩溃，外层重试成功完成全部 211 个订单：

**CleanerExecution**
```
BatchId=uuid-1, Attempt=1, Status=crashed,  TotalOrders=211, Processed=80,  ...
BatchId=uuid-1, Attempt=2, Status=success,  TotalOrders=211, Processed=211, ...
```

**CleanerOrderHistory**（Attempt=1 中部分记录）
```
BatchId=uuid-1, Attempt=1, Order=SC001, Status=success, Deleted=5, Skipped=1
BatchId=uuid-1, Attempt=1, Order=SC080, Status=crashed, Error=查询超时
```

**CleanerOrderHistory**（Attempt=2 中部分记录）
```
BatchId=uuid-1, Attempt=2, Order=SC001, Status=success, Deleted=5, Skipped=1
BatchId=uuid-1, Attempt=2, Order=SC080, Status=success, Deleted=3, Skipped=0
BatchId=uuid-1, Attempt=2, Order=SC211, Status=success, Deleted=2, Skipped=0
```

**CleanerMaterialDetail**（SC080 在 Attempt=2 中的物料）
```
BatchId=uuid-1, Attempt=2, Order=SC080, Material=MAT-001, Result=deleted
BatchId=uuid-1, Attempt=2, Order=SC080, Material=MAT-002, Result=skipped, Reason=不可删除
```

## 写入时机

```
用户点击"执行清理"
  → IPC: cleaner:run
    → cleaner-handler.ts
      → ① BatchId = randomUUID()
      → ② 插入 CleanerExecution（Status=pending）
      → ③ 插入 CleanerOrderHistory（所有订单，Status=pending）
      → ④ 执行清理（CleanerApplicationService.runCleaner）
      → ⑤ 更新 CleanerExecution（Status=success/failed/partial/crashed）
      → ⑥ 更新 CleanerOrderHistory（每个订单的结果）
      → ⑦ 插入 CleanerMaterialDetail（每个物料的操作明细）
      → ⑧ 如果 crashed → 外层重试
         → 插入新的 CleanerExecution（AttemptNumber=2, Status=pending）
         → 插入新的 CleanerOrderHistory（AttemptNumber=2, Status=pending）
         → 重新执行
         → 更新执行表和订单表状态
         → 插入物料明细
```

- 步骤 ②③：在 `cleaner-handler.ts` 中，执行前写入，记录操作人、全局配置、待处理订单
- 步骤 ⑤⑥⑦：在 `CleanerApplicationService` 中，执行完成后回调 DAO 写入结果
- 步骤 ⑧：外层重试时，三张表都新增 AttemptNumber=2 的记录，首次尝试的数据完整保留

## 变更清单

### 新增文件

1. **`src/main/services/database/cleaner-operation-history-dao.ts`**
   - `CleanerOperationHistoryDAO` 类
   - 执行表操作：insertExecution、updateExecutionStatus
   - 订单表操作：insertOrderRecords、updateOrderStatus
   - 物料表操作：insertMaterialDetails
   - 查询操作：getBatches、getBatchDetails（含订单+物料）、deleteBatch
   - 参考 `ExtractorOperationHistoryDAO` 的模式，表名使用 `ERPAuto.CleanerExecution`、`ERPAuto.CleanerOrderHistory`、`ERPAuto.CleanerMaterialDetail`

2. **`src/main/types/cleaner-history.types.ts`**
   - `CleanerExecutionRecord`、`CleanerOrderRecord`、`CleanerMaterialRecord`
   - `CleanerBatchStats`、`InsertCleanerExecutionInput`、`InsertOrderInput`、`InsertMaterialDetailInput`

3. **`src/renderer/src/components/CleanerOperationHistoryModal.tsx`**
   - 操作历史弹窗，复用 ExtractorOperationHistoryModal 的 UI 模式
   - 批次列表（按 BatchId 聚合，显示操作时间、用户、状态、成功/失败数，区分多次尝试）
   - 展开明细（订单列表，每订单的删除/跳过/失败数）
   - 物料级详情（第二层展开，显示每个物料的操作结果）
   - 管理员可按用户筛选、可删除批次

### 修改文件

4. **`src/main/ipc/cleaner-handler.ts`**
   - `CLEANER_RUN` handler 中：执行前插入 execution + order 的 pending 记录，执行后更新结果
   - 新增 IPC handlers：`CLEANER_HISTORY_BATCHES`、`CLEANER_HISTORY_DETAILS`、`CLEANER_HISTORY_DELETE`

5. **`src/main/services/cleaner/cleaner-application-service.ts`**
   - `runCleaner` 接收 `batchId` 参数
   - 移除 `generateExecutionId()` 函数
   - 移除 `generateAndUploadReport()` 方法
   - 移除 `executionId` 相关逻辑
   - 外层重试时，通过 DAO 写入 AttemptNumber=2 的执行记录和订单记录，不覆盖首次尝试
   - 执行完成后回调 DAO 写入订单结果和物料明细

6. **`src/main/ipc/index.ts`**
   - 注册新的 cleaner history IPC handlers

7. **`src/preload/api/cleaner.ts`**
   - 新增 IPC 调用方法：getBatches、getBatchDetails、deleteBatch

8. **`src/preload/index.d.ts`**
   - `CleanerAPI` 接口新增 getBatches、getBatchDetails、deleteBatch 类型声明

9. **`src/renderer/src/pages/CleanerPage.tsx`**
   - 新增"操作历史"按钮
   - 引入 CleanerOperationHistoryModal

### 删除文件

10. **`src/main/services/report/cleaner-report-generator.ts`**
    - 整个文件删除，报告生成逻辑不再需要

### 可选清理

11. **`src/renderer/src/components/ReportViewerDialog.tsx`**
    - 基于 RustFS 文件的报告查看器，Cleaner 不再使用
    - 如果 Extractor 不共用此组件，可删除

12. **`src/renderer/src/components/ReportAnalysisDialog.tsx`**
    - 基于报告文件的分析，Cleaner 不再使用
    - 后续可基于数据库重新实现统计分析

## 移除的概念

| 概念 | 原因 |
|------|------|
| ExecutionId（CLN-时间戳-随机） | 为文件名设计，数据库用 UUID |
| generateExecutionId() | 随 ExecutionId 一起移除 |
| CleanerReportGenerator | Markdown 报告生成器，被数据库替代 |
| generateAndUploadReport() | RustFS 上传链路，被数据库写入替代 |
| 报告文件名去重 | 数据库 UUID 天然唯一 |
| 重试覆盖旧报告 | 数据库保留所有尝试记录 |

## 不涉及的部分

- Extractor 的持久化逻辑不变
- 数据库 schema 迁移（需 DBA 创建表，应用层只做 CRUD）
- 后续智能跳过功能（基于已有 success 记录跳过已成功的订单）
- 内层重试逻辑（订单级/物料级）不变
