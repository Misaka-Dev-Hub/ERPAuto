# Playwright 浏览器版本信息

本文档记录 ERPAuto 项目使用的 Playwright 浏览器版本和部署信息。

## 版本信息

| 组件            | 版本号       |
| --------------- | ------------ |
| Playwright      | 1.58.2       |
| Chromium        | 145.0.7632.6 |
| Chromium 修订号 | 1208         |

## 浏览器目录结构

Playwright 将浏览器文件缓存在以下位置：

### Windows 开发环境

```
C:\Users\<用户名>\AppData\Local\ms-playwright\
└── chromium-1208/
    └── chrome-win/
        ├── chrome.exe
        └── ...
```

### 目标部署环境

```
%APPDATA%\erpauto\ms-playwright\
└── chromium-1208/
    └── chrome-win/
        ├── chrome.exe
        └── ...
```

## 部署指南

### 开发环境准备

1. 安装 Playwright 1.58.2

   ```bash
   npm install playwright@1.58.2
   ```

2. 下载 Chromium 浏览器
   ```bash
   npx playwright install chromium
   ```

### 浏览器文件复制步骤

1. **定位源目录**
   - 开发机上找到 Playwright 浏览器缓存目录
   - 默认路径：`C:\Users\<用户名>\AppData\Local\ms-playwright\chromium-1208`

2. **复制浏览器文件**
   - 将整个 `chromium-1208` 目录复制到部署目标
   - 目标路径：`%APPDATA%\erpauto\ms-playwright\chromium-1208`

3. **验证目录结构**
   - 确认目标路径包含 `chrome-win/chrome.exe`
   - 确保所有子文件完整复制

### 环境变量配置

如需要自定义浏览器路径，可设置环境变量：

```bash
# Windows
set PLAYWRIGHT_BROWSERS_PATH=%APPDATA%\erpauto\ms-playwright
```

## 注意事项

- 仅包含 Chromium 浏览器（Firefox 和 WebKit 不需要）
- 浏览器文件体积约为 280MB
- 部署时确保目标机器具有相同的 Playwright 版本（1.58.2）
- 修订号必须匹配（1208），否则可能出现兼容性问题

## 故障排查

### 浏览器无法启动

1. 检查修订号是否匹配（1208）
2. 确认 `chrome-win/chrome.exe` 文件存在
3. 验证 PLAYWRIGHT_BROWSERS_PATH 环境变量设置

### 版本不匹配错误

确保以下版本一致：

- package.json 中的 Playwright 版本
- 下载的 Chromium 修订号
- browsers.json 中定义版本号
