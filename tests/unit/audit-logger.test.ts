/**
 * Audit Logger Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// Mock fs for file operations
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn()
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn()
}))

// Mock electron app
vi.mock('electron', () => ({
  app: {
    isReady: vi.fn(() => false),
    getPath: vi.fn(() => './logs'),
    isPackaged: false
  }
}))

// Track calls to winston
interface WinstonCall {
  level: string
  message: string
}
const winstonCalls: WinstonCall[] = []

// Mock winston
vi.mock('winston', () => ({
  default: {
    createLogger: vi.fn(() => ({
      info: vi.fn((message) => {
        winstonCalls.push({ level: 'info', message })
      }),
      close: vi.fn()
    })),
    format: {
      combine: vi.fn((...args) => args),
      timestamp: vi.fn(() => ({ type: 'timestamp' })),
      printf: vi.fn((fn) => fn)
    }
  }
}))

// Mock winston-daily-rotate-file
vi.mock('winston-daily-rotate-file', () => ({
  default: vi.fn()
}))

describe('Audit Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    winstonCalls.length = 0
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('should export logAudit function', async () => {
    const { logAudit } = await import('../../src/main/services/logger/audit-logger')
    expect(logAudit).toBeDefined()
    expect(typeof logAudit).toBe('function')
  })

  it('should log audit entry with all required fields', async () => {
    const { logAudit } = await import('../../src/main/services/logger/audit-logger')

    await logAudit('LOGIN', 'user123', {
      username: 'john.doe',
      computerName: 'DESKTOP-001',
      resource: 'ERP_SYSTEM',
      status: 'success',
      metadata: { sessionId: 'abc-123' }
    })

    expect(winstonCalls.length).toBe(1)
    const call = winstonCalls[0]
    expect(call.level).toBe('info')

    // Parse the JSONL message
    const entry = JSON.parse(call.message as string)
    expect(entry.action).toBe('LOGIN')
    expect(entry.userId).toBe('user123')
    expect(entry.username).toBe('john.doe')
    expect(entry.computerName).toBe('DESKTOP-001')
    expect(entry.resource).toBe('ERP_SYSTEM')
    expect(entry.status).toBe('success')
    expect(entry.metadata).toEqual({ sessionId: 'abc-123' })
    expect(entry.timestamp).toBeDefined()
  })

  it('should log audit entry without optional metadata', async () => {
    const { logAudit } = await import('../../src/main/services/logger/audit-logger')

    await logAudit('LOGOUT', 'user456', {
      username: 'jane.smith',
      computerName: 'DESKTOP-002',
      resource: 'ERP_SYSTEM',
      status: 'success'
    })

    expect(winstonCalls.length).toBe(1)
    const call = winstonCalls[0]
    const entry = JSON.parse(call.message as string)

    expect(entry.action).toBe('LOGOUT')
    expect(entry.userId).toBe('user456')
    expect(entry.username).toBe('jane.smith')
    expect(entry.computerName).toBe('DESKTOP-002')
    expect(entry.resource).toBe('ERP_SYSTEM')
    expect(entry.status).toBe('success')
    expect(entry.metadata).toEqual({}) // Empty object when not provided
  })

  it('should handle different status values', async () => {
    const { logAudit } = await import('../../src/main/services/logger/audit-logger')

    // Test failure status
    await logAudit('EXTRACT', 'user789', {
      username: 'test.user',
      computerName: 'DESKTOP-003',
      resource: 'materials_table',
      status: 'failure',
      metadata: { error: 'Connection timeout' }
    })

    const call = winstonCalls[0]
    const entry = JSON.parse(call.message as string)
    expect(entry.status).toBe('failure')
  })

  it('should log with partial status', async () => {
    const { logAudit } = await import('../../src/main/services/logger/audit-logger')

    await logAudit('DELETE', 'user999', {
      username: 'admin',
      computerName: 'DESKTOP-004',
      resource: 'temp_files',
      status: 'partial',
      metadata: { deleted: 5, failed: 2 }
    })

    const call = winstonCalls[0]
    const entry = JSON.parse(call.message as string)
    expect(entry.status).toBe('partial')
  })

  it('should export closeAuditLogger function', async () => {
    const { closeAuditLogger } = await import('../../src/main/services/logger/audit-logger')
    expect(closeAuditLogger).toBeDefined()
    expect(typeof closeAuditLogger).toBe('function')
  })

  it('should close audit logger without errors', async () => {
    const { closeAuditLogger } = await import('../../src/main/services/logger/audit-logger')

    await expect(closeAuditLogger()).resolves.toBeUndefined()
  })
})
