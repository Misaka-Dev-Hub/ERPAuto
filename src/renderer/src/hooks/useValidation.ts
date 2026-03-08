import { useState, useCallback } from 'react'

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
      const response = await window.electron.validation.validate(request)
      if (!response.success || !response.data) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: response.error || 'Validation failed'
        }))
        return response.success ? null : { success: false, error: response.error }
      }

      const result = response.data as ValidationResponse
      if (!result.success) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: result.error || 'Validation failed'
        }))
        return result
      }

      setState({
        loading: false,
        data: result.results || null,
        stats: result.stats || null,
        error: null
      })
      return result
    },
    []
  )

  const setSharedProductionIds = useCallback(async (ids: string[]): Promise<void> => {
    await window.electron.validation.setSharedProductionIds(ids)
  }, [])

  const getSharedProductionIds = useCallback(async (): Promise<string[]> => {
    const result = await window.electron.validation.getSharedProductionIds()
    if (!result.success || !result.data) {
      return []
    }
    const payload = result.data as { productionIds?: string[] }
    return payload.productionIds || []
  }, [])

  const getCleanerData = useCallback(async (): Promise<{
    orderNumbers: string[]
    materialCodes: string[]
  } | null> => {
    const result = await window.electron.validation.getCleanerData()
    if (!result.success || !result.data) {
      return null
    }

    const payload = result.data as {
      success?: boolean
      orderNumbers?: string[]
      materialCodes?: string[]
    }

    if (payload.success === false) {
      return null
    }

    return {
      orderNumbers: payload.orderNumbers || [],
      materialCodes: payload.materialCodes || []
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
