# 配置保存优化设计文档

**日期：** 2026-03-03
**分支：** fix/settings-partial-save
**状态：** 设计阶段

---

## 问题描述

当前设置界面只能配置 3 个字段（ERP URL、用户名、密码），但保存后会意外覆盖 `.env` 文件中的其他配置项（如 `DB_TYPE`、`VALIDATION_DATA_SOURCE` 等），导致这些字段被重置为默认值或丢失。

### 根本原因

在 `config-manager.ts:437-483` 中，`saveAllSettings()` 方法无条件覆盖所有配置类别。当 UI 只发送部分字段时，未包含的字段会被设置为 `undefined` 或默认值，导致原有配置丢失。

**数据流问题：**

```
SettingsPage (只修改 ERP URL)
    ↓ 发送完整的 settings 对象
ConfigManager.saveAllSettings()
    ↓ 覆盖所有字段到缓存
.env 文件被完全重写（丢失未被 UI 包含的字段）
```

---

## 解决方案

采用 **方案 A（深度合并）+ 方案 C（字段白名单）** 的组合策略：

### 核心策略

1. **部分更新**：只更新传入的字段，保留其他字段不变
2. **白名单验证**：只允许 UI 支持的字段被修改
3. **备份机制**：保存前备份，失败可回滚
4. **安全日志**：记录所有配置变更操作

---

## 架构设计

### 数据流

```
┌─────────────────┐
│  SettingsPage   │
│   (Renderer)    │
└────────┬────────┘
         │ 只发送支持的字段
         │ { erp: { url, username, password } }
         ▼
┌─────────────────┐
│ Settings Handler│
│  (IPC Bridge)   │
└────────┬────────┘
         │ 传递部分配置 (Partial<SettingsData>)
         ▼
┌─────────────────────────────┐
│     ConfigManager           │
│  ┌─────────────────────┐    │
│  │ 1. 验证字段白名单    │    │
│  │ 2. 深度合并当前配置  │    │
│  │ 3. 备份 .env 文件    │    │
│  │ 4. 原子写入新配置    │    │
│  └─────────────────────┘    │
└─────────────────────────────┘
```

### 改动点

| 文件                                         | 改动类型 | 说明                                             |
| -------------------------------------------- | -------- | ------------------------------------------------ |
| `src/main/services/config/config-manager.ts` | 核心     | 新增 `savePartialSettings()`、深度合并、备份机制 |
| `src/main/ipc/settings-handler.ts`           | 调整     | IPC 参数改为 `Partial<SettingsData>`             |
| `src/renderer/src/pages/SettingsPage.tsx`    | 优化     | 只发送 UI 支持的字段                             |

---

## 核心实现

### 1. 深度合并工具函数

```typescript
/**
 * 深度合并两个对象，只更新 target 中存在的字段
 * 保留 source 中 target 没有的字段
 */
function deepMerge<T>(source: T, target: Partial<T>): T {
  const result = { ...source }

  for (const key in target) {
    if (key in target) {
      const targetValue = target[key]
      const sourceValue = result[key]

      if (isObject(targetValue) && isObject(sourceValue)) {
        result[key] = deepMerge(sourceValue, targetValue)
      } else if (targetValue !== undefined) {
        result[key] = targetValue as T[Extract<keyof T, string>]
      }
    }
  }

  return result
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
```

### 2. 字段白名单验证

```typescript
/**
 * 定义 UI 可编辑的字段路径
 * 使用点号表示法：'section.field'
 */
const UI_EDITABLE_FIELDS: string[] = [
  'erp.url',
  'erp.username',
  'erp.password'
  // 未来扩展：
  // 'database.dbType',
  // 'paths.dataDir',
  // ...
]

/**
 * 验证配置更新是否只包含允许的字段
 */
function validateEditableFields(settings: Partial<SettingsData>): {
  valid: boolean
  invalidFields: string[]
} {
  const invalidFields: string[] = []

  for (const [section, values] of Object.entries(settings)) {
    if (values && typeof values === 'object') {
      for (const field of Object.keys(values)) {
        const fieldPath = `${section}.${field}`
        if (!UI_EDITABLE_FIELDS.includes(fieldPath)) {
          invalidFields.push(fieldPath)
        }
      }
    }
  }

  return {
    valid: invalidFields.length === 0,
    invalidFields
  }
}
```

### 3. 部分保存方法

```typescript
/**
 * 保存部分配置（只更新传入的字段）
 */
public async savePartialSettings(
  settings: Partial<SettingsData>
): Promise<{ success: boolean; error?: string }> {
  try {
    // 步骤 1: 验证字段白名单
    const validation = validateEditableFields(settings)
    if (!validation.valid) {
      log.warn('Attempted to save non-editable fields', {
        invalidFields: validation.invalidFields
      })
      return {
        success: false,
        error: `包含不允许修改的字段：${validation.invalidFields.join(', ')}`
      }
    }

    // 步骤 2: 读取当前配置
    const currentSettings = this.getAllSettings()

    // 步骤 3: 深度合并
    const mergedSettings = deepMerge(currentSettings, settings)

    // 步骤 4: 备份并保存
    const backupSuccess = await this.backupEnvFile()
    if (!backupSuccess) {
      log.warn('Failed to backup .env file, proceeding with caution')
    }

    const saveSuccess = await this.saveAllSettings(mergedSettings)

    if (!saveSuccess) {
      // 保存失败，尝试恢复备份
      await this.restoreBackup()
      return {
        success: false,
        error: '保存配置失败，已恢复原配置'
      }
    }

    log.info('Settings saved successfully', {
      updatedFields: Object.keys(settings)
    })

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log.error('Error in savePartialSettings', { error: message })
    await this.restoreBackup()
    return {
      success: false,
      error: `保存配置时发生错误：${message}`
    }
  }
}
```

### 4. 备份与恢复机制

```typescript
private backupPath: string

constructor() {
  // ...
  this.backupPath = path.resolve(__dirname, '../../.env.backup')
}

/**
 * 备份当前 .env 文件
 */
private async backupEnvFile(): Promise<boolean> {
  try {
    if (fs.existsSync(this.envPath)) {
      fs.copyFileSync(this.envPath, this.backupPath)
      log.debug('Backup created', { path: this.backupPath })
      return true
    }
    return false
  } catch (error) {
    log.error('Failed to backup .env file', { error })
    return false
  }
}

/**
 * 从备份恢复 .env 文件
 */
private async restoreBackup(): Promise<boolean> {
  try {
    if (fs.existsSync(this.backupPath)) {
      fs.copyFileSync(this.backupPath, this.envPath)
      await this.loadEnvFile() // 重新加载到缓存
      log.info('Restored from backup')
      return true
    }
    return false
  } catch (error) {
    log.error('Failed to restore backup', { error })
    return false
  }
}
```

---

## IPC 调用链路调整

### settings-handler.ts

```typescript
ipcMain.handle(
  'settings:saveSettings',
  async (_event, settings: Partial<SettingsData>): Promise<SaveSettingsResult> => {
    try {
      log.info('Saving settings', {
        sections: Object.keys(settings)
      })

      // 使用新的部分保存方法
      const result = await configManager.savePartialSettings(settings)

      if (result.success) {
        log.info('Settings saved successfully')
        return { success: true }
      } else {
        log.warn('Failed to save settings', {
          error: result.error
        })
        return {
          success: false,
          error: result.error || '保存设置失败'
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('Error saving settings', { error: message })
      return {
        success: false,
        error: `保存设置失败：${message}`
      }
    }
  }
)
```

**关键改动：**

- 参数类型从 `SettingsData` 改为 `Partial<SettingsData>`
- 调用 `savePartialSettings()` 替代 `saveAllSettings()`

---

## 前端优化（双重保险）

### SettingsPage.tsx

```typescript
const handleSaveSettings = async () => {
  try {
    // 只发送 UI 支持的字段（双重保险）
    const partialSettings = {
      erp: {
        url: settings.erp?.url,
        username: settings.erp?.username,
        password: settings.erp?.password
      }
    }

    const result = await window.electron.settings.saveSettings(partialSettings)

    if (result.success) {
      setIsModified(false)
      showMessage('success', '设置保存成功')
    } else {
      showMessage('error', result.error || '保存失败')
    }
  } catch (error) {
    showMessage('error', '保存设置时发生错误')
  }
}
```

---

## 测试策略

### 单元测试场景

```typescript
describe('ConfigManager.savePartialSettings', () => {
  it('应该只更新指定的字段，保留其他字段', async () => {
    const initial = {
      erp: { url: 'http://old.com', username: 'user1' },
      database: { dbType: 'mysql' }
    }

    const update = {
      erp: { url: 'http://new.com' }
    }

    await configManager.savePartialSettings(update)
    const result = configManager.getAllSettings()

    expect(result.erp.url).toBe('http://new.com')
    expect(result.erp.username).toBe('user1') // 保留
    expect(result.database.dbType).toBe('mysql') // 保留
  })

  it('应该拒绝未授权的字段更新', async () => {
    const invalidUpdate = {
      database: { dbType: 'postgres' }
    }

    const result = await configManager.savePartialSettings(invalidUpdate)

    expect(result.success).toBe(false)
    expect(result.error).toContain('不允许修改')
  })

  it('保存失败时应该恢复备份', async () => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('Disk full')
    })

    const result = await configManager.savePartialSettings({ erp: { url: 'x' } })

    expect(result.success).toBe(false)
  })
})
```

### 手动验证步骤

1. 打开 `.env`，记录所有字段值
2. 打开设置页面，只修改 ERP URL
3. 点击保存
4. 检查 `.env`：只有 `ERP_URL` 改变，其他字段保持原值

---

## 未来扩展性

### 1. 白名单配置化

当设置页面需要支持更多配置时：

```typescript
const UI_EDITABLE_FIELDS: string[] = [
  'erp.url',
  'erp.username',
  'erp.password',
  'database.dbType', // 新增
  'paths.dataDir', // 新增
  'extraction.batchSize' // 新增
  // ...
]
```

### 2. 按用户角色分级

```typescript
const EDITABLE_FIELDS_BY_ROLE: Record<UserType, string[]> = {
  Admin: ['*'],
  User: ['erp.url', 'erp.username', 'erp.password'],
  Guest: []
}

function validateEditableFields(settings: Partial<SettingsData>, userType: UserType) {
  const allowed = EDITABLE_FIELDS_BY_ROLE[userType]
  // 验证逻辑...
}
```

### 3. 配置变更审计

```typescript
interface ConfigChange {
  timestamp: Date
  user: string
  field: string
  oldValue: string
  newValue: string
}
```

---

## 实施计划

下一步将创建详细的实施计划，包括：

1. 在 ConfigManager 中添加深度合并和验证函数
2. 实现 `savePartialSettings()` 方法
3. 添加备份与恢复机制
4. 更新 IPC handler 调用
5. 前端优化（只发送必要字段）
6. 编写单元测试
7. 集成测试和手动验证

---

## 风险与缓解

| 风险             | 影响       | 缓解措施                      |
| ---------------- | ---------- | ----------------------------- |
| 深度合并逻辑错误 | 配置错误   | 完善单元测试覆盖              |
| 备份文件权限问题 | 无法恢复   | 错误处理 + 日志               |
| 白名单漏配置     | 功能受限   | 清晰的文档 + 代码注释         |
| 并发保存冲突     | 数据不一致 | 单实例 ConfigManager + 文件锁 |

---

## 附录

### 相关文件

- `src/main/services/config/config-manager.ts` - 配置管理器
- `src/main/ipc/settings-handler.ts` - IPC 处理器
- `src/renderer/src/pages/SettingsPage.tsx` - 设置页面
- `src/main/types/settings.types.ts` - 类型定义

### 参考

- 当前问题：保存设置时 `.env` 中未包含的字段被覆盖
- 设计原则：安全优先、最小化修改、可扩展性
