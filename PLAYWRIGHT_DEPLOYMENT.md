# Playwright 部署说明

## 浏览器路径问题修复

### 问题描述

应用启动时提示"浏览器文件未找到"，但浏览器文件已经放置在正确路径下。

**原因**：Playwright 1.48+ 改变了浏览器目录命名规则：

- **旧格式**：`chromium-win32/chrome.exe`
- **新格式**：`chromium-1208/chrome-win64/chrome.exe`（revision 号可能不同）

### 解决方案

代码已更新为自动检测新旧两种格式，并显示当前目录内容以便调试。

## 快速部署

### 方法 1：使用 Playwright CLI（推荐）

```bash
# 在应用目录运行
npx playwright install chromium
```

浏览器会自动下载并安装到正确位置：

- **用户数据目录**：`%APPDATA%\erpauto\ms-playwright\`
- **完整路径**：`C:\Users\pengq\AppData\Roaming\erpauto\ms-playwright\chromium-<revision>\chrome-win64\chrome.exe`

### 方法 2：手动复制

如果你已经有 Playwright 浏览器文件，可以复制到应用的用户数据目录：

1. 找到现有浏览器文件（通常在 `%USERPROFILE%\AppData\Local\ms-playwright`）
2. 复制到 `%APPDATA%\erpauto\ms-playwright\`
3. 确保目录结构正确：
   ```
   ms-playwright/
   ├── chromium-1208/
   │   ├── chrome-win64/
   │   │   └── chrome.exe
   │   └── INSTALLATION_COMPLETE
   └── chromium_headless_shell-1208/
       └── ...
   ```

### 方法 3：使用 PLAYWRIGHT_BROWSERS_PATH 环境变量

将浏览器文件放在共享位置，然后设置环境变量：

```bash
# 系统环境变量
setx PLAYWRIGHT_BROWSERS_PATH "D:\shared\playwright-browsers"
```

或在应用启动脚本中设置。

## 验证安装

运行应用后，检查是否还有错误提示。如果没有浏览器错误，说明安装成功。

你也可以在应用日志中查找：

- `Found Chromium revision: chromium-1208` - 表示成功找到浏览器
- `Playwright browser not found` - 表示未找到，会显示可用目录列表

## 常见问题

### Q: 显示"浏览器文件未找到"但文件确实在那里

检查目录结构是否正确：

```powershell
# 查看当前目录内容
Get-ChildItem $env:APPDATA\erpauto\ms-playwright

# 检查 chrome.exe 是否存在
Test-Path "$env:APPDATA\erpauto\ms-playwright\chromium-*/chrome-win64/chrome.exe"
```

### Q: 不同用户使用同一个浏览器文件

使用环境变量 `PLAYWRIGHT_BROWSERS_PATH` 指向共享目录。

### Q: 离线部署

1. 在有网络的机器上运行 `npx playwright install chromium`
2. 复制整个 `ms-playwright` 目录
3. 在目标机器上设置 `PLAYWRIGHT_BROWSERS_PATH` 指向该目录

## 下次构建

只需运行：

```bash
npm run build:win
```

所有配置已保存，Playwright 模块和浏览器路径检查会自动处理。
