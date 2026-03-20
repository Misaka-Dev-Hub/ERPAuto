# 构建与发布流程

本文档说明 ERPAuto Windows 便携版的当前构建与发布方式，包括推荐的一键发布命令、分步命令，以及发布产物在对象存储中的结构。

## 概览

当前发布链路分为 3 个阶段：

1. 构建 Windows 包
2. 生成本地发布物料和索引
3. 上传到对象存储并校验远端索引

现在已经提供一键总控脚本：

```bash
npm run release:publish -- --channel stable
```

或：

```bash
npm run release:publish -- --channel preview
```

## 发布前准备

发布前需要确认：

1. [package.json](/d:/FileLib/Projects/CodeMigration/ERPAuto/package.json) 和 [package-lock.json](/d:/FileLib/Projects/CodeMigration/ERPAuto/package-lock.json) 的版本号已经改到目标版本
2. [config.yaml](/d:/FileLib/Projects/CodeMigration/ERPAuto/config.yaml) 中 `update` 配置正确，且对象存储可访问
3. 对应版本的 changelog 已存在于 `docs/releases/`

changelog 自动查找规则如下：

1. 优先查找 `docs/releases/<version>-rebuild.md`
2. 如果不存在，再查找 `docs/releases/<version>.md`

例如当前版本是 `1.3.6`，脚本会按顺序尝试：

```text
docs/releases/1.3.6-rebuild.md
docs/releases/1.3.6.md
```

## 推荐流程：一键发布

### 发布 Stable

```bash
npm run release:publish -- --channel stable
```

### 发布 Preview

```bash
npm run release:publish -- --channel preview
```

这个命令会自动完成：

1. 读取当前 `package.json` 版本号
2. 校验 `package.json` / `package-lock.json` 版本一致
3. 校验 changelog 文件存在
4. 设置 `APP_CHANNEL`
5. 执行 `build:win`
6. 执行 `release:prepare`
7. 执行 `release:upload --verify`
8. 输出本次发布摘要

## 分步流程

如果需要调试，也可以手工分步执行。

### 1. 构建

Stable：

```bash
$env:APP_CHANNEL="stable"
npm run build:win
```

Preview：

```bash
$env:APP_CHANNEL="preview"
npm run build:win
```

### 2. 生成发布物料

```bash
npm run release:prepare -- --channel stable --changelog docs/releases/1.3.6.md
```

或：

```bash
npm run release:prepare -- --channel preview --changelog docs/releases/1.3.6.md
```

这一步会生成：

- `release-output/updates/win-portable/<channel>/artifacts/...`
- `release-output/updates/win-portable/<channel>/changelogs/...`
- `release-output/updates/win-portable/<channel>/index.json`

### 3. 上传并校验

```bash
npm run release:upload -- --channel stable --verify
```

或：

```bash
npm run release:upload -- --channel preview --verify
```

## 上传策略

当前上传脚本默认采用“增量上传”：

- 上传当前版本对应的 `artifact`
- 上传当前版本对应的 `changelog`
- 上传最新的 `index.json`

也就是说，它不会再把旧版本的 exe 和旧 changelog 全部重复上传。

如果确实需要整条通道做一次全量同步，可以显式使用：

```bash
npm run release:upload -- --channel stable --full-sync
```

## 对象存储目录结构

发布到对象存储后的目录结构如下：

```text
updates/win-portable/
├── stable/
│   ├── artifacts/
│   │   └── erpauto-<version>-stable-portable.exe
│   ├── changelogs/
│   │   └── <version>.md
│   └── index.json
└── preview/
    ├── artifacts/
    │   └── erpauto-<version>-preview-portable.exe
    ├── changelogs/
    │   └── <version>.md
    └── index.json
```

## 相关脚本

- [publish-release.js](/d:/FileLib/Projects/CodeMigration/ERPAuto/scripts/publish-release.js)
  一键总控脚本，负责串起 build、prepare、upload。
- [prepare-release.js](/d:/FileLib/Projects/CodeMigration/ERPAuto/scripts/prepare-release.js)
  负责整理本地发布物料和生成 `index.json`。
- [upload-release.js](/d:/FileLib/Projects/CodeMigration/ERPAuto/scripts/upload-release.js)
  负责上传当前版本物料和 `index.json`，并可回读远端索引。
- [compile-updater.js](/d:/FileLib/Projects/CodeMigration/ERPAuto/scripts/compile-updater.js)
  负责构建原生 `portable-updater.exe`。

## 常见问题

### 1. 缺少 `--channel`

会直接失败，因为发布必须显式指定 `stable` 或 `preview`。

### 2. 找不到 changelog

说明 `docs/releases/` 下没有当前版本对应的 Markdown 文件。  
先补 changelog，再执行发布。

### 3. 版本不是当前通道最新

总控脚本在 `prepare` 后会检查本地生成的 `index.json`。  
如果当前版本不是该通道索引的第一项，脚本会停止，避免把旧版本误当成当前发布版本。

### 4. 只想调试某一步

可以直接使用分步命令：

- `npm run build:win`
- `npm run release:prepare -- ...`
- `npm run release:upload -- ...`

## 建议

日常发布优先使用：

```bash
npm run release:publish -- --channel <stable|preview>
```

只有在排查问题或需要特殊处理时，再退回分步命令。
