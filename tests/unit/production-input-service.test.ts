import { describe, expect, it } from 'vitest'
import { identifyInputType } from '../../src/main/services/validation/production-input-service'

describe('production-input-service', () => {
  it('identifies order numbers', () => {
    expect(identifyInputType('SC12345678901234')).toBe('order_number')
  })

  it('identifies production ids', () => {
    expect(identifyInputType('26A1234')).toBe('production_id')
  })

  it('returns unknown for unsupported formats', () => {
    expect(identifyInputType('invalid-value')).toBe('unknown')
  })
})
