/**
 * Logger Integration Tests - RequestContext Integration
 * Verifies RequestContext is properly integrated with Logger
 */

import { describe, it, expect } from 'vitest'

describe('Logger RequestContext Integration', () => {
  it('should export run from request-context', async () => {
    const { run } = await import('../../src/main/services/logger/index')
    expect(run).toBeDefined()
    expect(typeof run).toBe('function')
  })

  it('should export getRequestId from request-context', async () => {
    const { getRequestId } = await import('../../src/main/services/logger/index')
    expect(getRequestId).toBeDefined()
    expect(typeof getRequestId).toBe('function')
  })

  it('should export getContext from request-context', async () => {
    const { getContext } = await import('../../src/main/services/logger/index')
    expect(getContext).toBeDefined()
    expect(typeof getContext).toBe('function')
  })

  it('should export withContext from request-context', async () => {
    const { withContext } = await import('../../src/main/services/logger/index')
    expect(withContext).toBeDefined()
    expect(typeof withContext).toBe('function')
  })

  it('should export withRequestContext wrapper', async () => {
    const { withRequestContext } = await import('../../src/main/services/logger/index')
    expect(withRequestContext).toBeDefined()
    expect(typeof withRequestContext).toBe('function')
  })

  it('should export createLogger', async () => {
    const { createLogger } = await import('../../src/main/services/logger/index')
    expect(createLogger).toBeDefined()
    expect(typeof createLogger).toBe('function')
  })

  it('should have all exports available from LoggerContext type', async () => {
    const loggerModule = await import('../../src/main/services/logger/index')
    expect(loggerModule.run).toBeDefined()
    expect(loggerModule.getRequestId).toBeDefined()
    expect(loggerModule.getContext).toBeDefined()
    expect(loggerModule.withContext).toBeDefined()
    expect(loggerModule.withRequestContext).toBeDefined()
    expect(loggerModule.createLogger).toBeDefined()
  })
})
