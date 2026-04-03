/**
 * ComparisonTooltip Component
 * Custom tooltip for comparison chart view showing user-specific metrics
 */

import React from 'react'
import { MetricKey } from '../types'

interface ComparisonTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
  users: string[]
  selectedUsers: Set<string>
  selectedMetrics: Set<MetricKey>
}

/**
 * Renders a detailed tooltip for the comparison chart view
 * Shows user-specific metric values for the selected date
 */
export const ComparisonTooltip = React.memo(
  ({ active, payload, label, users, selectedUsers, selectedMetrics }: ComparisonTooltipProps) => {
    if (!active || !payload || !payload.length) {
      return null
    }

    const displayUsers = selectedUsers.size === 0 ? users : Array.from(selectedUsers)
    const firstMetric = Array.from(selectedMetrics)[0]

    return (
      <div className="bg-white p-4 border border-slate-200 shadow-lg rounded-lg max-w-sm">
        <p className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-2">{label}</p>

        <div className="space-y-1.5 text-sm">
          {displayUsers.map((user: string) => {
            const userEntry = payload.find((p: any) => p.name === (user || '未分配'))
            if (!userEntry) return null

            return (
              <div key={user} className="flex justify-between items-center gap-4">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: userEntry.color }}
                  />
                  {user || '未分配'}:
                </span>
                <span className="font-medium text-slate-900">
                  {firstMetric === 'executionTimeSecs'
                    ? Number(userEntry.value).toFixed(1)
                    : userEntry.value}{' '}
                  {firstMetric === 'executionTimeSecs' ? '秒' : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison for memoization
    return (
      prevProps.label === nextProps.label &&
      prevProps.selectedUsers.size === nextProps.selectedUsers.size &&
      prevProps.selectedMetrics.size === nextProps.selectedMetrics.size &&
      prevProps.payload?.length === nextProps.payload?.length
    )
  }
)

ComparisonTooltip.displayName = 'ComparisonTooltip'
