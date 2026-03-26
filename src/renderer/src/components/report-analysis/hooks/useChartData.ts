/**
 * Custom hook for transforming report data into chart-ready formats
 * Handles data aggregation for different view modes
 */

import { useMemo } from 'react'
import { ReportMetrics, DailyMetrics, UserDailyMetrics, MetricKey } from '../types'
import {
  aggregateByDate,
  extractAllUsers,
  aggregateByUserAndDate,
  formatComparisonChartData
} from '../utils/aggregators'

interface UseChartDataResult {
  chartData: DailyMetrics[]
  allUsers: string[]
  comparisonData: UserDailyMetrics[]
  comparisonChartData: any[]
}

/**
 * Hook for managing chart data transformations
 *
 * @param reportData - Raw report metrics data
 * @param selectedUsers - Set of selected users for filtering
 * @param selectedMetrics - Set of selected metrics to display
 * @returns Transformed data ready for chart rendering
 */
export const useChartData = (
  reportData: ReportMetrics[],
  selectedUsers: Set<string>,
  selectedMetrics: Set<MetricKey>
): UseChartDataResult => {
  // Aggregate data by date
  const chartData = useMemo(() => aggregateByDate(reportData), [reportData])

  // Extract all unique users from report data
  const allUsers = useMemo(() => extractAllUsers(reportData), [reportData])

  // Aggregate data by date AND user for comparison view
  const comparisonData = useMemo(
    () => aggregateByUserAndDate(reportData, selectedUsers),
    [reportData, selectedUsers]
  )

  // Format comparison data for chart rendering
  const comparisonChartData = useMemo(
    () => formatComparisonChartData(comparisonData, selectedUsers, selectedMetrics),
    [comparisonData, selectedUsers, selectedMetrics]
  )

  return {
    chartData,
    allUsers,
    comparisonData,
    comparisonChartData
  }
}
