import { useEffect } from 'react'

function parseProductionIds(input: string): string[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

async function syncSharedProductionIds(input: string): Promise<void> {
  const productionIds = parseProductionIds(input)

  if (productionIds.length === 0) {
    await window.electron.validation.clearSharedProductionIds()
    return
  }

  await window.electron.validation.setSharedProductionIds(productionIds)
}

export function useSharedProductionIds(orderNumbers: string, debounceMs = 300) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void syncSharedProductionIds(orderNumbers)
    }, debounceMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [debounceMs, orderNumbers])

  return {
    clearSharedProductionIdsNow: () => window.electron.validation.clearSharedProductionIds(),
    syncSharedProductionIdsNow: () => syncSharedProductionIds(orderNumbers)
  }
}
