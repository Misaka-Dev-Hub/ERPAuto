/**
 * Audit Logger Unit Tests
 *
 * Tests audit logger behavior: verifies JSONL entry content,
 * status handling, metadata processing, and special characters.
 * Uses spy on the module's audit logger instance instead of mocking winston,
 * to avoid cross-contamination with logger.test.ts under isolate:false.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Audit Logger', () => {
  let auditLoggerModule: typeof import('../../src/main/services/logger/audit-logger')
  let infoSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    auditLoggerModule = await import('../../src/main/services/logger/audit-logger')

    // Spy on the audit logger's info method
    const auditLogger = auditLoggerModule.default
    infoSpy = vi.fn()
    auditLogger.info = infoSpy
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('should produce a valid JSONL entry with all required fields', async () => {
    const { logAudit, applyAuditConfig } = auditLoggerModule

    applyAuditConfig(30)
    logAudit('LOGIN', 'user-001', {
      username: 'alice',
      computerName: 'PC-001',
      resource: 'ERP_SYSTEM',
      status: 'success',
      metadata: { sessionId: 'abc' }
    })

    expect(infoSpy).toHaveBeenCalledTimes(1)
    const entry = JSON.parse(infoSpy.mock.calls[0][0])

    expect(entry.action).toBe('LOGIN')
    expect(entry.userId).toBe('user-001')
    expect(entry.username).toBe('alice')
    expect(entry.computerName).toBe('PC-001')
    expect(entry.appVersion).toBe('1.9.0-test')
    expect(entry.resource).toBe('ERP_SYSTEM')
    expect(entry.status).toBe('success')
    expect(entry.metadata).toEqual({ sessionId: 'abc' })
    // Timestamp should be a valid ISO 8601 string
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp)
  })

  it('should accept all status values: success, failure, partial', async () => {
    const { logAudit, applyAuditConfig } = auditLoggerModule

    applyAuditConfig(30)

    logAudit('EXTRACT', 'user1', {
      username: 'extractor',
      computerName: 'PC-001',
      resource: 'materials',
      status: 'success'
    })

    logAudit('DELETE', 'user2', {
      username: 'cleaner',
      computerName: 'PC-002',
      resource: 'temp_files',
      status: 'failure',
      metadata: { error: 'Permission denied' }
    })

    logAudit('UPDATE', 'user3', {
      username: 'updater',
      computerName: 'PC-003',
      resource: 'config',
      status: 'partial',
      metadata: { updated: 5, failed: 2 }
    })

    expect(infoSpy).toHaveBeenCalledTimes(3)
    const entries = infoSpy.mock.calls.map((call: any[]) => JSON.parse(call[0]))
    expect(entries[0].status).toBe('success')
    expect(entries[1].status).toBe('failure')
    expect(entries[2].status).toBe('partial')
  })

  it('should default to empty metadata when not provided', async () => {
    const { logAudit, applyAuditConfig } = auditLoggerModule

    applyAuditConfig(30)

    logAudit('PING', 'user-no-meta', {
      username: 'tester',
      computerName: 'PC-001',
      resource: 'ERP',
      status: 'success'
    })

    const entry = JSON.parse(infoSpy.mock.calls[0][0])
    expect(entry.metadata).toEqual({})
  })

  it('should handle special characters in fields without error', async () => {
    const { logAudit, applyAuditConfig } = auditLoggerModule

    applyAuditConfig(30)

    logAudit('LOGIN_ATTEMPT', 'user-special', {
      username: 'user.name+test@example.com',
      computerName: 'DESKTOP-特殊字符-001',
      resource: 'ERP/子系统',
      status: 'failure',
      metadata: { reason: '密码错误', attempt: 3 }
    })

    expect(infoSpy).toHaveBeenCalledTimes(1)
    const entry = JSON.parse(infoSpy.mock.calls[0][0])
    expect(entry.username).toBe('user.name+test@example.com')
    expect(entry.computerName).toBe('DESKTOP-特殊字符-001')
    expect(entry.resource).toBe('ERP/子系统')
    expect(entry.metadata.reason).toBe('密码错误')
  })

  it('should close audit logger without errors', async () => {
    const { closeAuditLogger } = auditLoggerModule

    expect(() => closeAuditLogger()).not.toThrow()
  })
})
