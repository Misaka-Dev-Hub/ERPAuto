# 数据提取界面 - 开始按钮工作流程详解

> **文档版本**: 1.2
> **更新日期**: 2026-03-03
> **适用范围**: ERPAuto v1.0+
> **相关文件**:
> - `src/renderer/src/pages/ExtractorPage.tsx` (UI层)
> - `src/preload/index.ts` (IPC API 暴露)
> - `src/main/ipc/extractor-handler.ts` (IPC处理层)
> - `src/main/services/erp/extractor.ts` (业务逻辑层)
> - `src/main/services/erp/order-resolver.ts` (订单号解析服务)
> - `src/main/services/erp/erp-auth.ts` (ERP认证服务)
> - `src/main/services/database/index.ts` (数据库工厂)
> - `src/main/types/database.types.ts` (数据库类型定义)
> - `src/main/types/extractor.types.ts` (类型定义)

## 目录

1. [系统架构概览](#系统架构概览)
2. [完整执行流程](#完整执行流程)
3. [状态管理流程](#状态管理流程)
4. [错误处理机制](#错误处理机制)
5. [数据流转过程](#数据流转过程)
6. [关键代码引用](#关键代码引用)
7. [已知限制与待实现功能](#已知限制与待实现功能)

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

    subgraph "Database Layer (数据库层)"
        N["DatabaseFactory
        create()"]
        O["IDatabaseService
        统一接口"]
        P1[(MySQL)]
        P2[(SQL Server)]
    end

    subgraph "External Services (外部服务)"
        L[ERP Web System]
        M[Playwright Browser]
    end

    A -->|用户点击| D
    D -->|调用API| E
    E -->|IPC通信| F
    F -->|接收请求| G
    G -->|解析订单号| H
    H -->|创建服务| N
    N -->|返回实例| O
    O -->|查询数据| P1
    O -->|查询数据| P2
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
    style N fill:#e8f5e9
    style O fill:#e8f5e9
    style L fill:#f3e5f5
```

### 架构说明

- **Renderer Process**: 负责UI展示和用户交互，使用React管理状态
- **IPC Bridge**: 安全的进程间通信桥梁，通过preload脚本暴露
- **Main Process**: 处理业务逻辑、数据库操作、浏览器自动化
- **Database Layer**: 数据库抽象层，通过工厂模式创建服务实例
  - 支持 MySQL 和 SQL Server 双数据库
  - 通过 `IDatabaseService` 统一接口操作
  - 由 `DB_TYPE` 环境变量决定使用哪种数据库
- **External Services**: ERP Web 系统

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
    participant DBFactory as DatabaseFactory
    participant Database as IDatabaseService
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

    Note over Handler,Database: 数据库连接阶段
    Handler->>DBFactory: 11. 调用 create()
    DBFactory->>DBFactory: 12. 读取 DB_TYPE 环境变量
    alt DB_TYPE = mysql
        DBFactory->>Database: 创建 MySqlService 实例
    else DB_TYPE = sqlserver
        DBFactory->>Database: 创建 SqlServerService 实例
    end
    Database->>Database: 13. connect()
    alt 数据库连接失败
        Database-->>Handler: 抛出异常
        Handler-->>UI: 返回DatabaseQueryError
    end
    DBFactory-->>Handler: 14. 返回 IDatabaseService 实例

    Note over Handler,Database: 订单号解析阶段
    Handler->>Resolver: 15. 创建OrderNumberResolver(dbService)
    Handler->>Resolver: 16. 调用resolve(orderNumbers)
    Resolver->>Database: 17. 查询生产订单号映射
    Database-->>Resolver: 18. 返回映射结果
    Resolver-->>Handler: 19. 返回映射结果<br/>(包含有效订单号和警告)

    alt 没有有效订单号
        Handler-->>UI: 返回ValidationError
        UI->>UI: 显示错误: "没有有效的生产订单号"
    end

    Note over Handler,Browser: ERP认证阶段
    Handler->>Auth: 20. 创建ErpAuthService
    Handler->>Auth: 21. 调用login()
    Auth->>Browser: 22. 启动Playwright浏览器
    Browser->>ERP: 23. 访问ERP登录页面
    Browser->>ERP: 24. 填写用户名密码
    Browser->>ERP: 25. 点击登录按钮
    ERP-->>Browser: 26. 登录成功
    Browser-->>Auth: 27. 返回session对象
    Auth-->>Handler: 28. 登录成功
    alt 登录失败
        Auth-->>Handler: 抛出异常
        Handler-->>UI: 返回ErpConnectionError
    end

    Note over Extractor,ERP: 数据提取阶段
    Handler->>Extractor: 29. 创建ExtractorService
    Handler->>Extractor: 30. 调用extract()<br/>传入有效订单号
    Extractor->>Browser: 31. 使用已有session
    Extractor->>ERP: 32. 导航到离散备料计划维护页面
    Extractor->>ERP: 33. 设置查询界面<br/>(订单号查询, 全部标签, 限制5000)

    loop 批处理循环 (每批最多100个订单)
        Extractor->>Extractor: 34. 创建批次<br/>(按batchSize分组)
        Note over Extractor: onProgress回调存在但<br/>无法通过IPC传递(函数不可序列化)

        Extractor->>ERP: 35. 填充订单号到搜索框
        Extractor->>ERP: 36. 点击搜索按钮
        Extractor->>ERP: 37. 等待加载完成
        Extractor->>ERP: 38. 点击第一行复选框
        Extractor->>ERP: 39. 悬停并点击"更多"
        Extractor->>ERP: 40. 点击"输出"
        Extractor->>ERP: 41. 设置行数阈值为300000
        Extractor->>ERP: 42. 点击"确定(Y)"

        Browser->>Browser: 43. 监听下载事件
        ERP->>Browser: 44. 触发文件下载
        Browser->>Browser: 45. 保存文件到downloads目录
        Browser-->>Extractor: 46. 返回文件路径
        Extractor->>Extractor: 47. 记录下载文件路径
    end

    Extractor->>Extractor: 48. 汇总结果<br/>(文件列表, 记录数, 错误)
    Extractor-->>Handler: 49. 返回ExtractorResult
    Handler->>Handler: 50. 添加解析警告到错误列表

    Note over Handler,IPC: 清理阶段
    Handler->>Browser: 51. 关闭浏览器
    Handler->>Database: 52. 断开数据库连接<br/>(dbService.disconnect())

    Note over Handler,UI: 响应阶段
    Handler-->>IPC: 53. 返回IPC响应<br/>(success: true, data: result)
    IPC-->>UI: 54. 返回response
    UI->>UI: 55. 设置result状态
    UI->>UI: 56. 设置isRunning=false
    UI->>UI: 57. 清空进度状态
    UI->>User: 58. 显示提取结果<br/>(文件数, 记录数, 错误数)

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

| 状态变量 | 类型 | 说明 | 持久化 |
|---------|------|------|--------|
| `orderNumbers` | string | 用户输入的订单号列表 | ✅ sessionStorage |
| `batchSize` | number | 每批处理的订单数量 (默认100) | ✅ sessionStorage |
| `isRunning` | boolean | 是否正在执行提取 | ❌ 内存状态 |
| `progress` | ExtractorProgress \| null | 当前进度信息 (当前实现中未从后端接收) | ❌ 内存状态 |
| `result` | ExtractorResult \| null | 提取结果 | ❌ 内存状态 |
| `error` | string \| null | 错误信息 | ❌ 内存状态 |
| `logs` | string[] | 执行日志列表 | ❌ 内存状态 |

> **注意**: `progress` 状态目前未从后端接收实时更新。虽然 `ExtractorService` 内部调用 `onProgress` 回调，但函数无法通过 IPC 序列化传递。后续可通过 IPC 事件通道实现实时进度更新。

---

## 错误处理机制

```mermaid
flowchart TD
    Start([用户点击开始]) --> Validate{前端验证}
    Validate -->|订单号为空| ShowEmptyError["显示错误:
    请输入至少一个订单号"]
    Validate -->|验证通过| CallIPC[调用IPC API]

    CallIPC --> ConfigCheck{环境配置检查}
    ConfigCheck -->|配置不完整| ConfigError["返回ValidationError:
    ERP配置不完整"]
    ConfigCheck -->|配置完整| ConnectDB["连接数据库
    (MySQL或SQL Server)"]

    ConnectDB --> DBCheck{连接成功?}
    DBCheck -->|失败| DBError["返回DatabaseQueryError:
    数据库连接失败"]
    DBCheck -->|成功| ResolveOrders[解析订单号]

    ResolveOrders --> ValidOrders{有有效订单号?}
    ValidOrders -->|无| NoOrdersError["返回ValidationError:
    没有有效的生产订单号"]
    ValidOrders -->|有| LoginERP[ERP登录]

    LoginERP --> LoginCheck{登录成功?}
    LoginCheck -->|失败| LoginError["返回ErpConnectionError:
    ERP登录失败"]
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
    DBError --> ResetState3[设置isRunning=false]
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
    style DBError fill:#ffcccc
    style NoOrdersError fill:#ffcccc
    style LoginError fill:#ffcccc
    style RecordError fill:#fff4cc
    style ReturnSuccess fill:#ccffcc
```

### 错误类型与处理策略

| 错误类型 | 触发条件 | 用户反馈 | 恢复策略 |
|---------|---------|---------|---------|
| `ValidationError` | 订单号为空、配置不完整、无有效订单号 | 显示红色错误消息 | 修正输入后重试 |
| `DatabaseQueryError` | 数据库连接失败 (MySQL/SQL Server) | 显示数据库连接错误 | 检查数据库配置 |
| `ErpConnectionError` | ERP登录失败 | 显示ERP登录错误 | 检查ERP凭据 |
| `BatchError` | 单个批次处理失败 | 记录到错误列表，继续处理 | 查看错误详情 |
| `SystemError` | 未知系统错误 | 显示通用错误消息 | 查看日志 |

---

## 数据流转过程

```mermaid
flowchart LR
    subgraph "Input (用户输入)"
        A1["原始输入
        订单号列表"]
        A2["批次大小
        batchSize=100"]
    end

    subgraph "Transformation (数据转换)"
        B1["行解析
        按换行符分割"]
        B2["去空白
        trim每行"]
        B3["过滤空行
        移除空字符串"]
        B4["存储共享状态
        Production IDs"]
    end

    subgraph "Resolution (订单号解析)"
        C0["DatabaseFactory
        create()"]
        C1["查询数据库
        查找映射关系"]
        C2["提取生产订单号
        获取有效值"]
        C3["收集警告
        记录未映射项"]
    end

    subgraph "Processing (批量处理)"
        D1["批次分组
        按batchSize切分"]
        D2["批次迭代
        逐批处理"]
        D3["订单拼接
        逗号连接"]
    end

    subgraph "Output (结果输出)"
        E1["下载文件列表
        downloadedFiles数组"]
        E2["合并文件
        mergedFile TODO"]
        E3["记录总数
        recordCount"]
        E4["错误列表
        errors数组"]
    end

    A1 --> B1
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> C0
    A2 --> D1
    C0 --> C1
    C1 --> C2
    C2 --> D1
    C3 --> E4
    D1 --> D2
    D2 --> D3
    D3 --> E1
    E1 --> E3

    style A1 fill:#e3f2fd
    style A2 fill:#e3f2fd
    style C0 fill:#e8f5e9
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

    // 4. 存储到共享状态 (与Cleaner模块共享)
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

### 1.1 订单号实时同步到共享状态 (ExtractorPage.tsx:34-45)

```typescript
// 当用户输入订单号时，实时同步到共享状态
useEffect(() => {
  sessionStorage.setItem('extractor_orderNumbers', orderNumbers)
  // 实时更新共享的 Production IDs
  if (orderNumbers.trim()) {
    const orderNumberList = orderNumbers
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    window.electron.validation.setSharedProductionIds(orderNumberList)
  }
}, [orderNumbers])
```

> **设计说明**: 订单号通过两种方式存储到共享状态：
> 1. `useEffect` 在用户输入时实时更新
> 2. `handleExtract` 在提取开始前再次确认存储
>
> 这确保了即使用户在Cleaner页面刷新，数据也已同步。

### 2. IPC处理器核心逻辑 (extractor-handler.ts:17-145)

```typescript
ipcMain.handle(
  'extractor:run',
  async (_event, input: ExtractorInput): Promise<IpcResult<ExtractorResult>> => {
    return withErrorHandling(async () => {
      let authService: ErpAuthService | null = null
      let dbService: IDatabaseService | null = null

      try {
        // 1. 环境配置检查
        const erpUrl = process.env.ERP_URL || ''
        const erpUsername = process.env.ERP_USERNAME || ''
        const erpPassword = process.env.ERP_PASSWORD || ''

        if (!erpUrl || !erpUsername || !erpPassword) {
          throw new ValidationError('ERP 配置不完整')
        }

        // 2. 使用数据库工厂创建服务实例 (支持 MySQL 和 SQL Server)
        try {
          dbService = await create()  // 工厂方法，根据 DB_TYPE 自动选择数据库
        } catch (error) {
          throw new DatabaseQueryError('数据库连接失败', 'DB_CONNECTION_FAILED', error)
        }

        // 3. 解析订单号
        const resolver = new OrderNumberResolver(dbService)
        const mappings = await resolver.resolve(input.orderNumbers)
        const validOrderNumbers = resolver.getValidOrderNumbers(mappings)
        const warnings = resolver.getWarnings(mappings)

        if (validOrderNumbers.length === 0) {
          throw new ValidationError('没有有效的生产订单号可处理')
        }

        // 4. ERP登录
        authService = new ErpAuthService({ url, username, password, headless: true })
        await authService.login()

        // 5. 执行提取
        const extractor = new ExtractorService(authService)
        const result = await extractor.extract({
          ...input,
          orderNumbers: validOrderNumbers
        })

        // 6. 添加警告到结果
        if (warnings.length > 0) {
          result.errors = [...warnings, ...result.errors]
        }

        return result
      } finally {
        // 7. 资源清理
        if (authService) await authService.close()
        if (dbService) await dbService.disconnect()
      }
    }, 'extractor:run')
  }
)
```

### 2.1 数据库工厂模式 (database/index.ts)

```typescript
/**
 * 数据库工厂 - 创建数据库服务实例
 * 支持 MySQL 和 SQL Server 双数据库
 */
export async function create(type?: DatabaseType): Promise<IDatabaseService> {
  const dbType = type || getDatabaseType()  // 从 DB_TYPE 环境变量读取

  // 返回缓存的实例（单例模式）
  const cached = instances.get(dbType)
  if (cached && cached.isConnected()) {
    return cached
  }

  // 创建新实例
  let service: IDatabaseService

  if (dbType === 'sqlserver') {
    service = new SqlServerService(createSqlServerConfig())
  } else {
    service = new MySqlService(createMySqlConfig())
  }

  await service.connect()
  instances.set(dbType, service)  // 缓存实例

  return service
}

/**
 * 数据库类型判断
 */
export function getDatabaseType(): DatabaseType {
  const dbType = process.env.DB_TYPE?.toLowerCase()
  if (dbType === 'sqlserver' || dbType === 'mssql') {
    return 'sqlserver'
  }
  return 'mysql'
}
```

### 2.2 数据库服务接口 (types/database.types.ts)

```typescript
/**
 * 数据库服务统一接口
 */
export interface IDatabaseService {
  /** 数据库类型标识 */
  readonly type: DatabaseType

  /** 连接数据库 */
  connect(): Promise<void>

  /** 断开连接 */
  disconnect(): Promise<void>

  /** 检查连接状态 */
  isConnected(): boolean

  /** 执行查询 */
  query(sql: string, params?: any[]): Promise<QueryResult>

  /** 事务执行 */
  transaction(queries: { sql: string; params?: any[] }[]): Promise<void>
}

export type DatabaseType = 'mysql' | 'sqlserver'
```

### 3. 提取服务批处理逻辑 (extractor.ts:29-77)

```typescript
async extract(input: ExtractorInput): Promise<ExtractorResult> {
  const result: ExtractorResult = {
    downloadedFiles: [],
    mergedFile: null,
    recordCount: 0,
    errors: []
  }

  try {
    const session = this.authService.getSession()

    // 导航到提取页面并获取工作框架
    const { popupPage, workFrame } = await this.navigateToExtractorPage(session)

    // 批处理设置
    const batchSize = input.batchSize || 100
    const batches = this.createBatches(input.orderNumbers, batchSize)

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const progress = ((i + 1) / batches.length) * 100

      // 注意: onProgress 回调存在但无法通过 IPC 传递
      // 后续可通过 IPC 事件通道实现实时进度
      input.onProgress?.(`Processing batch ${i + 1}/${batches.length}`, progress)

      try {
        const filePath = await this.downloadBatch(
          session, popupPage, workFrame, batch, i, batches.length
        )
        result.downloadedFiles.push(filePath)
      } catch (error) {
        // 单批次失败不影响其他批次
        result.errors.push(`Batch ${i + 1}: ${error.message}`)
      }
    }

    // TODO: 合并文件功能待实现
  } catch (error) {
    result.errors.push(`Extraction failed: ${error.message}`)
  }

  return result
}
```

### 4. 浏览器自动化单批次处理 (extractor.ts:151-194)

```typescript
private async downloadBatch(
  session: ErpSession,
  popupPage: any,
  workFrame: any,
  orderNumbers: string[],
  batchIndex: number,
  totalBatches: number
): Promise<string> {
  // 1. 清空并填充订单号
  const textbox = workFrame.getByRole('textbox', { name: '来源生产订单号' })
  await textbox.fill('')
  await textbox.fill(orderNumbers.join(','))

  // 2. 点击搜索按钮
  await workFrame.locator('.search-component-searchBtn').click()

  // 3. 等待加载完成
  await this.waitForLoading(workFrame)

  // 4. 选择第一行（全选）
  await workFrame.getByRole('row', { name: '序号' }).getByLabel('').click()

  // 5. 悬停"更多"按钮并点击"输出"
  await workFrame.getByRole('button', { name: '更多' }).hover()
  await workFrame.getByText('输出', { exact: true }).click()

  // 6. 设置行数阈值
  const thresholdBox = workFrame
    .locator('div')
    .filter({ hasText: /^行数阈值$/ })
    .locator('input[type="text"]')
  await thresholdBox.fill('300000')

  // 7. 等待下载并保存
  const downloadPath = path.join(this.downloadDir, `temp_batch_${batchIndex + 1}.xlsx`)
  const downloadPromise = popupPage.waitForEvent('download')
  await workFrame.getByRole('button', { name: '确定(Y)' }).click()

  const download = await downloadPromise
  await download.saveAs(downloadPath)

  return downloadPath
}
```

### 5. Preload API 暴露 (preload/index.ts:24-26)

```typescript
// Extractor service
extractor: {
  runExtractor: (input: ExtractorInput) => ipcRenderer.invoke('extractor:run', input)
}
```

### 6. 类型定义 (types/extractor.types.ts)

```typescript
export interface ExtractorInput {
  orderNumbers: string[]
  batchSize?: number
  onProgress?: (message: string, progress: number) => void  // 注意: 函数无法通过IPC传递
}

export interface ExtractorResult {
  downloadedFiles: string[]
  mergedFile: string | null
  recordCount: number
  errors: string[]
}
```

---

## 总结

### 流程关键点

1. **三层验证机制**:
   - 前端验证: 非空检查
   - 配置验证: 环境变量完整性
   - 数据验证: 订单号有效性（通过数据库查询）

2. **数据库架构 (v1.2 更新)**:
   - 使用工厂模式 (`create()`) 创建数据库服务实例
   - 支持 MySQL 和 SQL Server 双数据库，通过 `DB_TYPE` 环境变量切换
   - 通过 `IDatabaseService` 统一接口实现数据库无关操作
   - 单例缓存机制，避免重复创建连接

3. **资源管理策略**:
   - 使用 try-finally 确保资源清理
   - 浏览器在使用后立即关闭
   - 数据库连接在使用后断开
   - 清理操作在 finally 块中独立 try-catch，避免清理失败影响结果返回

4. **错误容错设计**:
   - 单个批次失败不影响其他批次
   - 警告信息独立收集，不影响主流程
   - 详细错误信息返回给前端展示
   - 使用自定义错误类型 (`ValidationError`, `DatabaseQueryError`, `ErpConnectionError`)

5. **用户体验优化**:
   - sessionStorage 持久化用户输入（`orderNumbers`, `batchSize`）
   - 订单号实时同步到共享状态（供 Cleaner 模块使用）
   - 详细的日志记录
   - 结果面板显示文件数、记录数、错误数

### 已知限制

1. **进度更新未实现**:
   - `ExtractorInput.onProgress` 回调存在但无法通过 IPC 传递
   - 前端 `progress` 状态当前未从后端接收实时更新
   - 后续可通过 IPC 事件通道（`ipcRenderer.on` / `webContents.send`）实现

2. **文件合并未实现**:
   - `ExtractorResult.mergedFile` 当前始终为 `null`
   - 各批次文件独立保存在 `downloads` 目录

### 性能考虑

- **批处理**: 默认每批100个订单，平衡性能与稳定性
- **异步并发**: 使用 async/await 处理异步操作
- **下载监听**: 使用 Playwright 事件监听处理文件下载
- **数据库连接池**: 工厂模式缓存实例，复用连接

### 扩展性

- **数据库可切换**: 通过 `DB_TYPE` 环境变量切换 MySQL/SQL Server
- **配置化**: batchSize 可配置
- **模块化**: 服务独立，易于测试和维护
- **错误类型化**: 使用自定义错误类型便于精确处理
- **共享状态**: 通过 `validation.setSharedProductionIds` 实现跨页面数据共享

---

## 已知限制与待实现功能

### 进度更新机制

**当前状态**: 未实现

**原因**: IPC 通信无法序列化函数，`onProgress` 回调无法传递到主进程。

**当前实现**:
```typescript
// extractor.ts 中调用但无效
input.onProgress?.(`Processing batch ${i + 1}/${batches.length}`, progress)
```

**建议实现方案**:
```typescript
// 方案: 使用 IPC 事件通道

// 1. 主进程发送进度
event.sender.send('extractor:progress', { message, progress })

// 2. Preload 暴露事件监听
extractor: {
  onProgress: (callback) => {
    ipcRenderer.on('extractor:progress', (_event, data) => callback(data))
  }
}

// 3. 渲染进程监听
useEffect(() => {
  window.electron.extractor.onProgress((data) => {
    setProgress(data)
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${data.message}`])
  })
}, [])
```

### 文件合并功能

**当前状态**: 未实现

**待实现**: 将多个批次下载的文件合并为单一 Excel 文件。

**相关代码位置**: `extractor.ts:69-70`

```typescript
// TODO: Merge files (implement in separate task)
// result.mergedFile = await this.mergeFiles(result.downloadedFiles);
```

---

**文档维护**: 如代码逻辑变更，请及时更新本文档和相关流程图。
