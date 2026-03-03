import { describe, it, expect, vi } from 'vitest'
import { ConfigManager } from '@services/config/config-manager'
import type { SettingsData } from '@types/settings.types'

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

describe('ConfigManager - backup and restore', () => {
  it('should create backup before saving', async () => {
    const manager = ConfigManager.getInstance()
    await manager.initialize()

    const backupSuccess = await manager['backupEnvFile']()

    expect(backupSuccess).toBe(true)

    // Check backup file exists (in same location as .env file)
    const fs = await import('fs')
    const path = await import('path')
    const backupPath = path.resolve('src/main/.env.backup')

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
