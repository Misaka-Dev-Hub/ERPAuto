import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CleanerApplicationService } from '../../../../src/main/services/cleaner/cleaner-application-service'
import { CleanerOperationHistoryDAO } from '../../../../src/main/services/database/cleaner-operation-history-dao'

// Mock 所有依赖
vi.mock('../../../../src/main/services/config/config-manager', () => ({
  ConfigManager: {
    getInstance: () => ({
      getDatabaseType: () => 'mysql',
      getConfig: () => ({ database: { activeType: 'mysql' } })
    })
  }
}))

vi.mock('../../../../src/main/services/erp/order-resolver', () => ({
  OrderNumberResolver: class {
    constructor(_dbService: any) {}
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
}))

let mockInsertedMaterials: any[] = []

vi.mock('../../../../src/main/services/erp/cleaner', () => ({
  CleanerService: class {
    constructor(_erpAuth: any) {}
    async clean(input: any) {
      // 模拟一个订单有 deleted 和 skipped 物料
      return {
        ordersProcessed: 1,
        materialsDeleted: 1,
        materialsSkipped: 1,
        materialsFailed: 0,
        uncertainDeletions: 0,
        errors: [],
        details: [
          {
            orderNumber: 'SC70202604080195',
            materialsDeleted: 1,
            materialsSkipped: 1,
            materialsFailed: 0,
            uncertainDeletions: 0,
            errors: [],
            deletedMaterials: [
              {
                materialCode: 'MAT001',
                materialName: '测试物料 1',
                rowNumber: 10,
                outcome: 'success'
              }
            ],
            skippedMaterials: [
              {
                materialCode: 'MAT002',
                materialName: '测试物料 2',
                rowNumber: 2500,
                reason: '行号在 2000-7999 范围内（受保护）'
              }
            ],
            failedMaterials: [],
            retryCount: 0,
            retrySuccess: false
          }
        ],
        retriedOrders: 0,
        successfulRetries: 0,
        crashed: false
      } as any
    }
  }
}))

vi.mock('../../../../src/main/services/erp/erp-auth', () => ({
  ErpAuthService: class {
    constructor(_config: any) {}
    async login() {
      return Promise.resolve(undefined)
    }
    async close() {
      return Promise.resolve(undefined)
    }
  }
}))

vi.mock('../../../../src/main/services/database/cleaner-operation-history-dao', () => ({
  CleanerOperationHistoryDAO: class {
    async getBatchDetails(batchId: string) {
      return { executions: [{ attemptNumber: 1, isDryRun: false }], orders: [] }
    }
    async insertExecution(input: any) {
      return true
    }
    async insertOrderRecords(batchId: string, attemptNumber: number, orders: any[]) {
      return true
    }
    async updateOrderStatus(
      batchId: string,
      attemptNumber: number,
      orderNumber: string,
      status: string,
      materialsDeleted: number,
      materialsSkipped: number,
      materialsFailed: number,
      uncertainDeletions: number,
      retryCount: number,
      retrySuccess: boolean,
      errorMessage?: string
    ) {
      return true
    }
    async insertMaterialDetails(batchId: string, attemptNumber: number, details: any[]) {
      mockInsertedMaterials = [...details]
      return true
    }
    async updateExecutionStatus(
      batchId: string,
      attemptNumber: number,
      status: string,
      ordersProcessed: number,
      materialsDeleted: number,
      materialsSkipped: number,
      materialsFailed: number,
      uncertainDeletions: number,
      endTime: Date,
      errorMessage?: string
    ) {
      return true
    }
  }
}))

vi.mock('../../../../src/main/services/logger/audit-logger', () => ({
  logAuditWithCurrentUser: () => {}
}))

vi.mock('../../../../src/main/services/user/session-manager', () => ({
  SessionManager: {
    getInstance: () => ({
      getUserInfo: () => ({ id: 1, username: 'test' })
    })
  }
}))

function setupServiceMocks(service: CleanerApplicationService) {
  ;(service as any).getErpConfig = vi
    .fn()
    .mockResolvedValue({ url: 'http://erp', username: 'u', password: 'p' })
  ;(service as any).getDatabaseService = vi.fn().mockResolvedValue({ disconnect: vi.fn() })
  ;(service as any).recordCleanupAudit = vi.fn()
}

function makeInput(overrides: any = {}) {
  return {
    orderNumbers: ['SC70202604080195'],
    materialCodes: ['MAT001', 'MAT002'],
    dryRun: false,
    queryBatchSize: 100,
    processConcurrency: 1,
    onProgress: vi.fn(),
    ...overrides
  }
}

describe('CleanerApplicationService - Skipped Materials', () => {
  let service: CleanerApplicationService
  let historyDao: CleanerOperationHistoryDAO

  beforeEach(() => {
    service = new CleanerApplicationService()
    historyDao = new CleanerOperationHistoryDAO()
    mockInsertedMaterials = []
    setupServiceMocks(service)
  })

  it('should save skipped materials to database', async () => {
    const eventSender: any = { send: vi.fn() }
    const result = await service.runCleaner(
      eventSender,
      makeInput(),
      'TEST-BATCH',
      historyDao,
      '1.0.0'
    )

    expect(result.materialsSkipped).toBe(1)
    expect(mockInsertedMaterials.length).toBe(2) // 1 deleted + 1 skipped

    const skippedMaterial = mockInsertedMaterials.find((m) => m.result === 'skipped')
    expect(skippedMaterial).toBeDefined()
    expect(skippedMaterial!.materialCode).toBe('MAT002')
    expect(skippedMaterial!.materialName).toBe('测试物料 2')
    expect(skippedMaterial!.rowNumber).toBe(2500)
    expect(skippedMaterial!.reason).toBe('行号在 2000-7999 范围内（受保护）')
  })
})
