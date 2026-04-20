/**
 * ConfigManager Unit Tests
 *
 * Tests for ConfigManager default configuration values, schema validation,
 * and singleton behavior.
 * Logger is mocked to isolate ConfigManager testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'

// Mock logger to prevent initialization issues
vi.mock('../../src/main/services/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  })),
  applyLoggingConfig: vi.fn(),
  trackDuration: vi.fn()
}))

// Mock audit-logger
vi.mock('../../src/main/services/logger/audit-logger', () => ({
  applyAuditConfig: vi.fn()
}))

describe('ConfigManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('should return default config with correct logging values', async () => {
    const { ConfigManager } = await import('../../src/main/services/config/config-manager')

    const manager = ConfigManager.getInstance()
    const defaultConfig = manager.getDefaultConfig()

    expect(defaultConfig.logging.level).toBe('info')
    expect(defaultConfig.logging.auditRetention).toBe(30)
    expect(defaultConfig.logging.appRetention).toBe(14)
  })

  it('should return default config with correct database defaults', async () => {
    const { ConfigManager } = await import('../../src/main/services/config/config-manager')

    const manager = ConfigManager.getInstance()
    const defaultConfig = manager.getDefaultConfig()

    expect(defaultConfig.database.activeType).toBe('mysql')
    expect(defaultConfig.database.mysql.host).toBe('localhost')
    expect(defaultConfig.database.mysql.port).toBe(3306)
    expect(defaultConfig.database.mysql.database).toBe('erp_db')
  })

  it('should return default config with correct extraction defaults', async () => {
    const { ConfigManager } = await import('../../src/main/services/config/config-manager')

    const manager = ConfigManager.getInstance()
    const defaultConfig = manager.getDefaultConfig()

    expect(defaultConfig.extraction.batchSize).toBe(100)
    expect(defaultConfig.extraction.headless).toBe(true)
    expect(defaultConfig.extraction.autoConvert).toBe(true)
  })

  it('should throw when getConfig() is called before initialize()', async () => {
    const { ConfigManager } = await import('../../src/main/services/config/config-manager')

    // Reset singleton to get a fresh uninitialized instance
    const FreshConfigManager = ConfigManager as any
    FreshConfigManager.instance = null

    const manager = ConfigManager.getInstance()

    expect(() => manager.getConfig()).toThrow('Configuration not initialized')
  })

  it('should return the same singleton instance', async () => {
    const { ConfigManager } = await import('../../src/main/services/config/config-manager')

    const a = ConfigManager.getInstance()
    const b = ConfigManager.getInstance()

    expect(a).toBe(b)
  })

  it('should re-apply logging configuration after saveConfig succeeds', async () => {
    const loggerModule = await import('../../src/main/services/logger')
    const auditLoggerModule = await import('../../src/main/services/logger/audit-logger')
    const { ConfigManager } = await import('../../src/main/services/config/config-manager')

    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined)

    const FreshConfigManager = ConfigManager as any
    FreshConfigManager.instance = null

    const manager = ConfigManager.getInstance() as any
    const nextConfig = manager.getDefaultConfig()
    nextConfig.logging.level = 'debug'
    nextConfig.logging.appRetention = 21
    nextConfig.logging.auditRetention = 45
    nextConfig.seq.enabled = true
    nextConfig.seq.serverUrl = 'http://seq.local'

    const success = await manager.saveConfig(nextConfig)

    expect(success).toBe(true)
    expect(loggerModule.applyLoggingConfig).toHaveBeenCalledWith(
      nextConfig.logging,
      nextConfig.seq
    )
    expect(auditLoggerModule.applyAuditConfig).toHaveBeenCalledWith(45)
  })
})

describe('Config Schema Validation', () => {
  it('should validate complete logging configuration', async () => {
    const { loggingConfigSchema } = await import('../../src/main/types/config.schema')

    const validConfig = {
      level: 'debug' as const,
      auditRetention: 60,
      appRetention: 21
    }

    const result = loggingConfigSchema.safeParse(validConfig)
    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data.level).toBe('debug')
      expect(result.data.auditRetention).toBe(60)
      expect(result.data.appRetention).toBe(21)
    }
  })

  it('should validate logging level enum values', async () => {
    const { loggingConfigSchema } = await import('../../src/main/types/config.schema')

    const validLevels = ['error', 'warn', 'info', 'debug', 'verbose']

    for (const level of validLevels) {
      const result = loggingConfigSchema.safeParse({ level })
      expect(result.success).toBe(true)
    }
  })

  it('should reject invalid logging level', async () => {
    const { loggingConfigSchema } = await import('../../src/main/types/config.schema')

    const result = loggingConfigSchema.safeParse({ level: 'invalid_level' })
    expect(result.success).toBe(false)
  })

  it('should validate audit retention range (1-365)', async () => {
    const { loggingConfigSchema } = await import('../../src/main/types/config.schema')

    expect(loggingConfigSchema.safeParse({ auditRetention: 1 }).success).toBe(true)
    expect(loggingConfigSchema.safeParse({ auditRetention: 365 }).success).toBe(true)
    expect(loggingConfigSchema.safeParse({ auditRetention: 0 }).success).toBe(false)
    expect(loggingConfigSchema.safeParse({ auditRetention: 366 }).success).toBe(false)
  })

  it('should validate app retention range (1-365)', async () => {
    const { loggingConfigSchema } = await import('../../src/main/types/config.schema')

    expect(loggingConfigSchema.safeParse({ appRetention: 1 }).success).toBe(true)
    expect(loggingConfigSchema.safeParse({ appRetention: 365 }).success).toBe(true)
    expect(loggingConfigSchema.safeParse({ appRetention: 0 }).success).toBe(false)
    expect(loggingConfigSchema.safeParse({ appRetention: 366 }).success).toBe(false)
  })

  it('should use default values when logging config is partial', async () => {
    const { loggingConfigSchema } = await import('../../src/main/types/config.schema')

    const result = loggingConfigSchema.safeParse({ level: 'warn' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.auditRetention).toBe(30)
      expect(result.data.appRetention).toBe(14)
    }
  })
})
