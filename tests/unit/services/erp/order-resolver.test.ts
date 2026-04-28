import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OrderNumberResolver } from '../../../../src/main/services/erp/order-resolver'
import type { IDatabaseService } from '../../../../src/main/services/database'

// Mock logger
vi.mock('../../../../src/main/services/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

// Mock ConfigManager
vi.mock('../../../../src/main/services/config/config-manager', () => ({
  ConfigManager: {
    getInstance: vi.fn().mockReturnValue({
      getConfig: vi.fn().mockReturnValue({
        orderResolution: {
          tableName: 'test_table',
          productionIdField: '总排号',
          orderNumberField: '生产订单号'
        }
      })
    })
  }
}))

describe('OrderNumberResolver', () => {
  const mockDbService = {
    type: 'mysql' as const,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    query: vi.fn()
  } as unknown as IDatabaseService

  let resolver: OrderNumberResolver

  beforeEach(() => {
    vi.clearAllMocks()
    resolver = new OrderNumberResolver(mockDbService)
  })

  describe('resolve()', () => {
    it('resolves order numbers to production IDs', async () => {
      vi.mocked(mockDbService.query).mockResolvedValue({
        rows: [{ 生产订单号: 'SC70202602120085' }],
        columns: ['生产订单号'],
        rowCount: 1
      })

      const results = await resolver.resolve(['22A1'])

      expect(results).toHaveLength(1)
      expect(mockDbService.query).toHaveBeenCalled()
    })

    it('batches orders correctly', async () => {
      vi.mocked(mockDbService.query).mockResolvedValue({
        rows: [
          { 总排号: '22A1', 生产订单号: 'SC70202602120085' },
          { 总排号: '22A2', 生产订单号: 'SC70202602120086' }
        ],
        columns: ['总排号', '生产订单号'],
        rowCount: 2
      })

      const results = await resolver.resolve(['22A1', '22A2'])

      expect(results).toHaveLength(2)
      expect(results[0].resolved).toBe(true)
      expect(results[1].resolved).toBe(true)
    })

    it('handles missing orders', async () => {
      vi.mocked(mockDbService.query).mockResolvedValue({
        rows: [],
        columns: [],
        rowCount: 0
      })

      const results = await resolver.resolve(['22A999'])

      expect(results).toHaveLength(1)
      expect(results[0].resolved).toBe(false)
      expect(results[0].error).toBeDefined()
    })

    it('handles mixed input (productionIds and orderNumbers)', async () => {
      vi.mocked(mockDbService.query).mockResolvedValue({
        rows: [{ 总排号: '22A1', 生产订单号: 'SC70202602120085' }],
        columns: ['总排号', '生产订单号'],
        rowCount: 1
      })

      const results = await resolver.resolve(['22A1', 'SC70202602120086'])

      expect(results).toHaveLength(2)
      expect(results[0].productionId).toBe('22A1')
      expect(results[0].orderNumber).toBe('SC70202602120085')
      expect(results[0].resolved).toBe(true)
      expect(results[1].orderNumber).toBe('SC70202602120086')
      expect(results[1].resolved).toBe(true)
    })

    it('handles unrecognized input format', async () => {
      const results = await resolver.resolve(['INVALID_FORMAT'])

      expect(results).toHaveLength(1)
      expect(results[0].resolved).toBe(false)
      expect(results[0].error).toContain('格式不识别')
    })

    it('deduplicates identical inputs', async () => {
      vi.mocked(mockDbService.query).mockResolvedValue({
        rows: [{ 总排号: '22A1', 生产订单号: 'SC70202602120085' }],
        columns: ['总排号', '生产订单号'],
        rowCount: 1
      })

      const results = await resolver.resolve(['22A1', '22A1', '22A1'])

      expect(results).toHaveLength(1) // deduplicated
      expect(results[0].resolved).toBe(true)
    })
  })

  describe('mapProductionIdToOrderNumber()', () => {
    it('uses database service for lookup', async () => {
      vi.mocked(mockDbService.query).mockResolvedValue({
        rows: [{ 生产订单号: 'SC70202602120085' }],
        columns: ['生产订单号'],
        rowCount: 1
      })

      const result = await resolver.mapProductionIdToOrderNumber('22A1')

      expect(mockDbService.query).toHaveBeenCalled()
      expect(result).toBe('SC70202602120085')
    })

    it('queries database for each call (no caching)', async () => {
      vi.mocked(mockDbService.query).mockResolvedValue({
        rows: [{ 生产订单号: 'SC70202602120085' }],
        columns: ['生产订单号'],
        rowCount: 1
      })

      // First call
      const result1 = await resolver.mapProductionIdToOrderNumber('22A1')
      // Second call with same input
      const result2 = await resolver.mapProductionIdToOrderNumber('22A1')

      expect(result1).toBe(result2)
      // Should query twice as there's no explicit caching in this method
      expect(mockDbService.query).toHaveBeenCalledTimes(2)
    })
  })

  describe('mapProductionIdsToOrderNumbers()', () => {
    it('caching works correctly - batch deduplication', async () => {
      vi.mocked(mockDbService.query).mockResolvedValue({
        rows: [{ 总排号: '22A1', 生产订单号: 'SC70202602120085' }],
        columns: ['总排号', '生产订单号'],
        rowCount: 1
      })

      // Should internally deduplicate
      await resolver.mapProductionIdsToOrderNumbers(['22A1', '22A1', '22A1'])

      // Should be optimized to query unique values only
      expect(mockDbService.query).toHaveBeenCalledTimes(1)
    })

    it('splits large mapping queries into bounded batches', async () => {
      const largeInput = Array.from({ length: 1001 }, (_, i) => `22A${i}`)

      vi.mocked(mockDbService.query).mockImplementation(async (_sql, params = []) => ({
        rows: params.map((prodId, i) => ({
          总排号: prodId,
          生产订单号: `SC7020260212${String(i).padStart(5, '0')}`
        })),
        columns: ['总排号', '生产订单号'],
        rowCount: params.length
      }))

      await resolver.mapProductionIdsToOrderNumbers(largeInput)

      expect(mockDbService.query).toHaveBeenCalledTimes(2)
      expect(vi.mocked(mockDbService.query).mock.calls[0][1]).toHaveLength(1000)
      expect(vi.mocked(mockDbService.query).mock.calls[1][1]).toHaveLength(1)
    })
  })

  describe('error handling', () => {
    it('error handling for database failures', async () => {
      vi.mocked(mockDbService.query).mockRejectedValue(new Error('Database connection failed'))

      await expect(resolver.mapProductionIdToOrderNumber('22A1')).rejects.toThrow(
        'Database connection failed'
      )
    })
  })

  describe('getValidOrderNumbers()', () => {
    it('returns deduplicated order numbers', async () => {
      const mappings = [
        { input: '22A1', resolved: true, orderNumber: 'SC70202602120085' },
        { input: 'SC70202602120086', resolved: true, orderNumber: 'SC70202602120086' },
        { input: '22A1', resolved: true, orderNumber: 'SC70202602120085' } // Duplicate
      ]

      const validOrderNumbers = resolver.getValidOrderNumbers(mappings as any)

      expect(validOrderNumbers).toHaveLength(2)
      expect(validOrderNumbers).toEqual(['SC70202602120085', 'SC70202602120086'])
    })
  })

  describe('performance', () => {
    it('performance with large order sets', async () => {
      const largeInput = Array.from({ length: 100 }, (_, i) => `22A${i}`)

      vi.mocked(mockDbService.query).mockResolvedValue({
        rows: largeInput.map((prodId, i) => ({
          总排号: prodId,
          生产订单号: `SC7020260212${String(i).padStart(5, '0')}`
        })),
        columns: ['总排号', '生产订单号'],
        rowCount: largeInput.length
      })

      const startTime = Date.now()
      const results = await resolver.resolve(largeInput)
      const elapsed = Date.now() - startTime

      expect(results).toHaveLength(largeInput.length)
      expect(elapsed).toBeLessThan(5000) // Should complete within 5 seconds
    })
  })

  describe('isProductionId()', () => {
    it('should recognize valid production IDs', () => {
      expect(resolver.isProductionId('22A1')).toBe(true)
      expect(resolver.isProductionId('26B10617')).toBe(true)
      expect(resolver.isProductionId('99Z999999')).toBe(true)
      expect(resolver.isProductionId('00A0')).toBe(true)
    })

    it('should reject invalid formats', () => {
      expect(resolver.isProductionId('SC70202602120085')).toBe(false) // order number, not production ID
      expect(resolver.isProductionId('abc')).toBe(false)
      expect(resolver.isProductionId('1A')).toBe(false)
      expect(resolver.isProductionId('22AA1')).toBe(false)
      expect(resolver.isProductionId('')).toBe(false)
      expect(resolver.isProductionId('2A1')).toBe(false) // only 1 digit before letter
    })
  })

  describe('isOrderNumber()', () => {
    it('should recognize valid order numbers', () => {
      expect(resolver.isOrderNumber('SC70202602120085')).toBe(true)
    })

    it('should reject invalid formats', () => {
      expect(resolver.isOrderNumber('22A1')).toBe(false) // production ID
      expect(resolver.isOrderNumber('SC123')).toBe(false) // too short
      expect(resolver.isOrderNumber('SC702026021200')).toBe(false) // only 13 digits
      expect(resolver.isOrderNumber('XX70202602120085')).toBe(false) // wrong prefix
      expect(resolver.isOrderNumber('')).toBe(false)
    })
  })

  describe('recognizeType()', () => {
    it('should return productionId for production IDs', () => {
      expect(resolver.recognizeType('22A1')).toBe('productionId')
    })

    it('should return orderNumber for order numbers', () => {
      expect(resolver.recognizeType('SC70202602120085')).toBe('orderNumber')
    })

    it('should return unknown for unrecognized formats', () => {
      expect(resolver.recognizeType('abc')).toBe('unknown')
      expect(resolver.recognizeType('')).toBe('unknown')
    })
  })

  describe('getWarnings()', () => {
    it('should return empty array when all mappings resolved', () => {
      const mappings = [
        { input: '22A1', resolved: true, orderNumber: 'SC70202602120085' },
        { input: 'SC70202602120086', resolved: true, orderNumber: 'SC70202602120086' }
      ]
      expect(resolver.getWarnings(mappings as any)).toEqual([])
    })

    it('should return formatted warnings for failed mappings', () => {
      const mappings = [
        { input: '22A999', resolved: false, error: '未在数据库中找到对应的订单号' },
        {
          input: 'abc',
          resolved: false,
          error: '格式不识别：既不是有效的生产订单号也不是总排号格式'
        }
      ]
      const warnings = resolver.getWarnings(mappings as any)
      expect(warnings).toHaveLength(2)
      expect(warnings[0]).toBe('22A999: 未在数据库中找到对应的订单号')
      expect(warnings[1]).toContain('格式不识别')
    })
  })

  describe('getStats()', () => {
    it('should compute correct stats for mixed results', () => {
      const mappings = [
        { input: 'SC70202602120085', resolved: true, orderNumber: 'SC70202602120085' },
        { input: '22A1', resolved: true, productionId: '22A1', orderNumber: 'SC70202602120085' },
        { input: '22A999', resolved: false, error: 'not found', productionId: '22A999' },
        { input: 'abc', resolved: false, error: 'unknown format' }
      ]
      const stats = resolver.getStats(mappings as any)
      expect(stats.totalInputs).toBe(4)
      expect(stats.validOrderNumbers).toBe(1) // only direct order number input
      expect(stats.validProductionIds).toBe(1) // only resolved production IDs count
      expect(stats.resolvedCount).toBe(2)
      expect(stats.failedCount).toBe(2)
      expect(stats.unknownFormat).toBe(1) // only 'abc'
    })

    it('should compute all-success stats', () => {
      const mappings = [
        { input: 'SC70202602120085', resolved: true, orderNumber: 'SC70202602120085' },
        { input: '22A1', resolved: true, productionId: '22A1', orderNumber: 'SC70202602120086' }
      ]
      const stats = resolver.getStats(mappings as any)
      expect(stats.resolvedCount).toBe(2)
      expect(stats.failedCount).toBe(0)
      expect(stats.unknownFormat).toBe(0)
    })

    it('should compute all-failure stats with unknown formats', () => {
      const mappings = [
        { input: 'abc', resolved: false, error: 'unknown' },
        { input: 'xyz', resolved: false, error: 'unknown' }
      ]
      const stats = resolver.getStats(mappings as any)
      expect(stats.resolvedCount).toBe(0)
      expect(stats.failedCount).toBe(2)
      expect(stats.unknownFormat).toBe(2)
    })
  })

  describe('getDeduplicationReport()', () => {
    it('should report duplicates when inputs exceed unique order numbers', () => {
      const mappings = [
        { input: '22A1', resolved: true, orderNumber: 'SC70202602120085' },
        { input: '22A2', resolved: true, orderNumber: 'SC70202602120085' },
        { input: '22A3', resolved: true, orderNumber: 'SC70202602120086' }
      ]
      const report = resolver.getDeduplicationReport(mappings as any)
      expect(report.inputCount).toBe(3)
      expect(report.uniqueOrderNumbersCount).toBe(2)
      expect(report.summary).toContain('重复已合并')
      expect(report.orderNumberGroups.get('SC70202602120085')).toEqual(['22A1', '22A2'])
      expect(report.orderNumberGroups.get('SC70202602120086')).toEqual(['22A3'])
    })

    it('should report no duplicates when all inputs map to unique order numbers', () => {
      const mappings = [
        { input: '22A1', resolved: true, orderNumber: 'SC70202602120085' },
        { input: '22A2', resolved: true, orderNumber: 'SC70202602120086' }
      ]
      const report = resolver.getDeduplicationReport(mappings as any)
      expect(report.inputCount).toBe(2)
      expect(report.uniqueOrderNumbersCount).toBe(2)
      expect(report.summary).not.toContain('重复已合并')
    })
  })
})
