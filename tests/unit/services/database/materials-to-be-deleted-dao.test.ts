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

describe('MaterialsToBeDeletedDAO (PostgreSQL compatibility)', () => {
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

    const { MaterialsToBeDeletedDAO } = await import(
      '../../../../src/main/services/database/materials-to-be-deleted-dao'
    )
    const dao = new MaterialsToBeDeletedDAO()

    const result = await dao.upsertMaterial('M-001', 'tester')

    expect(result).toBe(true)
    expect(queryMock).toHaveBeenCalledTimes(2)

    const [updateSql, updateParams] = queryMock.mock.calls[0]
    const [insertSql, insertParams] = queryMock.mock.calls[1]

    expect(updateSql).toContain('UPDATE "dbo"."MaterialsToBeDeleted"')
    expect(updateSql).toContain('WHERE MaterialCode = $2')
    expect(updateParams).toEqual(['tester', 'M-001'])

    expect(insertSql).toContain('INSERT INTO "dbo"."MaterialsToBeDeleted" (MaterialCode, ManagerName)')
    expect(insertSql).toContain('WHERE NOT EXISTS')
    expect(insertSql).not.toContain('ON CONFLICT')
    expect(insertParams).toEqual(['M-001', 'tester'])
  })

  it('reuses the PostgreSQL-safe path in updateManager', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [],
      columns: [],
      rowCount: 1
    })

    const { MaterialsToBeDeletedDAO } = await import(
      '../../../../src/main/services/database/materials-to-be-deleted-dao'
    )
    const dao = new MaterialsToBeDeletedDAO()

    const result = await dao.updateManager('M-001', 'tester')

    expect(result).toEqual({ success: true })
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect((queryMock.mock.calls[0][0] as string)).toContain('UPDATE "dbo"."MaterialsToBeDeleted"')
  })
})
