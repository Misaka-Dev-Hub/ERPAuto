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

describe('CleanerOperationHistoryDAO (PostgreSQL compatibility)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    createMock.mockResolvedValue({
      type: 'postgresql',
      isConnected: () => true,
      query: queryMock,
      disconnect: vi.fn()
    })
  })

  it('uses PostgreSQL-compatible aggregation in getBatches', async () => {
    queryMock.mockResolvedValue({
      rows: [],
      columns: [],
      rowCount: 0
    })

    const { CleanerOperationHistoryDAO } = await import(
      '../../../../src/main/services/database/cleaner-operation-history-dao'
    )
    const dao = new CleanerOperationHistoryDAO()

    await dao.getBatches(undefined, { limit: 10 })

    expect(queryMock).toHaveBeenCalledTimes(1)
    const sql = queryMock.mock.calls[0][0] as string

    expect(sql).toContain('COALESCE(SUM(CASE WHEN o.Status = \'success\' THEN 1 ELSE 0 END), 0)')
    expect(sql).toContain('COALESCE(SUM(CASE WHEN o.Status = \'failed\' THEN 1 ELSE 0 END), 0)')
    expect(sql).toContain('MAX(CASE WHEN e.IsDryRun THEN 1 ELSE 0 END) as IsDryRun')
    expect(sql).not.toContain('ISNULL(')
  })

  it('avoids SQL Server TOP syntax when checking delete permissions', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            ID: 1,
            BatchId: 'batch-1',
            AttemptNumber: 1,
            UserId: 7,
            Username: 'tester',
            OperationTime: new Date('2026-04-14T10:00:00.000Z'),
            EndTime: null,
            Status: 'success',
            IsDryRun: false,
            TotalOrders: 1,
            OrdersProcessed: 1,
            TotalMaterialsDeleted: 1,
            TotalMaterialsSkipped: 0,
            TotalMaterialsFailed: 0,
            TotalUncertainDeletions: 0,
            ErrorMessage: null,
            AppVersion: '1.12.3'
          }
        ],
        columns: [],
        rowCount: 1
      })
      .mockResolvedValueOnce({
        rows: [],
        columns: [],
        rowCount: 0
      })
      .mockResolvedValue({
        rows: [],
        columns: [],
        rowCount: 1
      })

    const { CleanerOperationHistoryDAO } = await import(
      '../../../../src/main/services/database/cleaner-operation-history-dao'
    )
    const dao = new CleanerOperationHistoryDAO()

    const result = await dao.deleteBatch('batch-1', 7, false)

    expect(result).toEqual({ success: true })
    const executedSql = queryMock.mock.calls.map(([sql]) => sql as string).join('\n')
    expect(executedSql).not.toContain('TOP 1')
    expect(executedSql).toContain('FROM "ERPAuto"."CleanerExecution"')
    expect(executedSql).toContain('DELETE FROM "ERPAuto"."CleanerMaterialDetail"')
  })
})
