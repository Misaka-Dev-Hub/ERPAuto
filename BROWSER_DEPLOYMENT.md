# Playwright 浏览器部署指南

## 概述

本文档为开发人员提供 ERPAuto 应用程序中 Playwright Chromium 浏览器的部署指南。文档说明如何将浏览器文件从开发机复制到目标用户机器，确保应用程序能够正常运行浏览器自动化任务。

**重要提示**：部署前请先阅读 [BROWSER_VERSIONS.md](./BROWSER_VERSIONS.md) 了解版本信息。

## 目标路径

浏览器文件必须部署在以下路径：

```
%APPDATA%\erpauto\ms-playwright\chromium-1208\
```

完整展开路径示例（Windows）：

```
C:\Users\<用户名>\AppData\Roaming\erpauto\ms-playwright\chromium-1208\
```

## 目录结构

部署完成后，目标目录结构应如下所示：

```
%APPDATA%\erpauto\ms-playwright\
└── chromium-1208/
    └── chrome-win/
        ├── chrome.exe              # 浏览器可执行文件
        ├── chrome_dll.dll
        ├── resources/
        ├── locales/
        └── ...                     # 其他浏览器文件
```

**关键文件**：`chrome-win/chrome.exe` 必须存在，否则浏览器无法启动。

## 部署步骤

### 步骤 1：在开发机上准备

1. 确保开发机已安装正确版本的 Playwright：

   ```bash
   npm install playwright@1.58.2
   ```

2. 下载 Chromium 浏览器：

   ```bash
   npx playwright install chromium
   ```

3. 定位开发机上的浏览器缓存目录：

   ```
   C:\Users\<开发机用户名>\AppData\Local\ms-playwright\chromium-1208
   ```

### 步骤 2：复制文件

1. **复制整个浏览器目录**
   - 将开发机上的 `chromium-1208` 目录完整复制
   - 不要只复制部分文件，确保所有子目录和文件都包含在内

2. **粘贴到目标路径**
   - 在目标机器上创建目录：`%APPDATA%\erpauto\ms-playwright\`
   - 将 `chromium-1208` 目录粘贴到该路径下

3. **验证文件完整性**
   - 确认目标路径存在：`%APPDATA%\erpauto\ms-playwright\chromium-1208\chrome-win\chrome.exe`
   - 检查文件大小约为 280MB

### 步骤 3：配置环境变量（可选）

如需确保应用程序使用正确的浏览器路径，可设置以下环境变量：

```batch
set PLAYWRIGHT_BROWSERS_PATH=%APPDATA%\erpauto\ms-playwright
```

或在应用程序代码中设置：

```javascript
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(app.getPath('userData'), 'ms-playwright')
```

## 验证步骤

部署完成后，执行以下验证步骤：

### 验证 1：检查目录结构

在目标机器上运行：

```batch
dir %APPDATA%\erpauto\ms-playwright\chromium-1208\chrome-win\chrome.exe
```

应显示文件存在。

### 验证 2：启动浏览器测试

运行 ERPAuto 应用程序，执行以下操作：

1. 登录应用程序
2. 进入「数据提取」页面
3. 输入一个有效订单号
4. 点击「开始提取」
5. 观察浏览器是否正常启动并执行任务

### 验证 3：检查日志

查看应用程序日志，确认没有浏览器相关的错误信息：

- 无 "browser not found" 错误
- 无 "chromium revision not found" 错误
- 无 "PLAYWRIGHT_BROWSERS_PATH" 相关警告

## 故障排查

### 问题 1：浏览器无法启动

**症状**：应用程序报错，提示找不到浏览器或启动失败。

**解决方案**：

1. 确认修订号匹配（必须是 1208）
2. 检查 `chrome-win/chrome.exe` 文件是否存在
3. 验证 `PLAYWRIGHT_BROWSERS_PATH` 环境变量设置正确
4. 确认目标机器具有相同的 Playwright 版本（1.58.2）

### 问题 2：版本不匹配错误

**症状**：应用程序启动时报出版本冲突错误。

**解决方案**：

1. 检查 `package.json` 中的 Playwright 版本是否为 1.58.2
2. 确认复制的 Chromium 修订号为 1208
3. 参考 [BROWSER_VERSIONS.md](./BROWSER_VERSIONS.md) 核对所有版本信息

### 问题 3：权限不足

**症状**：无法写入或读取浏览器目录。

**解决方案**：

1. 确保目标目录具有适当的读写权限
2. 以管理员身份运行应用程序进行测试
3. 检查防病毒软件是否阻止了浏览器执行

### 问题 4：路径错误

**症状**：应用程序在错误的位置查找浏览器文件。

**解决方案**：

1. 确认 `%APPDATA%` 环境变量指向正确的用户目录
2. 检查应用程序是否正确解析了 `userData` 路径
3. 在代码中硬编码浏览器路径进行调试

## 注意事项

- **仅部署 Chromium**：ERPAuto 只需要 Chromium 浏览器，不需要 Firefox 或 WebKit
- **版本一致性**：开发机和目标机器的 Playwright 版本必须一致
- **修订号匹配**：Chromium 修订号（1208）必须完全匹配，否则可能出现兼容性问题
- **文件完整性**：复制时确保所有文件完整，损坏的浏览器文件会导致启动失败
- **网络隔离环境**：目标机器如果无法访问互联网，必须提前部署浏览器文件，因为无法自动下载

## 参考文档

- [BROWSER_VERSIONS.md](./BROWSER_VERSIONS.md) - 版本信息和目录结构详情
- [README.md](./README.md) - 项目总体说明
