import { describe, expect, it } from 'vitest'
import { SharedProductionIdsStore } from '../../src/main/services/validation/shared-production-ids-store'

describe('SharedProductionIdsStore', () => {
  it('stores unique ids per sender', () => {
    const store = new SharedProductionIdsStore()

    store.set(1, ['A', 'B', 'A'])

    expect(store.get(1)).toEqual(['A', 'B'])
  })

  it('keeps sender scopes isolated', () => {
    const store = new SharedProductionIdsStore()

    store.set(1, ['A'])
    store.set(2, ['B'])

    expect(store.get(1)).toEqual(['A'])
    expect(store.get(2)).toEqual(['B'])
  })

  it('clears sender data', () => {
    const store = new SharedProductionIdsStore()

    store.set(1, ['A'])
    store.clear(1)

    expect(store.get(1)).toEqual([])
  })
})
