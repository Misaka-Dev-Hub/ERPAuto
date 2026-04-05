import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ValidationApplicationService } from '../../../../src/main/services/validation/validation-application-service'
import type { ValidationRequest } from '../../../../src/main/types/validation.types'

// ─── Mock logger to prevent real winston initialization and console noise ───
vi.mock('../../../../src/main/services/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }),
  withRequestContext: (_fn: () => Promise<any>) => _fn(),
  trackDuration: async <T>(fn: () => Promise<T>) => {
    const result = await fn()
    return { result, durationMs: 0, isSlow: false }
  },
  getRequestId: () => undefined
}))

// ─── DAO mock state ───
let returnEmptyMaterials = false
let materialRecords: any[] = [
  { MaterialName: 'MatA', MaterialCode: 'M1', Model: 'Mod', Specification: 'Spec' }
]
let filteredMaterialRecords: any[] = [
  { MaterialName: 'FilteredMat', MaterialCode: 'MF1', Model: 'FMod', Specification: 'FSpec' }
]

vi.mock('../../../../src/main/services/database/discrete-material-plan-dao', () => {
  return {
    DiscreteMaterialPlanDAO: class {
      async queryAllDistinctByMaterialCode() {
        if (returnEmptyMaterials) return []
        return materialRecords
      }
      async queryBySourceNumbersDistinct(_nums: string[]) {
        if (returnEmptyMaterials) return []
        return filteredMaterialRecords
      }
    }
  }
})

// ─── MaterialsToBeDeletedDAO mock state ───
let materialsByManagerResult: any[] = []
let allMaterialsResult: any[] = []
let allMaterialCodesResult: Set<string> = new Set()

vi.mock('../../../../src/main/services/database/materials-to-be-deleted-dao', () => {
  return {
    MaterialsToBeDeletedDAO: class {
      async getMaterialsByManager(_managerName: string) {
        return materialsByManagerResult
      }
      async getAllRecords() {
        return allMaterialsResult
      }
      async getAllMaterialCodes() {
        return allMaterialCodesResult
      }
    }
  }
})

// ─── Production input service mock ───
let sourceNumbersFromInputs: string[] = ['SC001', 'SC002']

vi.mock('../../../../src/main/services/validation/production-input-service', () => ({
  getSourceNumbersFromInputs: vi.fn().mockImplementation(async () => sourceNumbersFromInputs),
  readProductionIds: vi.fn().mockReturnValue(['PROD001', 'PROD002'])
}))

// ─── Shared production IDs store mock ───
let sharedIds: string[] = []

vi.mock('../../../../src/main/services/validation/shared-production-ids-store', () => ({
  sharedProductionIdsStore: {
    get: (_senderId: number) => sharedIds
  }
}))

// ─── Validation database mock with robust SQL matching ───
function matchQuery(sql: string): string {
  // Extract table name from FROM clause to avoid substring ambiguity
  const fromMatch = sql.match(/FROM\s+(\S+)/i)
  const table = fromMatch?.[1] ?? ''

  if (/MaterialsTypeToBeDeleted/i.test(table)) return 'typeKeywords'
  if (/MaterialsToBeDeleted/i.test(table)) return 'markedCodes'
  if (/DiscreteMaterialPlanData/i.test(table)) return 'materialDetail'
  return 'unknown'
}

vi.mock('../../../../src/main/services/validation/validation-database', () => ({
  createValidationDatabaseService: vi.fn().mockImplementation(async () => ({
    type: 'mysql' as const,
    query: vi.fn().mockImplementation((sql: string) => {
      const kind = matchQuery(sql)
      switch (kind) {
        case 'typeKeywords':
          return Promise.resolve({
            rows: [{ MaterialName: 'MatA', ManagerName: 'Mgr' }],
            rowCount: 1
          })
        case 'markedCodes':
          return Promise.resolve({
            rows: [{ MaterialCode: 'M1', ManagerName: 'Mgr' }],
            rowCount: 1
          })
        case 'materialDetail':
          return Promise.resolve({
            rows: [{ MaterialName: 'MatA', Specification: 'Spec', Model: 'Mod' }],
            rowCount: 1
          })
        default:
          return Promise.resolve({ rows: [], rowCount: 0 })
      }
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined)
  })),
  getValidationTableName: vi.fn().mockImplementation((name: string) => name)
}))

describe('ValidationApplicationService', () => {
  let service: ValidationApplicationService

  beforeEach(() => {
    returnEmptyMaterials = false
    materialRecords = [
      { MaterialName: 'MatA', MaterialCode: 'M1', Model: 'Mod', Specification: 'Spec' }
    ]
    filteredMaterialRecords = [
      { MaterialName: 'FilteredMat', MaterialCode: 'MF1', Model: 'FMod', Specification: 'FSpec' }
    ]
    materialsByManagerResult = [
      { materialCode: 'M1', managerName: 'Mgr' }
    ]
    allMaterialsResult = [
      { materialCode: 'M1', managerName: 'Mgr' },
      { materialCode: 'M2', managerName: 'Other' }
    ]
    allMaterialCodesResult = new Set(['M1'])
    sourceNumbersFromInputs = ['SC001', 'SC002']
    sharedIds = []
    service = new ValidationApplicationService()
  })

  // ─── validate – database_full mode ───
  describe('validate – database_full mode', () => {
    it('should return success with results for admin user', async () => {
      const req: ValidationRequest = { mode: 'database_full' }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any
      const res = await service.validate(req, userInfo, 1)
      expect(res.success).toBe(true)
      expect(res.results).toBeDefined()
      expect(res.stats).toBeDefined()
      expect(res.stats!.totalRecords).toBe(1)
    })

    it('should return success for regular user', async () => {
      const req: ValidationRequest = { mode: 'database_full' }
      const userInfo = { id: 2, username: 'guest', userType: 'User' } as any
      const res = await service.validate(req, userInfo, 2)
      expect(res.success).toBe(true)
      expect(res.results).toBeDefined()
    })

    it('should return failure when material records are empty', async () => {
      returnEmptyMaterials = true
      const req: ValidationRequest = { mode: 'database_full' }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any
      const res = await service.validate(req, userInfo, 1)
      expect(res.success).toBe(false)
      expect(res.error).toContain('未找到物料记录')
    })

    it('should correctly compute stats for matched and marked records', async () => {
      materialRecords = [
        { MaterialName: 'MatA', MaterialCode: 'M1', Model: 'Mod', Specification: 'Spec' },
        { MaterialName: 'Other', MaterialCode: 'M2', Model: 'Mod', Specification: 'Spec' }
      ]
      const req: ValidationRequest = { mode: 'database_full' }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any
      const res = await service.validate(req, userInfo, 1)

      expect(res.success).toBe(true)
      expect(res.stats!.totalRecords).toBe(2)
      // M1 is in markedCodes → isMarkedForDeletion=true, managerName='Mgr'
      const m1Result = res.results!.find((r) => r.materialCode === 'M1')
      expect(m1Result?.isMarkedForDeletion).toBe(true)
      expect(m1Result?.managerName).toBe('Mgr')
      // M2 is NOT in markedCodes but 'Other' doesn't match any type keyword
      const m2Result = res.results!.find((r) => r.materialCode === 'M2')
      expect(m2Result?.isMarkedForDeletion).toBe(false)
    })

    it('should match type keywords when material name contains keyword', async () => {
      materialRecords = [
        { MaterialName: 'MatA-Extra', MaterialCode: 'MX1', Model: 'Mod', Specification: 'Spec' }
      ]
      const req: ValidationRequest = { mode: 'database_full' }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any
      const res = await service.validate(req, userInfo, 1)

      expect(res.success).toBe(true)
      // 'MatA-Extra' contains 'MatA' which is a type keyword → matched
      expect(res.results![0].matchedTypeKeyword).toBe('MatA')
      expect(res.results![0].managerName).toBe('Mgr')
    })
  })

  // ─── validate – database_filtered with shared production IDs ───
  describe('validate – database_filtered with shared IDs', () => {
    it('should return success when shared IDs resolve to orders', async () => {
      sharedIds = ['PROD001']
      const req: ValidationRequest = { mode: 'database_filtered', useSharedProductionIds: true }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const res = await service.validate(req, userInfo, 1)

      expect(res.success).toBe(true)
      expect(res.results).toBeDefined()
      expect(res.results!.length).toBeGreaterThan(0)
    })

    it('should return failure when shared IDs are empty', async () => {
      sharedIds = []
      const req: ValidationRequest = { mode: 'database_filtered', useSharedProductionIds: true }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const res = await service.validate(req, userInfo, 1)

      expect(res.success).toBe(false)
      expect(res.error).toContain('共享')
    })

    it('should return failure when shared IDs yield no source numbers', async () => {
      sharedIds = ['PROD001']
      sourceNumbersFromInputs = []
      const req: ValidationRequest = { mode: 'database_filtered', useSharedProductionIds: true }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const res = await service.validate(req, userInfo, 1)

      expect(res.success).toBe(false)
      expect(res.error).toContain('共享')
    })
  })

  // ─── validate – database_filtered with production ID file ───
  describe('validate – database_filtered with file', () => {
    it('should return success when file IDs resolve to orders', async () => {
      const req: ValidationRequest = {
        mode: 'database_filtered',
        productionIdFile: '/tmp/ids.txt'
      }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const res = await service.validate(req, userInfo, 1)

      expect(res.success).toBe(true)
      expect(res.results).toBeDefined()
    })

    it('should return failure when file IDs yield no source numbers', async () => {
      sourceNumbersFromInputs = []
      const req: ValidationRequest = {
        mode: 'database_filtered',
        productionIdFile: '/tmp/ids.txt'
      }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const res = await service.validate(req, userInfo, 1)

      expect(res.success).toBe(false)
      expect(res.error).toContain('文件')
    })
  })

  // ─── getMaterialsByManager ───
  describe('getMaterialsByManager', () => {
    it('should return enriched materials for a manager', async () => {
      const result = await service.getMaterialsByManager('Mgr')

      expect(result).toBeDefined()
      expect(result.length).toBe(1)
      expect(result[0].materialCode).toBe('M1')
      expect(result[0].materialName).toBe('MatA')
      expect(result[0].isMarked).toBe(true) // M1 is in allMaterialCodesResult
    })

    it('should return empty array when manager has no materials', async () => {
      materialsByManagerResult = []

      const result = await service.getMaterialsByManager('Nobody')

      expect(result).toEqual([])
    })
  })

  // ─── getAllMaterials ───
  describe('getAllMaterials', () => {
    it('should return all enriched materials', async () => {
      const result = await service.getAllMaterials()

      expect(result).toBeDefined()
      expect(result.length).toBe(2)
      expect(result[0].materialCode).toBe('M1')
      expect(result[0].isMarked).toBe(true)
      expect(result[1].materialCode).toBe('M2')
      expect(result[1].isMarked).toBe(false) // M2 not in allMaterialCodesResult
    })

    it('should return empty array when no materials exist', async () => {
      allMaterialsResult = []

      const result = await service.getAllMaterials()

      expect(result).toEqual([])
    })
  })

  // ─── getCleanerData ───
  describe('getCleanerData', () => {
    it('should return order numbers and material codes for admin user', async () => {
      sharedIds = ['PROD001']
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const result = await service.getCleanerData(userInfo, 1)

      expect(result.success).toBe(true)
      expect(result.orderNumbers).toBeDefined()
      expect(result.orderNumbers!.length).toBeGreaterThan(0)
      expect(result.materialCodes).toBeDefined()
    })

    it('should return empty order numbers when no shared IDs', async () => {
      sharedIds = []
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const result = await service.getCleanerData(userInfo, 1)

      expect(result.success).toBe(true)
      expect(result.orderNumbers).toEqual([])
    })

    it('should handle errors gracefully', async () => {
      const { createValidationDatabaseService } = await import('../../../../src/main/services/validation/validation-database')
      vi.mocked(createValidationDatabaseService).mockRejectedValueOnce(new Error('DB down'))

      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any
      const result = await service.getCleanerData(userInfo, 1)

      expect(result.success).toBe(false)
      expect(result.error).toContain('DB down')
    })
  })
})
