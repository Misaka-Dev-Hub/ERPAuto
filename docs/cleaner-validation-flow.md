# 清理界面 - 获取校验状态流程分析文档

**文档版本**: 1.0
**创建日期**: 2026-03-02
**面向对象**: 开发人员

## 概述

本文档详细分析了在清理界面(CleanerPage)中，用户点击"获取并校验物料状态"按钮后，程序的完整运行逻辑，包括前端交互、IPC通信、后端处理和数据库交互。

---

## 核心流程概览

```mermaid
flowchart TB
    Start([用户点击<br/>获取并校验物料状态]) --> UI1[设置状态<br/>isValidationRunning=true]
    UI1 --> UI2["清空现有数据<br/>validationResults=empty<br/>selectedItems=empty"]
    UI2 --> IPC[调用IPC<br/>window.electron.validation.validate]

    IPC --> Handler{validation-handler.ts<br/>validation:validate}
    Handler --> DB[连接数据库<br/>MySQL/SQL Server]
    DB --> ModeCheck{校验模式?}

    ModeCheck -->|database_full| FullQuery[查询DiscreteMaterialPlanData<br/>全表去重查询<br/>queryAllDistinctByMaterialCode]
    ModeCheck -->|database_filtered| FilterCheck{useSharedProductionIds?}

    FilterCheck -->|true| SharedIds[获取共享Production IDs<br/>getSharedProductionIds]
    FilterCheck -->|false| FileCheck[productionIdFile存在?]
    SharedIds --> SourceQuery[查询生产订单号<br/>getSourceNumbersFromInputs]
    FileCheck -->|true| SourceQuery
    FileCheck -->|false| Error1[返回错误<br/>没有可用Production ID]

    FullQuery --> TypeQuery[查询类型关键词<br/>MaterialsTypeToBeDeleted]
    SourceQuery --> TypeQuery

    TypeQuery --> MarkedQuery[查询已标记物料<br/>MaterialsToBeDeleted]
    MarkedQuery --> Match[物料匹配算法<br/>优先级匹配]
    Match --> Return[返回ValidationResponse<br/>success/results/stats]

    Error1 --> Return
    Return --> UI3[前端接收响应]
    UI3 --> SuccessCheck{success?}

    SuccessCheck -->|true| UI4["更新validationResults<br/>自动勾选已标记物料"]
    UI4 --> UI5[管理员更新负责人列表]
    UI5 --> UI6[设置isValidationRunning=false]
    UI6 --> End([流程结束])

    SuccessCheck -->|false| Error2[显示错误弹窗<br/>alert error]
    Error2 --> UI6
```

---

## 详细流程分解

### 1. 前端交互层 (CleanerPage.tsx)

**触发位置**: `src/renderer/src/pages/CleanerPage.tsx:117-155`

```mermaid
sequenceDiagram
    participant User as 用户
    participant UI as CleanerPage
    participant IPC as window.electron.validation

    User->>UI: 点击"获取并校验物料状态"按钮
    UI->>UI: setIsValidationRunning(true)
    UI->>UI: 清空 validationResults, selectedItems, hiddenItems
    UI->>IPC: validate({ mode, useSharedProductionIds })

    Note over UI,IPC: 请求参数:<br/>- mode: 'database_full' | 'database_filtered'<br/>- useSharedProductionIds: boolean

    IPC-->>UI: ValidationResponse
    alt success=true
        UI->>UI: setValidationResults(results)
        UI->>UI: 自动勾选已标记物料
        UI->>UI: 管理员更新负责人列表
    else success=false
        UI->>User: alert(error)
    end
    UI->>UI: setIsValidationRunning(false)
```

**关键代码逻辑**:

```typescript
const handleValidation = async () => {
  setIsValidationRunning(true)
  setValidationResults([])
  setSelectedItems(new Set())
  setHiddenItems(new Set())

  try {
    const response = await window.electron.validation.validate({
      mode: valMode === 'full' ? 'database_full' : 'database_filtered',
      useSharedProductionIds: valMode === 'filtered'
    })

    if (response.success && response.results) {
      setValidationResults(response.results)
      // 自动勾选已标记物料
      const markedCodes = new Set(
        response.results
          .filter(r => r.isMarkedForDeletion)
          .map(r => r.materialCode)
      )
      setSelectedItems(markedCodes)

      // 管理员更新负责人列表
      if (isAdmin) {
        const uniqueManagers = new Set(
          response.results
            .map(r => r.managerName)
            .filter(Boolean)
        )
        setManagers([...uniqueManagers])
        setSelectedManagers(uniqueManagers)
      }
    }
  } finally {
    setIsValidationRunning(false)
  }
}
```

---

### 2. IPC Handler层 (validation-handler.ts)

**处理位置**: `src/main/ipc/validation-handler.ts:209-392`

```mermaid
flowchart TB
    subgraph IPC_Handler["IPC Handler: validation:validate"]
        Start([接收请求]) --> Log[console.log开始校验]
        Log --> Connect[getValidationDatabaseService<br/>连接MySQL/SQLServer]
        Connect --> CheckMode{检查mode参数}

        CheckMode -->|database_full| FullMode[全表校验分支]
        CheckMode -->|database_filtered| FilterMode[过滤校验分支]

        FullMode --> QueryMaterial[DiscreteMaterialPlanDAO<br/>queryAllDistinctByMaterialCode]

        FilterMode --> CheckShared{useSharedProductionIds?}
        CheckShared -->|true| GetShared[getSharedProductionIds<br/>获取共享ID]
        CheckShared -->|false| CheckFile{productionIdFile?}
        CheckFile -->|true| ReadFile[readProductionIds<br/>读取文件]
        CheckFile -->|false| ReturnError1[返回错误]

        GetShared --> GetSource[getSourceNumbersFromInputs<br/>查询生产订单号]
        ReadFile --> GetSource

        QueryMaterial --> QueryType[查询MaterialsTypeToBeDeleted<br/>获取类型关键词]
        GetSource --> QueryType

        QueryType --> QueryMarked[查询MaterialsToBeDeleted<br/>获取已标记物料]
        QueryMarked --> Match[物料匹配算法]
        Match --> BuildResponse[构建ValidationResponse]
        BuildResponse --> Disconnect[断开数据库连接]
        Disconnect --> ReturnResponse[返回响应]
        ReturnError1 --> ReturnResponse
    end
```

---

### 3. 数据库交互层

#### 3.1 数据库连接与类型选择

**位置**: `validation-handler.ts:55-83`

```mermaid
flowchart LR
    Start([getValidationDatabaseService]) --> CheckEnv{检查DB_TYPE环境变量}
    CheckEnv -->|sqlserver/mssql| SQLServer[创建SqlServerService<br/>使用mssql驱动]
    CheckEnv -->|其他| MySQL[创建MySqlService<br/>使用mysql2驱动]

    SQLServer --> ConnectSQL[connect<br/>连接SQL Server]
    MySQL --> ConnectMySQL[connect<br/>连接MySQL]

    ConnectSQL --> ReturnSQL[返回SqlServerService实例]
    ConnectMySQL --> ReturnMySQL[返回MySqlService实例]
```

**表名转换逻辑**:

```typescript
// MySQL: dbo_MaterialsToBeDeleted
// SQL Server: [dbo].[MaterialsToBeDeleted]
function getTableName(mysqlTableName: string): string {
  const dbType = process.env.DB_TYPE?.toLowerCase()
  if (dbType === 'sqlserver' || dbType === 'mssql') {
    // 找到第一个下划线分割schema和表名
    const firstUnderscoreIndex = mysqlTableName.indexOf('_')
    if (firstUnderscoreIndex > 0) {
      const schema = mysqlTableName.substring(0, firstUnderscoreIndex)
      const tableName = mysqlTableName.substring(firstUnderscoreIndex + 1)
      return `[${schema}].[${tableName}]`
    }
    return `[dbo].[${mysqlTableName}]`
  }
  return mysqlTableName
}
```

#### 3.2 核心查询流程

```mermaid
sequenceDiagram
    participant Handler as IPC Handler
    participant DAO as DiscreteMaterialPlanDAO
    participant DB as Database(MySQL/SQLServer)
    participant TypeDAO as MaterialsTypeToBeDeleted
    participant MarkedDAO as MaterialsToBeDeleted

    Handler->>DAO: 查询物料计划数据
    Note over DAO,DB: 根据mode决定查询方式

    alt 全表模式 (database_full)
        DAO->>DB: queryAllDistinctByMaterialCode()
        DB-->>DAO: 全表去重数据(按MaterialCode)
    else 过滤模式 (database_filtered)
        DAO->>DB: queryBySourceNumbersDistinct(sourceNumbers)
        DB-->>DAO: 按订单号过滤去重数据
    end

    Handler->>TypeDAO: 查询类型关键词
    TypeDAO->>DB: SELECT MaterialName, ManagerName<br/>FROM MaterialsTypeToBeDeleted
    DB-->>TypeDAO: 类型关键词列表
    TypeDAO-->>Handler: typeKeywords[]

    Handler->>MarkedDAO: 查询已标记物料
    MarkedDAO->>DB: SELECT MaterialCode, ManagerName<br/>FROM MaterialsToBeDeleted
    DB-->>MarkedDAO: 已标记物料字典
    MarkedDAO-->>Handler: markedCodesDict(Map)
```

#### 3.3 查询SQL详解

**全表去重查询** (MySQL/SQL Server通用):

```sql
WITH RankedRecords AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY MaterialCode
      ORDER BY CreateDate ASC, SequenceNumber ASC
    ) AS rn
  FROM dbo_DiscreteMaterialPlanData
  WHERE MaterialCode IS NOT NULL
)
SELECT
  Factory, MaterialStatus, PlanNumber, SourceNumber, MaterialType,
  ProductCode, ProductName, ProductUnit, ProductPlanQuantity,
  UseDepartment, Remark, Creator, CreateDate, Approver, ApproveDate,
  SequenceNumber, MaterialCode, MaterialName, Specification, Model,
  DrawingNumber, MaterialQuality, PlanQuantity, Unit, RequiredDate,
  Warehouse, UnitUsage, CumulativeOutputQuantity, BOMVersion
FROM RankedRecords
WHERE rn = 1
```

**按订单号过滤查询** (批量处理，每批2000条):

```sql
WITH RankedRecords AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY MaterialCode
      ORDER BY CreateDate ASC, SequenceNumber ASC
    ) AS rn
  FROM dbo_DiscreteMaterialPlanData
  WHERE SourceNumber IN (?, ?, ...)  -- 批量占位符
    AND MaterialCode IS NOT NULL
)
SELECT [字段列表]
FROM RankedRecords
WHERE rn = 1
```

---

### 4. 物料匹配算法

**位置**: `validation-handler.ts:325-361`

```mermaid
flowchart TB
    Start([开始物料匹配]) --> Loop[遍历materialRecords]
    Loop --> Extract[提取物料信息<br/>materialName, materialCode<br/>specification, model]

    Extract --> Priority1{优先级1:<br/>MaterialsToBeDeleted<br/>精确匹配?}

    Priority1 -->|materialCode<br/>在markedCodesDict中| SetMarked[设置managerName<br/>isMarkedForDeletion=true]
    Priority1 -->|未匹配| Priority2{优先级2:<br/>MaterialsTypeToBeDeleted<br/>名称包含匹配?}

    SetMarked --> PushResult[添加到results]
    Priority2 -->|遍历typeKeywords| CheckContains{typeKeyword.materialName<br/>包含 materialName?}

    CheckContains -->|是| SetMatched[设置managerName<br/>matchedTypeKeyword<br/>isMarkedForDeletion=false]
    CheckContains -->|否| SetNull[managerName=null<br/>isMarkedForDeletion=false]

    SetMatched --> PushResult
    SetNull --> PushResult

    PushResult --> Next{还有物料?}
    Next -->|是| Loop
    Next -->|否| Stats[计算统计数据<br/>totalRecords, matchedCount, markedCount]
    Stats --> Return([返回ValidationResponse])
```

**匹配优先级**:

1. **优先级1 (最高)**: `MaterialsToBeDeleted` 表精确匹配
   - 匹配条件: `MaterialCode` 完全相等
   - 结果: `isMarkedForDeletion = true`, `managerName` 从表中获取

2. **优先级2 (次高)**: `MaterialsTypeToBeDeleted` 表包含匹配
   - 匹配条件: `MaterialName` 包含关系 (`typeKeyword.materialName.includes(materialName)`)
   - 结果: `isMarkedForDeletion = false`, `managerName` 从表中获取, `matchedTypeKeyword` 记录匹配项

3. **未匹配**: 无任何匹配
   - 结果: `isMarkedForDeletion = false`, `managerName = ''`, `matchedTypeKeyword = undefined`

**核心代码**:

```typescript
for (const record of materialRecords) {
  const materialName = (record.MaterialName as string) || ''
  const materialCode = (record.MaterialCode as string) || ''
  const specification = (record.Specification as string) || ''
  const model = (record.Model as string) || ''

  // 优先级1: 检查 MaterialsToBeDeleted (MaterialCode 精确匹配)
  let managerName = markedCodesDict.get(materialCode) || null
  const isMarkedForDeletion = managerName !== null
  let matchedTypeKeyword: string | undefined = undefined

  // 优先级2: 匹配 MaterialsTypeToBeDeleted (MaterialName 包含匹配)
  if (!managerName) {
    for (const typeKeyword of typeKeywords) {
      if (
        typeKeyword.materialName &&
        typeKeyword.materialName.includes(materialName)
      ) {
        matchedTypeKeyword = typeKeyword.materialName
        managerName = typeKeyword.managerName
        break
      }
    }
  }

  results.push({
    materialName,
    materialCode,
    specification,
    model,
    managerName: managerName || '',
    isMarkedForDeletion,
    matchedTypeKeyword
  })
}
```

---

### 5. 数据流向图

```mermaid
graph TB
    subgraph 前端["前端 (Renderer Process)"]
        Button[获取并校验按钮] --> Handler[handleValidation函数]
    end

    subgraph Preload["Preload Script"]
        API[window.electron.validation.validate]
    end

    subgraph Main["主进程 (Main Process)"]
        IPC[validation:validate Handler]
        DAO1[DiscreteMaterialPlanDAO]
        DAO2[MaterialsToBeDeletedDAO]
        DB[(Database<br/>MySQL/SQL Server)]
    end

    Handler -->|IPC调用| API
    API --> IPC
    IPC -->|查询物料数据| DAO1
    IPC -->|查询已标记| DAO2
    DAO1 --> DB
    DAO2 --> DB
    DB --> DAO1
    DB --> DAO2
    DAO1 --> IPC
    DAO2 --> IPC
    IPC --> API
    API --> Handler
    Handler -->|更新UI| State[validationResults State]
```

---

### 6. 关键数据结构

#### 6.1 ValidationRequest (IPC输入)

```typescript
interface ValidationRequest {
  mode: 'database_full' | 'database_filtered'
  useSharedProductionIds?: boolean
  productionIdFile?: string  // 可选，文件路径
}
```

#### 6.2 ValidationResponse (IPC输出)

```typescript
interface ValidationResponse {
  success: boolean
  results?: ValidationResult[]
  stats?: {
    totalRecords: number
    matchedCount: number    // 有负责人(包括类型匹配)
    markedCount: number     // 已标记删除
  }
  error?: string
}
```

#### 6.3 ValidationResult (单个物料结果)

```typescript
interface ValidationResult {
  materialName: string
  materialCode: string
  specification: string
  model: string
  managerName: string          // 负责人名称
  isMarkedForDeletion: boolean // 是否精确匹配MaterialsToBeDeleted
  matchedTypeKeyword?: string  // 如果匹配了类型关键词，记录匹配项
}
```

---

### 7. 错误处理流程

```mermaid
flowchart TB
    Try([try-catch块开始]) --> Exec[执行数据库操作]
    Exec --> Catch{发生异常?}

    Catch -->|是| LogError[console.error错误信息]
    LogError --> BuildError[构建错误响应<br/>success=false<br/>error=错误消息]
    BuildError --> Finally[finally块]

    Catch -->|否| Finally

    Finally --> CheckDB{数据库连接存在?}
    CheckDB -->|是| Disconnect[断开连接<br/>dbService.disconnect]
    CheckDB -->|否| ReturnResponse[返回响应]
    Disconnect --> ReturnResponse
```

**常见错误场景**:

1. **没有共享Production ID**:
   - 场景: `mode='database_filtered'` 且 `useSharedProductionIds=true`，但共享ID为空
   - 错误信息: "没有可用的共享 Production ID。请在数据提取页面输入 Production ID。"

2. **没有找到物料记录**:
   - 场景: 数据库查询返回空结果
   - 错误信息: "No material records found"

3. **数据库连接失败**:
   - 场景: 数据库服务未启动、配置错误
   - 错误信息: 具体的数据库错误消息

---

## 文件索引

| 文件路径 | 说明 | 关键行号 |
|---------|------|---------|
| `src/renderer/src/pages/CleanerPage.tsx` | 前端清理页面 | 117-155 (handleValidation) |
| `src/main/ipc/validation-handler.ts` | IPC处理器 | 209-392 (validation:validate) |
| `src/main/services/database/discrete-material-plan-dao.ts` | 物料计划DAO | 191-227 (queryAllDistinctByMaterialCode) |
| `src/main/services/database/discrete-material-plan-dao.ts` | 物料计划DAO | 294-377 (queryBySourceNumbersDistinct) |
| `src/main/services/database/materials-to-be-deleted-dao.ts` | 待删除物料DAO | 248-268 (getAllMaterialCodes) |

---

## 附录: 共享Production IDs机制

**用途**: 在数据提取页面和清理页面之间共享订单号列表

**存储位置**: `validation-handler.ts:28-43` (内存Set)

**相关IPC接口**:

- `validation:setSharedProductionIds`: 设置共享ID (提取页面调用)
- `validation:getSharedProductionIds`: 获取共享ID (清理页面调用)

**流程**:

```mermaid
sequenceDiagram
    participant Extractor as 数据提取页面
    participant IPC as validation-handler
    participant Cleaner as 清理页面
    participant Memory as sharedProductionIds<br/>内存Set

    Extractor->>IPC: setSharedProductionIds([...])
    IPC->>Memory: 存储到内存Set

    Note over Cleaner: 页面加载时
    Cleaner->>IPC: getSharedProductionIds()
    IPC->>Memory: 读取内存Set
    Memory-->>IPC: productionIds[]
    IPC-->>Cleaner: { productionIds }
    Cleaner->>Cleaner: 显示Production IDs数量
```

---

**文档结束**
