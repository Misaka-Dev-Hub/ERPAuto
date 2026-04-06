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

// ─── Hoisted mock functions shared between vi.mock() factories and tests ───
const {
  mockQueryAll,
  mockQueryBySource,
  mockGetMaterialsByManager,
  mockGetAllRecords,
  mockGetAllMaterialCodes,
  mockGetSourceNumbers,
  mockReadProductionIds,
  mockSharedIdsGet,
  mockDbQuery,
  mockDbDisconnect,
  mockCreateDbService
} = vi.hoisted(() => ({
  mockQueryAll: vi.fn(),
  mockQueryBySource: vi.fn(),
  mockGetMaterialsByManager: vi.fn(),
  mockGetAllRecords: vi.fn(),
  mockGetAllMaterialCodes: vi.fn(),
  mockGetSourceNumbers: vi.fn(),
  mockReadProductionIds: vi.fn(),
  mockSharedIdsGet: vi.fn(),
  mockDbQuery: vi.fn(),
  mockDbDisconnect: vi.fn(),
  mockCreateDbService: vi.fn()
}))

// ─── DiscreteMaterialPlanDAO mock ───
vi.mock('../../../../src/main/services/database/discrete-material-plan-dao', () => ({
  DiscreteMaterialPlanDAO: class {
    queryAllDistinctByMaterialCode = mockQueryAll
    queryBySourceNumbersDistinct = mockQueryBySource
  }
}))

// ─── MaterialsToBeDeletedDAO mock ───
vi.mock('../../../../src/main/services/database/materials-to-be-deleted-dao', () => ({
  MaterialsToBeDeletedDAO: class {
    getMaterialsByManager = mockGetMaterialsByManager
    getAllRecords = mockGetAllRecords
    getAllMaterialCodes = mockGetAllMaterialCodes
  }
}))

// ─── Production input service mock ───
vi.mock('../../../../src/main/services/validation/production-input-service', () => ({
  getSourceNumbersFromInputs: mockGetSourceNumbers,
  readProductionIds: mockReadProductionIds
}))

// ─── Shared production IDs store mock ───
vi.mock('../../../../src/main/services/validation/shared-production-ids-store', () => ({
  sharedProductionIdsStore: {
    get: mockSharedIdsGet
  }
}))

// ─── Validation database mock ───
vi.mock('../../../../src/main/services/validation/validation-database', () => ({
  createValidationDatabaseService: mockCreateDbService,
  getValidationTableName: vi.fn().mockImplementation((name: string) => name)
}))

function createDbService() {
  return {
    type: 'mysql' as const,
    query: mockDbQuery,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: mockDbDisconnect
  }
}

describe('ValidationApplicationService', () => {
  let service: ValidationApplicationService

  beforeEach(() => {
    vi.clearAllMocks()

    // DiscreteMaterialPlanDAO defaults
    mockQueryAll.mockResolvedValue([
      { MaterialName: 'MatA', MaterialCode: 'M1', Model: 'Mod', Specification: 'Spec' }
    ])
    mockQueryBySource.mockResolvedValue([
      { MaterialName: 'FilteredMat', MaterialCode: 'MF1', Model: 'FMod', Specification: 'FSpec' }
    ])

    // MaterialsToBeDeletedDAO defaults
    mockGetMaterialsByManager.mockResolvedValue([{ materialCode: 'M1', managerName: 'Mgr' }])
    mockGetAllRecords.mockResolvedValue([
      { materialCode: 'M1', managerName: 'Mgr' },
      { materialCode: 'M2', managerName: 'Other' }
    ])
    mockGetAllMaterialCodes.mockResolvedValue(new Set(['M1']))

    // Production input defaults
    mockGetSourceNumbers.mockResolvedValue(['SC001', 'SC002'])
    mockReadProductionIds.mockReturnValue(['PROD001', 'PROD002'])

    // Shared IDs default: empty
    mockSharedIdsGet.mockReturnValue([])

    // DB service creation
    mockCreateDbService.mockImplementation(async () => createDbService())
    mockDbDisconnect.mockResolvedValue(undefined)

    // DB query dispatches by table name extracted from SQL
    mockDbQuery.mockImplementation((sql: string) => {
      const table = sql.match(/FROM\s+(\S+)/i)?.[1] ?? ''
      if (/MaterialsTypeToBeDeleted/i.test(table))
        return Promise.resolve({
          rows: [{ MaterialName: 'MatA', ManagerName: 'Mgr' }],
          rowCount: 1
        })
      if (/MaterialsToBeDeleted/i.test(table))
        return Promise.resolve({
          rows: [{ MaterialCode: 'M1', ManagerName: 'Mgr' }],
          rowCount: 1
        })
      if (/DiscreteMaterialPlanData/i.test(table))
        return Promise.resolve({
          rows: [{ MaterialName: 'MatA', Specification: 'Spec', Model: 'Mod' }],
          rowCount: 1
        })
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

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
      mockQueryAll.mockResolvedValueOnce([])
      const req: ValidationRequest = { mode: 'database_full' }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any
      const res = await service.validate(req, userInfo, 1)
      expect(res.success).toBe(false)
      expect(res.error).toContain('未找到物料记录')
    })

    it('should correctly compute stats for matched and marked records', async () => {
      mockQueryAll.mockResolvedValueOnce([
        { MaterialName: 'MatA', MaterialCode: 'M1', Model: 'Mod', Specification: 'Spec' },
        { MaterialName: 'Other', MaterialCode: 'M2', Model: 'Mod', Specification: 'Spec' }
      ])
      const req: ValidationRequest = { mode: 'database_full' }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any
      const res = await service.validate(req, userInfo, 1)

      expect(res.success).toBe(true)
      expect(res.stats!.totalRecords).toBe(2)
      // M1 is in markedCodes → isMarkedForDeletion=true, managerName='Mgr'
      const m1Result = res.results!.find((r) => r.materialCode === 'M1')
      expect(m1Result?.isMarkedForDeletion).toBe(true)
      expect(m1Result?.managerName).toBe('Mgr')
      // M2 is NOT in markedCodes and 'Other' doesn't match any type keyword
      const m2Result = res.results!.find((r) => r.materialCode === 'M2')
      expect(m2Result?.isMarkedForDeletion).toBe(false)
    })

    it('should match type keywords when material name contains keyword', async () => {
      mockQueryAll.mockResolvedValueOnce([
        { MaterialName: 'MatA-Extra', MaterialCode: 'MX1', Model: 'Mod', Specification: 'Spec' }
      ])
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
      mockSharedIdsGet.mockReturnValue(['PROD001'])
      const req: ValidationRequest = { mode: 'database_filtered', useSharedProductionIds: true }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const res = await service.validate(req, userInfo, 1)

      expect(res.success).toBe(true)
      expect(res.results).toBeDefined()
      expect(res.results!.length).toBeGreaterThan(0)
    })

    it('should return failure when shared IDs are empty', async () => {
      mockSharedIdsGet.mockReturnValue([])
      const req: ValidationRequest = { mode: 'database_filtered', useSharedProductionIds: true }
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const res = await service.validate(req, userInfo, 1)

      expect(res.success).toBe(false)
      expect(res.error).toContain('共享')
    })

    it('should return failure when shared IDs yield no source numbers', async () => {
      mockSharedIdsGet.mockReturnValue(['PROD001'])
      mockGetSourceNumbers.mockResolvedValueOnce([])
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
      mockGetSourceNumbers.mockResolvedValueOnce([])
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
      mockGetMaterialsByManager.mockResolvedValueOnce([])

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
      mockGetAllRecords.mockResolvedValueOnce([])

      const result = await service.getAllMaterials()

      expect(result).toEqual([])
    })
  })

  // ─── getCleanerData ───
  describe('getCleanerData', () => {
    it('Admin with selected managers should query MaterialsToBeDeleted by ManagerName IN', async () => {
      mockSharedIdsGet.mockReturnValue(['PROD001'])
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const result = await service.getCleanerData(userInfo, 1, ['Mgr', 'Other'])

      expect(result.success).toBe(true)
      expect(result.orderNumbers).toBeDefined()
      expect(result.orderNumbers!.length).toBeGreaterThan(0)
      // materialCodes come from MaterialsToBeDeleted query (mock returns M1)
      expect(result.materialCodes).toBeDefined()
      expect(result.materialCodes).toContain('M1')
    })

    it('Admin without selected managers should query DiscreteMaterialPlanData by orderNumbers', async () => {
      mockSharedIdsGet.mockReturnValue(['PROD001'])
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const result = await service.getCleanerData(userInfo, 1, [])

      expect(result.success).toBe(true)
      expect(result.orderNumbers).toBeDefined()
      // materialCodes come from DiscreteMaterialPlanDAO.queryBySourceNumbersDistinct
      // mock returns MF1
      expect(result.materialCodes).toBeDefined()
      expect(result.materialCodes).toContain('MF1')
    })

    it('Admin without selected managers and no orderNumbers should return empty material codes', async () => {
      mockSharedIdsGet.mockReturnValue([])
      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any

      const result = await service.getCleanerData(userInfo, 1, [])

      expect(result.success).toBe(true)
      expect(result.orderNumbers).toEqual([])
      expect(result.materialCodes).toEqual([])
    })

    it('regular user should filter by ManagerName = username', async () => {
      mockSharedIdsGet.mockReturnValue(['PROD001'])
      const userInfo = { id: 2, username: 'guest', userType: 'User' } as any

      const result = await service.getCleanerData(userInfo, 1)

      expect(result.success).toBe(true)
      // materialCodes from MaterialsToBeDeleted WHERE ManagerName = 'guest'
      // mock returns M1 for any MaterialsToBeDeleted query
      expect(result.materialCodes).toBeDefined()
      expect(result.materialCodes).toContain('M1')
    })

    it('should handle errors gracefully', async () => {
      mockCreateDbService.mockRejectedValueOnce(new Error('DB down'))

      const userInfo = { id: 1, username: 'admin', userType: 'Admin' } as any
      const result = await service.getCleanerData(userInfo, 1)

      expect(result.success).toBe(false)
      expect(result.error).toContain('DB down')
    })
  })
})
