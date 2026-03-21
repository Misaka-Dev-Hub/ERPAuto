# 项目总览

本文档用于帮助开发者快速建立对项目的整体认知，包括系统目标、核心能力、目录结构和主要运行路径。

## 1. 项目定位

`ERPAuto` 是一个基于 Electron + React + TypeScript 构建的内部桌面工具，主要用于辅助 ERP 相关的数据提取、校验、清理、配置和更新管理。

当前项目的核心业务能力主要包括：

- 批量提取 ERP 数据并导入本地数据库
- 基于数据库和共享订单号进行物料校验
- 执行 ERP 物料清理与结果导出
- 用户认证、管理员代切用户
- 桌面端应用更新
- 本地配置、日志、报告与文件处理

项目可以先粗略理解成下面这张图：

```mermaid
mindmap
  root((ERPAuto))
    数据提取
      订单号输入
      批量导出
      导入数据库
    物料校验与清理
      共享 Production IDs
      校验结果
      删除计划
      ERP 执行
      执行报告
    用户与权限
      silent login
      管理员代切用户
    系统能力
      配置
      日志
      更新
      报告
```

## 2. 技术栈概览

- 桌面容器：Electron
- 前端渲染：React 19
- 构建工具：electron-vite / Vite
- 语言：TypeScript
- 样式：Tailwind CSS
- 测试：Vitest / Playwright
- 数据库：MySQL / SQL Server
- 自动化：Playwright

## 3. 顶层结构

项目核心代码主要分布在这几个目录：

- `src/main/`
  Electron 主进程，负责窗口、IPC、服务编排、配置、日志、更新、ERP 相关主流程。
- `src/preload/`
  preload bridge，向 renderer 暴露按领域组织的安全 API facade。
- `src/renderer/src/`
  React 渲染层，负责页面、组件、hooks、状态管理和交互流程。
- `tests/`
  单元测试、集成测试、e2e 和手工测试。
- `docs/`
  项目说明、执行计划、架构文档和后续维护文档。

也可以从目录责任关系上理解：

```mermaid
graph TD
    Root[项目根目录]
    Main[src/main]
    Preload[src/preload]
    Renderer[src/renderer/src]
    Tests[tests]
    Docs[docs]

    Root --> Main
    Root --> Preload
    Root --> Renderer
    Root --> Tests
    Root --> Docs

    Main --> MainDesc[主进程与服务执行]
    Preload --> PreloadDesc[桥接 API 与 IPC 封装]
    Renderer --> RendererDesc[页面 组件 Hooks 状态]
    Tests --> TestsDesc[单测 集成 E2E]
    Docs --> DocsDesc[说明 计划 开发文档]
```

## 4. 运行时分层

项目运行时可简单理解为三层：

```mermaid
graph LR
    Renderer[Renderer / React]
    Preload[Preload API Facade]
    Main[Main Process Services]

    Renderer --> Preload
    Preload --> Main
```

职责划分如下：

- `renderer`
  负责页面展示、用户交互、状态管理和流程触发。
- `preload`
  负责把 IPC 能力整理成前端可用的 API facade。
- `main`
  负责真正的业务执行、数据库访问、ERP 自动化、文件和更新处理。

从用户操作到系统执行的主路径如下：

```mermaid
flowchart LR
    User[用户操作]
    Page[React 页面]
    Hook[页面 Hook]
    Preload[Preload API]
    Handler[IPC Handler]
    Service[Main Service]
    External[数据库 / ERP / 文件 / 更新源]

    User --> Page
    Page --> Hook
    Hook --> Preload
    Preload --> Handler
    Handler --> Service
    Service --> External
```

## 5. 当前核心页面

当前渲染层主要有三个业务页面：

- `ExtractorPage`
  负责订单号输入、批量提取和提取日志展示。
- `CleanerPage`
  负责物料校验、负责人分配、删除计划保存、ERP 清理执行与结果查看。
- `SettingsPage`
  负责系统设置与配置维护。

应用入口在：

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/app/AuthenticatedAppShell.tsx`
- `src/renderer/src/components/app/UnauthenticatedApp.tsx`

页面级结构可以简化为：

```mermaid
graph TD
    App[App.tsx]
    Unauth[UnauthenticatedApp]
    Shell[AuthenticatedAppShell]
    Extractor[ExtractorPage]
    Cleaner[CleanerPage]
    Settings[SettingsPage]

    App --> Unauth
    App --> Shell
    Shell --> Extractor
    Shell --> Cleaner
    Shell --> Settings
```

## 6. 当前主进程结构

主进程侧目前已经按职责拆成几类目录：

- `bootstrap/`
  应用启动、窗口创建、进程守卫、运行时初始化。
- `ipc/`
  IPC handler 注册与调用入口。
- `services/`
  具体业务服务实现，按领域组织。
- `types/`
  主进程与 preload/renderer 共享的类型定义。

`services/` 当前主要领域包括：

- `auth`
- `cleaner`
- `config`
- `database`
- `erp`
- `excel`
- `logger`
- `report`
- `rustfs`
- `update`
- `user`
- `validation`

主进程结构关系如下：

```mermaid
graph TD
    MainIndex[index.ts]
    Bootstrap[bootstrap/]
    IPC[ipc/]
    Services[services/]
    Types[types/]

    MainIndex --> Bootstrap
    MainIndex --> IPC
    IPC --> Services
    Services --> Types
    IPC --> Types
```

## 7. 关键业务链路

项目最重要的几条业务链路可以概括为：

```mermaid
graph TD
    A[登录与认证]
    B[订单号提取]
    C[共享 Production IDs]
    D[物料校验]
    E[删除计划保存]
    F[ERP 清理执行]
    G[报告与导出]
    H[应用更新]

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    A --> H
```

## 8. 目录阅读建议

如果你是第一次进入代码库，建议按下面顺序读：

1. `src/main/index.ts`
2. `src/main/bootstrap/`
3. `src/preload/index.ts`
4. `src/renderer/src/App.tsx`
5. `src/renderer/src/pages/`
6. 对应业务模块的 `src/main/ipc/` 和 `src/main/services/`

阅读路径也可以理解成：

```mermaid
flowchart TD
    A[src/main/index.ts]
    B[src/main/bootstrap]
    C[src/preload/index.ts]
    D[src/renderer/src/App.tsx]
    E[src/renderer/src/pages]
    F[src/main/ipc]
    G[src/main/services]

    A --> B --> C --> D --> E --> F --> G
```

## 9. 相关文档

继续阅读建议：

- `runtime-architecture.md`
  了解 `main / preload / renderer` 的分层与调用关系。
- 后续 `modules/` 目录中的模块文档
  深入理解各业务模块。
