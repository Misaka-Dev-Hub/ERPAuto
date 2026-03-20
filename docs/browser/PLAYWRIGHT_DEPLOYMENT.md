# Playwright 部署说明

本文档聚焦“如何让 ERPAuto 在目标机器上拥有可用的 Playwright Chromium 浏览器”，适合作为实际部署操作说明。

如果你想看版本信息，请同时参考：

- [BROWSER_VERSIONS.md](./BROWSER_VERSIONS.md)

## 背景

ERPAuto 启动时会把 `PLAYWRIGHT_BROWSERS_PATH` 设置到：

```text
%APPDATA%\erpauto\ms-playwright
```

随后在该目录下查找 Chromium 浏览器文件。当前代码支持：

- `chromium-1208\chrome-win64\chrome.exe`
- `chromium-win32\chrome.exe`
- 任意 `chromium-*` 目录下的 `chrome-win64\chrome.exe`

因此，部署的本质就是把一个完整可用的 Chromium revision 目录放到这个位置。

当前查找顺序是：

1. 先查 `%APPDATA%\erpauto\ms-playwright\chromium-1208\chrome-win64\chrome.exe`
2. 再查 `%APPDATA%\erpauto\ms-playwright\chromium-win32\chrome.exe`
3. 最后扫描任意 `chromium-*` 目录下的 `chrome-win64\chrome.exe`

所以从部署角度看，真正重要的不是目录名一定等于 `1208`，而是目录结构满足当前实现的查找规则。

## 推荐部署方式

### 方式 1：使用 Playwright CLI

如果目标机器能联网，最简单的方式是在项目目录执行：

```bash
npx playwright install chromium
```

执行后，需要把下载得到的 `chromium-*` 目录放到：

```text
%APPDATA%\erpauto\ms-playwright\
```

说明：

- Playwright 默认下载目录通常是 `%LOCALAPPDATA%\ms-playwright\`
- ERPAuto 运行时查找的是 `%APPDATA%\erpauto\ms-playwright\`
- 所以“下载成功”不等于“应用一定能找到”，最终还是要确保文件落在 ERPAuto 使用的目录下

### 方式 2：手动复制

这是离线环境或最稳定的部署方式。

1. 在一台已完成 `npx playwright install chromium` 的机器上找到：

```text
C:\Users\<用户名>\AppData\Local\ms-playwright\
```

2. 复制完整的 `chromium-*` 目录，例如：

```text
chromium-1208
```

3. 将该目录复制到目标机器：

```text
%APPDATA%\erpauto\ms-playwright\
```

4. 确认内部存在：

```text
chrome-win64\chrome.exe
```

## 推荐目录示例

```text
%APPDATA%\erpauto\ms-playwright\
└── chromium-1208/
    └── chrome-win64/
        ├── chrome.exe
        ├── chrome.dll
        ├── locales/
        ├── resources/
        └── ...
```

如果你使用的是旧结构，也可兼容：

```text
%APPDATA%\erpauto\ms-playwright\
└── chromium-win32/
    └── chrome.exe
```

## 验证方式

### 验证 1：检查文件

执行：

```powershell
Get-ChildItem $env:APPDATA\erpauto\ms-playwright
```

如果使用默认 revision，再执行：

```powershell
Test-Path "$env:APPDATA\erpauto\ms-playwright\chromium-1208\chrome-win64\chrome.exe"
```

如果你部署的是其他 revision，请按实际目录替换。

### 验证 2：启动应用

启动 ERPAuto，观察是否仍弹出“浏览器文件未找到”错误框。

如果没有弹窗，通常说明启动时的浏览器路径检查已经通过。

### 验证 3：执行真实业务

进入依赖 Playwright 的功能页面，执行一次真实流程，确认浏览器可以正常启动。

## 常见问题

### 问题 1：文件明明存在，但应用还是报找不到

常见原因：

1. 文件放在 `%LOCALAPPDATA%\ms-playwright\`，而不是 `%APPDATA%\erpauto\ms-playwright\`
2. 目录结构是旧文档里的 `chrome-win\chrome.exe`
3. revision 目录名不符合 `chromium-*`
4. 缺少 `chrome-win64\chrome.exe`

### 问题 2：想多个用户共用同一份浏览器文件

当前代码在应用启动时会直接把 `PLAYWRIGHT_BROWSERS_PATH` 设为：

```text
%APPDATA%\erpauto\ms-playwright
```

所以默认行为是“每个用户使用自己的用户目录”。  
如果要改成共享目录，需要同时改代码，而不是只改系统环境变量。

### 问题 3：构建时是否会自动打包 Chromium

不会。

当前 [package.json](/d:/FileLib/Projects/CodeMigration/ERPAuto/package.json) 的 `build:win` 明确设置了：

```text
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
```

也就是说：

- 构建过程不会自动下载浏览器
- 打包产物也不自带 Chromium
- 浏览器仍需要单独部署到目标机器

## 结论

当前最稳妥的部署方式是：

1. 在联网机器下载 Chromium
2. 复制完整 `chromium-*` 目录
3. 放到 `%APPDATA%\erpauto\ms-playwright\`
4. 确保内部有 `chrome-win64\chrome.exe`

只要满足这几个条件，ERPAuto 当前实现就能正确识别并使用浏览器。
