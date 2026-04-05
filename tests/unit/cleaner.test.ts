import { describe, it, expect } from 'vitest'
import {
  CleanerService,
  createBatches,
  getMissingOrders,
  runWithConcurrency
} from '../../src/main/services/erp/cleaner'

describe('Cleaner Service (Unit)', () => {
  describe('shouldDeleteMaterial', () => {
    // CleanerService constructor requires ErpAuthService, but shouldDeleteMaterial doesn't use it
    const cleaner = new CleanerService({} as any)

    it('should skip materials with row number 2000-7999', () => {
      const testCases = [
        { rowNumber: 2000, pendingQty: '', materialCode: 'TEST001', expected: false },
        { rowNumber: 5000, pendingQty: '', materialCode: 'TEST001', expected: false },
        { rowNumber: 7999, pendingQty: '', materialCode: 'TEST001', expected: false },
        { rowNumber: 1999, pendingQty: '', materialCode: 'TEST001', expected: true },
        { rowNumber: 8000, pendingQty: '', materialCode: 'TEST001', expected: true }
      ]

      for (const tc of testCases) {
        const shouldDelete = cleaner.shouldDeleteMaterial({
          rowNumber: tc.rowNumber,
          pendingQty: tc.pendingQty,
          materialCode: tc.materialCode,
          deleteSet: new Set(['TEST001'])
        })
        expect(shouldDelete).toBe(tc.expected)
      }
    })

    it('should skip materials with non-empty pending quantity', () => {
      const result = cleaner.shouldDeleteMaterial({
        rowNumber: 100,
        pendingQty: '5',
        materialCode: 'TEST001',
        deleteSet: new Set(['TEST001'])
      })

      expect(result).toBe(false)
    })

    it('should skip materials not in delete list', () => {
      const result = cleaner.shouldDeleteMaterial({
        rowNumber: 100,
        pendingQty: '',
        materialCode: 'NOT_IN_LIST',
        deleteSet: new Set(['TEST001'])
      })

      expect(result).toBe(false)
    })

    it('should delete materials with empty pending qty and valid row number', () => {
      const testCases = [
        { rowNumber: 1, pendingQty: '', materialCode: 'TEST001', expected: true },
        { rowNumber: 100, pendingQty: '', materialCode: 'TEST001', expected: true },
        { rowNumber: 1999, pendingQty: '', materialCode: 'TEST001', expected: true },
        { rowNumber: 8000, pendingQty: '', materialCode: 'TEST001', expected: true },
        { rowNumber: 10000, pendingQty: '', materialCode: 'TEST001', expected: true }
      ]

      for (const tc of testCases) {
        const shouldDelete = cleaner.shouldDeleteMaterial({
          rowNumber: tc.rowNumber,
          pendingQty: tc.pendingQty,
          materialCode: tc.materialCode,
          deleteSet: new Set(['TEST001'])
        })
        expect(shouldDelete).toBe(tc.expected)
      }
    })

    it('should handle multiple conditions correctly', () => {
      // Material in list, valid row, no pending qty = should delete
      expect(
        cleaner.shouldDeleteMaterial({
          rowNumber: 100,
          pendingQty: '',
          materialCode: 'TEST001',
          deleteSet: new Set(['TEST001'])
        })
      ).toBe(true)

      // Material in list, protected row, no pending qty = should NOT delete
      expect(
        cleaner.shouldDeleteMaterial({
          rowNumber: 7500,
          pendingQty: '',
          materialCode: 'TEST001',
          deleteSet: new Set(['TEST001'])
        })
      ).toBe(false)

      // Material in list, valid row, has pending qty = should NOT delete
      expect(
        cleaner.shouldDeleteMaterial({
          rowNumber: 100,
          pendingQty: '10',
          materialCode: 'TEST001',
          deleteSet: new Set(['TEST001'])
        })
      ).toBe(false)

      // Material NOT in list = should NOT delete
      expect(
        cleaner.shouldDeleteMaterial({
          rowNumber: 100,
          pendingQty: '',
          materialCode: 'OTHER',
          deleteSet: new Set(['TEST001'])
        })
      ).toBe(false)
    })
  })

  describe('batch and concurrency helpers', () => {
    it('should split orders into batches', () => {
      const batches = createBatches(['A', 'B', 'C', 'D', 'E'], 2)
      expect(batches).toEqual([['A', 'B'], ['C', 'D'], ['E']])
    })

    it('should identify missing orders', () => {
      const missing = getMissingOrders(['SC1', 'SC2', 'SC3'], new Set(['SC1', 'SC3']))
      expect(missing).toEqual(['SC2'])
    })

    it('should respect concurrency limit', async () => {
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
    })
  })
})
