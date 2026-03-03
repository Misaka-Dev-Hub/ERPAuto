# 数据提取界面 - 开始按钮工作流程详解

> **文档版本**: 1.0
> **创建日期**: 2026-03-03
> **适用范围**: ERPAuto v1.0+
> **相关文件**:
>
> - `src/renderer/src/pages/ExtractorPage.tsx` (UI层)
> - `src/main/ipc/extractor-handler.ts` (IPC处理层)
> - `src/main/services/erp/extractor.ts` (业务逻辑层)
> - `src/main/services/erp/order-resolver.ts` (订单号解析服务)
> - `src/main/services/erp/erp-auth.ts` (ERP认证服务)

## 目录

1. [系统架构概览](#系统架构概览)
2. [完整执行流程](#完整执行流程)
3. [状态管理流程](#状态管理流程)
4. [错误处理机制](#错误处理机制)
5. [数据流转过程](#数据流转过程)
6. [关键代码引用](#关键代码引用)

---

## 系统架构概览

```mermaid
graph TB
    subgraph "Renderer Process (UI层)"
        A[ExtractorPage.tsx]
        B[React State Management]
        C[用户输入: 订单号列表]
        D[开始按钮]
    end

    subgraph "IPC Bridge (通信桥梁)"
        E[electron.extractor.runExtractor]
        F[extractor:run Channel]
    end

    subgraph "Main Process (主进程)"
        G[extractor-handler.ts]
        H[OrderNumberResolver]
        I[ErpAuthService]
        J[ExtractorService]
    end

    subgraph "External Services (外部服务)"
        K[(MySQL Database)]
        L[ERP Web System]
        M[Playwright Browser]
    end

    A -->|用户点击| D
    D -->|调用API| E
    E -->|IPC通信| F
    F -->|接收请求| G
    G -->|解析订单号| H
    H -->|查询数据| K
    G -->|登录认证| I
    I -->|自动化操作| M
    M -->|访问页面| L
    G -->|执行提取| J
    J -->|使用| I
    J -->|返回结果| G
    G -->|IPC响应| F
    F -->|更新UI| A
    B -->|管理状态| A

    style A fill:#e1f5ff
    style G fill:#fff4e1
    style K fill:#e8f5e9
    style L fill:#f3e5f5
```

### 架构说明

- **Renderer Process**: 负责UI展示和用户交互，使用React管理状态
- **IPC Bridge**: 安全的进程间通信桥梁，通过preload脚本暴露
- **Main Process**: 处理业务逻辑、数据库操作、浏览器自动化
- **External Services**: MySQL数据库和ERP Web系统

---

## 完整执行流程

```mermaid
sequenceDiagram
    autonumber
    participant User as 👤 用户
    participant UI as ExtractorPage.tsx
    participant IPC as electron API
    participant Handler as extractor-handler.ts
    participant Resolver as OrderNumberResolver
    participant MySQL as MySQL Database
    participant Auth as ErpAuthService
    participant Extractor as ExtractorService
    participant Browser as Playwright Browser
    participant ERP as ERP Web System

    User->>UI: 1. 输入订单号列表<br/>(每行一个)
    User->>UI: 2. 点击"开始提取"按钮

    Note over UI: 前端验证与准备
    UI->>UI: 3. 验证订单号非空
    UI->>UI: 4. 设置isRunning=true
    UI->>UI: 5. 清空之前的结果和错误
    UI->>UI: 6. 存储Production IDs到共享状态
    UI->>IPC: 7. 调用electron.extractor.runExtractor()

    Note over IPC,Handler: IPC通信
    IPC->>Handler: 8. 发送IPC消息 'extractor:run'

    Note over Handler: 环境配置检查
    Handler->>Handler: 9. 读取.env配置<br/>(ERP_URL, USERNAME, PASSWORD)
    Handler->>Handler: 10. 验证配置完整性
    alt 配置不完整
        Handler-->>UI: 返回ValidationError
        UI->>UI: 显示错误提示
        UI->>UI: 设置isRunning=false
    end

    Note over Handler,MySQL: 订单号解析阶段
    Handler->>MySQL: 11. 连接MySQL数据库
    alt MySQL连接失败
        Handler-->>UI: 返回DatabaseQueryError
    end

    Handler->>Resolver: 12. 创建OrderNumberResolver
    Handler->>Resolver: 13. 调用resolve(orderNumbers)
    Resolver->>MySQL: 14. 查询生产订单号映射
    MySQL-->>Resolver: 15. 返回映射结果
    Resolver-->>Handler: 16. 返回映射结果<br/>(包含有效订单号和警告)

    alt 没有有效订单号
        Handler-->>UI: 返回ValidationError
        UI->>UI: 显示错误: "没有有效的生产订单号"
    end

    Note over Handler,Browser: ERP认证阶段
    Handler->>Auth: 17. 创建ErpAuthService
    Handler->>Auth: 18. 调用login()
    Auth->>Browser: 19. 启动Playwright浏览器
    Browser->>ERP: 20. 访问ERP登录页面
    Browser->>ERP: 21. 填写用户名密码
    Browser->>ERP: 22. 点击登录按钮
    ERP-->>Browser: 23. 登录成功
    Browser-->>Auth: 24. 返回session对象
    Auth-->>Handler: 25. 登录成功
    alt 登录失败
        Auth-->>Handler: 抛出异常
        Handler-->>UI: 返回ErpConnectionError
    end

    Note over Extractor,ERP: 数据提取阶段
    Handler->>Extractor: 26. 创建ExtractorService
    Handler->>Extractor: 27. 调用extract()<br/>传入有效订单号
    Extractor->>Browser: 28. 使用已有session
    Extractor->>ERP: 29. 导航到离散备料计划维护页面
    Extractor->>ERP: 30. 设置查询界面<br/>(订单号查询, 全部标签, 限制5000)

    loop 批处理循环 (每批最多100个订单)
        Extractor->>Extractor: 31. 创建批次<br/>(按batchSize分组)
        Extractor->>UI: 32. 发送进度更新<br/>onProgress(message, progress%)
        UI->>UI: 33. 更新进度条和日志

        Extractor->>ERP: 34. 填充订单号到搜索框
        Extractor->>ERP: 35. 点击搜索按钮
        Extractor->>ERP: 36. 等待加载完成
        Extractor->>ERP: 37. 点击第一行复选框
        Extractor->>ERP: 38. 悬停并点击"更多"
        Extractor->>ERP: 39. 点击"输出"
        Extractor->>ERP: 40. 设置行数阈值为300000
        Extractor->>ERP: 41. 点击"确定(Y)"

        Browser->>Browser: 42. 监听下载事件
        ERP->>Browser: 43. 触发文件下载
        Browser->>Browser: 44. 保存文件到downloads目录
        Browser-->>Extractor: 45. 返回文件路径
        Extractor->>Extractor: 46. 记录下载文件路径
    end

    Extractor->>Extractor: 47. 汇总结果<br/>(文件列表, 记录数, 错误)
    Extractor-->>Handler: 48. 返回ExtractorResult
    Handler->>Handler: 49. 添加解析警告到错误列表

    Note over Handler,IPC: 清理阶段
    Handler->>Browser: 50. 关闭浏览器
    Handler->>MySQL: 51. 断开数据库连接

    Note over Handler,UI: 响应阶段
    Handler-->>IPC: 52. 返回IPC响应<br/>(success: true, data: result)
    IPC-->>UI: 53. 返回response
    UI->>UI: 54. 设置result状态
    UI->>UI: 55. 设置isRunning=false
    UI->>UI: 56. 清空进度状态
    UI->>User: 57. 显示提取结果<br/>(文件数, 记录数, 错误数)

    alt 发生任何错误
        Handler-->>UI: 返回error响应
        UI->>UI: 设置error状态
        UI->>UI: 设置isRunning=false
        UI->>User: 显示错误信息
    end
```

---

## 状态管理流程

```mermaid
stateDiagram-v2
    [*] --> Idle: 初始状态

    Idle --> Validating: 用户点击开始按钮
    Validating --> Idle: 验证失败<br/>(订单号为空)
    Validating --> Running: 验证通过

    Running --> Processing: 调用IPC API
    Processing --> Progress: 收到进度更新
    Progress --> Processing: 继续处理

    Processing --> Success: 提取成功
    Processing --> Error: 提取失败

    Success --> Idle: 用户清空或重新输入
    Error --> Idle: 用户修正后重试

    note right of Validating
        前端验证阶段:
        - 检查orderNumbers非空
        - 解析订单号列表
        - 存储到sessionStorage
        - 存储到共享状态
    end note

    note right of Processing
        后端处理阶段:
        - 环境配置检查
        - 订单号解析
        - ERP登录
        - 批量数据提取
        - 资源清理
    end note

    note right of Progress
        进度更新:
        - 更新进度条百分比
        - 添加日志到控制台
        - 保持isRunning=true
    end note

    note right of Success
        成功状态:
        - 显示下载文件数
        - 显示记录总数
        - 显示错误数
        - isRunning=false
    end note

    note right of Error
        错误状态:
        - 显示错误信息
        - isRunning=false
        - 保留用户输入
    end note
```

### 状态变量说明

| 状态变量       | 类型                      | 说明                         | 持久化            |
| -------------- | ------------------------- | ---------------------------- | ----------------- |
| `orderNumbers` | string                    | 用户输入的订单号列表         | ✅ sessionStorage |
| `batchSize`    | number                    | 每批处理的订单数量 (默认100) | ✅ sessionStorage |
| `isRunning`    | boolean                   | 是否正在执行提取             | ❌ 内存状态       |
| `progress`     | ExtractorProgress \| null | 当前进度信息                 | ❌ 内存状态       |
| `result`       | ExtractorResult \| null   | 提取结果                     | ❌ 内存状态       |
| `error`        | string \| null            | 错误信息                     | ❌ 内存状态       |
| `logs`         | string[]                  | 执行日志列表                 | ❌ 内存状态       |

---

## 错误处理机制

```mermaid
flowchart TD
    Start([用户点击开始]) --> Validate{前端验证}
    Validate -->|订单号为空| ShowEmptyError[显示错误:<br/>请输入至少一个订单号]
    Validate -->|验证通过| CallIPC[调用IPC API]

    CallIPC --> ConfigCheck{环境配置检查}
    ConfigCheck -->|配置不完整| ConfigError[返回ValidationError:<br/>ERP配置不完整]
    ConfigCheck -->|配置完整| ConnectMySQL[连接MySQL]

    ConnectMySQL --> MySQLCheck{连接成功?}
    MySQLCheck -->|失败| MySQLError[返回DatabaseQueryError:<br/>MySQL连接失败]
    MySQLCheck -->|成功| ResolveOrders[解析订单号]

    ResolveOrders --> ValidOrders{有有效订单号?}
    ValidOrders -->|无| NoOrdersError[返回ValidationError:<br/>没有有效的生产订单号]
    ValidOrders -->|有| LoginERP[ERP登录]

    LoginERP --> LoginCheck{登录成功?}
    LoginCheck -->|失败| LoginError[返回ErpConnectionError:<br/>ERP登录失败]
    LoginCheck -->|成功| ExtractData[执行数据提取]

    ExtractData --> BatchLoop[批处理循环]
    BatchLoop --> BatchError{批次成功?}
    BatchError -->|失败| RecordError[记录错误到result.errors]
    BatchError -->|成功| SaveFile[保存文件]
    RecordError --> NextBatch{还有批次?}
    SaveFile --> NextBatch

    NextBatch -->|是| BatchLoop
    NextBatch -->|否| Cleanup[清理资源]

    Cleanup --> CheckWarnings{有警告?}
    CheckWarnings -->|是| AddWarnings[添加警告到errors]
    CheckWarnings -->|否| ReturnSuccess[返回成功结果]
    AddWarnings --> ReturnSuccess

    ShowEmptyError --> ResetState1[设置isRunning=false]
    ConfigError --> ResetState2[设置isRunning=false]
    MySQLError --> ResetState3[设置isRunning=false]
    NoOrdersError --> ResetState4[设置isRunning=false]
    LoginError --> ResetState5[设置isRunning=false]

    ResetState1 --> End1([结束])
    ResetState2 --> End2([结束])
    ResetState3 --> End3([结束])
    ResetState4 --> End4([结束])
    ResetState5 --> End5([结束])
    ReturnSuccess --> End6([显示结果])

    style ShowEmptyError fill:#ffcccc
    style ConfigError fill:#ffcccc
    style MySQLError fill:#ffcccc
    style NoOrdersError fill:#ffcccc
    style LoginError fill:#ffcccc
    style RecordError fill:#fff4cc
    style ReturnSuccess fill:#ccffcc
```

### 错误类型与处理策略

| 错误类型             | 触发条件                             | 用户反馈                 | 恢复策略       |
| -------------------- | ------------------------------------ | ------------------------ | -------------- |
| `ValidationError`    | 订单号为空、配置不完整、无有效订单号 | 显示红色错误消息         | 修正输入后重试 |
| `DatabaseQueryError` | MySQL连接失败                        | 显示数据库连接错误       | 检查数据库配置 |
| `ErpConnectionError` | ERP登录失败                          | 显示ERP登录错误          | 检查ERP凭据    |
| `BatchError`         | 单个批次处理失败                     | 记录到错误列表，继续处理 | 查看错误详情   |
| `SystemError`        | 未知系统错误                         | 显示通用错误消息         | 查看日志       |

---

## 数据流转过程

```mermaid
flowchart LR
    subgraph "Input (用户输入)"
        A1[原始输入<br/>订单号列表]
        A2[批次大小<br/>batchSize=100]
    end

    subgraph "Transformation (数据转换)"
        B1[行解析<br/>按换行符分割]
        B2[去空白<br/>trim每行]
        B3[过滤空行<br/>移除空字符串]
        B4[存储共享状态<br/>Production IDs]
    end

    subgraph "Resolution (订单号解析)"
        C1[查询MySQL<br/>查找映射关系]
        C2[提取生产订单号<br/>获取有效值]
        C3[收集警告<br/>记录未映射项]
    end

    subgraph "Processing (批量处理)"
        D1[批次分组<br/>按batchSize切分]
        D2[批次迭代<br/>逐批处理]
        D3[订单拼接<br/>逗号连接]
    end

    subgraph "Output (结果输出)"
        E1[下载文件列表<br/>downloadedFiles数组]
        E2[合并文件<br/>mergedFile TODO]
        E3[记录总数<br/>recordCount]
        E4[错误列表<br/>errors数组]
    end

    A1 --> B1
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> C1
    A2 --> D1
    C1 --> C2
    C2 --> D1
    C3 --> E4
    D1 --> D2
    D2 --> D3
    D3 --> E1
    E1 --> E3

    style A1 fill:#e3f2fd
    style A2 fill:#e3f2fd
    style E1 fill:#e8f5e9
    style E2 fill:#e8f5e9
    style E3 fill:#e8f5e9
    style E4 fill:#fff3e0
```

### 数据转换详情

**阶段1: 用户输入 → Production IDs**

```
输入: "PO-20231024-001\nPO-20231024-002\nPO-20231024-003"
  ↓ 分割 + trim + 过滤
结果: ["PO-20231024-001", "PO-20231024-002", "PO-20231024-003"]
  ↓ 存储到共享状态
共享状态: Production IDs (供清理模块使用)
```

**阶段2: Production IDs → 生产订单号**

```
输入: ["PO-20231024-001", "PO-20231024-002", "INVALID"]
  ↓ MySQL查询 (production_order表)
映射结果: {
  "PO-20231024-001": "MO-20231024-001",
  "PO-20231024-002": "MO-20231024-002",
  "INVALID": null
}
  ↓ 提取有效值
有效订单号: ["MO-20231024-001", "MO-20231024-002"]
警告: ["INVALID: 未找到对应的生产订单号"]
```

**阶段3: 生产订单号 → 批次**

```
输入: ["MO-001", "MO-002", ..., "MO-250"] (250个)
批次大小: 100
  ↓ 分组
批次1: ["MO-001", ..., "MO-100"]
批次2: ["MO-101", ..., "MO-200"]
批次3: ["MO-201", ..., "MO-250"]
```

**阶段4: 批次 → ERP查询字符串**

```
批次: ["MO-001", "MO-002", "MO-003"]
  ↓ 逗号连接
查询字符串: "MO-001,MO-002,MO-003"
  ↓ 填充到ERP搜索框
ERP操作: 填入搜索框并点击搜索
```

---

## 关键代码引用

### 1. 前端开始按钮处理 (ExtractorPage.tsx:52-90)

```typescript
const handleExtract = async () => {
  // 1. 前端验证
  if (!orderNumbers.trim()) {
    setError('请输入至少一个订单号')
    return
  }

  // 2. 设置运行状态
  setIsRunning(true)
  setProgress(null)
  setResult(null)
  setError(null)

  try {
    // 3. 解析订单号列表
    const orderNumberList = orderNumbers
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    // 4. 存储到共享状态
    await window.electron.validation.setSharedProductionIds(orderNumberList)

    // 5. 调用后端API
    const response = await window.electron.extractor.runExtractor({
      orderNumbers: orderNumberList,
      batchSize
    })

    // 6. 处理响应
    if (response.success && response.data) {
      setResult(response.data)
    } else {
      setError(response.error || '提取失败')
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : '发生未知错误')
  } finally {
    // 7. 重置状态
    setIsRunning(false)
    setProgress(null)
  }
}
```

### 2. IPC处理器核心逻辑 (extractor-handler.ts:17-154)

```typescript
ipcMain.handle('extractor:run', async (_event, input: ExtractorInput) => {
  return withErrorHandling(async () => {
    // 1. 环境配置检查
    const erpUrl = process.env.ERP_URL || ''
    const erpUsername = process.env.ERP_USERNAME || ''
    const erpPassword = process.env.ERP_PASSWORD || ''

    if (!erpUrl || !erpUsername || !erpPassword) {
      throw new ValidationError('ERP 配置不完整')
    }

    // 2. 订单号解析
    const mysqlService = new MySqlService(mysqlConfig)
    await mysqlService.connect()

    const resolver = new OrderNumberResolver(mysqlService)
    const mappings = await resolver.resolve(input.orderNumbers)
    const validOrderNumbers = resolver.getValidOrderNumbers(mappings)

    if (validOrderNumbers.length === 0) {
      throw new ValidationError('没有有效的生产订单号可处理')
    }

    // 3. ERP登录
    const authService = new ErpAuthService({...})
    await authService.login()

    // 4. 执行提取
    const extractor = new ExtractorService(authService)
    const result = await extractor.extract({
      ...input,
      orderNumbers: validOrderNumbers
    })

    // 5. 资源清理
    await authService.close()
    await mysqlService.disconnect()

    return result
  }, 'extractor:run')
})
```

### 3. 提取服务批处理逻辑 (extractor.ts:43-67)

```typescript
// 批处理循环
const batches = this.createBatches(input.orderNumbers, batchSize)

for (let i = 0; i < batches.length; i++) {
  const batch = batches[i]
  const progress = ((i + 1) / batches.length) * 100

  // 发送进度更新
  input.onProgress?.(`Processing batch ${i + 1}/${batches.length}`, progress)

  try {
    const filePath = await this.downloadBatch(
      session,
      popupPage,
      workFrame,
      batch,
      i,
      batches.length
    )
    result.downloadedFiles.push(filePath)
  } catch (error) {
    // 记录错误但继续处理
    result.errors.push(`Batch ${i + 1}: ${error.message}`)
  }
}
```

### 4. 浏览器自动化单批次处理 (extractor.ts:151-194)

```typescript
private async downloadBatch(...): Promise<string> {
  // 1. 填充订单号
  const textbox = workFrame.getByRole('textbox', { name: '来源生产订单号' })
  await textbox.fill(orderNumbers.join(','))

  // 2. 点击搜索
  await workFrame.locator('.search-component-searchBtn').click()

  // 3. 等待加载
  await this.waitForLoading(workFrame)

  // 4. 选择第一行
  await workFrame.getByRole('row', { name: '序号' }).getByLabel('').click()

  // 5. 点击更多 -> 输出
  await workFrame.getByRole('button', { name: '更多' }).hover()
  await workFrame.getByText('输出', { exact: true }).click()

  // 6. 设置阈值
  await thresholdBox.fill('300000')

  // 7. 等待下载
  const downloadPromise = popupPage.waitForEvent('download')
  await workFrame.getByRole('button', { name: '确定(Y)' }).click()
  const download = await downloadPromise

  // 8. 保存文件
  const downloadPath = path.join(this.downloadDir, `temp_batch_${batchIndex + 1}.xlsx`)
  await download.saveAs(downloadPath)

  return downloadPath
}
```

---

## 总结

### 流程关键点

1. **三层验证机制**:
   - 前端验证: 非空检查
   - 配置验证: 环境变量完整性
   - 数据验证: 订单号有效性

2. **资源管理策略**:
   - 使用try-finally确保资源清理
   - 浏览器在使用后立即关闭
   - 数据库连接在使用后断开

3. **错误容错设计**:
   - 单个批次失败不影响其他批次
   - 警告信息独立收集，不影响主流程
   - 详细错误信息返回给前端展示

4. **用户体验优化**:
   - sessionStorage持久化用户输入
   - 实时进度反馈
   - 共享状态支持跨页面数据传递
   - 详细的日志记录

### 性能考虑

- **批处理**: 默认每批100个订单，平衡性能与稳定性
- **异步并发**: 使用async/await处理异步操作
- **进度反馈**: 避免长时间无响应的用户体验

### 扩展性

- **配置化**: batchSize可配置
- **模块化**: 服务独立，易于测试和维护
- **错误类型化**: 使用自定义错误类型便于精确处理

---

**文档维护**: 如代码逻辑变更，请及时更新本文档和相关流程图。
