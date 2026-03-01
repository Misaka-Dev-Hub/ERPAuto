# ERPAuto - ERP 数据自动化处理工具

一个基于 Electron 的桌面应用程序，用于自动化处理 ERP 系统中的数据提取和清理任务。

## 功能特性

- **数据提取**：从 ERP 系统批量下载物料计划数据
- **物料清理**：自动删除指定的物料代码，支持干运行模式
- **数据库支持**：支持 MySQL 和 SQL Server 数据存储
- **Excel 解析**：自动解析下载的 Excel 文件

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9
- 可访问的 ERP 系统

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd ERPAuto

# 安装依赖
npm install
```

### 配置

在项目根目录创建 `.env` 文件：

```bash
# ERP 配置
ERP_URL=https://your-erp-server.com
ERP_USERNAME=your_username
ERP_PASSWORD=your_password

# MySQL 配置（可选）
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=erpauto

# SQL Server 配置（可选）
SQL_SERVER_HOST=localhost
SQL_SERVER_PORT=1433
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=password
SQL_SERVER_DATABASE=erpauto
```

### 运行开发环境

```bash
npm run dev
```

### 构建应用

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 使用指南

### 数据提取

1. 启动应用后，点击主页的「数据提取」进入提取页面
2. 在订单号输入框中输入订单号，每行一个
3. 设置批量大小（默认 100）
4. 点击「开始提取」按钮
5. 等待提取完成，查看结果

### 物料清理

1. 点击主页的「物料清理」进入清理页面
2. 输入订单号（每行一个）
3. 输入要删除的物料代码（每行一个）
4. 勾选「干运行模式」可预览删除结果（不实际删除）
5. 点击「开始清理」按钮
6. 查看清理结果和详细统计

## 测试

```bash
# 运行单元测试
npm run test

# 运行 E2E 测试
npm run test:e2e

# 查看测试报告
npm run test:e2e:report
```

## 项目结构

```
ERPAuto/
├── src/
│   ├── main/           # 主进程代码
│   │   ├── services/   # 业务服务
│   │   ├── ipc/        # IPC 处理器
│   │   └── types/      # TypeScript 类型
│   ├── preload/        # 预加载脚本
│   └── renderer/       # 渲染进程（React UI）
├── tests/
│   ├── unit/           # 单元测试
│   ├── integration/    # 集成测试
│   └── e2e/            # E2E 测试
└── docs/               # 文档
```

## 技术栈

- **框架**：Electron 39
- **前端**：React 19 + TypeScript
- **构建工具**：electron-vite
- **浏览器自动化**：Playwright
- **数据库**：mysql2, mssql
- **Excel 处理**：ExcelJS
- **测试**：Vitest, Playwright Test

## 常见问题

### 无法连接 ERP 系统

1. 检查 `.env` 文件中的 ERP_URL 是否正确
2. 确认网络连接正常
3. 检查 ERP 系统是否可访问

### 提取失败

1. 确认订单号格式正确
2. 检查 ERP 系统账号权限
3. 查看应用日志获取详细错误信息

### 数据库连接失败

1. 确认数据库服务已启动
2. 检查 `.env` 中的数据库配置
3. 确认防火墙允许数据库端口访问

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 类型检查
npm run typecheck

# 代码格式化
npm run format

# Lint 检查
npm run lint
```

## 许可证

MIT License
