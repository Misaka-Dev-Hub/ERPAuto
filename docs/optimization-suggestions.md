# ERPAuto 优化建议与规范指南

基于目前 ERPAuto 代码架构的实现，我们提出以下旨在提高代码可维护性、系统稳定性以及架构规范性的优化建议。

## 1. 架构与关注点分离优化

当前的架构在主进程中集中了大量的业务逻辑处理，服务层之间存在一定的耦合。我们可以通过引入**领域驱动设计(DDD)**的理念和更严格的分层架构来进行优化。

### 1.1 优化的目标架构

```mermaid
graph TD
    subgraph 渲染层 (Renderer)
        UI[页面组件: UI 渲染与交互]
        State[状态管理: Zustand / Redux]
        Hooks[自定义 Hooks: 封装 IPC 调用]

        UI --> Hooks
        UI --> State
    end

    subgraph 接口层 (Interface)
        IPC[IPC Handlers: 请求校验与分发]
        DTO[数据传输对象: 请求/响应格式化]
    end

    subgraph 业务逻辑层 (Application)
        UseCases[业务用例: 组合领域服务]
        ERPFacade[ERP 操作门面]
    end

    subgraph 基础设施层 (Infrastructure)
        Playwright[浏览器引擎]
        ORM[数据库中间件: Prisma / TypeORM]
        Logger[统一日志: Winston]
        Error[全局异常处理]
    end

    Hooks --"IPC 消息"--> IPC
    IPC --> DTO
    DTO --> UseCases

    UseCases --> ERPFacade
    ERPFacade --> Playwright
    UseCases --> ORM

    Playwright -.-> Logger
    ORM -.-> Logger
    UseCases -.-> Error
```

## 2. 核心模块重构建议

### 2.1 引入统一的错误处理与日志系统

**现状**：目前 IPC 和 Playwright 脚本中可能会散落 `console.log` 或 `try-catch` 块，如果报错，前端难以获取具体错误原因，且日志无法持久化跟踪。
**建议**：
- **定义自定义错误类**：如 `ErpConnectionError`, `DatabaseQueryError`, `ValidationError`。
- **引入专门的日志库**：在主进程引入 `winston` 或 `electron-log`，分别记录 info、warn、error 级别的日志，并将其输出到文件系统中，方便以后问题排查。
- **IPC 错误拦截器**：创建一个通用的 IPC 异常拦截器。如果底层抛出异常，拦截器格式化为标准的 `{ success: false, message: string, code: number }` 返回给渲染层。

### 2.2 强化并收拢依赖与服务抽象

**现状**：直接在组件内或方法内使用 `mysql2`、`mssql` 原生客户端执行 SQL，或者强耦合地使用 `exceljs`。
**建议**：
- **引入 ORM / Query Builder**：考虑到双数据库（MySQL / SQL Server）的需求，考虑使用像 Prisma、Knex.js 或 TypeORM，它们能够极大抹平不同数据库 SQL 语法的差异，并提供更优秀的 TypeScript 支持，减少拼装 SQL 的安全风险（SQL 注入）。
- **统一的存储库模式 (Repository Pattern)**：将对数据表的操作（增删查改）封装在统一的 Repository 接口后面，业务服务（如 Extractor, Cleaner）只依赖这些接口，不再关心底层的数据库驱动实现。

### 2.3 规范 React 渲染层代码

**现状**：现有的组件可能既负责 UI 渲染，又负责直接调用 `window.api`。
**建议**：
- **提取自定义 Hooks**：将 `api.extractor.runExtractor` 等异步调用逻辑封装成自定义 Hook，如 `useExtractor`，以处理 `loading`、`error`、`data` 状态，降低组件的圈复杂度。
- **集中状态管理**：复杂的组件间通信，可引入 `Zustand` 这样轻量的全局状态管理库，防止 Prop Drilling（属性层层传递）。
- **统一主题和组件库**：对常用的 Tailwind 样式进行提炼，或者基于 Radix UI / Headless UI 构建内部组件库，确保整套系统的交互一致性。

### 2.4 TypeScript 强约束

**现状**：代码中可能存在部分 `any` 或可选类型的滥用。
**建议**：
- **严格模式 (Strict Mode)**：在 `tsconfig.json` 中保持 `"strict": true`，并且杜绝 `any` 的使用，推荐使用 `unknown` 并配合类型保护 (Type Guards) 使用。
- **Zod 运行时校验**：由于 IPC 边界的调用跨越了 V8 进程，可以在主进程的 IPC handlers 接收参数时，利用 `zod` 对参数进行运行时验证。

### 2.5 增加自动化测试保障

**现状**：目前提供了少量的测试脚本（如 `test_extractor.ts`），但在持续迭代中不足。
**建议**：
- **单元测试**：使用 `Vitest` 对主进程中的数据转换逻辑、状态判定逻辑编写详尽的单元测试。
- **UI 测试**：使用 `React Testing Library` 对重要的 React 交互组件进行功能测试。
- **端到端测试 (E2E)**：使用 `@playwright/test` 或 `@electron/remote` 对包含 Electron 壳子的完整使用链路进行集成回归测试，保证在新需求发布时不破坏旧功能。

通过实施这些优化建议，系统的可维护性、稳定性和拓展性将得到长足的进步。