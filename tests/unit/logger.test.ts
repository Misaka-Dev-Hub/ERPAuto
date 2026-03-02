/**
 * Logger Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock winston since we don't need actual file logging in tests
vi.mock('winston', () => ({
  default: {
    createLogger: vi.fn(() => ({
      add: vi.fn(),
      child: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      })),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    })),
    format: {
      combine: vi.fn(),
      timestamp: vi.fn(),
      colorize: vi.fn(),
      printf: vi.fn(),
      json: vi.fn()
    },
    transports: {
      Console: vi.fn()
    }
  }
}))

vi.mock('winston-daily-rotate-file', () => ({
  default: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    isReady: vi.fn(() => false),
    getPath: vi.fn(() => './logs')
  }
}))

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('should create a logger with context', async () => {
    const { createLogger } = await import('../../src/main/services/logger')
    const logger = createLogger('TestContext')

    expect(logger).toBeDefined()
    expect(logger.child).toBeDefined()
  })

  it('should have log methods', async () => {
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
})
