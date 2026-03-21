import { useEffect } from 'react'

interface ValidationSyncApi {
  clearSharedProductionIds: () => Promise<unknown>
  setSharedProductionIds: (ids: string[]) => Promise<unknown>
}

export function parseProductionIds(input: string): string[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export async function syncSharedProductionIdsWithApi(
  input: string,
  validationApi: ValidationSyncApi
): Promise<void> {
  const productionIds = parseProductionIds(input)

  if (productionIds.length === 0) {
    await validationApi.clearSharedProductionIds()
    return
  }

  await validationApi.setSharedProductionIds(productionIds)
}

async function syncSharedProductionIds(input: string): Promise<void> {
  await syncSharedProductionIdsWithApi(input, window.electron.validation)
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
