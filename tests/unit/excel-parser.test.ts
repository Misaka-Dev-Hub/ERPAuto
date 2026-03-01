import { describe, it, expect } from 'vitest'
import { ExcelParser } from '../../src/main/services/excel/excel-parser'
import type { DiscreteMaterialPlan } from '../../src/main/types/excel.types'
import path from 'path'

describe('Excel Parser', () => {
  it('should parse Excel file and extract material plans', async () => {
    const parser = new ExcelParser()
    const filePath = path.resolve(__dirname, '../fixtures/test-export.xlsx')

    const plans = await parser.parse(filePath)

    expect(Array.isArray(plans)).toBe(true)
    expect(plans.length).toBeGreaterThan(0)

    const firstPlan = plans[0]
    expect(firstPlan).toHaveProperty('orderNumber')
    expect(firstPlan).toHaveProperty('materialCode')
  })

  it('should parse all material fields correctly', async () => {
    const parser = new ExcelParser()
    const filePath = path.resolve(__dirname, '../fixtures/test-export.xlsx')

    const plans = await parser.parse(filePath)

    expect(plans.length).toBe(3)

    // Check first material
    expect(plans[0].orderNumber).toBe('SC202501001')
    expect(plans[0].materialCode).toBe('M001')
    expect(plans[0].materialName).toBe('钢材A')
    expect(plans[0].specification).toBe('规格1')
    expect(plans[0].model).toBe('型号1')
    expect(plans[0].drawingNumber).toBe('图号1')
    expect(plans[0].material).toBe('材质1')
    expect(plans[0].quantity).toBe(50)
    expect(plans[0].unit).toBe('kg')
    expect(plans[0].requiredDate).toBe('2025-02-10')
    expect(plans[0].warehouse).toBe('仓库1')
    expect(plans[0].unitUsage).toBe(0.5)
    expect(plans[0].cumulativeOutboundQty).toBe(0)

    // Check third material (with some empty fields)
    expect(plans[2].materialCode).toBe('M003')
    expect(plans[2].materialName).toBe('配件C')
    expect(plans[2].quantity).toBe(200)
  })

  it('should handle empty orders gracefully', async () => {
    const parser = new ExcelParser()
    const filePath = path.resolve(__dirname, '../fixtures/test-empty-orders.xlsx')

    const plans = await parser.parse(filePath)

    expect(plans).toBeDefined()
    expect(plans.length).toBe(0)
  })
})
