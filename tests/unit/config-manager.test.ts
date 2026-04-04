/**
 * ConfigManager Unit Tests
 *
 * Tests for ConfigManager service configuration and validation functionality.
 * Logger is mocked to isolate ConfigManager testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

  it('should load ConfigManager class', async () => {
    const { ConfigManager } = await import('../../src/main/services/config/config-manager')
    expect(ConfigManager).toBeDefined()
    expect(typeof ConfigManager.getInstance).toBe('function')
  })

  it('should have logging configuration methods', async () => {
    const { ConfigManager } = await import('../../src/main/services/config/config-manager')

    const manager = ConfigManager.getInstance()

    expect(manager.getLoggingConfig).toBeDefined()
    expect(typeof manager.getLoggingConfig).toBe('function')
    expect(manager.getDefaultConfig).toBeDefined()
    expect(typeof manager.getDefaultConfig).toBe('function')
  })

  it('should return default logging config structure', async () => {
    const { ConfigManager } = await import('../../src/main/services/config/config-manager')

    const manager = ConfigManager.getInstance()
    const defaultConfig = manager.getDefaultConfig()

    expect(defaultConfig.logging).toBeDefined()
    expect(defaultConfig.logging.level).toBe('info')
    expect(defaultConfig.logging.auditRetention).toBe(30)
    expect(defaultConfig.logging.appRetention).toBe(14)
  })

  it('should get default logging config values', async () => {
    const { ConfigManager } = await import('../../src/main/services/config/config-manager')

    const manager = ConfigManager.getInstance()
    const defaultConfig = manager.getDefaultConfig()

    expect(defaultConfig.logging.level).toBe('info')
    expect(defaultConfig.logging.auditRetention).toBe(30)
    expect(defaultConfig.logging.appRetention).toBe(14)
  })

  it('should export fullConfigSchema for validation', async () => {
    const { fullConfigSchema } = await import('../../src/main/types/config.schema')

    expect(fullConfigSchema).toBeDefined()
    expect(typeof fullConfigSchema.parse).toBe('function')
    expect(typeof fullConfigSchema.safeParse).toBe('function')
  })

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
})
