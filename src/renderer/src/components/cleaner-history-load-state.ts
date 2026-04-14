export type HistoryLoadState = 'idle' | 'loading' | 'success' | 'error'

export const canStartHistoryLoad = (state: HistoryLoadState): boolean =>
  state === 'idle' || state === 'error'

export const getNextHistoryLoadState = (
  currentState: HistoryLoadState,
  event: 'start' | 'success' | 'error'
): HistoryLoadState => {
  if (event === 'start') {
    return canStartHistoryLoad(currentState) ? 'loading' : currentState
  }

  if (event === 'success') {
    return 'success'
  }

  return 'error'
}
