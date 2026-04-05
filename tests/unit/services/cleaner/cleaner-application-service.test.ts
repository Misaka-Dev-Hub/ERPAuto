import { describe, it, expect, beforeEach, vi } from 'vitest'

import { CleanerApplicationService } from '../../../../src/main/services/cleaner/cleaner-application-service'
import {
  ValidationError,
  ErpConnectionError,
  DatabaseQueryError
} from '../../../../src/main/types/errors'

// Mock ConfigManager to avoid "Configuration not initialized" errors in tests
vi.mock('../../../../src/main/services/config/config-manager', () => {
  return {
    ConfigManager: {
      getInstance: () => ({
        getDatabaseType: () => 'mysql',
        getConfig: () => ({ database: { activeType: 'mysql' } })
      })
    }
  }
})

// Mock the OrderResolver to avoid real DB interactions
vi.mock('../../../../src/main/services/erp/order-resolver', () => {
  return {
    OrderNumberResolver: class {
      constructor(_dbService: any) {} // eslint-disable-line @typescript-eslint/no-empty-function
      async resolve(orderNumbers: string[]) {
        return orderNumbers
      }
      getValidOrderNumbers(mappings: string[]) {
        return mappings
      }
      getWarnings(_mappings: any[]) {
        return []
      }
    }
  }
})

// Control whether CleanerService.clean should throw
let cleanerShouldThrow = false
let cleanerError: Error = new Error('cleaner crashed')

// Capture last input passed to CleanerService.clean for assertions
let lastCleanerInput: any = null
vi.mock('../../../../src/main/services/erp/cleaner', () => {
  return {
    CleanerService: class {
      constructor(_erpAuth: any) {
        this.clean = vi.fn(async (input: any) => {
          if (cleanerShouldThrow) throw cleanerError
          lastCleanerInput = input
          const count = input?.orderNumbers?.length ?? 0
          const isDryRun = input?.dryRun ?? false
          return {
            ordersProcessed: count,
            materialsDeleted: isDryRun ? 0 : count,
            materialsSkipped: 0,
            errors: [],
            details: []
          } as any
        })
      }
      clean: any
    }
  }
})

// Capture close calls on ErpAuthService
let erpAuthCloseCalled = false
vi.mock('../../../../src/main/services/erp/erp-auth', () => {
  return {
    ErpAuthService: class {
      constructor(_config: any) {} // eslint-disable-line @typescript-eslint/no-empty-function
      async login() {
        return Promise.resolve(undefined)
      }
      async close() {
        erpAuthCloseCalled = true
        return Promise.resolve(undefined)
      }
    }
  }
})

// Mock ResultExporter for exportResults tests
vi.mock('../../../../src/main/services/excel/result-exporter', () => {
  return {
    ResultExporter: class {
      async exportValidationResults(items: any[]) {
        return {
          success: true,
          filePath: '/tmp/exported.xlsx',
          recordCount: items.length
        }
      }
    }
  }
})

// Helper to set up common method mocks for a service instance
function setupServiceMocks(service: CleanerApplicationService) {
  ;(service as any).getErpConfig = vi
    .fn()
    .mockResolvedValue({ url: 'http://erp', username: 'u', password: 'p' })
  ;(service as any).getDatabaseService = vi.fn().mockResolvedValue({
    disconnect: vi.fn().mockResolvedValue(undefined)
  })
  ;(service as any).recordCleanupAudit = vi.fn().mockResolvedValue(undefined)
  ;(service as any).generateAndUploadReport = vi.fn().mockResolvedValue(undefined)
}

function makeInput(overrides: Record<string, any> = {}) {
  return {
    orderNumbers: ['SC1', 'SC2'],
    materialCodes: [],
    dryRun: false,
    queryBatchSize: 100,
    processConcurrency: 1,
    onProgress: vi.fn(),
    ...overrides
  }
}

describe('CleanerApplicationService', () => {
  let service: CleanerApplicationService

  beforeEach(() => {
    service = new CleanerApplicationService()
    lastCleanerInput = null
    erpAuthCloseCalled = false
    cleanerShouldThrow = false
    cleanerError = new Error('cleaner crashed')
    setupServiceMocks(service)
  })

  describe('runCleaner', () => {
    it('should process orders and return results', async () => {
      const eventSender: any = { send: vi.fn() }

      const result = await service.runCleaner(eventSender, makeInput())

      expect(result.ordersProcessed).toBe(2)
      expect(result.materialsDeleted).toBe(2)
    })

    it('should pass dryRun=true to CleanerService and report zero deletions', async () => {
      const eventSender: any = { send: vi.fn() }

      const result = await service.runCleaner(eventSender, makeInput({ dryRun: true }))

      expect(result.ordersProcessed).toBe(2)
      expect(result.materialsDeleted).toBe(0)
      expect(lastCleanerInput?.dryRun).toBe(true)
    })

    it('should increase materialsDeleted when dryRun is false vs true', async () => {
      const eventSender: any = { send: vi.fn() }

      const resDry = await service.runCleaner(
        eventSender,
        makeInput({ dryRun: true, orderNumbers: ['SC1', 'SC2', 'SC3'] })
      )
      expect(resDry.materialsDeleted).toBe(0)

      const resActual = await service.runCleaner(
        eventSender,
        makeInput({ dryRun: false, orderNumbers: ['SC1', 'SC2', 'SC3'] })
      )
      expect(resActual.materialsDeleted).toBe(3)
      expect(lastCleanerInput?.dryRun).toBe(false)
    })

    it('should handle different order counts independently across invocations', async () => {
      const eventSender: any = { send: vi.fn() }

      const res1 = await service.runCleaner(
        eventSender,
        makeInput({ orderNumbers: ['SC1', 'SC2'] })
      )
      expect(res1.ordersProcessed).toBe(2)

      const res2 = await service.runCleaner(eventSender, makeInput({ orderNumbers: ['SC3'] }))
      expect(res2.ordersProcessed).toBe(1)
    })

    it('should reject when ERP config fetch fails', async () => {
      ;(service as any).getErpConfig = vi.fn().mockRejectedValue(new Error('ERP config error'))

      await expect(service.runCleaner({ send: vi.fn() } as any, makeInput())).rejects.toThrow(
        'ERP config error'
      )
    })

    it('should reject with DatabaseQueryError when database connection fails', async () => {
      ;(service as any).getErpConfig = vi
        .fn()
        .mockResolvedValue({ url: 'u', username: 'x', password: 'p' })
      ;(service as any).getDatabaseService = vi.fn().mockRejectedValue(new Error('DB fail'))

      const { DatabaseQueryError } = await import('../../../../src/main/types/errors')
      await expect(
        service.runCleaner({ send: vi.fn() } as any, makeInput())
      ).rejects.toBeInstanceOf(DatabaseQueryError)
    })

    it('should reject with ValidationError when no valid order numbers are provided', async () => {
      ;(service as any).getErpConfig = vi
        .fn()
        .mockResolvedValue({ url: 'u', username: 'x', password: 'p' })
      ;(service as any).getDatabaseService = vi.fn().mockResolvedValue({
        disconnect: vi.fn().mockResolvedValue(undefined)
      })

      await expect(
        service.runCleaner({ send: vi.fn() } as any, makeInput({ orderNumbers: [] }))
      ).rejects.toThrow('没有有效的生产订单号可处理')
    })

    it('should process orders containing empty strings without crashing', async () => {
      const eventSender: any = { send: vi.fn() }

      const result = await service.runCleaner(eventSender, makeInput({ orderNumbers: ['', 'SC2'] }))
      expect(result.ordersProcessed).toBe(2)
    })

    it('should handle processConcurrency=0 gracefully', async () => {
      const eventSender: any = { send: vi.fn() }

      const result = await service.runCleaner(
        eventSender,
        makeInput({
          orderNumbers: ['SC1'],
          processConcurrency: 0
        })
      )
      expect(result.ordersProcessed).toBe(1)
    })

    it('should close ERP browser on success', async () => {
      await service.runCleaner({ send: vi.fn() } as any, makeInput())

      expect(erpAuthCloseCalled).toBe(true)
    })

    it('should close ERP browser even when cleaner throws', async () => {
      erpAuthCloseCalled = false
      cleanerShouldThrow = true
      cleanerError = new Error('cleaner crashed')

      await expect(service.runCleaner({ send: vi.fn() } as any, makeInput())).rejects.toThrow(
        'cleaner crashed'
      )

      expect(erpAuthCloseCalled).toBe(true)
    })

    it('should disconnect database after successful run', async () => {
      const mockDisconnect = vi.fn().mockResolvedValue(undefined)
      ;(service as any).getErpConfig = vi
        .fn()
        .mockResolvedValue({ url: 'u', username: 'x', password: 'p' })
      ;(service as any).getDatabaseService = vi.fn().mockResolvedValue({
        disconnect: mockDisconnect
      })
      ;(service as any).recordCleanupAudit = vi.fn().mockResolvedValue(undefined)
      ;(service as any).generateAndUploadReport = vi.fn().mockResolvedValue(undefined)

      await service.runCleaner({ send: vi.fn() } as any, makeInput())

      expect(mockDisconnect).toHaveBeenCalled()
    })

    it('should disconnect database even when cleaner throws', async () => {
      const mockDisconnect = vi.fn().mockResolvedValue(undefined)
      ;(service as any).getErpConfig = vi
        .fn()
        .mockResolvedValue({ url: 'u', username: 'x', password: 'p' })
      ;(service as any).getDatabaseService = vi.fn().mockResolvedValue({
        disconnect: mockDisconnect
      })

      cleanerShouldThrow = true
      cleanerError = new Error('boom')

      await expect(service.runCleaner({ send: vi.fn() } as any, makeInput())).rejects.toThrow(
        'boom'
      )

      expect(mockDisconnect).toHaveBeenCalled()
    })
  })

  describe('exportResults', () => {
    it('should export results successfully for non-empty items', async () => {
      const items = [
        {
          materialCode: 'M1',
          materialName: 'Mat A',
          specification: '',
          model: '',
          managerName: 'Mgr',
          isMarkedForDeletion: false,
          isSelected: true
        },
        {
          materialCode: 'M2',
          materialName: 'Mat B',
          specification: '',
          model: '',
          managerName: 'Mgr',
          isMarkedForDeletion: true,
          isSelected: false
        }
      ]

      const result = await service.exportResults(items as any)

      expect(result.success).toBe(true)
      expect(result.filePath).toBeDefined()
    })

    it('should throw ValidationError when items array is empty', async () => {
      await expect(service.exportResults([])).rejects.toThrow('没有数据可导出')
    })

    it('should throw when items is null/undefined', async () => {
      // Source accesses items.length before null guard, so TypeError is expected
      await expect(service.exportResults(null as any)).rejects.toThrow()
      await expect(service.exportResults(undefined as any)).rejects.toThrow()
    })
  })
})
