/**
 * IPC Hook for Validation operations
 *
 * Provides a React-friendly interface for validation IPC calls
 * with loading state, error handling, and data management.
 */

import { useState, useCallback } from 'react'

// Types based on validation types
interface ValidationRequest {
  mode: 'database_full' | 'database_filtered'
  productionIdFile?: string
  useSharedProductionIds?: boolean
}

interface ValidationResult {
  materialName: string
  materialCode: string
  specification: string
  model: string
  managerName: string
  isMarkedForDeletion: boolean
  matchedTypeKeyword?: string
}

interface ValidationStats {
  totalRecords: number
  matchedCount: number
  markedCount: number
}

interface ValidationResponse {
  success: boolean
  results?: ValidationResult[]
  stats?: ValidationStats
  error?: string
}

interface UseValidationState {
  loading: boolean
  data: ValidationResult[] | null
  stats: ValidationStats | null
  error: string | null
}

interface UseValidationReturn extends UseValidationState {
  validate: (request: ValidationRequest) => Promise<ValidationResponse | null>
  setSharedProductionIds: (ids: string[]) => Promise<void>
  getSharedProductionIds: () => Promise<string[]>
  getCleanerData: () => Promise<{ orderNumbers: string[]; materialCodes: string[] } | null>
  reset: () => void
}

/**
 * Hook for validation operations
 */
export function useValidation(): UseValidationReturn {
  const [state, setState] = useState<UseValidationState>({
    loading: false,
    data: null,
    stats: null,
    error: null
  })

  const validate = useCallback(
    async (request: ValidationRequest): Promise<ValidationResponse | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const result = await window.electron.ipcRenderer.invoke('validation:validate', request)

        if (result.success) {
          setState({
            loading: false,
            data: result.results || null,
            stats: result.stats || null,
            error: null
          })
          return result
        } else {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: result.error || 'Validation failed'
          }))
          return result
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        setState((prev) => ({ ...prev, loading: false, error: message }))
        return null
      }
    },
    []
  )

  const setSharedProductionIds = useCallback(async (ids: string[]): Promise<void> => {
    try {
      await window.electron.ipcRenderer.invoke('validation:setSharedProductionIds', ids)
    } catch (error) {
      console.error('Failed to set shared production IDs:', error)
    }
  }, [])

  const getSharedProductionIds = useCallback(async (): Promise<string[]> => {
    try {
      const result = await window.electron.ipcRenderer.invoke('validation:getSharedProductionIds')
      return result?.productionIds || []
    } catch {
      return []
    }
  }, [])

  const getCleanerData = useCallback(async (): Promise<{
    orderNumbers: string[]
    materialCodes: string[]
  } | null> => {
    try {
      const result = await window.electron.ipcRenderer.invoke('validation:getCleanerData')
      if (result.success) {
        return {
          orderNumbers: result.orderNumbers || [],
          materialCodes: result.materialCodes || []
        }
      }
      return null
    } catch {
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setState({
      loading: false,
      data: null,
      stats: null,
      error: null
    })
  }, [])

  return {
    ...state,
    validate,
    setSharedProductionIds,
    getSharedProductionIds,
    getCleanerData,
    reset
  }
}

export default useValidation
