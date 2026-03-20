# CLAUDE.md

本文件用于给 AI 编程代理提供本项目的最小必要指导。  
目标不是替代 `README` 或 `docs/`，而是帮助代理快速理解项目结构、工作方式和关键约束。

## 项目概览

ERPAuto 是一个基于 Electron 的桌面应用，用于自动化处理 ERP 系统中的数据提取、清理、校验和配置管理。

技术栈：

- Electron 39
- React 19
- TypeScript 5.9
- electron-vite / Vite 7
- Playwright 1.58
- Vitest

## 常用命令

开发与构建：

```bash
npm run dev
npm run build
npm run build:win
```

质量检查：

```bash
npm run typecheck
npm run typecheck:node
npm run typecheck:web
npm run lint
npm run format
```

测试：

```bash
npm run test
npm run test:coverage
npm run test:e2e
```

发布：

```bash
npm run release:publish -- --channel stable
npm run release:publish -- --channel preview
```

详细发布流程见：
[docs/build-and-release-guide.md](/d:/FileLib/Projects/CodeMigration/ERPAuto/docs/build-and-release-guide.md)

## 代码结构

### 主进程

- 路径：`src/main/`
- 入口：`src/main/index.ts`
- 职责：
  - 应用生命周期管理
  - 配置加载
  - IPC 注册
  - 更新服务初始化

### 预加载层

- 路径：`src/preload/`
- 职责：
  - 暴露 `window.electron` API
  - 作为 renderer 和 main 之间的安全桥

### 渲染进程

- 路径：`src/renderer/`
- 技术：React + TypeScript
- 特点：
  - 通过 preload 暴露的 API 调用主进程
  - 以登录状态和角色控制主要功能入口

### 服务层

主进程服务集中在 `src/main/services/`，按领域拆分：

- `erp/`：ERP 浏览器自动化
- `database/`：MySQL / SQL Server
- `user/`：登录、会话、用户切换
- `config/`：YAML 配置管理
- `update/`：便携版更新
- `excel/`：Excel 处理

## 关键事实

### 配置系统

- 使用 YAML 配置
- 模板文件：`config.template.yaml`
- 开发环境通常使用项目根目录下的 `config.yaml`
- 生产环境会将配置放到用户目录

### IPC 组织方式

- 所有 IPC handler 在 `src/main/ipc/`
- 每个领域一个 handler 模块
- 统一在 `src/main/ipc/index.ts` 注册
- channel 命名遵循 `domain:action`

### 认证与角色

当前主要角色是：

- `Admin`
- `User`
- `Guest`

登录流程支持：

- 静默登录
- 普通登录
- 管理员切换用户

### 便携版自动更新

项目已实现 Windows 便携版更新，关键点：

- 更新检查基于登录用户角色
- 支持 `stable` / `preview` 双通道
- `User` 只看 `stable`
- `Admin` 同时看 `stable` 和 `preview`
- 使用原生 `portable-updater.exe` 完成替换，不依赖 PowerShell

相关文档：

- [docs/portable-auto-update-architecture.md](/d:/FileLib/Projects/CodeMigration/ERPAuto/docs/portable-auto-update-architecture.md)
- [docs/build-and-release-guide.md](/d:/FileLib/Projects/CodeMigration/ERPAuto/docs/build-and-release-guide.md)

## 代理工作约束

1. 优先修改现有文件，不要随意新建同类文件。
2. 变更前先理解对应模块的现有模式，尽量保持风格一致。
3. renderer 不要直接访问 Node/Electron 能力，统一走 preload。
4. 配置、IPC、类型定义通常需要同步更新，避免只改一层。
5. 涉及发布、更新、构建链路时，优先复用现有脚本，不要重复实现。
6. 涉及浏览器部署或更新流程时，先看 `docs/` 里的专题文档。

## 代理优先查看的文档

- [README.md](/d:/FileLib/Projects/CodeMigration/ERPAuto/README.md)
- [docs/build-and-release-guide.md](/d:/FileLib/Projects/CodeMigration/ERPAuto/docs/build-and-release-guide.md)
- [docs/portable-auto-update-architecture.md](/d:/FileLib/Projects/CodeMigration/ERPAuto/docs/portable-auto-update-architecture.md)
- [docs/browser/PLAYWRIGHT_DEPLOYMENT.md](/d:/FileLib/Projects/CodeMigration/ERPAuto/docs/browser/PLAYWRIGHT_DEPLOYMENT.md)

## 不放在这里的内容

以下内容不应继续堆在本文件中：

- 详细用户使用说明
- 大段业务流程说明
- 重复的架构长文
- 版本发布记录

这些内容应继续放在 `README` 或 `docs/` 下的专题文档中。
