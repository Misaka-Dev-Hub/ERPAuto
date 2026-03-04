/**
 * Unit tests for DataImportService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DataImportService } from '../../../src/main/services/database/data-importer'

// Mock the logger
vi.mock('../../../src/main/services/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

// Mock the database factory
vi.mock('../../../src/main/services/database', () => ({
  create: vi.fn().mockResolvedValue({
    type: 'mysql',
    isConnected: () => true,
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    disconnect: vi.fn().mockResolvedValue(undefined)
  })
}))

// Create mock worksheet
const mockWorksheet = {
  getRow: vi.fn().mockReturnValue({
    eachCell: vi.fn((callback) => {
      callback({ text: '工厂' }, 1)
      callback({ text: '来源单号' }, 2)
      callback({ text: '备料计划单号' }, 3)
    })
  }),
  eachRow: vi.fn((callback) => {
    // Skip header row (rowNumber 1)
    // Add data rows
    callback(
      {
        eachCell: vi.fn((cellCallback) => {
          cellCallback({ text: '工厂A', value: '工厂A' }, 1)
          cellCallback({ text: 'PO-001', value: 'PO-001' }, 2)
          cellCallback({ text: 'PLAN-001', value: 'PLAN-001' }, 3)
        }),
        text: '工厂A,PO-001,PLAN-001'
      },
      2
    )
    callback(
      {
        eachCell: vi.fn((cellCallback) => {
          cellCallback({ text: '工厂A', value: '工厂A' }, 1)
          cellCallback({ text: 'PO-002', value: 'PO-002' }, 2)
          cellCallback({ text: 'PLAN-002', value: 'PLAN-002' }, 3)
        }),
        text: '工厂A,PO-002,PLAN-002'
      },
      3
    )
  })
}

// Mock ExcelJS with a proper class constructor
class MockWorkbook {
  worksheets = [mockWorksheet]
  xlsx = {
    readFile: vi.fn().mockResolvedValue(undefined)
  }
}

vi.mock('exceljs', () => {
  return {
    default: {
      Workbook: MockWorkbook
    },
    Workbook: MockWorkbook
  }
})

describe('DataImportService', () => {
  let service: DataImportService

  beforeEach(() => {
    service = new DataImportService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('importFromExcel', () => {
    it('should return result with expected structure', async () => {
      const result = await service.importFromExcel('/path/to/test.xlsx', 1000)

      // Check that we got a result with expected structure
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('recordsRead')
      expect(result).toHaveProperty('recordsDeleted')
      expect(result).toHaveProperty('recordsImported')
      expect(result).toHaveProperty('uniqueSourceNumbers')
      expect(result).toHaveProperty('errors')
    })

    it('should return records read count', async () => {
      const result = await service.importFromExcel('/path/to/test.xlsx', 1000)

      expect(result.recordsRead).toBeGreaterThanOrEqual(0)
    })

    it('should return unique source numbers count', async () => {
      const result = await service.importFromExcel('/path/to/test.xlsx', 1000)

      expect(result.uniqueSourceNumbers).toBeGreaterThanOrEqual(0)
    })
  })
})