# Playwright 浏览器版本信息

本文档记录 ERPAuto 当前使用的 Playwright 版本，以及代码中采用的浏览器目录约定。

## 当前版本

根据 [package.json](/d:/FileLib/Projects/CodeMigration/ERPAuto/package.json)，项目当前依赖为：

| 组件 | 当前版本 |
| --- | --- |
| `playwright` | `^1.58.2` |
| `playwright-core` | `^1.58.2` |
| `@playwright/test` | `^1.58.2` |

## 当前代码中的目录约定

根据 [src/main/index.ts](/d:/FileLib/Projects/CodeMigration/ERPAuto/src/main/index.ts)，应用启动时会把：

```text
PLAYWRIGHT_BROWSERS_PATH = %APPDATA%\erpauto\ms-playwright
```

随后按以下顺序检查 Chromium：

1. 优先检查：

```text
%APPDATA%\erpauto\ms-playwright\chromium-1208\chrome-win64\chrome.exe
```

2. 兼容旧结构：

```text
%APPDATA%\erpauto\ms-playwright\chromium-win32\chrome.exe
```

3. 如果仍然找不到，则继续扫描任意 `chromium-*` 目录，并尝试：

```text
%APPDATA%\erpauto\ms-playwright\chromium-<revision>\chrome-win64\chrome.exe
```

这意味着：

- `chromium-1208` 是当前代码优先查找的默认 revision
- 但应用并不只接受 `1208`
- 当前主目录结构是 `chrome-win64`

## 推荐目录结构

### Windows 开发环境

```text
C:\Users\<用户名>\AppData\Local\ms-playwright\
└── chromium-1208/
    └── chrome-win64/
        ├── chrome.exe
        └── ...
```

### 目标部署环境

```text
%APPDATA%\erpauto\ms-playwright\
└── chromium-1208/
    └── chrome-win64/
        ├── chrome.exe
        └── ...
```

如果不是 `1208`，只要目录名满足 `chromium-*` 且内部存在 `chrome-win64\chrome.exe`，当前代码也能识别。

## 使用建议

### 开发环境准备

1. 安装项目依赖：

```bash
npm install
```

2. 下载 Chromium 浏览器：

```bash
npx playwright install chromium
```

### 复制浏览器文件

1. 在开发机上找到 Playwright 浏览器缓存目录：

```text
C:\Users\<用户名>\AppData\Local\ms-playwright\
```

2. 复制完整的 `chromium-*` 目录到目标路径：

```text
%APPDATA%\erpauto\ms-playwright\
```

3. 确保内部存在：

```text
chrome-win64\chrome.exe
```

## 注意事项

- ERPAuto 当前只依赖 Chromium，不需要 Firefox 和 WebKit
- 浏览器文件体积较大，建议按整个 revision 目录复制
- 当前代码会优先尝试 `chromium-1208`
- 但从实现角度看，“revision 严格等于 1208”不是唯一成功条件
- 真正关键的是目录结构与可执行文件路径满足当前查找规则

## 故障排查

### 浏览器无法启动

优先检查：

1. `%APPDATA%\erpauto\ms-playwright\` 是否存在
2. 是否存在 `chromium-1208\chrome-win64\chrome.exe`
3. 是否存在其他 `chromium-*` 目录，且包含 `chrome-win64\chrome.exe`
4. 是否误用了过时的 `chrome-win\chrome.exe` 路径

### 版本不匹配或路径不匹配

建议同时确认：

- `package.json` 中的 Playwright 版本
- 目标机器上实际部署的 Chromium 目录
- 当前目录结构是否为 `chrome-win64\chrome.exe`
- 应用启动时是否能在 `%APPDATA%\erpauto\ms-playwright\` 下扫描到有效 revision

## 相关文档

- [PLAYWRIGHT_DEPLOYMENT.md](./PLAYWRIGHT_DEPLOYMENT.md)
