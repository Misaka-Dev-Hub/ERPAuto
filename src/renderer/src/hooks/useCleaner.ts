/**
 * IPC Hook for Cleaner operations
 *
 * Provides a React-friendly interface for cleaner IPC calls
 * with loading state, error handling, and data management.
 */

import { useState, useCallback } from 'react'

// Types based on the cleaner types
interface CleanerInput {
  orderNumbers: string[]
  materialCodes: string[]
  dryRun: boolean
}

interface CleanerResult {
  processedCount: number
  errors: string[]
}

interface UseCleanerState {
  loading: boolean
  data: CleanerResult | null
  error: string | null
}

interface UseCleanerReturn extends UseCleanerState {
  execute: (input: CleanerInput) => Promise<CleanerResult | null>
  reset: () => void
}

/**
 * Hook for executing cleaner operations
 */
export function useCleaner(): UseCleanerReturn {
  const [state, setState] = useState<UseCleanerState>({
    loading: false,
    data: null,
    error: null
  })

  const execute = useCallback(async (input: CleanerInput): Promise<CleanerResult | null> => {
    setState({ loading: true, data: null, error: null })

    try {
      const result = await window.electron.ipcRenderer.invoke('cleaner:run', input) as any

      if (result.success) {
        setState({ loading: false, data: result.data, error: null })
        return result.data
      } else {
        setState({ loading: false, data: null, error: result.error || 'Unknown error' })
        return null
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setState({ loading: false, data: null, error: message })
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setState({ loading: false, data: null, error: null })
  }, [])

  return {
    ...state,
    execute,
    reset
  }
}

export default useCleaner
