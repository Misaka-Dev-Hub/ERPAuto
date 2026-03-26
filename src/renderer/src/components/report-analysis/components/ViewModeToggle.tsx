/**
 * ViewModeToggle Component
 * Allows users to switch between aggregated and comparison view modes
 */

import React from 'react'
import { ViewMode } from '../types'

interface ViewModeToggleProps {
  viewMode: ViewMode
  onViewModeChange: (newMode: ViewMode) => void
}

/**
 * Renders toggle buttons for switching between view modes
 * Aggregated: shows data grouped by date
 * Comparison: shows data grouped by user for comparison
 */
export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ viewMode, onViewModeChange }) => {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-slate-700 mb-3">视图模式</h3>
      <div className="flex gap-2">
        <button
          onClick={() => onViewModeChange('aggregated')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            viewMode === 'aggregated'
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          按日期聚合
        </button>
        <button
          onClick={() => onViewModeChange('comparison')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            viewMode === 'comparison'
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          用户对比
        </button>
      </div>
    </div>
  )
}
