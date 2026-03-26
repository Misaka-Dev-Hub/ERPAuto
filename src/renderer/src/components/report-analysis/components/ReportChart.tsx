/**
 * ReportChart Component
 * Renders the main chart display with support for both aggregated and comparison views
 * Uses Recharts library for responsive, interactive charts
 */

import React from 'react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart
} from 'recharts'
import { DailyMetrics, MetricKey, METRIC_LABELS, METRIC_COLORS, USER_COLORS } from '../types'
import { CustomTooltip } from './CustomTooltip'
import { ComparisonTooltip } from './ComparisonTooltip'

interface ReportChartProps {
  viewMode: 'aggregated' | 'comparison'
  selectedMetrics: Set<MetricKey>
  selectedUsers: Set<string>
  allUsers: string[]
  chartData: DailyMetrics[]
  comparisonChartData: any[]
}

/**
 * Helper function to get consistent color for a user
 */
const getUserColor = (user: string, users: string[]): string => {
  const index = users.indexOf(user)
  return USER_COLORS[index % USER_COLORS.length]
}

/**
 * Renders the appropriate chart based on view mode
 * - Aggregated: Shows metrics grouped by date
 * - Comparison: Shows metrics grouped by user for comparison
 */
export const ReportChart: React.FC<ReportChartProps> = ({
  viewMode,
  selectedMetrics,
  selectedUsers,
  allUsers,
  chartData,
  comparisonChartData
}) => {
  return (
    <div className="flex-1 min-h-[400px]">
      {viewMode === 'aggregated' ? (
        // Aggregated view: metrics by date
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              dy={10}
            />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
            <Tooltip content={<CustomTooltip chartData={chartData} />} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />

            {Array.from(selectedMetrics).map((metric) => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                name={METRIC_LABELS[metric]}
                stroke={METRIC_COLORS[metric]}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        // Comparison view: metrics by user
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={comparisonChartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              dy={10}
            />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
            <Tooltip
              content={
                <ComparisonTooltip
                  users={allUsers}
                  selectedUsers={selectedUsers}
                  selectedMetrics={selectedMetrics}
                />
              }
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />

            {selectedUsers.size === 0 || selectedUsers.size > 1
              ? // Multiple users: show first metric for each user
                allUsers
                  .filter((user) => selectedUsers.size === 0 || selectedUsers.has(user))
                  .map((user) => (
                    <Line
                      key={user}
                      type="monotone"
                      dataKey={`${user}_${Array.from(selectedMetrics)[0]}`}
                      name={user || '未分配'}
                      stroke={getUserColor(user, allUsers)}
                      strokeWidth={2}
                      dot={{ r: 4, strokeWidth: 2 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  ))
              : // Single user: show all metrics for that user
                Array.from(selectedMetrics).map((metric) => {
                  const user = Array.from(selectedUsers)[0]
                  return (
                    <Line
                      key={metric}
                      type="monotone"
                      dataKey={`${user}_${metric}`}
                      name={METRIC_LABELS[metric]}
                      stroke={METRIC_COLORS[metric]}
                      strokeWidth={2}
                      dot={{ r: 4, strokeWidth: 2 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  )
                })}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
