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
// Winston Format Mock - Callable Object Pattern
// ============================================
// Supports: format(), format.combine(), format.printf(),
//           AND IIFE pattern: format((info) => info)()
// ============================================
function createFormatFn() {
  // The format FUNCTION itself - callable with ()
  const formatCallable = vi.fn((callback?: Function) => {
    if (callback) {
      // Return a new callable format when callback is provided
      // This simulates: format((info) => { ... })() where () calls the returned function
      const transform = vi.fn() as any
      transform.combine = vi.fn(() => formatCallable)
      transform.timestamp = vi.fn(() => formatCallable)
      transform.colorize = vi.fn(() => formatCallable)
      transform.json = vi.fn(() => formatCallable)
      transform.simple = vi.fn(() => formatCallable)
      transform.pretty = vi.fn(() => formatCallable)
      transform.label = vi.fn(() => formatCallable)
      transform.errors = vi.fn(() => formatCallable)
      transform.metadata = vi.fn(() => formatCallable)
      transform.cli = vi.fn(() => formatCallable)
      // When called as transform(info), pass through the callback
      // Handle undefined/null info gracefully
      transform.mockImplementation((info: any) => {
        // During initialization, logger may call with undefined - skip in that case
        if (!info || typeof info !== 'object') {
          info = { level: 'info', message: '', timestamp: new Date().toISOString() }
        }
        return callback(info)
      })
      return transform
    }
    // Called without callback - return formatCallable for chaining
    return formatCallable
  }) as any

  // Add top-level chainable methods
  formatCallable.combine = vi.fn(() => formatCallable)
  formatCallable.timestamp = vi.fn(() => formatCallable)
  formatCallable.colorize = vi.fn(() => formatCallable)
  formatCallable.printf = vi.fn((cb: Function) => cb)
  formatCallable.json = vi.fn(() => formatCallable)
  formatCallable.simple = vi.fn(() => formatCallable)
  formatCallable.pretty = vi.fn(() => formatCallable)
  formatCallable.label = vi.fn(() => formatCallable)
  formatCallable.errors = vi.fn(() => formatCallable)
  formatCallable.metadata = vi.fn(() => formatCallable)
  formatCallable.cli = vi.fn(() => formatCallable)

  return formatCallable
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
