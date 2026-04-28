import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  DiscreteMaterialPlanDAO,
  type MaterialPlanRecord
} from '../../../../src/main/services/database/discrete-material-plan-dao'
import type { IDatabaseService } from '../../../../src/main/services/database'

vi.mock('../../../../src/main/services/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })),
  getRequestId: vi.fn(() => 'test-request-id'),
  trackDuration: vi.fn(async (fn) => ({ result: await fn(), durationMs: 1, isSlow: false }))
}))

vi.mock('../../../../src/main/services/database', () => ({
  create: vi.fn()
}))

function createRecord(sourceNumber: string, index: number): MaterialPlanRecord {
  return {
    factory: '工厂A',
    materialStatus: '已审批',
    planNumber: `PLAN-${index}`,
    sourceNumber,
    materialType: '标准',
    productCode: 'P001',
    productName: '产品A',
    productUnit: 'PCS',
    productPlanQuantity: 1,
    useDepartment: '',
    remark: '',
    creator: '',
    createDate: new Date('2026-04-28T00:00:00Z'),
    approver: '',
    approveDate: new Date('2026-04-28T00:00:00Z'),
    sequenceNumber: index,
    materialCode: `MAT-${index}`,
    materialName: '物料A',
    specification: '',
    model: '',
    drawingNumber: '',
    materialQuality: '',
    planQuantity: 1,
    unit: 'PCS',
    requiredDate: new Date('2026-04-28T00:00:00Z'),
    warehouse: '',
    unitUsage: 1,
    cumulativeOutputQuantity: 0,
    bomVersion: ''
  }
}

describe('DiscreteMaterialPlanDAO', () => {
  let mockDbService: IDatabaseService

  beforeEach(async () => {
    vi.clearAllMocks()
    mockDbService = {
      type: 'sqlserver',
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn(() => true),
      query: vi.fn(async (_sql, params = []) => {
        const rows = JSON.parse(params[1] || '[]')
        return {
          rows: [{ deletedCount: 0, insertedCount: rows.length }],
          columns: ['deletedCount', 'insertedCount'],
          rowCount: 1
        }
      }),
      transaction: vi.fn()
    }

    const database = await import('../../../../src/main/services/database')
    vi.mocked(database.create).mockResolvedValue(mockDbService)
  })

  it('splits SQL Server replace operations by source number batches', async () => {
    const records = Array.from({ length: 151 }, (_, index) =>
      createRecord(`SC-${String(index).padStart(4, '0')}`, index)
    )

    const dao = new DiscreteMaterialPlanDAO()
    const result = await dao.replaceBySourceNumbers(records, 1000)

    expect(result).toEqual({ deleted: 0, inserted: 151 })
    expect(mockDbService.query).toHaveBeenCalledTimes(7)

    const firstParams = vi.mocked(mockDbService.query).mock.calls[0][1] || []
    const sixthParams = vi.mocked(mockDbService.query).mock.calls[5][1] || []
    const seventhParams = vi.mocked(mockDbService.query).mock.calls[6][1] || []

    expect(JSON.parse(firstParams[0])).toHaveLength(25)
    expect(JSON.parse(sixthParams[0])).toHaveLength(25)
    expect(JSON.parse(seventhParams[0])).toHaveLength(1)
    expect(JSON.parse(firstParams[1])).toHaveLength(25)
    expect(JSON.parse(sixthParams[1])).toHaveLength(25)
    expect(JSON.parse(seventhParams[1])).toHaveLength(1)
  })
})
