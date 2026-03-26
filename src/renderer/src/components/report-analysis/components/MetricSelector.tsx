/**
 * MetricSelector Component
 * Allows users to select which metrics to display in the chart
 * Supports both single-select (comparison mode) and multi-select (aggregated mode)
 */

import React from 'react'
import { MetricKey, METRIC_LABELS, METRIC_COLORS } from '../types'

interface MetricSelectorProps {
  selectedMetrics: Set<MetricKey>
  viewMode: 'aggregated' | 'comparison'
  onMetricToggle: (metric: MetricKey) => void
}

/**
 * Renders a list of metric selection buttons
 * Shows multi-select hint in aggregated mode and single-select hint in comparison mode
 */
export const MetricSelector: React.FC<MetricSelectorProps> = ({
  selectedMetrics,
  viewMode,
  onMetricToggle
}) => {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-medium text-slate-700 mb-3">
        选择呈现内容 ({viewMode === 'comparison' ? '单选' : '多选'})
      </h3>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(METRIC_LABELS) as MetricKey[]).map((key) => {
          const isSelected = selectedMetrics.has(key)
          return (
            <button
              key={key}
              onClick={() => onMetricToggle(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isSelected ? METRIC_COLORS[key] : '#cbd5e1' }}
              />
              {METRIC_LABELS[key]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
