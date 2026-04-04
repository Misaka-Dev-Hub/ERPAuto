/**
 * Other Factories Unit Tests
 *
 * Tests for ExtractResult, CleanerResult, AuditLog, UpdateRelease,
 * ProductionInput, and ValidationError factories.
 */

import { describe, it, expect } from 'vitest'
import {
  ExtractResultFactory,
  CleanerResultFactory,
  AuditLogFactory,
  UpdateReleaseFactory,
  ProductionInputFactory,
  ValidationErrorFactory
} from './factory'
import { AuditAction, AuditStatus } from '../../src/main/types/audit.types'
import { VALIDATION_ERROR_CODES } from '../../src/main/types/errors'

describe('ExtractResultFactory', () => {
  it('creates extract result with default values', () => {
    const result = ExtractResultFactory.createExtractResult()

    expect(result.downloadedFiles).toHaveLength(1)
    expect(result.downloadedFiles[0]).toMatch(/download_\d+\.xlsx/)
    expect(result.mergedFile).toMatch(/merged_\d+\.xlsx/)
    expect(result.recordCount).toBe(100)
    expect(result.errors).toEqual([])
    expect(result.orderRecordCounts).toHaveLength(1)
  })

  it('creates extract result with overrides', () => {
    const result = ExtractResultFactory.createExtractResult({
      recordCount: 50,
      errors: ['Network timeout']
    })

    expect(result.recordCount).toBe(50)
    expect(result.errors).toEqual(['Network timeout'])
  })

  it('creates import result with default values', () => {
    const importResult = ExtractResultFactory.createImportResult()

    expect(importResult.success).toBe(true)
    expect(importResult.recordsRead).toBe(100)
    expect(importResult.recordsImported).toBe(95)
    expect(importResult.errors).toEqual([])
  })
})

describe('CleanerResultFactory', () => {
  it('creates cleaner result with default values', () => {
    const result = CleanerResultFactory.createCleanerResult()

    expect(result.ordersProcessed).toBe(5)
    expect(result.materialsDeleted).toBe(20)
    expect(result.materialsSkipped).toBe(2)
    expect(result.errors).toEqual([])
    expect(result.details).toEqual([])
    expect(result.retriedOrders).toBe(0)
  })

  it('creates cleaner result with overrides', () => {
    const result = CleanerResultFactory.createCleanerResult({
      ordersProcessed: 10,
      materialsDeleted: 40,
      retriedOrders: 2,
      successfulRetries: 1
    })

    expect(result.ordersProcessed).toBe(10)
    expect(result.materialsDeleted).toBe(40)
    expect(result.retriedOrders).toBe(2)
    expect(result.successfulRetries).toBe(1)
  })

  it('creates order clean detail with default values', () => {
    const detail = CleanerResultFactory.createOrderCleanDetail()

    expect(detail.orderNumber).toMatch(/SC\d+/)
    expect(detail.materialsDeleted).toBe(5)
    expect(detail.materialsSkipped).toBe(0)
    expect(detail.errors).toEqual([])
    expect(detail.skippedMaterials).toEqual([])
    expect(detail.retryCount).toBe(0)
  })
})

describe('AuditLogFactory', () => {
  it('creates audit log with default values', () => {
    const entry = AuditLogFactory.createAuditLog()

    expect(entry.timestamp).toBeInstanceOf(Date)
    expect(entry.action).toBe(AuditAction.LOGIN)
    expect(entry.status).toBe(AuditStatus.SUCCESS)
    expect(entry.userId).toBe('USR-001')
    expect(entry.username).toBe('test_user')
    expect(entry.computerName).toBe('TEST-PC')
    expect(entry.appVersion).toBe('1.0.0')
  })

  it('creates audit log with custom action and status', () => {
    const entry = AuditLogFactory.createAuditLog(AuditAction.EXTRACT, AuditStatus.FAILURE, {
      userId: 'USR-999',
      resource: 'Order SC123'
    })

    expect(entry.action).toBe(AuditAction.EXTRACT)
    expect(entry.status).toBe(AuditStatus.FAILURE)
    expect(entry.userId).toBe('USR-999')
    expect(entry.resource).toBe('Order SC123')
  })
})

describe('UpdateReleaseFactory', () => {
  it('creates stable release with default values', () => {
    const release = UpdateReleaseFactory.createUpdateRelease('stable')

    expect(release.version).toBe('1.0.0')
    expect(release.channel).toBe('stable')
    expect(release.artifactKey).toMatch(/erputo-stable-v1\.0\.0\.exe/)
    expect(release.size).toBe(52428800)
    expect(release.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('creates preview release with overrides', () => {
    const release = UpdateReleaseFactory.createUpdateRelease('preview', {
      version: '2.0.0-beta.1',
      size: 62914560
    })

    expect(release.channel).toBe('preview')
    expect(release.version).toBe('2.0.0-beta.1')
    expect(release.size).toBe(62914560)
  })
})

describe('ProductionInputFactory', () => {
  it('creates validation result with default values', () => {
    const result = ProductionInputFactory.createValidationResult()

    expect(result.materialName).toBe('Test Material')
    expect(result.materialCode).toMatch(/MAT-\d+/)
    expect(result.specification).toBe('Standard Spec')
    expect(result.model).toBe('Model-A')
    expect(result.managerName).toBe('Test Manager')
    expect(result.isMarkedForDeletion).toBe(false)
  })

  it('creates validation result marked for deletion', () => {
    const result = ProductionInputFactory.createValidationResult({
      isMarkedForDeletion: true,
      materialCode: 'MAT-999'
    })

    expect(result.isMarkedForDeletion).toBe(true)
    expect(result.materialCode).toBe('MAT-999')
  })
})

describe('ValidationErrorFactory', () => {
  it('creates validation error with default values', () => {
    const error = ValidationErrorFactory.createValidationError()

    expect(error.name).toBe('ValidationError')
    expect(error.message).toBe('Validation failed')
    expect(error.code).toBe(VALIDATION_ERROR_CODES.INVALID_INPUT)
  })

  it('creates validation error with custom message and code', () => {
    const error = ValidationErrorFactory.createValidationError(
      'Missing required field',
      VALIDATION_ERROR_CODES.MISSING_REQUIRED
    )

    expect(error.message).toBe('Missing required field')
    expect(error.code).toBe(VALIDATION_ERROR_CODES.MISSING_REQUIRED)
  })

  it('creates validation error with cause', () => {
    const cause = new Error('Underlying cause')
    const error = ValidationErrorFactory.createValidationError(
      'Invalid format',
      VALIDATION_ERROR_CODES.INVALID_FORMAT,
      cause
    )

    expect(error.cause).toBe(cause)
    expect(error.message).toBe('Invalid format')
  })
})
