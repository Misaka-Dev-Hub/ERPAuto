/**
 * Logger Unit Tests
 *
 * Tests logger creation, log output content, level filtering,
 * and setLogLevel behavior.
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
function createFormatFn() {
  const formatCallable = vi.fn((callback?: Function) => {
    if (callback) {
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
      transform.mockImplementation((info: any) => {
        if (!info || typeof info !== 'object') {
          info = { level: 'info', message: '', timestamp: new Date().toISOString() }
        }
        return callback(info)
      })
      return transform
    }
    return formatCallable
  }) as any

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

// Mock winston
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

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    winstonCalls.length = 0
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('should create a child logger that logs with context metadata', async () => {
    const { createLogger } = await import('../../src/main/services/logger')
    const logger = createLogger('TestContext')

    logger.info('Hello world', { extraKey: 'extraValue' })

    expect(winstonCalls).toHaveLength(1)
    expect(winstonCalls[0].level).toBe('info')
    expect(winstonCalls[0].message).toBe('Hello world')
    expect(winstonCalls[0].meta?.context).toBe('TestContext')
    expect(winstonCalls[0].meta?.extraKey).toBe('extraValue')
  })

  it('should log at all severity levels with correct content', async () => {
    const { createLogger } = await import('../../src/main/services/logger')
    const logger = createLogger('LevelTest')

    logger.debug('debug msg', { key: 'd' })
    logger.info('info msg', { key: 'i' })
    logger.warn('warn msg', { key: 'w' })
    logger.error('error msg', { key: 'e' })

    expect(winstonCalls).toHaveLength(4)
    const levels = winstonCalls.map((c) => c.level)
    expect(levels).toEqual(['debug', 'info', 'warn', 'error'])

    expect(winstonCalls[0].message).toBe('debug msg')
    expect(winstonCalls[1].message).toBe('info msg')
    expect(winstonCalls[2].message).toBe('warn msg')
    expect(winstonCalls[3].message).toBe('error msg')
  })

  it('should produce separate child loggers with independent context', async () => {
    const { createLogger } = await import('../../src/main/services/logger')
    const loggerA = createLogger('ModuleA')
    const loggerB = createLogger('ModuleB')

    loggerA.info('from A')
    loggerB.warn('from B')

    expect(winstonCalls).toHaveLength(2)
    expect(winstonCalls[0].meta?.context).toBe('ModuleA')
    expect(winstonCalls[0].message).toBe('from A')
    expect(winstonCalls[1].meta?.context).toBe('ModuleB')
    expect(winstonCalls[1].message).toBe('from B')
  })
})

describe('setLogLevel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    winstonCalls.length = 0
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('should change the root logger level', async () => {
    const loggerModule = await import('../../src/main/services/logger')

    // Default export is the root winston logger
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
