import { describe, expect, it } from 'vitest'
import {
  canStartHistoryLoad,
  getNextHistoryLoadState
} from '../../src/renderer/src/components/cleaner-history-load-state'

describe('cleaner history load state helpers', () => {
  it('allows initial and failed loads to retry', () => {
    expect(canStartHistoryLoad('idle')).toBe(true)
    expect(canStartHistoryLoad('error')).toBe(true)
  })

  it('prevents duplicate requests after loading starts or succeeds', () => {
    expect(canStartHistoryLoad('loading')).toBe(false)
    expect(canStartHistoryLoad('success')).toBe(false)
  })

  it('retries after an error but keeps successful loads cached', () => {
    const failedState = getNextHistoryLoadState('loading', 'error')
    const retryState = getNextHistoryLoadState(failedState, 'start')
    const successState = getNextHistoryLoadState(retryState, 'success')
    const blockedState = getNextHistoryLoadState(successState, 'start')

    expect(failedState).toBe('error')
    expect(retryState).toBe('loading')
    expect(successState).toBe('success')
    expect(blockedState).toBe('success')
  })
})
