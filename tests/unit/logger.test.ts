/**
 * Logger Unit Tests - Enhanced for Configuration Loading
 *
 * Tests logger creation, configuration, and integration with ConfigManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Track winston calls
interface WinstonCall {
  level: string
  message?: string
  meta?: Record<string, unknown>
}
const winstonCalls: WinstonCall[] = []

// ============================================
// Properly implemented winston format function
// Supports chainable calls: format().combine().timestamp().printf()
// AND direct calls: format(), format.printf()
// ============================================
function createFormatFn() {
  // The format function itself - when called as format()
  const formatFn = vi.fn((callback?: Function) => {
    if (callback) {
      return { transform: callback }
    }
    return formatFn
  }) as any

  // Add chainable methods
  formatFn.combine = vi.fn((...formats: any[]) => formatFn)
  formatFn.timestamp = vi.fn((options?: any) => formatFn)
  formatFn.colorize = vi.fn(() => formatFn)
  formatFn.printf = vi.fn((callback: Function) => ({ transform: callback }))
  formatFn.json = vi.fn(() => formatFn)
  formatFn.simple = vi.fn(() => formatFn)
  formatFn.pretty = vi.fn(() => formatFn)
  formatFn.label = vi.fn((options?: any) => formatFn)
  formatFn.errors = vi.fn(() => formatFn)
  formatFn.metadata = vi.fn(() => formatFn)
  formatFn.cli = vi.fn(() => formatFn)

  return formatFn
}

const format = createFormatFn()

// Mock winston since we don't need actual file logging in tests
vi.mock('winston', () => {
  const createLoggerInstance = {
    level: 'info',
    add: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    child: vi.fn(function (this: any, metadata: Record<string, unknown>) {
      return {
        ...this,
        info: vi.fn((message: string, meta?: Record<string, unknown>) => {
          winstonCalls.push({ level: 'info', message, meta: { ...metadata, ...meta } })
        }),
        error: vi.fn((message: string, meta?: Record<string, unknown>) => {
          winstonCalls.push({ level: 'error', message, meta: { ...metadata, ...meta } })
        }),
        warn: vi.fn((message: string, meta?: Record<string, unknown>) => {
          winstonCalls.push({ level: 'warn', message, meta: { ...metadata, ...meta } })
        }),
        debug: vi.fn((message: string, meta?: Record<string, unknown>) => {
          winstonCalls.push({ level: 'debug', message, meta: { ...metadata, ...meta } })
        })
      }
    }),
    info: vi.fn((message, meta) => {
      winstonCalls.push({ level: 'info', message, meta })
    }),
    error: vi.fn((message, meta) => {
      winstonCalls.push({ level: 'error', message, meta })
    }),
    warn: vi.fn((message, meta) => {
      winstonCalls.push({ level: 'warn', message, meta })
    }),
    debug: vi.fn((message, meta) => {
      winstonCalls.push({ level: 'debug', message, meta })
    })
  }

  return {
    default: {
      createLogger: vi.fn(() => createLoggerInstance),
      format,
      transports: {
        Console: vi.fn(function Console(this: any, options?: any) {
          this.level = options?.level || 'info'
        }),
        DailyRotateFile: vi.fn(function DailyRotateFile(this: any, options?: any) {
          this.options = options
        }),
        File: vi.fn(),
        Http: vi.fn()
      },
      addColors: vi.fn()
    }
  }
})

vi.mock('winston-daily-rotate-file', () => ({
  default: vi.fn() as any
}))

// Note: electron mock is now in tests/setup.ts (global)
// This local mock is removed to avoid conflicts

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    winstonCalls.length = 0
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('should create a logger with context', async () => {
    const { createLogger } = await import('../../src/main/services/logger')
    const logger = createLogger('TestContext')

    expect(logger).toBeDefined()
    // Logger should have logging methods
    expect(logger.info || logger.debug || logger.warn || logger.error).toBeDefined()
  })

  it('should have all log methods', async () => {
    const { createLogger } = await import('../../src/main/services/logger')
    const logger = createLogger('TestContext')

    expect(typeof logger.info).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })

  it('should export default logger', async () => {
    const logger = await import('../../src/main/services/logger')
    expect(logger.default).toBeDefined()
  })

  it('should export setLogLevel function', async () => {
    const { setLogLevel } = await import('../../src/main/services/logger')
    expect(setLogLevel).toBeDefined()
    expect(typeof setLogLevel).toBe('function')
  })

  it('should create child logger with context metadata', async () => {
    const { createLogger } = await import('../../src/main/services/logger')
    const logger = createLogger('MyModule')

    logger.info('Test message')

    // Verify logger was created and called
    expect(logger.info).toHaveBeenCalled()
  })

  it('should log at different levels with metadata', async () => {
    const { createLogger } = await import('../../src/main/services/logger')
    const logger = createLogger('TestContext')

    logger.debug('Debug message', { debugKey: 'debugValue' })
    logger.info('Info message', { infoKey: 'infoValue' })
    logger.warn('Warning message', { warnKey: 'warnValue' })
    logger.error('Error message', { errorKey: 'errorValue' })

    expect(logger.debug).toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('Logger Configuration Loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    winstonCalls.length = 0
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
    expect(defaultConfig.logging.level).toBeDefined()
    expect(defaultConfig.logging.auditRetention).toBeDefined()
    expect(defaultConfig.logging.appRetention).toBeDefined()
  })

  it('should validate logging level enum values', async () => {
    const { loggingConfigSchema } = await import('../../src/main/types/config.schema')

    // Test all valid log levels
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

    // Valid values
    expect(loggingConfigSchema.safeParse({ auditRetention: 1 }).success).toBe(true)
    expect(loggingConfigSchema.safeParse({ auditRetention: 365 }).success).toBe(true)
    expect(loggingConfigSchema.safeParse({ auditRetention: 30 }).success).toBe(true)

    // Invalid values
    expect(loggingConfigSchema.safeParse({ auditRetention: 0 }).success).toBe(false)
    expect(loggingConfigSchema.safeParse({ auditRetention: 366 }).success).toBe(false)
  })

  it('should validate app retention range (1-365)', async () => {
    const { loggingConfigSchema } = await import('../../src/main/types/config.schema')

    // Valid values
    expect(loggingConfigSchema.safeParse({ appRetention: 1 }).success).toBe(true)
    expect(loggingConfigSchema.safeParse({ appRetention: 365 }).success).toBe(true)
    expect(loggingConfigSchema.safeParse({ appRetention: 14 }).success).toBe(true)

    // Invalid values
    expect(loggingConfigSchema.safeParse({ appRetention: 0 }).success).toBe(false)
    expect(loggingConfigSchema.safeParse({ appRetention: 366 }).success).toBe(false)
  })

  it('should use default values when logging config is partial', async () => {
    const { loggingConfigSchema } = await import('../../src/main/types/config.schema')

    // Only provide level, should default others
    const result = loggingConfigSchema.safeParse({ level: 'warn' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.auditRetention).toBe(30) // default
      expect(result.data.appRetention).toBe(14) // default
    }
  })
})

describe('ConfigManager Logging Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    winstonCalls.length = 0
  })

  afterEach(() => {
    vi.resetModules()
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

  it('should export validateConfig helper function', async () => {
    const { validateConfig } = await import('../../src/main/types/config.schema')

    expect(validateConfig).toBeDefined()
    expect(typeof validateConfig).toBe('function')

    const result = validateConfig({
      erp: { url: 'https://test.com' },
      database: {
        activeType: 'mysql' as const,
        mysql: {
          host: 'localhost',
          port: 3306,
          database: 'test',
          username: 'user',
          password: 'pass',
          charset: 'utf8mb4'
        },
        sqlserver: {
          server: 'localhost',
          port: 1433,
          database: 'test',
          username: 'sa',
          password: 'pass',
          driver: 'ODBC Driver 18 for SQL Server',
          trustServerCertificate: true
        }
      },
      paths: {
        dataDir: './data/',
        defaultOutput: 'output.xlsx',
        validationOutput: 'validation.xlsx'
      },
      extraction: {
        batchSize: 100,
        verbose: true,
        autoConvert: true,
        mergeBatches: true,
        enableDbPersistence: true
      },
      validation: {
        dataSource: 'database_full' as const,
        batchSize: 2000,
        matchMode: 'substring' as const,
        enableCrud: false,
        defaultManager: ''
      },
      orderResolution: {
        tableName: 'table',
        productionIdField: 'prod',
        orderNumberField: 'order'
      },
      logging: {
        level: 'info' as const,
        auditRetention: 30,
        appRetention: 14
      }
    })

    expect(result.success).toBe(true)
  })
})
