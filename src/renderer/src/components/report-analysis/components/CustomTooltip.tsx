/**
 * CustomTooltip Component
 * Custom tooltip for aggregated chart view showing daily metrics
 */

import React from 'react'
import { DailyMetrics } from '../types'

interface CustomTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
  chartData: DailyMetrics[]
}

/**
 * Renders a detailed tooltip for the aggregated chart view
 * Shows metric values along with additional context like user count and report count
 */
export const CustomTooltip = React.memo(
  ({ active, payload, label, chartData }: CustomTooltipProps) => {
    if (!active || !payload || !payload.length) {
      return null
    }

    const dailyData = chartData.find((d) => d.date === label)

    return (
      <div className="bg-white p-4 border border-slate-200 shadow-lg rounded-lg max-w-sm">
        <p className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-2">{label}</p>

        <div className="space-y-1.5 text-sm">
          {payload.map((entry: any, index: number) => (
            <div key={`${entry.name}-${index}`} className="flex justify-between items-center gap-4">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: entry.color }}
                ></span>
                {entry.name}:
              </span>
              <span className="font-medium text-slate-900">
                {entry.dataKey === 'executionTimeSecs' ? Number(entry.value).toFixed(1) : entry.value} {entry.dataKey === 'executionTimeSecs' ? '秒' : ''}
              </span>
            </div>
          ))}
        </div>

        {dailyData && (
          <div className="mt-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <p>操作用户: {dailyData.users.join(', ')}</p>
            <p className="mt-1">报告总数: {dailyData.reportCount}</p>
          </div>
        )}
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison for memoization
    return (
      prevProps.label === nextProps.label &&
      prevProps.payload?.length === nextProps.payload?.length &&
      prevProps.chartData === nextProps.chartData
    )
  }
)

CustomTooltip.displayName = 'CustomTooltip'
