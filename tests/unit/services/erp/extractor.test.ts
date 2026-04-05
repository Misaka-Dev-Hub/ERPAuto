import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ExtractorService } from '../../../../src/main/services/erp/extractor'
import { ErpAuthService } from '../../../../src/main/services/erp/erp-auth'
import fs from 'fs/promises'
import type { ExtractorInput, ImportResult } from '../../../../src/main/types/extractor.types'
import type { ExcelParser } from '../../../../src/main/services/excel/excel-parser'
import type { DataImportService } from '../../../../src/main/services/database/data-importer'

// Mock external dependencies
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined)
  },
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../../src/main/services/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }

  return {
    createLogger: vi.fn(() => mockLogger),
    withRequestContext: vi.fn(async (fn) => fn()),
    getRequestId: vi.fn(() => 'test-request-id')
  }
})

vi.mock('../../../../src/main/services/logger/performance-monitor', () => ({
  trackDuration: vi.fn(async (fn) => ({ result: await fn() }))
}))

// Mock ExcelParser - reset in beforeEach
let mockExcelParserInstance: any
vi.mock('../../../../src/main/services/excel/excel-parser', () => ({
  ExcelParser: function ExcelParser() {
    return mockExcelParserInstance
  }
}))

// Mock DataImportService - reset in beforeEach
let mockDataImportInstance: any
vi.mock('../../../../src/main/services/database/data-importer', () => ({
  DataImportService: function DataImportService() {
    return mockDataImportInstance
  }
}))

// Mock ExtractorCore - reset in beforeEach
let mockExtractorCoreInstance: any
vi.mock('../../../../src/main/services/erp/extractor-core', () => ({
  ExtractorCore: function ExtractorCore() {
    return mockExtractorCoreInstance
  }
}))

describe('ExtractorService', () => {
  let mockAuthService: ErpAuthService
  let mockSession: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockSession = { cookie: 'test-cookie' }
    mockAuthService = {
      getSession: vi.fn(() => mockSession)
    } as unknown as ErpAuthService

    // Initialize mock instances
    mockExcelParserInstance = {
      parse: vi.fn().mockResolvedValue(undefined),
      _lastOrders: [] as Array<{ orderInfo: any; materials: any[] }>,
      get lastOrders() {
        return this._lastOrders
      },
      set lastOrders(val) {
        this._lastOrders = val
      }
    }

    // Explicitly reset lastOrders
    mockExcelParserInstance.lastOrders = []

    mockDataImportInstance = {
      importFromExcel: vi.fn().mockResolvedValue({
        success: true,
        recordsRead: 0,
        recordsDeleted: 0,
        recordsImported: 0,
        uniqueSourceNumbers: 0,
        errors: []
      } as ImportResult)
    }

    const mockDownloadAllBatches = vi.fn().mockResolvedValue({
      downloadedFiles: [],
      errors: []
    })
    mockExtractorCoreInstance = {
      downloadAllBatches: mockDownloadAllBatches
    }
  })

  // TODO: Complex extract() flow tests need integration test setup

  describe('Constructor', () => {
    it('should create instance with default download dir', () => {
      const service = new ExtractorService(mockAuthService)
      expect(service).toBeInstanceOf(ExtractorService)
    })

    it('should create instance with custom download dir', () => {
      const service = new ExtractorService(mockAuthService, './custom-downloads')
      expect(service).toBeInstanceOf(ExtractorService)
    })

    it('should ensure download directory exists', async () => {
      new ExtractorService(mockAuthService, './test-downloads')

      expect(fs.mkdir).toHaveBeenCalledWith('./test-downloads', { recursive: true })
    })
  })

  describe('extract() - Basic Behavior', () => {
    it('should return result object', async () => {
      const service = new ExtractorService(mockAuthService, './test-downloads')
      const input: ExtractorInput = { orderNumbers: [] }

      const result = await service.extract(input)

      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
    })

    it('should handle empty order numbers', async () => {
      const service = new ExtractorService(mockAuthService, './test-downloads')

      await expect(service.extract({ orderNumbers: [] })).resolves.toBeDefined()
    })

    it('should capture errors from ExtractorCore', async () => {
      mockExtractorCoreInstance.downloadAllBatches.mockResolvedValue({
        downloadedFiles: [],
        errors: ['Download failed']
      })

      const service = new ExtractorService(mockAuthService, './test-downloads')
      const result = await service.extract({ orderNumbers: ['ORD001'] })

      expect(result.downloadedFiles).toEqual([])
      expect(result.errors).toContain('Download failed')
    })

    it('should handle extraction errors gracefully', async () => {
      mockExtractorCoreInstance.downloadAllBatches.mockRejectedValue(new Error('Network error'))

      const service = new ExtractorService(mockAuthService, './test-downloads')
      const result = await service.extract({ orderNumbers: ['ORD001'] })

      expect(Array.isArray(result.errors)).toBe(true)
    })
  })

  describe('mergeFiles()', () => {
    it('should return null when no files to merge', async () => {
      const service = new ExtractorService(mockAuthService)

      // @ts-ignore - accessing private method for testing
      const result = await service.mergeFiles([], ['ORD001'])

      expect(result.mergedFile).toBeNull()
      expect(result.recordCount).toBe(0)
      expect(result.orderRecordCounts).toEqual([])
    })

    it('should handle single file', async () => {
      mockExcelParserInstance.lastOrders = [
        {
          orderInfo: { productionOrder: 'ORD001' },
          materials: [{ materialCode: 'MAT001', quantity: 10 }]
        }
      ]

      const service = new ExtractorService(mockAuthService, './test-downloads')

      // @ts-ignore - accessing private method for testing
      const result = await service.mergeFiles(['./file1.xlsx'], ['ORD001'])

      expect(result.recordCount).toBe(1)
      expect(result.orderRecordCounts).toEqual([{ orderNumber: 'ORD001', recordCount: 1 }])
    })

    it('should handle multiple files', async () => {
      // Mock parse to return different data for each file
      let callCount = 0
      mockExcelParserInstance.parse = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          mockExcelParserInstance._lastOrders = [
            {
              orderInfo: { productionOrder: 'ORD001' },
              materials: [{ materialCode: 'MAT001', quantity: 5 }]
            }
          ]
        } else {
          mockExcelParserInstance._lastOrders = [
            {
              orderInfo: { productionOrder: 'ORD002' },
              materials: [
                { materialCode: 'MAT002', quantity: 10 },
                { materialCode: 'MAT003', quantity: 15 }
              ]
            }
          ]
        }
        return Promise.resolve()
      })

      const service = new ExtractorService(mockAuthService, './test-downloads')

      // @ts-ignore - accessing private method for testing
      const result = await service.mergeFiles(
        ['./file1.xlsx', './file2.xlsx'],
        ['ORD001', 'ORD002']
      )

      expect(result.recordCount).toBe(3)
      expect(result.orderRecordCounts).toHaveLength(2)
      expect(result.orderRecordCounts[0]).toEqual({ orderNumber: 'ORD001', recordCount: 1 })
      expect(result.orderRecordCounts[1]).toEqual({ orderNumber: 'ORD002', recordCount: 2 })
    })
  })

  describe('cleanupTempFiles()', () => {
    it('should delete all temporary files', async () => {
      const service = new ExtractorService(mockAuthService)
      const files = ['./temp1.xlsx', './temp2.xlsx', './temp3.xlsx']

      // @ts-ignore - accessing private method for testing
      await service.cleanupTempFiles(files, ['ORD001'])

      expect(fs.unlink).toHaveBeenCalledTimes(3)
      expect(fs.unlink).toHaveBeenCalledWith('./temp1.xlsx')
      expect(fs.unlink).toHaveBeenCalledWith('./temp2.xlsx')
      expect(fs.unlink).toHaveBeenCalledWith('./temp3.xlsx')
    })

    it('should handle deletion errors gracefully', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(new Error('File not found'))

      const service = new ExtractorService(mockAuthService)
      const files = ['./temp1.xlsx', './temp2.xlsx']

      // @ts-ignore - accessing private method for testing
      await expect(service.cleanupTempFiles(files, ['ORD001'])).resolves.not.toThrow()

      expect(fs.unlink).toHaveBeenCalledTimes(2)
    })
  })

  describe('importToDatabaseWithLogging()', () => {
    it('should return success result', async () => {
      mockDataImportInstance.importFromExcel.mockResolvedValue({
        success: true,
        recordsRead: 100,
        recordsDeleted: 50,
        recordsImported: 50,
        uniqueSourceNumbers: 5,
        errors: []
      })

      const service = new ExtractorService(mockAuthService)
      const onLog = vi.fn()

      // @ts-ignore - accessing private method for testing
      const result = await service.importToDatabaseWithLogging('./merged.xlsx', onLog)

      expect(result.success).toBe(true)
      expect(result.recordsRead).toBe(100)
      expect(result.recordsImported).toBe(50)
      expect(onLog).toHaveBeenCalledWith('success', expect.stringContaining('导入完成'))
    })

    it('should handle import failure', async () => {
      mockDataImportInstance.importFromExcel.mockRejectedValue(
        new Error('Database connection failed')
      )

      const service = new ExtractorService(mockAuthService)
      const onLog = vi.fn()

      // @ts-ignore - accessing private method for testing
      const result = await service.importToDatabaseWithLogging('./merged.xlsx', onLog)

      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.includes('Database connection failed'))).toBe(true)
      expect(onLog).toHaveBeenCalledWith('error', expect.stringContaining('导入失败'))
    })

    it('should handle import with errors in result', async () => {
      mockDataImportInstance.importFromExcel.mockResolvedValue({
        success: false,
        recordsRead: 50,
        recordsDeleted: 0,
        recordsImported: 0,
        uniqueSourceNumbers: 0,
        errors: ['Validation failed', 'Duplicate records']
      })

      const service = new ExtractorService(mockAuthService)
      const onLog = vi.fn()

      // @ts-ignore - accessing private method for testing
      const result = await service.importToDatabaseWithLogging('./merged.xlsx', onLog)

      expect(result.success).toBe(false)
      expect(result.errors).toEqual(['Validation failed', 'Duplicate records'])
      expect(onLog).toHaveBeenCalledTimes(3)
    })

    it('should wrap import in trackDuration', async () => {
      mockDataImportInstance.importFromExcel.mockResolvedValue({
        success: true,
        recordsRead: 10,
        recordsDeleted: 0,
        recordsImported: 10,
        uniqueSourceNumbers: 1,
        errors: []
      })

      const { trackDuration } =
        await import('../../../../src/main/services/logger/performance-monitor')
      const service = new ExtractorService(mockAuthService)
      const onLog = vi.fn()

      // @ts-ignore - accessing private method for testing
      await service.importToDatabaseWithLogging('./merged.xlsx', onLog)

      expect(trackDuration).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ operationName: 'Database Import' })
      )
    })
  })
})
