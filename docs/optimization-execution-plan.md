# ERPAuto 优化执行计划文档

基于《ERPAuto 优化建议与规范指南》，本文档规划了具体的分阶段重构与优化执行步骤。每个阶段遵循“渐进式重构”原则，保证在优化期间项目依然可运行、可测试。

## 阶段一：基础设施建设 (Error & Logging)

在进行大规模业务逻辑重构前，首先建立坚实的基础设施，以便后续问题排查与数据追踪。

1. **引入并配置统一日志库**
   - **目标**: 替换分散的 `console.log`。
   - **执行**:
     - 安装 `winston` (针对 Node.js 主进程)。
     - 在 `src/main/services/logger` 创建单例日志记录器。
     - 配置双通道输出：Console (Dev 环境) 与 File (生产环境按天切割，如 `%AppData%/ERPAuto/logs/app-%DATE%.log`)。
2. **定义全局错误类型与 IPC 拦截器**
   - **目标**: 规范前后端错误抛出与展示体系。
   - **执行**:
     - 在 `src/main/types/errors.ts` 定义 `BaseError`, `ErpConnectionError`, `DatabaseQueryError`。
     - 在 `src/main/ipc/index.ts` 中封装高阶函数 `withErrorHandling`。所有 IPC Handler 统一用此高阶函数包裹，将捕获的错误统一转为 `{ success: false, error: string, code: string }` 结构。

## 阶段二：数据层抽象与 ORM 改造

彻底解决 SQL 语句散落和不同数据库适配成本高的问题。

1. **选型并引入 ORM**
   - **目标**: 弃用原生 SQL 拼接。
   - **执行**:
     - 引入 `Prisma` 或 `TypeORM`。结合当前多数据源 (MySQL + SQL Server) 需求，推荐 `TypeORM` 因为其在运行时切换数据源更为灵活。
2. **创建 Repository 抽象**
   - **目标**: 隔离数据库实现细节。
   - **执行**:
     - 建立 `src/main/services/database/repositories` 目录。
     - 为业务实体 (如 Users, ExtractedPlans 等) 编写 Repository 类接口。
     - 将原有 `mysql2` 和 `mssql` 的调用逐步迁移至 Repository 中。
3. **Zod 运行时校验**
   - **目标**: 保护 IPC 边界免受恶意/格式错误的 payload 影响。
   - **执行**:
     - 安装 `zod`。
     - 对所有的 IPC Handler 的入参（如 `ExtractorInput`, `LoginRequest`）添加 `zod` Schema 校验。

## 阶段三：React 渲染层规范化

提高前端代码复用率，解耦视图与逻辑。

1. **提取 IPC Hooks**
   - **目标**: 清理组件中的大段异步调用。
   - **执行**:
     - 在 `src/renderer/src/hooks` 创建 `useExtractor.ts`, `useCleaner.ts`。
     - 使用 React 的 `useState` 包装 `window.api` 调用，返回 `{ loading, data, error, execute }`。
2. **状态管理引入 (Zustand)**
   - **目标**: 解决跨组件状态共享 (如全局报错信息、用户认证状态)。
   - **执行**:
     - 安装 `zustand`。
     - 创建 `useUserStore` 和 `useAppStore`。
3. **UI 组件库/公共样式提取**
   - **目标**: 统一 Tailwind 设计语言。
   - **执行**:
     - 将高频使用的 Button, Input, Modal 抽取到 `src/renderer/src/components/ui/`。

## 阶段四：自动化服务解耦 (Domain Logic)

将基于 Playwright 的具体执行细节与业务调度逻辑分离。

1. **重构 ERP 自动化服务 (`cleaner.ts` / `extractor.ts`)**
   - **目标**: 遵循单一职责原则。
   - **执行**:
     - 抽象出 `ErpBrowserManager` (负责浏览器启动与资源回收)。
     - 抽象出 `ErpAuthService` (专职处理登录和 Session)。
     - `extractor.ts` 将只负责调度：调用 Browser -> Auth -> Navigate -> Download -> Excel Parse。
2. **加强 TypeScript 严格模式**
   - **目标**: 提升代码健壮性。
   - **执行**:
     - 开启 `tsconfig.json` 中的 `"strict": true` 和 `"noImplicitAny": true`。
     - 全局清理并替换现存的 `any` 为具体的 Type 或 `unknown` 并添加类型保护。

## 阶段五：测试覆盖率补充

确保核心流程不被破坏。

1. **补充关键服务的单元测试**
   - **目标**: 防止复杂转换逻辑衰退。
   - **执行**:
     - 使用 `Vitest` 测试所有的 Repository (使用内存数据库/Mock) 和工具函数 (如 ExcelParser)。
2. **核心业务 E2E 测试**
   - **目标**: 确保 IPC 及 Electron 整体运行顺畅。
   - **执行**:
     - 使用 Playwright 针对 Electron 的测试框架 (`@playwright/test` 的 electron 插件) 编写主流程测试：登录 -> 点击提取 -> 验证本地结果文件生成。

## 执行建议与回顾

- 每个阶段应作为一个单独的 Git 分支 (Feature Branch) 开发。
- 完成一个阶段后，必须全量运行既有的测试套件并通过 `npm run typecheck`。
- 本文档可作为每次 PR Review 的检查清单使用。