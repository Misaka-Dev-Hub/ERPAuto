import { describe, it, expect, vi } from 'vitest'
import { ConfigManager } from '@services/config/config-manager'
import type { SettingsData } from '@types/settings.types'

describe('ConfigManager - deep merge utilities', () => {
  it('should deep merge objects, updating only specified fields', async () => {
    const manager = ConfigManager.getInstance()
    await manager.initialize()
    // Reload to ensure clean state from previous tests
    await manager['loadEnvFile']()

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
    // Reload from disk to populate cache
    await manager['loadEnvFile']()

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

describe('ConfigManager - backup and restore', () => {
  it('should create backup before saving', async () => {
    const manager = ConfigManager.getInstance()
    await manager.initialize()

    const backupSuccess = await manager['backupEnvFile']()

    expect(backupSuccess).toBe(true)

    // Check backup file exists (in same location as .env file, which is src/main/)
    const fs = await import('fs')
    const path = await import('path')
    const backupPath = path.resolve(process.cwd(), 'src/main/.env.backup')

    expect(fs.existsSync(backupPath)).toBe(true)
  })

  // Note: Skipping fs.writeFileSync mock test due to ESM limitations in Vitest
  // The restoreBackup functionality is tested indirectly through the savePartialSettings rollback test
})

describe('ConfigManager.savePartialSettings', () => {
  it('should save only specified fields and preserve others', async () => {
    const manager = ConfigManager.getInstance()
    await manager.initialize()

    // Setup initial state with multiple categories
    await manager.saveAllSettings({
      erp: { url: 'http://old.com', username: 'user1', password: 'pass1', headless: true, ignoreHttpsErrors: true, autoCloseBrowser: true },
      database: { dbType: 'mysql', server: '', mysqlHost: '192.168.1.1', mysqlPort: 3306, database: 'testdb', username: 'dbuser', password: '' },
      paths: { dataDir: '/old/path', defaultOutput: 'out.xlsx', validationOutput: 'val.xlsx' },
      extraction: { batchSize: 50, verbose: true, autoConvert: true, mergeBatches: true, enableDbPersistence: true },
      validation: { dataSource: 'database_full', batchSize: 1000, matchMode: 'exact', enableCrud: false, defaultManager: '' },
      ui: { fontFamily: 'Tahoma', fontSize: 14, productionIdInputWidth: 25 },
      execution: { dryRun: true }
    })
    // Reload from disk to populate cache
    await manager['loadEnvFile']()

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
    // Reset to ensure clean state
    manager.resetToDefaults()
    await manager.save()

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
    // Reset to ensure clean state
    manager.resetToDefaults()
    await manager.save()

    await manager.saveAllSettings({
      erp: { url: 'http://test.com', username: 'u', password: 'p', headless: false, ignoreHttpsErrors: false, autoCloseBrowser: false },
      database: { dbType: 'mysql', server: '', mysqlHost: 'localhost', mysqlPort: 3306, database: 'db', username: 'user', password: '' },
      paths: { dataDir: '/data', defaultOutput: 'out.xlsx', validationOutput: 'val.xlsx' },
      extraction: { batchSize: 100, verbose: true, autoConvert: true, mergeBatches: true, enableDbPersistence: true },
      validation: { dataSource: 'database_full', batchSize: 2000, matchMode: 'substring', enableCrud: false, defaultManager: '' },
      ui: { fontFamily: 'Arial', fontSize: 12, productionIdInputWidth: 20 },
      execution: { dryRun: false }
    })
    // Reload from disk to populate cache
    await manager['loadEnvFile']()

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
    // Reset to ensure clean state
    manager.resetToDefaults()
    await manager.save()

    const originalUrl = manager.getAllSettings().erp.url

    // Mock save to fail
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
