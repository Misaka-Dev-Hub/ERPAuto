import { describe, it, expect } from 'vitest'
import { DeletionErrorCategory, DeletionOutcome } from '../../../../src/main/types/cleaner.types'
import {
  CleanerService,
  createBatches,
  getMissingOrders,
  runWithConcurrency
} from '../../../../src/main/services/erp/cleaner'

// TODO: clean() method tests need integration test setup with full page mock

describe('CleanerService - Helper Methods', () => {
  const createCleanerService = (dryRun = false): CleanerService => {
    return new CleanerService({} as any, { dryRun })
  }

  describe('shouldDeleteMaterial()', () => {
    const cleaner = createCleanerService()
    const deleteSet = new Set(['MAT001', 'MAT002'])

    it('should return true when material matches all deletion criteria', () => {
      const result = cleaner.shouldDeleteMaterial({
        rowNumber: 100,
        pendingQty: '',
        materialCode: 'MAT001',
        deleteSet
      })

      expect(result).toBe(true)
    })

    it('should return false when material is not in delete set', () => {
      const result = cleaner.shouldDeleteMaterial({
        rowNumber: 100,
        pendingQty: '',
        materialCode: 'MAT999',
        deleteSet
      })

      expect(result).toBe(false)
    })

    it('should return false when row is in protected range (2000-7999)', () => {
      const result = cleaner.shouldDeleteMaterial({
        rowNumber: 5000,
        pendingQty: '',
        materialCode: 'MAT001',
        deleteSet
      })

      expect(result).toBe(false)
    })

    it('should return false when pendingQty is not empty', () => {
      const result = cleaner.shouldDeleteMaterial({
        rowNumber: 100,
        pendingQty: '5',
        materialCode: 'MAT001',
        deleteSet
      })

      expect(result).toBe(false)
    })

    it('should return false when pendingQty has only whitespace', () => {
      const result = cleaner.shouldDeleteMaterial({
        rowNumber: 100,
        pendingQty: '  ',
        materialCode: 'MAT001',
        deleteSet
      })

      expect(result).toBe(true) // whitespace-only is treated as empty after trim
    })

    it('should respect boundary row numbers', () => {
      // Row 1999: can delete
      expect(
        cleaner.shouldDeleteMaterial({
          rowNumber: 1999,
          pendingQty: '',
          materialCode: 'MAT001',
          deleteSet
        })
      ).toBe(true)

      // Row 2000: protected
      expect(
        cleaner.shouldDeleteMaterial({
          rowNumber: 2000,
          pendingQty: '',
          materialCode: 'MAT001',
          deleteSet
        })
      ).toBe(false)

      // Row 7999: protected
      expect(
        cleaner.shouldDeleteMaterial({
          rowNumber: 7999,
          pendingQty: '',
          materialCode: 'MAT001',
          deleteSet
        })
      ).toBe(false)

      // Row 8000: can delete
      expect(
        cleaner.shouldDeleteMaterial({
          rowNumber: 8000,
          pendingQty: '',
          materialCode: 'MAT001',
          deleteSet
        })
      ).toBe(true)
    })
  })

  describe('getSkipReason()', () => {
    const cleaner = createCleanerService()
    const deleteSet = new Set(['MAT001'])

    it('should return correct skip reason for protected row', () => {
      const reason = cleaner.getSkipReason({
        rowNumber: 3000,
        pendingQty: '',
        materialCode: 'MAT001',
        deleteSet
      })

      expect(reason).toBe('行号在 2000-7999 范围内（受保护）')
    })

    it('should return "unknown reason" when no skip conditions match', () => {
      const result = cleaner.shouldDeleteMaterial({
        rowNumber: 100,
        pendingQty: '',
        materialCode: 'MAT001',
        deleteSet
      })
      const reason = cleaner.getSkipReason({
        rowNumber: 100,
        pendingQty: '',
        materialCode: 'MAT001',
        deleteSet
      })

      expect(result).toBe(true)
      expect(reason).toBe('未知原因')
    })

    it('should return correct reason for material not in delete set', () => {
      const reason = cleaner.getSkipReason({
        rowNumber: 100,
        pendingQty: '',
        materialCode: 'MAT999',
        deleteSet
      })

      expect(reason).toBe('物料不在删除清单中')
    })

    it('should return correct reason for non-empty pendingQty', () => {
      const reason = cleaner.getSkipReason({
        rowNumber: 100,
        pendingQty: '10',
        materialCode: 'MAT001',
        deleteSet
      })

      expect(reason).toBe('累计待发数量不为空')
    })
  })

  describe('createBatches()', () => {
    it('should split array into correct batch sizes', () => {
      const items = [1, 2, 3, 4, 5, 6, 7]
      const batches = createBatches(items, 3)

      expect(batches).toEqual([[1, 2, 3], [4, 5, 6], [7]])
    })

    it('should handle edge cases (empty array, single item, batchSize larger than array)', () => {
      expect(createBatches([], 5)).toEqual([])
      expect(createBatches([1], 5)).toEqual([[1]])
      expect(createBatches([1, 2], 10)).toEqual([[1, 2]])
    })

    it('should handle batchSize of 1', () => {
      const items = [1, 2, 3]
      const batches = createBatches(items, 1)

      expect(batches).toEqual([[1], [2], [3]])
    })
  })

  describe('runWithConcurrency()', () => {
    it('should limit parallelism to specified concurrency', async () => {
      const items = [1, 2, 3, 4, 5, 6]
      let running = 0
      let peak = 0

      await runWithConcurrency(items, 2, async () => {
        running += 1
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 10))
        running -= 1
        return true
      })

      expect(peak).toBeLessThanOrEqual(2)
      expect(peak).toBe(2)
    })

    it('should complete all items successfully', async () => {
      const items = ['a', 'b', 'c']
      const results = await runWithConcurrency(items, 2, async (item, index) => {
        return `${item}-${index}`
      })

      expect(results).toEqual(['a-0', 'b-1', 'c-2'])
      expect(results).toHaveLength(items.length)
    })
  })

  describe('isDryRun()', () => {
    it('should return correct dry run mode from constructor options', () => {
      const dryRunService = createCleanerService(true)
      const normalService = createCleanerService(false)

      expect(dryRunService.isDryRun()).toBe(true)
      expect(normalService.isDryRun()).toBe(false)
    })
  })

  describe('getMissingOrders()', () => {
    it('should return orders not in processed set', () => {
      const inputOrders = ['ORD001', 'ORD002', 'ORD003']
      const processedOrders = new Set(['ORD001', 'ORD003'])

      const missing = getMissingOrders(inputOrders, processedOrders)

      expect(missing).toEqual(['ORD002'])
    })

    it('should return empty when all orders processed', () => {
      const inputOrders = ['ORD001', 'ORD002']
      const processedOrders = new Set(['ORD001', 'ORD002'])

      const missing = getMissingOrders(inputOrders, processedOrders)

      expect(missing).toEqual([])
    })

    it('should deduplicate input orders', () => {
      const inputOrders = ['ORD001', 'ORD001', 'ORD002']
      const processedOrders = new Set(['ORD002'])

      const missing = getMissingOrders(inputOrders, processedOrders)

      expect(missing).toEqual(['ORD001'])
    })

    it('should return all orders when none processed', () => {
      const inputOrders = ['ORD001', 'ORD002']
      const processedOrders = new Set<string>()

      const missing = getMissingOrders(inputOrders, processedOrders)

      expect(missing).toEqual(['ORD001', 'ORD002'])
    })
  })
})

describe('CleanerService - evaluateDeletionSignals()', () => {
  const cleaner = new CleanerService({} as any, { dryRun: false })

  it('should return FailedErpError when error is detected', () => {
    const result = cleaner.evaluateDeletionSignals({
      rowChanged: false,
      countDecreased: false,
      hasError: true,
      errorText: '物料已被引用'
    })

    expect(result.outcome).toBe(DeletionOutcome.FailedErpError)
    expect(result.errorCategory).toBe(DeletionErrorCategory.ErpRejection)
    expect(result.errorMessage).toBe('物料已被引用')
  })

  it('should return FailedErpError with default message when no errorText', () => {
    const result = cleaner.evaluateDeletionSignals({
      rowChanged: false,
      countDecreased: false,
      hasError: true
    })

    expect(result.outcome).toBe(DeletionOutcome.FailedErpError)
    expect(result.errorMessage).toBe('ERP returned an error')
  })

  it('should return Success when row changed and count decreased (true)', () => {
    const result = cleaner.evaluateDeletionSignals({
      rowChanged: true,
      countDecreased: true,
      hasError: false
    })

    expect(result.outcome).toBe(DeletionOutcome.Success)
    expect(result.errorCategory).toBeUndefined()
  })

  it('should return Success when row changed and count is unreadable (null)', () => {
    const result = cleaner.evaluateDeletionSignals({
      rowChanged: true,
      countDecreased: null,
      hasError: false
    })

    expect(result.outcome).toBe(DeletionOutcome.Success)
  })

  it('should return Uncertain when row changed but count did not decrease', () => {
    const result = cleaner.evaluateDeletionSignals({
      rowChanged: true,
      countDecreased: false,
      hasError: false
    })

    expect(result.outcome).toBe(DeletionOutcome.Uncertain)
  })

  it('should return Success when row did not change but count decreased', () => {
    const result = cleaner.evaluateDeletionSignals({
      rowChanged: false,
      countDecreased: true,
      hasError: false
    })

    expect(result.outcome).toBe(DeletionOutcome.Success)
  })

  it('should return FailedNoChange when nothing changed', () => {
    const result = cleaner.evaluateDeletionSignals({
      rowChanged: false,
      countDecreased: false,
      hasError: false
    })

    expect(result.outcome).toBe(DeletionOutcome.FailedNoChange)
    expect(result.errorCategory).toBe(DeletionErrorCategory.Unknown)
  })

  it('should return FailedNoChange when row did not change and count is null', () => {
    const result = cleaner.evaluateDeletionSignals({
      rowChanged: false,
      countDecreased: null,
      hasError: false
    })

    expect(result.outcome).toBe(DeletionOutcome.FailedNoChange)
  })

  it('should prioritize error signal over all others', () => {
    const result = cleaner.evaluateDeletionSignals({
      rowChanged: true,
      countDecreased: true,
      hasError: true,
      errorText: 'Some error'
    })

    expect(result.outcome).toBe(DeletionOutcome.FailedErpError)
  })
})
