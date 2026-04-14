import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const createMock = vi.fn()
const trackDurationMock = vi.fn(async (fn: () => Promise<unknown>) => ({ result: await fn() }))

vi.mock('../../../../src/main/services/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }),
  getRequestId: () => 'test-request-id',
  trackDuration: trackDurationMock
}))

vi.mock('../../../../src/main/services/database/index', () => ({
  create: createMock
}))

describe('MaterialsTypeToBeDeletedDAO (PostgreSQL compatibility)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    createMock.mockResolvedValue({
      type: 'postgresql',
      isConnected: () => true,
      query: queryMock,
      disconnect: vi.fn()
    })
  })

  it('falls back to update-then-insert instead of ON CONFLICT for PostgreSQL inserts', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [],
        columns: [],
        rowCount: 0
      })
      .mockResolvedValueOnce({
        rows: [],
        columns: [],
        rowCount: 1
      })

    const { MaterialsTypeToBeDeletedDAO } = await import(
      '../../../../src/main/services/database/materials-type-to-be-deleted-dao'
    )
    const dao = new MaterialsTypeToBeDeletedDAO()

    const result = await dao.upsertMaterial('测试物料', 'tester')

    expect(result).toBe(true)
    expect(queryMock).toHaveBeenCalledTimes(2)

    const [updateSql, updateParams] = queryMock.mock.calls[0]
    const [insertSql, insertParams] = queryMock.mock.calls[1]

    expect(updateSql).toContain('UPDATE "dbo"."MaterialsTypeToBeDeleted"')
    expect(updateSql).toContain('WHERE MaterialName = $2')
    expect(updateParams).toEqual(['tester', '测试物料'])

    expect(insertSql).toContain('INSERT INTO "dbo"."MaterialsTypeToBeDeleted" (MaterialName, ManagerName)')
    expect(insertSql).toContain('WHERE NOT EXISTS')
    expect(insertSql).not.toContain('ON CONFLICT')
    expect(insertParams).toEqual(['测试物料', 'tester'])
  })

  it('returns after the first update when the material already exists', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [],
      columns: [],
      rowCount: 1
    })

    const { MaterialsTypeToBeDeletedDAO } = await import(
      '../../../../src/main/services/database/materials-type-to-be-deleted-dao'
    )
    const dao = new MaterialsTypeToBeDeletedDAO()

    const result = await dao.upsertMaterial('测试物料', 'tester')

    expect(result).toBe(true)
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect((queryMock.mock.calls[0][0] as string)).toContain('UPDATE "dbo"."MaterialsTypeToBeDeleted"')
  })
})
