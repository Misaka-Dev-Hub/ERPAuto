/**
 * Custom hook for managing report analysis filters and view modes
 * Handles metric selection, view mode switching, and user filtering
 */

import { useState, useCallback } from 'react'
import { MetricKey, ViewMode } from '../types'

interface UseReportFiltersResult {
  selectedMetrics: Set<MetricKey>
  viewMode: ViewMode
  selectedUsers: Set<string>
  handleMetricToggle: (metric: MetricKey) => void
  handleViewModeChange: (newMode: ViewMode) => void
  handleUserToggle: (user: string) => void
  handleSelectAllUsers: (users: string[]) => void
  handleClearAllUsers: () => void
}

/**
 * Hook for managing filter state and user interactions
 *
 * @returns Filter state and handler functions
 */
export const useReportFilters = (): UseReportFiltersResult => {
  const [selectedMetrics, setSelectedMetrics] = useState<Set<MetricKey>>(
    new Set(['processedOrders', 'deletedMaterials', 'errors'])
  )

  const [viewMode, setViewMode] = useState<ViewMode>('aggregated')

  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())

  /**
   * Handles metric selection with view mode awareness
   * In comparison view: single selection only
   * In aggregated view: multiple selection allowed
   */
  const handleMetricToggle = useCallback(
    (metric: MetricKey) => {
      setSelectedMetrics((prev) => {
        const next = new Set(prev)

        if (viewMode === 'comparison') {
          // Single selection mode for comparison view
          return new Set([metric])
        } else {
          // Multi-selection mode for aggregated view
          if (next.has(metric)) {
            // Ensure at least one metric is selected
            if (next.size > 1) {
              next.delete(metric)
            }
          } else {
            next.add(metric)
          }
          return next
        }
      })
    },
    [viewMode]
  )

  /**
   * Handles view mode switching with automatic metric adjustment
   * When switching to comparison view, keeps only first selected metric
   */
  const handleViewModeChange = useCallback((newMode: ViewMode) => {
    setViewMode(newMode)

    // When switching to comparison view, keep only the first selected metric
    if (newMode === 'comparison') {
      setSelectedMetrics((prev) => {
        if (prev.size > 1) {
          const firstMetric = Array.from(prev)[0]
          return new Set([firstMetric])
        }
        return prev
      })
    }
  }, [])

  /**
   * Handles user selection toggle
   */
  const handleUserToggle = useCallback((user: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev)
      if (next.has(user)) {
        next.delete(user)
      } else {
        next.add(user)
      }
      return next
    })
  }, [])

  /**
   * Selects all provided users
   */
  const handleSelectAllUsers = useCallback((users: string[]) => {
    setSelectedUsers(new Set(users))
  }, [])

  /**
   * Clears all user selections
   */
  const handleClearAllUsers = useCallback(() => {
    setSelectedUsers(new Set())
  }, [])

  return {
    selectedMetrics,
    viewMode,
    selectedUsers,
    handleMetricToggle,
    handleViewModeChange,
    handleUserToggle,
    handleSelectAllUsers,
    handleClearAllUsers
  }
}
