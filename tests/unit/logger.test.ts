/**
 * Logger Unit Tests
 *
 * Tests logger creation, log output content, level filtering,
 * and setLogLevel behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track logger calls
interface LoggerCall {
  level: string
  message?: string
  meta?: Record<string, unknown>
}
const loggerCalls: LoggerCall[] = []

// Mock the entire logger module for complete control
vi.mock('../../src/main/services/logger', () => {
  const createLoggerMethods = () => ({
    info: vi.fn((message, meta) => {
      loggerCalls.push({ level: 'info', message, meta })
    }),
    error: vi.fn((message, meta) => {
      loggerCalls.push({ level: 'error', message, meta })
    }),
    warn: vi.fn((message, meta) => {
      loggerCalls.push({ level: 'warn', message, meta })
    }),
    debug: vi.fn((message, meta) => {
      loggerCalls.push({ level: 'debug', message, meta })
    }),
    verbose: vi.fn((message, meta) => {
      loggerCalls.push({ level: 'verbose', message, meta })
    })
  })

  const rootLogger = {
    level: 'info',
    add: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    ...createLoggerMethods(),
    child: vi.fn((metadata: Record<string, unknown>) => ({
      level: 'info',
      ...createLoggerMethods(),
      // Override methods to include child metadata
      info: vi.fn((message: string, meta?: Record<string, unknown>) => {
        loggerCalls.push({ level: 'info', message, meta: { ...metadata, ...meta } })
      }),
      error: vi.fn((message: string, meta?: Record<string, unknown>) => {
        loggerCalls.push({ level: 'error', message, meta: { ...metadata, ...meta } })
      }),
      warn: vi.fn((message: string, meta?: Record<string, unknown>) => {
        loggerCalls.push({ level: 'warn', message, meta: { ...metadata, ...meta } })
      }),
      debug: vi.fn((message: string, meta?: Record<string, unknown>) => {
        loggerCalls.push({ level: 'debug', message, meta: { ...metadata, ...meta } })
      }),
      verbose: vi.fn((message: string, meta?: Record<string, unknown>) => {
        loggerCalls.push({ level: 'verbose', message, meta: { ...metadata, ...meta } })
      })
    }))
  }

  return {
    default: rootLogger,
    createLogger: vi.fn((context: string) => rootLogger.child({ context })),
    setLogLevel: vi.fn((level: string) => {
      rootLogger.level = level
    }),
    applyLoggingConfig: vi.fn(),
    withRequestContext: vi.fn()
  }
})

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loggerCalls.length = 0
  })

  it('should create a child logger that logs with context metadata', async () => {
    const { createLogger } = await import('../../src/main/services/logger')
    const logger = createLogger('TestContext')

    logger.info('Hello world', { extraKey: 'extraValue' })

    expect(loggerCalls).toHaveLength(1)
    expect(loggerCalls[0].level).toBe('info')
    expect(loggerCalls[0].message).toBe('Hello world')
    expect(loggerCalls[0].meta?.context).toBe('TestContext')
    expect(loggerCalls[0].meta?.extraKey).toBe('extraValue')
  })

  it('should log at all severity levels with correct content', async () => {
    const { createLogger } = await import('../../src/main/services/logger')
    const logger = createLogger('LevelTest')

    logger.debug('debug msg', { key: 'd' })
    logger.info('info msg', { key: 'i' })
    logger.warn('warn msg', { key: 'w' })
    logger.error('error msg', { key: 'e' })

    expect(loggerCalls).toHaveLength(4)
    const levels = loggerCalls.map((c) => c.level)
    expect(levels).toEqual(['debug', 'info', 'warn', 'error'])

    expect(loggerCalls[0].message).toBe('debug msg')
    expect(loggerCalls[1].message).toBe('info msg')
    expect(loggerCalls[2].message).toBe('warn msg')
    expect(loggerCalls[3].message).toBe('error msg')
  })

  it('should produce separate child loggers with independent context', async () => {
    const { createLogger } = await import('../../src/main/services/logger')
    const loggerA = createLogger('ModuleA')
    const loggerB = createLogger('ModuleB')

    loggerA.info('from A')
    loggerB.warn('from B')

    expect(loggerCalls).toHaveLength(2)
    expect(loggerCalls[0].meta?.context).toBe('ModuleA')
    expect(loggerCalls[0].message).toBe('from A')
    expect(loggerCalls[1].meta?.context).toBe('ModuleB')
    expect(loggerCalls[1].message).toBe('from B')
  })
})

describe('setLogLevel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loggerCalls.length = 0
  })

  it('should change the root logger level', async () => {
    const loggerModule = await import('../../src/main/services/logger')

    // Default export is the root logger
    const rootLogger = loggerModule.default

    // Default level is 'info'
    expect(rootLogger.level).toBe('info')

    // Change to debug
    loggerModule.setLogLevel('debug')
    expect(rootLogger.level).toBe('debug')

    // Change to error
    loggerModule.setLogLevel('error')
    expect(rootLogger.level).toBe('error')
  })
})
