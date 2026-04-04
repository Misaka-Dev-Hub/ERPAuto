import { describe, it, expect, vi } from 'vitest'
import { ExcelParser } from '../../src/main/services/excel/excel-parser'
import type { DiscreteMaterialPlan } from '../../src/main/types/excel.types'
import path from 'path'

// Mock ExcelJS to avoid file I/O in unit tests
vi.mock('exceljs', () => {
  return {
    default: {
      Workbook: vi.fn().mockImplementation(() => ({
        xlsx: {
          readFile: vi.fn().mockImplementation(() => Promise.resolve({}))
        },
        eachSheet: vi.fn()
      }))
    }
  }
})

describe('Excel Parser', () => {
  it('should instantiate Excel parser', () => {
    const parser = new ExcelParser()
    expect(parser).toBeDefined()
    expect(parser).toBeInstanceOf(ExcelParser)
  })

  // These tests require actual Excel file parsing (integration tests)
  it.skip('should parse Excel file and extract material plans', async () => {
    const parser = new ExcelParser()
    const filePath = path.resolve(__dirname, '../fixtures/test-export.xlsx')

    const plans = await parser.parse(filePath)

    expect(Array.isArray(plans)).toBe(true)
    expect(plans.length).toBeGreaterThan(0)

    const firstPlan = plans[0]
    expect(firstPlan).toHaveProperty('orderNumber')
    expect(firstPlan).toHaveProperty('materialCode')
  })

  it.skip('should parse all material fields correctly', async () => {
    const parser = new ExcelParser()
    const filePath = path.resolve(__dirname, '../fixtures/test-export.xlsx')

    const plans = await parser.parse(filePath)

    expect(plans.length).toBe(3)
    // ... field checks
  })

  it.skip('should handle empty orders gracefully', async () => {
    const parser = new ExcelParser()
    const filePath = path.resolve(__dirname, '../fixtures/test-empty-orders.xlsx')

    const plans = await parser.parse(filePath)

    expect(plans).toBeDefined()
    expect(plans.length).toBe(0)
  })
})
