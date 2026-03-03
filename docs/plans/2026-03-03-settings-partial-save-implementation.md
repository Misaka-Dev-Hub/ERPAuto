# Settings Partial Save Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix settings save to only update modified fields, preventing unintended overwrites of unmodified .env configuration values.

**Architecture:** Implement partial save strategy using deep merge + whitelist validation. ConfigManager validates fields, merges with current config, backs up .env, and atomically writes changes.

**Tech Stack:** TypeScript 5.9, Electron 39, Vitest, Node.js fs module

---

## Task 1: Add Utility Functions to ConfigManager

**Files:**

- Modify: `src/main/services/config/config-manager.ts`

**Step 1: Write failing test for deep merge**

Create test file: `tests/main/services/config/config-manager.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { ConfigManager } from '@/services/config/config-manager'
import type { SettingsData } from '@/types/settings.types'

describe('ConfigManager - deep merge utilities', () => {
  it('should deep merge objects, updating only specified fields', async () => {
    const manager = ConfigManager.getInstance()
    await manager.initialize()

    // Setup initial state
    const initial: SettingsData = {
      erp: {
        url: 'http://old.com',
        username: 'user1',
        password: 'pass1',
        headless: true,
        ignoreHttpsErrors: true,
        autoCloseBrowser: true
      },
      database: {
        dbType: 'mysql',
        server: '',
        mysqlHost: 'localhost',
        mysqlPort: 3306,
        database: 'db',
        username: 'user',
        password: ''
      },
      paths: { dataDir: '/data', defaultOutput: 'out.xlsx', validationOutput: 'validation.xlsx' },
      extraction: {
        batchSize: 100,
        verbose: true,
        autoConvert: true,
        mergeBatches: true,
        enableDbPersistence: true
      },
      validation: {
        dataSource: 'database_full',
        batchSize: 2000,
        matchMode: 'substring',
        enableCrud: false,
        defaultManager: ''
      },
      ui: { fontFamily: 'Arial', fontSize: 12, productionIdInputWidth: 20 },
      execution: { dryRun: false }
    }

    // Load initial settings
    await manager.saveAllSettings(initial)

    // Partial update
    const partial = {
      erp: { url: 'http://new.com' }
    }

    const result = await manager.savePartialSettings(partial)

    expect(result.success).toBe(true)

    const current = manager.getAllSettings()

    // Updated field
    expect(current.erp.url).toBe('http://new.com')

    // Preserved fields
    expect(current.erp.username).toBe('user1')
    expect(current.database.dbType).toBe('mysql')
    expect(current.paths.dataDir).toBe('/data')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd D:/Node/ERPAuto-settings-fix && npm test -- tests/main/services/config/config-manager.test.ts`

Expected: FAIL - "savePartialSettings is not a function"

**Step 3: Add helper functions to ConfigManager**

In `src/main/services/config/config-manager.ts`, add after the DEFAULT_SETTINGS constant (around line 78):

```typescript
/**
 * Check if value is a plain object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Deep merge two objects, only updating fields present in target
 * Preserves all fields from source that are not in target
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

/**
 * UI editable field whitelist
 * Fields that can be modified through the settings UI
 */
const UI_EDITABLE_FIELDS: string[] = [
  'erp.url',
  'erp.username',
  'erp.password'
  // Add more fields as UI expands
]

/**
 * Validate that settings only contain editable fields
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

**Step 4: Run test to verify it still fails (method not implemented yet)**

Run: `npm test -- tests/main/services/config/config-manager.test.ts`

Expected: FAIL - "savePartialSettings is not a function"

**Step 5: Commit**

```bash
cd D:/Node/ERPAuto-settings-fix
git add src/main/services/config/config-manager.ts tests/main/services/config/config-manager.test.ts
git commit -m "feat: add deep merge and validation utility functions to ConfigManager"
```

---

## Task 2: Add Backup and Restore Mechanism

**Files:**

- Modify: `src/main/services/config/config-manager.ts`

**Step 1: Write test for backup functionality**

Add to `tests/main/services/config/config-manager.test.ts`:

```typescript
describe('ConfigManager - backup and restore', () => {
  it('should create backup before saving', async () => {
    const manager = ConfigManager.getInstance()
    await manager.initialize()

    const backupSuccess = await manager['backupEnvFile']()

    expect(backupSuccess).toBe(true)

    // Check backup file exists
    const fs = await import('fs')
    const path = await import('path')
    const backupPath = path.resolve(process.cwd(), '.env.backup')

    expect(fs.existsSync(backupPath)).toBe(true)
  })

  it('should restore from backup when save fails', async () => {
    const manager = ConfigManager.getInstance()
    await manager.initialize()

    // Create initial state
    const initial = manager.getAllSettings()
    const originalUrl = initial.erp.url

    // Mock fs.writeFileSync to fail
    const fs = await import('fs')
    const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('Disk full')
    })

    const result = await manager.savePartialSettings({
      erp: { url: 'http://should-not-save.com' }
    })

    expect(result.success).toBe(false)

    // Restore should have happened
    const current = manager.getAllSettings()
    expect(current.erp.url).toBe(originalUrl)

    writeFileSyncSpy.mockRestore()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/main/services/config/config-manager.test.ts`

Expected: FAIL - "backupEnvFile is not a function"

**Step 3: Add backup path property and methods to ConfigManager class**

In `ConfigManager` class, modify constructor (around line 88) to add backupPath:

```typescript
export class ConfigManager {
  private static instance: ConfigManager | null = null
  private envPath: string
  private backupPath: string  // ADD THIS LINE
  private configCache: Map<string, string> = new Map()
  private initialized: boolean = false

  private constructor() {
    if (this.initialized) {
      return
    }
    this.envPath = path.resolve(__dirname, '../../.env')
    this.backupPath = path.resolve(__dirname, '../../.env.backup')  // ADD THIS LINE
    this.initialized = true
  }
```

Add private methods at the end of the class (before `getInstance()`):

```typescript
  /**
   * Backup current .env file
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
   * Restore .env file from backup
   */
  private async restoreBackup(): Promise<boolean> {
    try {
      if (fs.existsSync(this.backupPath)) {
        fs.copyFileSync(this.backupPath, this.envPath)
        await this.loadEnvFile()
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

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/main/services/config/config-manager.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
cd D:/Node/ERPAuto-settings-fix
git add src/main/services/config/config-manager.ts tests/main/services/config/config-manager.test.ts
git commit -m "feat: add backup and restore mechanism to ConfigManager"
```

---

## Task 3: Implement savePartialSettings Method

**Files:**

- Modify: `src/main/services/config/config-manager.ts`

**Step 1: Write comprehensive test for savePartialSettings**

Add to `tests/main/services/config/config-manager.test.ts`:

```typescript
describe('ConfigManager.savePartialSettings', () => {
  it('should save only specified fields and preserve others', async () => {
    const manager = ConfigManager.getInstance()
    await manager.initialize()

    // Setup initial state with multiple categories
    await manager.saveAllSettings({
      erp: {
        url: 'http://old.com',
        username: 'user1',
        password: 'pass1',
        headless: true,
        ignoreHttpsErrors: true,
        autoCloseBrowser: true
      },
      database: {
        dbType: 'mysql',
        server: '',
        mysqlHost: '192.168.1.1',
        mysqlPort: 3306,
        database: 'testdb',
        username: 'dbuser',
        password: ''
      },
      paths: { dataDir: '/old/path', defaultOutput: 'out.xlsx', validationOutput: 'val.xlsx' },
      extraction: {
        batchSize: 50,
        verbose: true,
        autoConvert: true,
        mergeBatches: true,
        enableDbPersistence: true
      },
      validation: {
        dataSource: 'database_full',
        batchSize: 1000,
        matchMode: 'exact',
        enableCrud: false,
        defaultManager: ''
      },
      ui: { fontFamily: 'Tahoma', fontSize: 14, productionIdInputWidth: 25 },
      execution: { dryRun: true }
    })

    // Update only ERP URL
    const result = await manager.savePartialSettings({
      erp: { url: 'http://new.com' }
    })

    expect(result.success).toBe(true)

    const current = manager.getAllSettings()

    // Verify updated field
    expect(current.erp.url).toBe('http://new.com')

    // Verify preserved ERP fields
    expect(current.erp.username).toBe('user1')
    expect(current.erp.password).toBe('pass1')

    // Verify preserved other categories
    expect(current.database.dbType).toBe('mysql')
    expect(current.database.mysqlHost).toBe('192.168.1.1')
    expect(current.paths.dataDir).toBe('/old/path')
    expect(current.extraction.batchSize).toBe(50)
    expect(current.ui.fontFamily).toBe('Tahoma')
  })

  it('should reject updates to non-whitelisted fields', async () => {
    const manager = ConfigManager.getInstance()
    await manager.initialize()

    const result = await manager.savePartialSettings({
      database: { dbType: 'postgres' }
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('不允许修改')
    expect(result.error).toContain('database.dbType')
  })

  it('should handle nested object updates correctly', async () => {
    const manager = ConfigManager.getInstance()
    await manager.initialize()

    await manager.saveAllSettings({
      erp: {
        url: 'http://test.com',
        username: 'u',
        password: 'p',
        headless: false,
        ignoreHttpsErrors: false,
        autoCloseBrowser: false
      },
      database: {
        dbType: 'mysql',
        server: '',
        mysqlHost: 'localhost',
        mysqlPort: 3306,
        database: 'db',
        username: 'user',
        password: ''
      },
      paths: { dataDir: '/data', defaultOutput: 'out.xlsx', validationOutput: 'val.xlsx' },
      extraction: {
        batchSize: 100,
        verbose: true,
        autoConvert: true,
        mergeBatches: true,
        enableDbPersistence: true
      },
      validation: {
        dataSource: 'database_full',
        batchSize: 2000,
        matchMode: 'substring',
        enableCrud: false,
        defaultManager: ''
      },
      ui: { fontFamily: 'Arial', fontSize: 12, productionIdInputWidth: 20 },
      execution: { dryRun: false }
    })

    // Update multiple ERP fields at once
    const result = await manager.savePartialSettings({
      erp: {
        url: 'http://updated.com',
        username: 'newuser',
        password: 'newpass'
      }
    })

    expect(result.success).toBe(true)

    const current = manager.getAllSettings()

    expect(current.erp.url).toBe('http://updated.com')
    expect(current.erp.username).toBe('newuser')
    expect(current.erp.password).toBe('newpass')
    expect(current.erp.headless).toBe(false) // preserved
  })

  it('should restore backup on save failure', async () => {
    const manager = ConfigManager.getInstance()
    await manager.initialize()

    const originalUrl = manager.getAllSettings().erp.url

    // Mock save to fail
    const originalSave = manager.save.bind(manager)
    vi.spyOn(manager, 'save').mockResolvedValueOnce(false)

    const result = await manager.savePartialSettings({
      erp: { url: 'http://should-not-apply.com' }
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('保存配置失败')

    // Verify rollback
    expect(manager.getAllSettings().erp.url).toBe(originalUrl)

    manager.save.mockRestore()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/main/services/config/config-manager.test.ts`

Expected: FAIL - "savePartialSettings is not a function" or implementation incomplete

**Step 3: Implement savePartialSettings method**

Add this public method to ConfigManager class (after saveAllSettings method, around line 483):

```typescript
  /**
   * Save partial settings (only update provided fields)
   * Preserves all existing fields not included in the update
   */
  public async savePartialSettings(
    settings: Partial<SettingsData>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Step 1: Validate field whitelist
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

      // Step 2: Read current settings
      const currentSettings = this.getAllSettings()

      // Step 3: Deep merge
      const mergedSettings = deepMerge(currentSettings, settings)

      // Step 4: Backup and save
      const backupSuccess = await this.backupEnvFile()
      if (!backupSuccess) {
        log.warn('Failed to backup .env file, proceeding with caution')
      }

      const saveSuccess = await this.saveAllSettings(mergedSettings)

      if (!saveSuccess) {
        // Save failed, attempt restore
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

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/main/services/config/config-manager.test.ts`

Expected: PASS

**Step 5: Run typecheck**

Run: `cd D:/Node/ERPAuto-settings-fix && npm run typecheck:node`

Expected: PASS (no type errors)

**Step 6: Commit**

```bash
cd D:/Node/ERPAuto-settings-fix
git add src/main/services/config/config-manager.ts tests/main/services/config/config-manager.test.ts
git commit -m "feat: implement savePartialSettings with validation and rollback"
```

---

## Task 4: Update IPC Handler to Use Partial Save

**Files:**

- Modify: `src/main/ipc/settings-handler.ts`

**Step 1: Update settings:saveSettings handler**

Find the `settings:saveSettings` handler (around line 83) and replace it:

```typescript
/**
 * Save settings (updated to use partial save)
 */
ipcMain.handle(
  'settings:saveSettings',
  async (_event, settings: Partial<SettingsData>): Promise<SaveSettingsResult> => {
    try {
      log.info('Saving settings', {
        sections: Object.keys(settings)
      })

      // Use partial save method
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

**Step 2: Run typecheck**

Run: `cd D:/Node/ERPAuto-settings-fix && npm run typecheck:node`

Expected: PASS

**Step 3: Commit**

```bash
cd D:/Node/ERPAuto-settings-fix
git add src/main/ipc/settings-handler.ts
git commit -m "feat: update settings handler to use savePartialSettings"
```

---

## Task 5: Update Frontend to Send Only Necessary Fields

**Files:**

- Modify: `src/renderer/src/pages/SettingsPage.tsx`

**Step 1: Update handleSaveSettings to send partial settings**

Find the `handleSaveSettings` function (around line 61) and replace it:

```typescript
const handleSaveSettings = async () => {
  try {
    // Only send UI-supported fields (double safety)
    const partialSettings = {
      erp: {
        url: settings.erp?.url,
        username: settings.erp?.username,
        password: settings.erp?.password
      }
    }

    const result = await window.electron.settings.saveSettings(partialSettings as any)

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

**Step 2: Run typecheck**

Run: `cd D:/Node/ERPAuto-settings-fix && npm run typecheck:web`

Expected: PASS

**Step 3: Commit**

```bash
cd D:/Node/ERPAuto-settings-fix
git add src/renderer/src/pages/SettingsPage.tsx
git commit -m "feat: send only ERP fields from settings page (defensive programming)"
```

---

## Task 6: Manual Testing and Verification

**Files:**

- Manual test procedure

**Step 1: Prepare test environment**

```bash
cd D:/Node/ERPAuto-settings-fix

# Create a test .env file with all fields
cat > .env << 'EOF'
# Test Configuration
ERP_URL=http://original-test.com
ERP_USERNAME=testuser
ERP_PASSWORD=testpass
ERP_HEADLESS=true
ERP_IGNORE_HTTPS_ERRORS=true
ERP_AUTO_CLOSE_BROWSER=true

DB_TYPE=mysql
DB_NAME=testdb
DB_USERNAME=dbuser
DB_PASSWORD=dbpass
DB_MYSQL_HOST=192.168.100.50
DB_MYSQL_PORT=3306
DB_MYSQL_CHARSET=utf8mb4

PATH_DATA_DIR=/test/data
PATH_DEFAULT_OUTPUT=test.xlsx
PATH_VALIDATION_OUTPUT=validation.xlsx

EXTRACTION_BATCH_SIZE=100
EXTRACTION_VERBOSE=true
EXTRACTION_AUTO_CONVERT=true
EXTRACTION_MERGE_BATCHES=true
EXTRACTION_ENABLE_DB_PERSISTENCE=true

VALIDATION_DATA_SOURCE=database_full
VALIDATION_USE_DATABASE=true
VALIDATION_BATCH_SIZE=2000
VALIDATION_ENABLE_CRUD=false
VALIDATION_DEFAULT_MANAGER=admin
VALIDATION_MATCH_MODE=substring

UI_FONT_FAMILY=TestFont
UI_FONT_SIZE=11
UI_PRODUCTION_ID_INPUT_WIDTH=15

EXECUTION_DRYRUN=false
EOF
```

**Step 2: Start development server**

Run: `npm run dev`

**Step 3: Navigate to settings page**

1. Login to the application
2. Navigate to Settings page
3. Modify only ERP URL to `http://modified-test.com`
4. Click "保存并应用配置"

**Step 4: Verify .env file preservation**

Check `.env` file:

```bash
cat .env
```

Expected results:

- `ERP_URL` should be `http://modified-test.com` (CHANGED)
- `DB_TYPE` should still be `mysql` (PRESERVED)
- `VALIDATION_MATCH_MODE` should still be `substring` (PRESERVED)
- All other fields should remain unchanged

**Step 5: Test whitelist validation**

Add test code to temporarily send invalid field:

```typescript
// In SettingsPage.tsx handleSaveSettings, temporarily add:
const partialSettings = {
  erp: {
    url: settings.erp?.url,
    username: settings.erp?.username,
    password: settings.erp?.password
  },
  database: { dbType: 'postgres' } // Should be rejected
}
```

Click save, should see error: "包含不允许修改的字段：database.dbType"

Remove test code after verification.

**Step 6: Test rollback mechanism**

Simulate save failure by temporarily making .env read-only:

```bash
chmod -w .env  # On Linux/Mac
# or on Windows with file properties
```

Attempt to save settings, should see error: "保存配置失败，已恢复原配置"

Verify .env content unchanged, then restore write permissions:

```bash
chmod +w .env  # On Linux/Mac
```

**Step 7: Document test results**

Create test report:

```bash
cat > docs/test-reports/settings-partial-save-manual-test.md << 'EOF'
# Settings Partial Save - Manual Test Report

**Date:** 2026-03-03
**Tester:** [Your Name]
**Branch:** fix/settings-partial-save

## Test Results

### Test 1: Partial Field Preservation
- [x] Modified ERP URL only
- [x] Verified DB_TYPE unchanged
- [x] Verified all other fields preserved

### Test 2: Whitelist Validation
- [x] Attempted to modify database.dbType
- [x] Received error message about unauthorized field
- [x] No changes applied to .env

### Test 3: Backup and Rollback
- [x] Backup file created before save
- [x] Save failure triggered rollback
- [x] Original configuration restored

## Conclusion
All manual tests passed successfully.
EOF
```

**Step 8: Commit**

```bash
cd D:/Node/ERPAuto-settings-fix
git add docs/test-reports/settings-partial-save-manual-test.md
git commit -m "test: add manual test report for settings partial save"
```

---

## Task 7: Update Documentation

**Files:**

- Create: `docs/settings-partial-save.md`
- Update: `README.md` (if applicable)

**Step 1: Create feature documentation**

Create `docs/settings-partial-save.md`:

````markdown
# Settings Partial Save Feature

## Overview

The settings system now implements partial save functionality to prevent unintended overwrites of configuration values.

## How It Works

1. **Field Whitelist**: Only fields exposed in the UI can be modified
2. **Deep Merge**: Updates are merged with existing config, preserving unmodified fields
3. **Backup & Rollback**: Config is backed up before save; failures trigger automatic rollback

## Editable Fields

Currently editable via UI:

- `erp.url` - ERP system URL
- `erp.username` - ERP login username
- `erp.password` - ERP login password

## Adding New Editable Fields

To add a new field to the UI:

1. Add field to whitelist in `src/main/services/config/config-manager.ts`:

```typescript
const UI_EDITABLE_FIELDS: string[] = [
  'erp.url',
  'erp.username',
  'erp.password',
  'database.dbType' // Add new field here
]
```
````

2. Add UI input in `src/renderer/src/pages/SettingsPage.tsx`
3. Update `handleSaveSettings` to include the new field

## API

### savePartialSettings(settings: Partial<SettingsData>)

Saves only the provided fields, preserving all existing configuration.

**Returns:** `{ success: boolean, error?: string }`

**Validation:**

- Checks whitelist before applying changes
- Returns error for unauthorized fields

## Error Handling

- **Unauthorized field**: Returns error message listing invalid fields
- **Save failure**: Automatically restores from backup
- **Backup failure**: Logs warning, continues with save

## Backup File

Location: `.env.backup` (in project root)

Created before every save operation. Used for rollback on failure.

````

**Step 2: Update CLAUDE.md if needed**

Add to "Development Commands" or "Architecture Overview" sections if there's relevant information about config management.

**Step 3: Commit**

```bash
cd D:/Node/ERPAuto-settings-fix
git add docs/settings-partial-save.md
git commit -m "docs: add settings partial save feature documentation"
````

---

## Task 8: Final Verification and Cleanup

**Files:**

- All modified files

**Step 1: Run full test suite**

Run: `cd D:/Node/ERPAuto-settings-fix && npm test`

Expected: All tests pass

**Step 2: Run type checking**

Run: `npm run typecheck`

Expected: No type errors

**Step 3: Run linting**

Run: `npm run lint`

Expected: No linting errors (or fix if present)

**Step 4: Build verification**

Run: `npm run build`

Expected: Build succeeds without errors

**Step 5: Review all changes**

```bash
cd D:/Node/ERPAuto-settings-fix
git diff dev --stat
```

Verify all changes are expected.

**Step 6: Final commit**

```bash
cd D:/Node/ERPAuto-settings-fix
git add -A
git commit -m "chore: final verification and cleanup for settings partial save feature"
```

---

## Summary

This implementation plan fixes the settings save issue through:

1. ✅ Deep merge utilities that preserve unmodified fields
2. ✅ Field whitelist validation to prevent unauthorized changes
3. ✅ Backup and rollback mechanism for safe saves
4. ✅ Updated IPC handler with partial save support
5. ✅ Frontend defensive programming (sends only necessary fields)
6. ✅ Comprehensive unit and manual testing
7. ✅ Complete documentation

**Total estimated implementation time:** 2-3 hours

**Key files modified:**

- `src/main/services/config/config-manager.ts` (core logic)
- `src/main/ipc/settings-handler.ts` (IPC layer)
- `src/renderer/src/pages/SettingsPage.tsx` (frontend)
- `tests/main/services/config/config-manager.test.ts` (tests)
