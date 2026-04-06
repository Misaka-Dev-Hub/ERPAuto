# 清理器角色差异流程 — Admin vs User

**文档版本**: 1.1
**创建日期**: 2026-04-06
**面向对象**: 开发人员

## 概述

清理器（Cleaner）在决定"哪些物料需要被清除"时，Admin 和 User 两个角色存在系统性的差异。这些差异贯穿三个阶段：**初始化 → 校验确认 → 执行清理**。

本文档使用 Mermaid 图表说明每个阶段的角色分支逻辑。

---

## 全局流程概览

```mermaid
flowchart TB
    subgraph init["阶段一：页面初始化"]
        I1([页面加载]) --> I2{角色判断}
        I2 -->|Admin| I3["管理员列表 ← 全部负责人<br/>默认选中全部"]
        I2 -->|User| I4["管理员列表 ← 空<br/>默认选中仅自己"]
    end

    subgraph validate["阶段二：校验 → 勾选 → 同步数据库"]
        V1([点击校验]) --> V2["后端查询物料<br/>（不区分角色）"]
        V2 --> V3["物料匹配算法<br/>（User 有覆盖匹配）"]
        V3 --> V4{角色判断}
        V4 -->|Admin| V5["显示全部物料<br/>侧边栏可按负责人筛选"]
        V4 -->|User| V6["仅显示自己的物料<br/>+ 无负责人的物料"]
        V5 --> V7["用户勾选/取消勾选"]
        V6 --> V7
        V7 --> V8{点击同步数据库}
        V8 --> V9{角色判断}
        V9 -->|Admin| V10["处理范围：全部校验结果"]
        V9 -->|User| V11["处理范围：仅筛选后结果"]
    end

    subgraph execute["阶段三：执行清理（ERP 删除）"]
        E1([点击执行清理]) --> E2["getCleanerData(selectedManagers)<br/>获取物料代码"]
        E2 --> E3{角色判断}
        E3 -->|Admin| E3a{selectedManagers<br/>非空?}
        E3a -->|"是"| E4["SQL WHERE ManagerName IN (选中)<br/>从 MaterialsToBeDeleted 获取"]
        E3a -->|"否"| E4b["从 DiscreteMaterialPlanData<br/>按 orderNumbers 获取"]
        E3 -->|User| E5["SQL WHERE ManagerName = 用户<br/>仅获取自己的物料代码"]
        E4 --> E6["传递给 runCleaner 执行"]
        E4b --> E6
        E5 --> E6
        E6 --> E7([在 ERP 中删除物料])
    end

    init --> validate --> execute
```

---

## 阶段一：页面初始化

**源码位置**: `src/renderer/src/hooks/cleaner/api.ts:25-52` 与 `src/renderer/src/hooks/useCleaner.ts:98-112`

```mermaid
flowchart TB
    Start([页面加载]) --> GetAdmin["调用 auth:isAdmin<br/>判断是否管理员"]
    GetAdmin --> GetUser["调用 auth:getCurrentUser<br/>获取当前用户名"]
    GetUser --> RoleCheck{isAdmin?}

    RoleCheck -->|Admin| GetManagers["调用 materials:getManagers<br/>获取全部负责人列表"]
    GetManagers --> SelectAll["selectedManagers ← 全部负责人<br/>（默认全选）"]
    SelectAll --> RenderSidebar["渲染 CleanerSidebar<br/>显示负责人复选框"]

    RoleCheck -->|User| SetSelf["selectedManagers ← {currentUsername}<br/>（仅选中自己）"]
    SetSelf --> NoSidebar["不渲染 CleanerSidebar<br/>无侧边栏"]

    RenderSidebar --> Ready([就绪])
    NoSidebar --> Ready
```

**差异总结**:

| 维度 | Admin | User |
|------|-------|------|
| 侧边栏 | 有 CleanerSidebar | 无 |
| 管理员列表 | 查询全部负责人 | 不查询 |
| 默认选中 | 所有负责人 | 仅自己 |

---

## 阶段二：校验 → 勾选 → 同步数据库

### 2.1 物料校验（后端，不区分角色）

**源码位置**: `src/main/services/validation/validation-application-service.ts`

校验阶段后端查询不区分角色，Admin 和 User 拿到相同的物料数据。区别在于**匹配算法**：

```mermaid
flowchart TB
    Start([遍历每条物料记录]) --> P1{"优先级1<br/>MaterialsToBeDeleted<br/>精确匹配 MaterialCode?"}

    P1 -->|"匹配"| SetManager["managerName ← 表中记录<br/>isMarkedForDeletion = true"]
    P1 -->|"未匹配"| P2{"优先级2<br/>MaterialsTypeToBeDeleted<br/>MaterialName 包含匹配?"}

    P2 -->|"匹配"| SetType["managerName ← 类型关键词负责人<br/>matchedTypeKeyword ← 匹配项"]
    P2 -->|"未匹配"| SetNull["managerName = null"]

    SetManager --> RoleCheck{角色?}
    SetType --> RoleCheck
    SetNull --> RoleCheck

    RoleCheck -->|"Admin"| Skip["跳过覆盖<br/>使用当前结果"]
    RoleCheck -->|"User"| P3{"优先级3（User 覆盖）<br/>自己的类型关键词匹配?"}

    P3 -->|"匹配"| Override["强制覆盖<br/>managerName ← 当前用户"]
    P3 -->|"未匹配"| Keep["保持当前结果"]
    Skip --> Next(["下一条物料"])
    Override --> Next
    Keep --> Next
```

**匹配优先级说明**:

| 优先级 | 数据源 | 匹配方式 | 适用角色 |
|--------|--------|----------|----------|
| 1（最高） | `MaterialsToBeDeleted` | MaterialCode 精确匹配 | 全部 |
| 2 | `MaterialsTypeToBeDeleted` | MaterialName 包含匹配 | 全部 |
| 3（User 覆盖） | 当前用户的类型关键词 | MaterialName 包含匹配 | 仅 User |

> **优先级 3 的作用**：当某个物料按优先级 2 被分配给其他负责人，但当前 User 有匹配的类型关键词时，会强制覆盖为自己的。这确保 User 不会为他人操作物料。

### 2.2 前端显示过滤

**源码位置**: `src/renderer/src/hooks/cleaner/helpers.ts:34-57`

校验结果返回前端后，会根据角色进行显示过滤：

```mermaid
flowchart TB
    Input([校验结果 validationResults]) --> RoleCheck{角色判断}

    RoleCheck -->|Admin| FilterManagers["按侧边栏选中的负责人过滤<br/>selectedManagers.has(managerName)<br/>|| !managerName"]
    RoleCheck -->|User| FilterSelf["仅显示自己的 + 无负责人的<br/>managerName === currentUsername<br/>|| !managerName"]

    FilterManagers --> FilterHidden["排除已隐藏的物料<br/>!hiddenItems.has(materialCode)"]
    FilterSelf --> FilterHidden

    FilterHidden --> Output([filteredResults<br/>用于表格显示])
```

### 2.3 确认删除（同步数据库）

**源码位置**: `src/renderer/src/hooks/useCleaner.ts:289-344`

```mermaid
flowchart TB
    Start([点击确认删除]) --> RoleScope{角色判断}

    RoleScope -->|Admin| UseAll["resultsToProcess = validationResults<br/>处理全部校验结果"]
    RoleScope -->|User| UseFiltered["resultsToProcess = filteredResults<br/>仅处理筛选后结果"]

    UseAll --> BuildPlan["buildDeletionPlan(resultsToProcess, selectedItems)"]
    UseFiltered --> BuildPlan

    BuildPlan --> Loop["遍历 resultsToProcess"]
    Loop --> Check{物料是否勾选?}

    Check -->|"已勾选"| HasManager{有负责人?}
    Check -->|"未勾选"| ToDelete["加入 materialsToDelete<br/>从数据库移除标记"]

    HasManager -->|"有"| ToUpsert["加入 materialsToUpsert<br/>写入/更新到数据库"]
    HasManager -->|"无"| Missing["加入 missingManager<br/>阻止操作"]

    ToUpsert --> Save["调用 materials:upsertBatch"]
    ToDelete --> Del["调用 materials:delete"]
    Missing --> Warn(["弹窗警告：缺少负责人"])
    Save --> Done([完成])
    Del --> Done
```

**关键代码**:

```typescript
// Admin 处理全部结果，User 只处理筛选后的结果
const resultsToProcess = isAdmin ? validationResults : filteredResults
```

**差异总结**:

| 维度 | Admin | User |
|------|-------|------|
| 处理范围 | `validationResults`（全部） | `filteredResults`（自己的+无负责人的） |
| 可操作物料 | 所有负责人的物料 | 仅自己的 + 无负责人的 |
| 能否修改他人数据 | 是 | 否 |

---

## 阶段三：执行清理（ERP 删除）

**源码位置**:
- 前端调用: `src/renderer/src/hooks/cleaner/api.ts:116-166`
- 获取数据: `src/main/services/validation/validation-application-service.ts:497-655`
- 执行删除: `src/main/services/cleaner/cleaner-application-service.ts`

```mermaid
sequenceDiagram
    participant UI as 前端 useCleaner
    participant API as api.ts
    participant Main as 主进程
    participant DB as 数据库
    participant ERP as ERP 系统

    UI->>API: runCleanerExecution({ dryRun, selectedManagers, ... })
    API->>Main: getCleanerData({ selectedManagers })

    alt Admin + selectedManagers 非空
        Main->>DB: SELECT MaterialCode FROM MaterialsToBeDeleted<br/>WHERE ManagerName IN (@manager0, @manager1, ...)
        Note over Main,DB: 按选中的负责人过滤<br/>从 MaterialsToBeDeleted 获取
    else Admin + selectedManagers 为空
        Main->>DB: SELECT DISTINCT MaterialCode FROM DiscreteMaterialPlanData<br/>WHERE SourceNumber IN (orderNumbers)
        Note over Main,DB: 按订单号查询<br/>从 DiscreteMaterialPlanData 获取
    else User
        Main->>DB: SELECT MaterialCode FROM MaterialsToBeDeleted<br/>WHERE ManagerName = @username
        Note over Main,DB: 按 ManagerName 过滤<br/>仅获取自己的物料代码
    end

    DB-->>Main: materialCodes[]
    Main-->>API: { orderNumbers, materialCodes }

    Note over API: 传入角色过滤后的 materialCodes
    API->>Main: cleaner.runCleaner({ orderNumbers, materialCodes, ... })

    Main->>ERP: 按订单遍历，删除指定物料
    ERP-->>Main: 删除结果
    Main-->>API: CleanerResult
    API-->>UI: 显示执行报告
```

**SQL 差异**:

```mermaid
flowchart TB
    subgraph AdminWithMgr["Admin + selectedManagers 非空"]
        A1["SELECT MaterialCode<br/>FROM MaterialsToBeDeleted<br/>WHERE ManagerName IN (@manager0, ...)<br/>AND MaterialCode IS NOT NULL"]
    end

    subgraph AdminNoMgr["Admin + selectedManagers 为空"]
        A2["SELECT DISTINCT MaterialCode<br/>FROM DiscreteMaterialPlanData<br/>WHERE SourceNumber IN (orderNumbers)"]
    end

    subgraph User["User 查询"]
        U1["SELECT MaterialCode<br/>FROM MaterialsToBeDeleted<br/>WHERE ManagerName = @username<br/>AND MaterialCode IS NOT NULL"]
    end

    AdminWithMgr --> |"按选中负责人过滤"| Result([传入 runCleaner])
    AdminNoMgr --> |"按订单号查 DiscreteMaterialPlanData"| Result
    User --> |"仅返回自己的物料代码"| Result
```

**差异总结**:

| 维度 | Admin（有 selectedManagers） | Admin（无 selectedManagers） | User |
|------|---------------------------|----------------------------|------|
| 数据源 | `MaterialsToBeDeleted` | `DiscreteMaterialPlanData` | `MaterialsToBeDeleted` |
| 查询条件 | `WHERE ManagerName IN (...)` | `WHERE SourceNumber IN (orderNumbers)` | `WHERE ManagerName = @username` |
| 可删除物料 | 选中负责人的物料 | 订单关联的全部物料 | 仅自己标记的物料 |
| 无订单号时 | — | 返回空数组 | — |

---

## 数据安全边界

角色隔离在**三个层面**同时生效，形成纵深防御：

```mermaid
flowchart TB
    subgraph layer1["第一层：前端过滤"]
        L1["filterValidationResults()<br/>User 仅看到自己的物料"]
    end

    subgraph layer2["第二层：同步范围"]
        L2["handleConfirmDeletion()<br/>User 仅同步 filteredResults"]
    end

    subgraph layer3["第三层：后端查询"]
        L3["loadMaterialCodesForCleaner()<br/>Admin: WHERE ManagerName IN (selectedManagers)<br/>User: SQL WHERE ManagerName = user"]
    end

    L1 -->|"防止误操作"| L2
    L2 -->|"缩小同步范围"| L3
    L3 -->|"最终保证"| Safe([User 无法删除他人物料])
```

> **注意**：`runCleaner()` 本身不做角色过滤，它信任上游传入的 `materialCodes` 已经过角色过滤。安全性由 `getCleanerData()` 的 SQL 查询保证。

---

## 涉及文件索引

| 文件 | 关键函数/逻辑 | 行号 |
|------|---------------|------|
| `src/renderer/src/hooks/cleaner/api.ts` | `initializeCleanerPage()`, `runCleanerExecution()` | 25-52, 116-166 |
| `src/renderer/src/hooks/useCleaner.ts` | `handleConfirmDeletion()`, 初始化逻辑 | 98-120, 289-345 |
| `src/renderer/src/hooks/cleaner/helpers.ts` | `filterValidationResults()`, `buildDeletionPlan()` | 34-57, 59-92 |
| `src/main/services/validation/validation-application-service.ts` | `getCleanerData()`, `loadMaterialCodesForCleaner()`, `queryMaterialCodesByManagers()` | 232-305, 497-604, 606-655 |
| `src/main/services/cleaner/cleaner-application-service.ts` | `runCleaner()` | 31-168 |
| `src/main/ipc/cleaner-handler.ts` | `CLEANER_RUN` handler | 16-22 |
| `src/main/ipc/validation-handler.ts` | `getCleanerData` handler | 194-223 |
| `src/preload/api/validation.ts` | `getCleanerData()` IPC 桥接 | 11-12 |
| `src/renderer/src/pages/CleanerPage.tsx` | 页面组件，条件渲染侧边栏 | 74-82 |
