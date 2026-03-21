# 调试指南

本文档说明项目里最常见的调试入口、日志观察方式和问题定位路径。

## 1. 调试总览

```mermaid
flowchart TD
    Problem[出现问题]
    Area{问题在哪一层}
    Renderer[Renderer]
    Preload[Preload / IPC]
    Main[Main / Services]
    External[ERP / DB / Update]

    Problem --> Area
    Area --> Renderer
    Area --> Preload
    Area --> Main
    Area --> External
```

## 2. 常见调试入口

项目里当前有几个现成的调试入口：

```bash
npm run debug:erp-login
npm run debug:config-path
npm run test:rustfs
```

对应文件：

- `src/main/tools/erp-login-debug.ts`
- `src/main/tools/config-path-debug.ts`
- `src/main/tools/rustfs-test.ts`

## 3. 调试分层思路

### 3.1 Renderer 问题

适合从这里开始：

- `src/renderer/src/App.tsx`
- `src/renderer/src/pages/*`
- `src/renderer/src/hooks/*`

常见现象：

- 页面不更新
- 弹窗打不开
- 表单状态异常
- 请求重复触发

### 3.2 Preload / IPC 问题

```mermaid
graph LR
    Renderer --> Preload
    Preload --> Handler
    Handler --> Service
```

定位顺序建议：

1. renderer 是否正确调用 `window.electron.xxx`
2. preload facade 是否暴露了正确接口
3. handler 是否已注册
4. service 是否返回了预期结构

### 3.3 Main 进程问题

适合从这里开始：

- `src/main/index.ts`
- `src/main/bootstrap/*`
- `src/main/ipc/*`
- `src/main/services/*`

常见现象：

- 启动失败
- 数据库连接失败
- ERP 登录失败
- 更新检查失败

## 4. Cleaner 调试路径

```mermaid
flowchart TD
    CleanerIssue[Cleaner 问题]
    UI[CleanerPage / useCleaner]
    Validation[validation-handler / service]
    Handler[cleaner-handler]
    AppSvc[cleaner-application-service]
    ERP[erp/cleaner.ts]
    Report[report / rustfs]

    CleanerIssue --> UI
    UI --> Validation
    Validation --> Handler
    Handler --> AppSvc
    AppSvc --> ERP
    ERP --> Report
```

## 5. Extractor 调试路径

```mermaid
flowchart TD
    ExtractorIssue[Extractor 问题]
    Input[ExtractorPage / OrderNumberInput]
    Hook[useExtractor]
    Shared[useSharedProductionIds]
    Handler[extractor-handler]
    Service[erp/extractor.ts]

    ExtractorIssue --> Input
    Input --> Hook
    Input --> Shared
    Hook --> Handler
    Handler --> Service
```

## 6. Update 调试路径

```mermaid
flowchart TD
    UpdateIssue[Update 问题]
    Hook[useAppBootstrap]
    Dialog[UpdateDialog / useUpdateDialogState]
    Handler[update-handler]
    Service[UpdateService]
    Catalog[UpdateCatalogService]
    Installer[UpdateInstaller]
    Storage[UpdateStorageClient]

    UpdateIssue --> Hook
    UpdateIssue --> Dialog
    Hook --> Handler
    Dialog --> Handler
    Handler --> Service
    Service --> Catalog
    Service --> Installer
    Service --> Storage
```

## 7. 认证调试路径

```mermaid
sequenceDiagram
    participant App as useAppBootstrap
    participant Auth as auth-handler
    participant AppSvc as auth-application-service
    participant Session as session-manager

    App->>Auth: silentLogin / login / switchUser
    Auth->>AppSvc: application service
    AppSvc->>Session: user resolution
    Session-->>AppSvc: session result
    AppSvc-->>Auth: response
    Auth-->>App: auth state
```

## 8. 日志观察建议

调试时优先关注：

- renderer 控制台输出
- main 进程日志
- 关键 application service 的 logger 输出
- audit log（如果问题涉及登录、清理等操作记录）

## 9. 定位建议

出现问题时，建议优先回答这几个问题：

1. 问题发生在哪一层
2. 是状态流问题还是外部依赖问题
3. 是请求没发出、没到 handler，还是 service 失败
4. 是同步返回问题，还是事件推送问题

## 10. 调试原则

- 先缩小层级，再深入代码
- 先看入口与边界，再看实现细节
- 能复现就尽量用最小路径复现
- 复杂主链路优先画调用链再改代码
