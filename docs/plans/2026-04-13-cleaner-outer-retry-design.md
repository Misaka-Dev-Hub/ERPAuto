# Cleaner 外层重试机制设计

## 背景

当 CleanerService.performCleanup 的主循环抛出未捕获异常时（如查询超时、浏览器崩溃），代码进入 outer catch 块，直接返回 partial result。位于 try 块后半段的订单级重试逻辑（retryFailedOrders）永远没有机会执行。

典型场景：211 个订单中处理到第 80 个时，查询列表页等待表格行超时 → Cleaner failed → 浏览器被关闭 → 剩余 131 个订单未处理 → 无重试。

## 设计决策

| 决策项       | 选择                      | 理由                             |
| ------------ | ------------------------- | -------------------------------- |
| 重试层级     | CleanerApplicationService | 崩溃后浏览器不可用，必须重新登录 |
| 重试范围     | 全部订单重新跑            | 简单可靠，物料删除是幂等操作     |
| 最大重试次数 | 1 次                      | 覆盖瞬态故障，不过度消耗时间     |
| 触发条件     | result.crashed === true   | 仅 outer catch 触发时才重试      |
| 报告去重     | 执行 ID                   | 用户点击执行时生成，重试不变     |

## 变更清单

### 1. CleanerResult 新增字段

**文件**: `src/main/types/cleaner.types.ts`

```typescript
export interface CleanerResult {
  // ... 现有字段
  crashed?: boolean // true = outer catch triggered, 流程级崩溃
}
```

同步更新 `src/shared/types/cleaner.types.ts`（如有独立定义）和 preload 暴露的类型声明。

### 2. CleanerService 标记崩溃

**文件**: `src/main/services/erp/cleaner.ts`，line 375 的 catch 块

```typescript
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  log.error('Cleaner failed', { ... })
  result.errors.push(`Clean failed: ${message}`)
  result.crashed = true  // ← 新增
}
```

### 3. CleanerApplicationService 重试逻辑

**文件**: `src/main/services/cleaner/cleaner-application-service.ts`

在 `runCleaner()` 中，`cleaner.clean()` 返回后增加重试判断：

```
runCleaner(eventSender, input) {
  const executionId = generateExecutionId()  // 用户点击时生成
  const startTime = Date.now()

  // 1. 获取 ERP 配置、数据库连接、订单解析（不变）
  // 2. 登录 ERP（不变）

  let result = await cleaner.clean(modifiedInput)

  // === 外层重试 ===
  if (result.crashed) {
    log.warn('检测到流程级崩溃，准备外层重试', { executionId })

    await authService.close()  // 关闭不可用的浏览器
    authService = new ErpAuthService({...})
    await authService.login()  // 重新登录

    cleaner = new CleanerService(authService)
    result = await cleaner.clean(modifiedInput)  // 全部订单重新跑
  }

  // 3. 生成报告（使用 executionId 作为文件名一部分，避免重复）
  await this.generateAndUploadReport(input, result, startTime, executionId)
  return result
}
```

### 4. 执行 ID 生成规则

格式: `CLN-{yyyyMMddHHmmss}-{4位随机字母}`

示例: `CLN-20260410112930-A7FK`

生成时机: `runCleaner()` 入口处，在 ERP 登录之前。重试时同一个 executionId 不变。

用途:

- 报告文件名: `cleaner-report-CLN-20260410112930-A7FK.md`
- RustFS 存储路径中包含该 ID，重试时覆盖同一文件
- 报告内容中显示该 ID

### 5. 报告增强

**文件**: `src/main/services/report/cleaner-report-generator.ts`

在执行摘要表格中新增字段:

```markdown
| 项目         | 值                        |
| ------------ | ------------------------- | ------ |
| **执行 ID**  | `CLN-20260410112930-A7FK` | ← 新增 |
| **应用版本** | `1.11.1`                  | ← 新增 |
| **执行时间** | `2026-04-10 11:29:30`     |
| **执行模式** | `正式执行`                |
| ...          | ...                       |
```

- **执行 ID**: 从 ReportOptions 传入
- **应用版本**: `app.getVersion()`，沿用 logger 中已有的获取方式

**ReportOptions 变更**:

```typescript
export interface ReportOptions {
  dryRun: boolean
  username: string
  startTime: number
  endTime: number
  executionId: string // ← 新增
  appVersion: string // ← 新增
}
```

**报告文件名变更**:

```
旧: cleaner-report-2026-04-10-03-30-12.md
新: cleaner-report-CLN-20260410112930-A7FK.md
```

重试时同一个 executionId 生成相同的文件名，本地文件和 RustFS 上传都会覆盖旧报告，无需额外去重逻辑。

### 6. 进度通知增强

重试时向前端发送进度通知，让用户知道正在重试:

```typescript
this.sendProgress(eventSender, '流程崩溃，正在重新登录并重试...', 0, {
  phase: 'retry',
  ...
})
```

## 不涉及的部分

- 前端 UI 变更（后续可单独做，展示重试状态）
- IPC channel 变更
- 内层重试逻辑（订单级/物料级）不变
- 数据库 schema 变更
