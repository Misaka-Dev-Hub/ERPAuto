# ERPAuto 配置文件位置说明

## 概述

ERPAuto 根据运行环境自动选择配置文件的存储位置：

- **开发环境**：项目根目录（方便编辑和版本控制）
- **生产环境**：用户数据目录（AppData，安全且升级时保留）

---

## 配置文件位置

### 1. 开发环境

**适用场景**:

- 开发和调试
- 配置需要版本控制
- 团队协作

**配置文件位置**:

```
<项目根目录>\config.yaml
```

**示例**:

```
D:\Projects\ERPAuto\
├── src\
├── package.json
├── config.yaml           # 开发配置
├── config.yaml.backup    # 自动备份
└── config.template.yaml  # 配置模板
```

**检测方式**:

```typescript
process.env.NODE_ENV === 'development' || !app.isPackaged
```

---

### 2. 生产环境（安装版和便携版）

**适用场景**:

- 正式发布的应用
- 配置需要在应用升级时保留
- 多用户环境，每个用户独立配置

**配置文件位置**:

```
Windows: C:\Users\<用户名>\AppData\Roaming\erpauto\config.yaml
macOS:   ~/Library/Application Support/erpauto/config.yaml
Linux:   ~/.config/erpauto/config.yaml
```

**示例**:

```
C:\Users\zhangsan\AppData\Roaming\erpauto\
├── config.yaml           # 用户配置
└── config.yaml.backup    # 自动备份
```

**检测方式**:

```typescript
app.isPackaged === true
```

---

## 为什么生产环境使用用户数据目录？

| 方案               | 配置位置        | 优点                                                                        | 缺点                                                                                 |
| ------------------ | --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **用户数据目录** ✓ | AppData\Roaming | • 应用升级时配置保留<br>• 符合 Windows 规范<br>• 多用户隔离<br>• 配置不暴露 | • 路径较深，不易访问                                                                 |
| **应用同目录** ✗   | .exe 同目录     | • 易于访问和编辑                                                            | • 应用升级时配置可能丢失<br>• 需要写权限<br>• 配置暴露在应用目录<br>• 多用户共享配置 |

**我们的选择**：生产环境统一使用用户数据目录，确保：

1. ✅ 应用升级时用户配置不会丢失
2. ✅ 符合 Windows 应用规范
3. ✅ 配置不暴露在应用目录，更安全
4. ✅ 多用户环境下，每个用户有独立配置

---

## 构建配置

### electron-builder.yml

```yaml
win:
  target:
    - nsis # 安装版
    - portable # 便携版

portable:
  artifactName: ${name}-${version}-portable.${ext}
  # 便携版也使用用户数据目录 (AppData)
  # 不是 exe 同目录，确保配置在升级时保留

nsis:
  artifactName: ${name}-${version}-setup.${ext}
```

### 构建命令

```bash
# 构建 Windows 安装版和便携版
npm run build:win
```

### 输出文件

```
dist/
├── erpauto-1.0.0-setup.exe      # 安装版
└── erpauto-1.0.0-portable.exe   # 便携版
```

---

## 配置文件结构

```yaml
# ================================
# ERPAuto 配置文件
# ================================

# 数据库配置
database:
  activeType: mysql # 切换字段：mysql 或 sqlserver

  mysql:
    host: 192.168.31.83
    port: 3306
    database: BLD_DB
    username: remote_user
    password: ''
    charset: utf8mb4

  sqlserver:
    server: localhost
    port: 1433
    database: BLD_DB
    username: sa
    password: ''
    driver: 'ODBC Driver 18 for SQL Server'
    trustServerCertificate: true

# 路径配置
paths:
  dataDir: 'D:/python/playwrite/data/'
  defaultOutput: '离散备料计划维护_合并.xlsx'
  validationOutput: '物料状态校验结果.xlsx'

# 数据提取配置
extraction:
  batchSize: 100
  verbose: true
  autoConvert: true
  mergeBatches: true
  enableDbPersistence: true

# 校验配置
validation:
  dataSource: database_full
  batchSize: 2000
  matchMode: substring
  enableCrud: false
  defaultManager: ''

# 订单号解析配置
orderResolution:
  tableName: 'productionContractData_26 年压力表合同数据'
  productionIdField: '总排号'
  orderNumberField: '生产订单号'
```

---

## 配置文件管理

### 查看当前配置路径

运行调试工具：

```bash
npx tsx src\main\tools\config-path-debug.ts
```

### 快速访问配置（Windows）

```bash
# 打开配置所在目录
%APPDATA%\erpauto
```

### 备份配置

```bash
# 备份整个配置目录
xcopy %APPDATA%\erpauto D:\Backup\erpauto-config /E /I
```

### 迁移配置

从旧版本迁移：

```bash
# 使用迁移脚本
npx tsx scripts\migrate-env-to-yaml.ts
```

---

## 常见问题

### Q: 便携版应用的配置为什么不放在 exe 同目录？

**A**:

- 放在 exe 同目录会导致应用升级时配置丢失
- 便携版每次运行会解压到临时目录，无法持久保存配置
- 使用用户数据目录（AppData）确保配置持久化

### Q: 如何快速访问配置文件？

**A**:

- Windows: 按 `Win + R`，输入 `%APPDATA%\erpauto`，回车
- 或在文件管理器地址栏输入 `%APPDATA%\erpauto`

### Q: 多台电脑如何同步配置？

**A**:

1. 导出配置：`xcopy %APPDATA%\erpauto\config.yaml \\server\share\`
2. 导入配置：`xcopy \\server\share\config.yaml %APPDATA%\erpauto\`

或使用同步工具（OneDrive、坚果云等）同步配置目录。

### Q: 配置文件损坏了怎么办？

**A**:

1. 删除 `config.yaml`
2. 应用会自动创建新的默认配置
3. 从 `config.yaml.backup` 恢复（如果存在）

### Q: 开发环境下如何切换配置？

**A**:

- 直接编辑项目根目录的 `config.yaml`
- 建议保留 `config.template.yaml` 作为模板
- 将 `config.yaml` 加入 `.gitignore`，避免提交敏感信息

---

## 技术实现

### ConfigManager 路径选择逻辑

```typescript
// 检测是否为开发环境
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

if (isDev) {
  // 开发环境：项目根目录
  this.configPath = path.resolve(__dirname, '../../config.yaml')
} else {
  // 生产环境（安装版和便携版）：用户数据目录
  this.configPath = path.join(app.getPath('userData'), 'config.yaml')
}
```

---

## 版本历史

| 版本 | 配置策略                        | 说明                 |
| ---- | ------------------------------- | -------------------- |
| 1.0+ | 开发：项目目录<br>生产：AppData | 确保配置在升级时保留 |

---

## 参考资料

- [Electron app.getPath() 文档](https://www.electronjs.org/docs/api/app#appgetpathname)
- [electron-builder 配置](https://www.electron.build/configuration.html)
- [Windows 应用数据存储规范](https://docs.microsoft.com/en-us/windows/win32/shell/knownfolderid)
