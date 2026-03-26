import { describe, expect, it, vi } from 'vitest'
import {
  parseProductionIds,
  syncSharedProductionIdsWithApi
} from '../../src/renderer/src/hooks/useSharedProductionIds'

describe('useSharedProductionIds helpers', () => {
  it('parses trimmed non-empty production ids', () => {
    expect(parseProductionIds(' 22A1 \n\nSC70202602120085\n  ')).toEqual([
      '22A1',
      'SC70202602120085'
    ])
  })

  it('clears shared ids when parsed input is empty', async () => {
    const clearSharedProductionIds = vi.fn(async () => undefined)
    const setSharedProductionIds = vi.fn(async () => undefined)

    await syncSharedProductionIdsWithApi(' \n\t', {
      clearSharedProductionIds,
      setSharedProductionIds
    })

    expect(clearSharedProductionIds).toHaveBeenCalledTimes(1)
    expect(setSharedProductionIds).not.toHaveBeenCalled()
  })

  it('writes parsed ids when input contains values', async () => {
    const clearSharedProductionIds = vi.fn(async () => undefined)
    const setSharedProductionIds = vi.fn(async () => undefined)

    await syncSharedProductionIdsWithApi('22A1\nSC70202602120085', {
      clearSharedProductionIds,
      setSharedProductionIds
    })

    expect(clearSharedProductionIds).not.toHaveBeenCalled()
    expect(setSharedProductionIds).toHaveBeenCalledWith(['22A1', 'SC70202602120085'])
  })
})
