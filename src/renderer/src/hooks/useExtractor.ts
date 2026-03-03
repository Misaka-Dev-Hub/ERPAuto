/**
 * IPC Hook for Extractor operations
 *
 * Provides a React-friendly interface for extractor IPC calls
 * with loading state, error handling, and data management.
 */

import { useState, useCallback } from 'react'

// Types based on the extractor types
interface ExtractorInput {
  orderNumbers: string[]
  batchSize?: number
}

interface ExtractorResult {
  data: Record<string, unknown>[]
  errors: string[]
}

interface UseExtractorState {
  loading: boolean
  data: ExtractorResult | null
  error: string | null
}

interface UseExtractorReturn extends UseExtractorState {
  execute: (input: ExtractorInput) => Promise<ExtractorResult | null>
  reset: () => void
}

/**
 * Hook for executing extractor operations
 */
export function useExtractor(): UseExtractorReturn {
  const [state, setState] = useState<UseExtractorState>({
    loading: false,
    data: null,
    error: null
  })

  const execute = useCallback(async (input: ExtractorInput): Promise<ExtractorResult | null> => {
    setState({ loading: true, data: null, error: null })

    try {
      const result = await window.electron.ipcRenderer.invoke('extractor:run', input) as any

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

export default useExtractor
