# Cleaner 数据库持久化实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Cleaner 的执行记录从 Markdown 文件持久化迁移到数据库（三张表：执行级、订单级、物料级），并在前端新增操作历史弹窗。

**Architecture:** 新建 `CleanerOperationHistoryDAO` 操作三张表（`ERPAuto.CleanerExecution`、`ERPAuto.CleanerOrderHistory`、`ERPAuto.CleanerMaterialDetail`），通过新增 IPC handlers 暴露给前端。执行前写入 pending 记录，执行后更新结果和物料明细。外层重试时新增 AttemptNumber=2 的记录，不覆盖首次尝试。移除 Markdown 报告生成和 RustFS 上传链路。

**Tech Stack:** TypeScript, Electron IPC, SQL (MySQL/SQL Server/PostgreSQL via existing DAO+dialect pattern), React

---

## Task 1: 新增类型定义

**Files:**

- Create: `src/main/types/cleaner-history.types.ts`

**Step 1: 创建类型文件**

```typescript
// src/main/types/cleaner-history.types.ts

/**
 * Cleaner 操作历史类型定义
 */

/** 执行级记录 */
export interface CleanerExecutionRecord {
  id?: number
  batchId: string
  attemptNumber: number
  userId: number
  username: string
  operationTime: Date
  endTime: Date | null
  status: string
  isDryRun: boolean
  totalOrders: number
  ordersProcessed: number
  totalMaterialsDeleted: number
  totalMaterialsSkipped: number
  totalMaterialsFailed: number
  totalUncertainDeletions: number
  errorMessage: string | null
  appVersion: string | null
}

/** 订单级记录 */
export interface CleanerOrderRecord {
  id?: number
  batchId: string
  attemptNumber: number
  orderNumber: string
  status: string
  materialsDeleted: number
  materialsSkipped: number
  materialsFailed: number
  uncertainDeletions: number
  retryCount: number
  retrySuccess: boolean
  errorMessage: string | null
}

/** 物料级记录 */
export interface CleanerMaterialRecord {
  id?: number
  batchId: string
  attemptNumber: number
  orderNumber: string
  materialCode: string
  materialName: string
  rowNumber: number
  result: string
  reason: string | null
  attemptCount: number
  finalErrorCategory: string | null
}

/** 批次统计（前端列表展示用） */
export interface CleanerBatchStats {
  batchId: string
  userId: number
  username: string
  operationTime: string
  /** 最终一次尝试的状态 */
  status: string
  totalAttempts: number
  totalOrders: number
  ordersProcessed: number
  totalMaterialsDeleted: number
  totalMaterialsFailed: number
  successCount: number
  failedCount: number
  isDryRun: boolean
}

/** 插入执行记录的输入 */
export interface InsertCleanerExecutionInput {
  batchId: string
  attemptNumber: number
  userId: number
  username: string
  isDryRun: boolean
  totalOrders: number
  appVersion: string
}

/** 插入订单记录的输入 */
export interface InsertOrderInput {
  orderNumber: string
}

/** 插入物料明细的输入 */
export interface InsertMaterialDetailInput {
  orderNumber: string
  materialCode: string
  materialName: string
  rowNumber: number
  result: string
  reason: string | null
  attemptCount: number
  finalErrorCategory: string | null
}

/** 查询批次的选项 */
export interface GetCleanerBatchesOptions {
  limit?: number
  offset?: number
  usernames?: string[]
}
```

**Step 2: 验证类型检查通过**

Run: `npm run typecheck`
Expected: PASS（新文件不影响现有代码）

**Step 3: Commit**

```
feat(cleaner): add type definitions for cleaner operation history
```

---

## Task 2: 新增 DAO 层

**Files:**

- Create: `src/main/services/database/cleaner-operation-history-dao.ts`

**Step 1: 创建 DAO 文件**

参考 `extractor-operation-history-dao.ts` 的模式（`create()` 获取数据库连接、`createDialect()` 处理 SQL 方言、`trackDuration()` 记录耗时）。表名使用 `ERPAuto` schema。

关键方法：

```typescript
export class CleanerOperationHistoryDAO {
  private dbService: IDatabaseService | null = null
  private dialect: SqlDialect | null = null

  // ===== 执行表 =====
  private getExecutionTableName(): string {
    return this.getDialect().quoteTableName('ERPAuto', 'CleanerExecution')
  }

  async insertExecution(input: InsertCleanerExecutionInput): Promise<boolean>
  async updateExecutionStatus(
    batchId: string,
    attemptNumber: number,
    status: string,
    ordersProcessed: number,
    materialsDeleted: number,
    materialsSkipped: number,
    materialsFailed: number,
    uncertainDeletions: number,
    endTime: Date,
    errorMessage?: string
  ): Promise<boolean>

  // ===== 订单表 =====
  private getOrderTableName(): string {
    return this.getDialect().quoteTableName('ERPAuto', 'CleanerOrderHistory')
  }

  async insertOrderRecords(
    batchId: string,
    attemptNumber: number,
    orders: InsertOrderInput[]
  ): Promise<boolean>
  async updateOrderStatus(
    batchId: string,
    attemptNumber: number,
    orderNumber: string,
    status: string,
    materialsDeleted: number,
    materialsSkipped: number,
    materialsFailed: number,
    uncertainDeletions: number,
    retryCount: number,
    retrySuccess: boolean,
    errorMessage?: string
  ): Promise<boolean>

  // ===== 物料表 =====
  private getMaterialTableName(): string {
    return this.getDialect().quoteTableName('ERPAuto', 'CleanerMaterialDetail')
  }

  async insertMaterialDetails(
    batchId: string,
    attemptNumber: number,
    details: InsertMaterialDetailInput[]
  ): Promise<boolean>

  // ===== 查询 =====
  async getBatches(
    userId?: number,
    options?: GetCleanerBatchesOptions
  ): Promise<CleanerBatchStats[]>
  async getBatchDetails(
    batchId: string
  ): Promise<{ executions: CleanerExecutionRecord[]; orders: CleanerOrderRecord[] }>
  async getMaterialDetails(
    batchId: string,
    attemptNumber: number,
    orderNumber: string
  ): Promise<CleanerMaterialRecord[]>

  // ===== 删除 =====
  async deleteBatch(
    batchId: string,
    requestingUserId: number,
    isAdmin: boolean
  ): Promise<{ success: boolean; error?: string }>

  // ===== 列询执行级记录 =====
  async getMaterialDetails(
    batchId: string,
    attemptNumber: number,
    orderNumber: string
  ): Promise<CleanerMaterialRecord[]>

  // ===== 删除 =====
  async deleteBatch(
    batchId: string,
    requestingUserId: number,
    isAdmin: boolean
  ): Promise<{ success: boolean; error?: string }>
  async disconnect(): Promise<void>
}
```

`getBatches` 查询逻辑：

- `GROUP BY BatchId`，取 `MAX(AttemptNumber)` 对应的执行记录状态作为最终状态
- 汇总订单级的 success/failed 计数
- 支持 userId 过滤（普通用户）和 usernames 过滤（管理员）
- 支持分页

`getBatchDetails` 查询逻辑：

- 返回某 BatchId 下所有 execution 记录 + order 记录
- 前端用 attemptNumber 区分不同尝试

每个 INSERT/UPDATE 使用 `trackDuration()` 包裹，error handling 与 Extractor DAO 一致。

**Step 2: 验证类型检查通过**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```
feat(cleaner): add CleanerOperationHistoryDAO for three-table persistence
```

---

## Task 3: 新增 IPC channels

**Files:**

- Modify: `src/shared/ipc-channels.ts`

**Step 1: 添加 cleaner history channels**

在现有的 `CLEANER_PROGRESS` 之后添加：

```typescript
// Cleaner history
CLEANER_HISTORY_GET_BATCHES: 'cleanerHistory:getBatches',
CLEANER_HISTORY_GET_BATCH_DETAILS: 'cleanerHistory:getBatchDetails',
CLEANER_HISTORY_GET_MATERIAL_DETAILS: 'cleanerHistory:getMaterialDetails',
CLEANER_HISTORY_DELETE_BATCH: 'cleanerHistory:deleteBatch',
```

**Step 2: Commit**

```
feat(cleaner): add IPC channels for cleaner operation history
```

---

## Task 4: 新增 IPC handler

**Files:**

- Create: `src/main/ipc/cleaner-history-handler.ts`
- Modify: `src/main/ipc/index.ts` — 注册新 handler

**Step 1: 创建 cleaner-history-handler.ts**

参考 `operation-history-handler.ts` 的模式。四个 handler：

- `CLEANER_HISTORY_GET_BATCHES`：获取批次列表，Admin 看全部，User 看自己的
- `CLEANER_HISTORY_GET_BATCH_DETAILS`：获取某个批次的执行记录和订单记录
- `CLEANER_HISTORY_GET_MATERIAL_DETAILS`：获取某个订单的物料明细
- `CLEANER_HISTORY_DELETE_BATCH`：删除批次，权限校验与 Extractor 一致

```typescript
export function registerCleanerHistoryHandlers(): void {
  const dao = new CleanerOperationHistoryDAO()

  ipcMain.handle(
    IPC_CHANNELS.CLEANER_HISTORY_GET_BATCHES,
    async (event, options?: GetCleanerBatchesOptions): Promise<IpcResult<CleanerBatchStats[]>> => {
      return withErrorHandling(async () => {
        const currentUser = SessionManager.getInstance().getUserInfo()
        if (!currentUser) throw new Error('用户未登录')
        const userId = currentUser.userType === 'Admin' ? undefined : currentUser.id
        return dao.getBatches(userId, options)
      }, 'cleanerHistory:getBatches')
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CLEANER_HISTORY_GET_BATCH_DETAILS,
    async (
      event,
      batchId: string
    ): Promise<
      IpcResult<{ executions: CleanerExecutionRecord[]; orders: CleanerOrderRecord[] }>
    > => {
      // ... 与 operation-history-handler 的 getBatchDetails 模式一致
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CLEANER_HISTORY_GET_MATERIAL_DETAILS,
    async (
      event,
      batchId: string,
      attemptNumber: number,
      orderNumber: string
    ): Promise<IpcResult<CleanerMaterialRecord[]>> => {
      // ...
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CLEANER_HISTORY_DELETE_BATCH,
    async (event, batchId: string): Promise<IpcResult<{ deleted: boolean }>> => {
      // ... 权限校验后删除三张表的记录
    }
  )
}
```

**Step 2: 在 index.ts 中注册**

在 `registerIpcHandlers()` 中添加 `registerCleanerHistoryHandlers()` 调用，并在顶部添加 import。

**Step 3: 验证类型检查通过**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```
feat(cleaner): add IPC handlers for cleaner operation history
```

---

## Task 5: 新增 Preload API

**Files:**

- Modify: `src/preload/api/cleaner.ts` — 新增 history 方法
- Modify: `src/preload/index.d.ts` — 新增类型声明

**Step 1: 在 cleaner.ts 中新增 history 方法**

```typescript
import type {
  CleanerBatchStats,
  CleanerExecutionRecord,
  CleanerOrderRecord,
  CleanerMaterialRecord,
  GetCleanerBatchesOptions
} from '../../main/types/cleaner-history.types'

// 在 cleanerApi 对象中追加：
getHistoryBatches: (options?: GetCleanerBatchesOptions): Promise<IpcResult<CleanerBatchStats[]>> =>
  invokeIpc(IPC_CHANNELS.CLEANER_HISTORY_GET_BATCHES, options),

getHistoryBatchDetails: (batchId: string): Promise<IpcResult<{
  executions: CleanerExecutionRecord[]
  orders: CleanerOrderRecord[]
}>> =>
  invokeIpc(IPC_CHANNELS.CLEANER_HISTORY_GET_BATCH_DETAILS, batchId),

getHistoryMaterialDetails: (batchId: string, attemptNumber: number, orderNumber: string): Promise<IpcResult<CleanerMaterialRecord[]>> =>
  invokeIpc(IPC_CHANNELS.CLEANER_HISTORY_GET_MATERIAL_DETAILS, batchId, attemptNumber, orderNumber),

deleteHistoryBatch: (batchId: string): Promise<IpcResult<{ deleted: boolean }>> =>
  invokeIpc(IPC_CHANNELS.CLEANER_HISTORY_DELETE_BATCH, batchId),
```

**Step 2: 在 index.d.ts 中更新 CleanerAPI 接口**

在 `CleanerAPI` 接口中添加对应的类型声明，与实际 API 对齐。

**Step 3: 验证类型检查通过**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```
feat(cleaner): add preload API for cleaner operation history
```

---

## Task 6: 改造 CleanerApplicationService — 写入数据库记录

**Files:**

- Modify: `src/main/services/cleaner/cleaner-application-service.ts`

这是核心变更。`runCleaner` 方法需要：

**Step 1: 修改 runCleaner 签名，接收 batchId 和 DAO**

```typescript
async runCleaner(
  eventSender: WebContents,
  input: CleanerInput,
  batchId: string,
  historyDao: CleanerOperationHistoryDAO
): Promise<CleanerResult>
```

**Step 2: 移除报告相关代码**

- 删除 `import { app } from 'electron'`（仅用于 `app.getVersion()`）
- 删除 `generateExecutionId()` 函数
- 删除 `generateAndUploadReport()` 方法
- 删除所有 `executionId` 相关变量和日志

**Step 3: 插入 pending 订单记录**

在登录成功后、执行清理前，调用 `historyDao.insertOrderRecords(batchId, 1, orders)` 写入 pending 状态的订单记录。

**Step 4: 执行后更新订单记录和写入物料明细**

清理完成后遍历 `result.details`（`OrderCleanDetail[]`），对每个订单：

- 调用 `historyDao.updateOrderStatus(...)` 更新订单结果
- 调用 `historyDao.insertMaterialDetails(...)` 写入物料明细（skipped + failed 材料全部写入）

**Step 5: 更新执行记录状态**

调用 `historyDao.updateExecutionStatus(batchId, 1, ...)` 更新为最终状态。

**Step 6: 外层重试改造**

当 `result.crashed` 时：

1. 调用 `historyDao.updateExecutionStatus(batchId, 1, 'crashed', ...)` 标记首次尝试为 crashed
2. 调用 `historyDao.insertExecution({ batchId, attemptNumber: 2, ... })` 创建第二次尝试
3. 调用 `historyDao.insertOrderRecords(batchId, 2, orders)` 写入第二次尝试的 pending 订单
4. 重新登录并执行
5. 执行后更新 AttemptNumber=2 的订单和物料记录

**Step 7: 验证类型检查通过**

Run: `npm run typecheck`
Expected: PASS

**Step 8: Commit**

```
refactor(cleaner): replace report generation with database persistence
```

---

## Task 7: 改造 cleaner-handler.ts — 执行前后写入

**Files:**

- Modify: `src/main/ipc/cleaner-handler.ts`

**Step 1: 修改 CLEANER_RUN handler**

在调用 `cleanerService.runCleaner()` 之前：

1. 获取当前用户信息
2. `batchId = randomUUID()`
3. 创建 `CleanerOperationHistoryDAO` 实例
4. 调用 `dao.insertExecution({ batchId, attemptNumber: 1, userId, username, isDryRun, totalOrders, appVersion })`

将 `batchId` 和 `dao` 传入 `runCleaner()`。

执行完成后（无论成功失败），更新执行记录的最终状态。

**Step 2: 移除 app.getVersion() 调用**

`appVersion` 改为在 handler 层获取（因为 handler 已有 electron 访问权限），传给 DAO。

**Step 3: 验证类型检查通过**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```
refactor(cleaner): write execution records to database in IPC handler
```

---

## Task 8: 删除 Markdown 报告生成器

**Files:**

- Delete: `src/main/services/report/cleaner-report-generator.ts`

**Step 1: 删除文件**

删除 `cleaner-report-generator.ts`。

**Step 2: 检查是否有其他文件引用它**

搜索 `cleaner-report-generator` 或 `CleanerReportGenerator`，如有引用则一并移除（主要是 `cleaner-application-service.ts` 中已删除的 import）。

**Step 3: 验证编译通过**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```
refactor(cleaner): remove Markdown report generator
```

---

## Task 9: 前端 — 新增操作历史弹窗

**Files:**

- Create: `src/renderer/src/components/CleanerOperationHistoryModal.tsx`
- Modify: `src/renderer/src/pages/CleanerPage.tsx`

**Step 1: 创建 CleanerOperationHistoryModal**

参考 `ExtractorOperationHistoryModal.tsx` 的 UI 模式和代码结构。关键差异：

- 数据源使用 `window.electron.cleaner.getHistoryBatches()` 等新 API
- 批次列表增加"尝试次数"列和"模拟运行"标识
- 展开明细时，顶部显示执行级信息（尝试次数、crashed 状态等）
- 订单表格增加 deleted/skipped/failed/uncertain 列
- 订单行可再次展开查看物料明细（调用 `getHistoryMaterialDetails`）
- 管理员按用户筛选、删除功能与 Extractor 一致

**Step 2: 在 CleanerPage 中添加"操作历史"按钮和弹窗**

- 在 `CleanerToolbar` 中添加"操作历史"按钮（或直接在 CleanerPage 添加）
- 引入 `CleanerOperationHistoryModal` 组件
- 传入 `user` 和 `isOpen/onClose` 控制

**Step 3: 验证类型检查通过**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```
feat(cleaner): add operation history modal with database-backed records
```

---

## Task 10: 更新 renderer 类型定义

**Files:**

- Modify: `src/renderer/src/hooks/cleaner/types.ts`

**Step 1: 添加 history 相关类型**

在 types.ts 中添加前端需要的类型（或直接从 `cleaner-history.types.ts` import，根据项目的前端类型引用模式决定）。

**Step 2: 验证类型检查通过**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```
feat(cleaner): add renderer types for cleaner operation history
```

---

## Task 11: 清理旧代码

**Files:**

- Modify: `src/renderer/src/hooks/cleaner/types.ts` — 移除 `CleanerReportData.crashed`（如果不再需要）
- 检查 `ReportViewerDialog.tsx`、`ReportAnalysisDialog.tsx` 是否仍被 Cleaner 使用

**Step 1: 清理 renderer 中不再需要的类型**

- `CleanerReportData` 中如果 `crashed` 字段已无用，移除
- 确认 `CleanerPhase` 的 `'retry'` 值是否仍需要（前端进度通知仍在使用，保留）

**Step 2: 评估 ReportViewerDialog 和 ReportAnalysisDialog**

这两个组件目前用于查看 Markdown 报告文件。如果 Cleaner 不再使用它们：

- 在 CleanerPage 中移除相关按钮和引用
- 不删除组件本身（Extractor 可能仍在使用，后续统一清理）

**Step 3: 验证编译和类型检查通过**

Run: `npm run typecheck && npm run lint`
Expected: PASS

**Step 4: Commit**

```
chore(cleaner): clean up legacy report-related code
```

---

## Task 12: 集成测试

**Step 1: 运行完整类型检查**

Run: `npm run typecheck`
Expected: PASS

**Step 2: 运行 lint**

Run: `npm run lint`
Expected: PASS

**Step 3: 运行单元测试**

Run: `npm run test`
Expected: PASS

**Step 4: 手动验证**

1. 启动 `npm run dev`
2. 在 Cleaner 页面执行一次清理（模拟运行）
3. 检查数据库三张表是否正确写入
4. 点击"操作历史"按钮，验证批次列表和详情展示
5. 模拟崩溃场景（如果可以），验证外层重试写入 AttemptNumber=2 的记录
6. 用管理员账号验证用户筛选和删除功能

---

## 执行顺序

```
Task 1 (types) → Task 2 (DAO) → Task 3 (IPC channels) → Task 4 (IPC handler)
  → Task 5 (preload) → Task 6 (CleanerApplicationService) → Task 7 (cleaner-handler)
  → Task 8 (删除报告生成器) → Task 10 (renderer types) → Task 9 (前端弹窗)
  → Task 11 (清理) → Task 12 (集成测试)
```

Task 9 和 Task 10 可以并行。Task 8 必须在 Task 6、7 之后。
