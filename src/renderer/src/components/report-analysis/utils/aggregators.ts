/**
 * Data aggregation utilities for transforming raw report data
 * Handles date-based and user-based aggregations
 */

import { ReportMetrics, DailyMetrics, UserDailyMetrics, MetricKey } from '../types'

// ============================================================================
// Aggregation Functions
// ============================================================================

/**
 * Aggregates report data by date for the overview chart
 * Calculates totals and averages for each day
 *
 * @param reportData - Array of individual report metrics
 * @returns Array of daily aggregated metrics sorted by date
 */
export const aggregateByDate = (reportData: ReportMetrics[]): DailyMetrics[] => {
  if (!reportData.length) return []

  const dailyMap = new Map<string, DailyMetrics>()

  // First pass: aggregate by date
  for (const data of reportData) {
    const { date } = data

    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        processedOrders: 0,
        deletedMaterials: 0,
        skippedMaterials: 0,
        errors: 0,
        retriedOrders: 0,
        successfulRetries: 0,
        executionTimeSecs: 0,
        avgExecutionTimeSecs: 0,
        users: [],
        reportCount: 0
      })
    }

    const day = dailyMap.get(date)!
    day.processedOrders += data.processedOrders
    day.deletedMaterials += data.deletedMaterials
    day.skippedMaterials += data.skippedMaterials
    day.errors += data.errors
    day.retriedOrders += data.retriedOrders
    day.successfulRetries += data.successfulRetries
    day.executionTimeSecs += data.executionTimeSecs
    day.reportCount += 1

    if (!day.users.includes(data.user)) {
      day.users.push(data.user)
    }
  }

  // Second pass: calculate averages
  for (const day of dailyMap.values()) {
    day.avgExecutionTimeSecs =
      day.processedOrders > 0 ? day.executionTimeSecs / day.processedOrders : 0
    // Replace executionTimeSecs with avgExecutionTimeSecs for chart display
    day.executionTimeSecs = day.avgExecutionTimeSecs
  }

  // Convert map to array and sort by date
  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Extracts all unique users from report data
 *
 * @param reportData - Array of individual report metrics
 * @returns Sorted array of unique usernames
 */
export const extractAllUsers = (reportData: ReportMetrics[]): string[] => {
  const userSet = new Set<string>()
  reportData.forEach((data) => userSet.add(data.user))
  return Array.from(userSet).sort()
}

/**
 * Aggregates report data by date AND user for comparison view
 * Allows comparing multiple users across the same time periods
 *
 * @param reportData - Array of individual report metrics
 * @param selectedUsers - Set of selected users for filtering (empty = all)
 * @returns Array of user-daily aggregated metrics sorted by date and user
 */
export const aggregateByUserAndDate = (
  reportData: ReportMetrics[],
  selectedUsers: Set<string>
): UserDailyMetrics[] => {
  if (!reportData.length) return []

  // Filter by selected users if any
  const filteredData =
    selectedUsers.size > 0 ? reportData.filter((data) => selectedUsers.has(data.user)) : reportData

  // Group by date + user
  const keyMap = new Map<string, UserDailyMetrics>()

  for (const data of filteredData) {
    const key = `${data.date}|${data.user}`

    if (!keyMap.has(key)) {
      keyMap.set(key, {
        date: data.date,
        user: data.user,
        processedOrders: 0,
        deletedMaterials: 0,
        skippedMaterials: 0,
        errors: 0,
        retriedOrders: 0,
        successfulRetries: 0,
        executionTimeSecs: 0,
        reportCount: 0
      })
    }

    const entry = keyMap.get(key)!
    entry.processedOrders += data.processedOrders
    entry.deletedMaterials += data.deletedMaterials
    entry.skippedMaterials += data.skippedMaterials
    entry.errors += data.errors
    entry.retriedOrders += data.retriedOrders
    entry.successfulRetries += data.successfulRetries
    entry.executionTimeSecs += data.executionTimeSecs
    entry.reportCount += 1
  }

  // Calculate average execution time per order for each entry
  for (const entry of keyMap.values()) {
    entry.executionTimeSecs =
      entry.processedOrders > 0 ? entry.executionTimeSecs / entry.processedOrders : 0
  }

  return Array.from(keyMap.values()).sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date)
    if (dateCompare !== 0) return dateCompare
    return a.user.localeCompare(b.user)
  })
}

/**
 * Formats comparison data for chart rendering
 * Transforms user-date data into a format suitable for Recharts
 *
 * @param comparisonData - Array of user-daily aggregated metrics
 * @param selectedUsers - Set of selected users for filtering
 * @param selectedMetrics - Set of selected metrics to display
 * @returns Array of chart data points formatted for Recharts
 */
export const formatComparisonChartData = (
  comparisonData: UserDailyMetrics[],
  selectedUsers: Set<string>,
  selectedMetrics: Set<MetricKey>
): any[] => {
  if (!comparisonData.length) return []

  const dates = [...new Set(comparisonData.map((d) => d.date))].sort()
  const users = [...new Set(comparisonData.map((d) => d.user))]
    .filter((user) => selectedUsers.size === 0 || selectedUsers.has(user))
    .sort()

  const lookup = new Map<string, UserDailyMetrics>()
  comparisonData.forEach((d) => {
    lookup.set(`${d.date}|${d.user}`, d)
  })

  return dates.map((date) => {
    const point: any = { date }
    users.forEach((user) => {
      const key = `${date}|${user}`
      const data = lookup.get(key)

      Array.from(selectedMetrics).forEach((metric) => {
        const userKey = `${user}_${metric}` as any
        point[userKey] = data ? (data as any)[metric] : 0
      })
    })
    return point
  })
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets a consistent color for a user based on their position in the list
 *
 * @param user - Username to get color for
 * @param users - Array of all users (for consistent indexing)
 * @param colors - Array of color values to cycle through
 * @returns Color hex string
 */
export const getUserColor = (user: string, users: string[], colors: string[]): string => {
  const index = users.indexOf(user)
  return colors[index % colors.length]
}
