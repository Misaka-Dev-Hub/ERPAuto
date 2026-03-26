/**
 * ReportAnalysisDialog Component - Refactored
 *
 * A comprehensive dashboard for analyzing ERP system execution reports.
 * Features include:
 * - Aggregated view: Daily metrics overview
 * - Comparison view: User performance comparison
 * - Interactive filtering and metric selection
 *
 * This refactored version separates concerns into:
 * - Custom hooks for business logic
 * - Reusable components for UI
 * - Utility functions for data processing
 */

import React, { useCallback } from 'react'
import { X, BarChart3, Loader2, AlertCircle } from 'lucide-react'
import { ReportAnalysisDialogProps, MetricKey } from './types'
import { useReportData } from './hooks/useReportData'
import { useChartData } from './hooks/useChartData'
import { useReportFilters } from './hooks/useReportFilters'
import { MetricSelector } from './components/MetricSelector'
import { ViewModeToggle } from './components/ViewModeToggle'
import { UserFilter } from './components/UserFilter'
import { ReportChart } from './components/ReportChart'

export const ReportAnalysisDialog: React.FC<ReportAnalysisDialogProps> = ({
  isOpen,
  onClose,
  isAdmin
}) => {
  // Data management hook
  const { isLoading, error, reportData, loadAndAnalyzeReports } = useReportData(isAdmin, isOpen)

  // Filter state management hook
  const {
    selectedMetrics,
    viewMode,
    selectedUsers,
    handleMetricToggle,
    handleViewModeChange,
    handleUserToggle,
    handleSelectAllUsers: handleSelectAllUsersWithParam,
    handleClearAllUsers
  } = useReportFilters()

  // Chart data transformation hook (must be called before using allUsers)
  const { chartData, allUsers, comparisonChartData } = useChartData(
    reportData,
    selectedUsers,
    selectedMetrics
  )

  // Adapt handleSelectAllUsers to match component interface
  const handleSelectAllUsers = useCallback(() => {
    handleSelectAllUsersWithParam(allUsers)
  }, [allUsers, handleSelectAllUsersWithParam])

  // Early returns for conditional rendering
  if (!isOpen) return null
  if (!isAdmin) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-[1000px] max-w-[95vw] h-[85vh] flex flex-col border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2 text-slate-800">
            <BarChart3 size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold">执行报告分析</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 p-1.5 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col bg-white">
          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={loadAndAnalyzeReports} />
          ) : chartData.length === 0 ? (
            <EmptyState />
          ) : (
            <MainContent
              viewMode={viewMode}
              selectedMetrics={selectedMetrics}
              selectedUsers={selectedUsers}
              allUsers={allUsers}
              chartData={chartData}
              comparisonChartData={comparisonChartData}
              handleMetricToggle={handleMetricToggle}
              handleViewModeChange={handleViewModeChange}
              handleUserToggle={handleUserToggle}
              handleSelectAllUsers={handleSelectAllUsers}
              handleClearAllUsers={handleClearAllUsers}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components for better organization
// ============================================================================

const LoadingState: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
    <Loader2 size={32} className="animate-spin text-blue-500 mb-4" />
    <p>正在分析报告数据，可能需要几秒钟...</p>
  </div>
)

const ErrorState: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => (
  <div className="flex-1 flex flex-col items-center justify-center text-red-500 p-8 text-center">
    <AlertCircle size={48} className="mb-4 opacity-80" />
    <p className="text-lg font-medium mb-2">分析失败</p>
    <p className="text-sm opacity-80">{error}</p>
    <button
      onClick={onRetry}
      className="mt-6 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
    >
      重试
    </button>
  </div>
)

const EmptyState: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
    <BarChart3 size={48} className="mb-4 opacity-50 text-slate-300" />
    <p>暂无报告数据可供分析</p>
  </div>
)

interface MainContentProps {
  viewMode: 'aggregated' | 'comparison'
  selectedMetrics: Set<MetricKey>
  selectedUsers: Set<string>
  allUsers: string[]
  chartData: any[]
  comparisonChartData: any[]
  handleMetricToggle: (metric: MetricKey) => void
  handleViewModeChange: (newMode: 'aggregated' | 'comparison') => void
  handleUserToggle: (user: string) => void
  handleSelectAllUsers: () => void
  handleClearAllUsers: () => void
}

const MainContent: React.FC<MainContentProps> = ({
  viewMode,
  selectedMetrics,
  selectedUsers,
  allUsers,
  chartData,
  comparisonChartData,
  handleMetricToggle,
  handleViewModeChange,
  handleUserToggle,
  handleSelectAllUsers,
  handleClearAllUsers
}) => (
  <div className="flex-1 flex flex-col p-6 overflow-y-auto">
    {/* Metric Selector */}
    <MetricSelector
      selectedMetrics={selectedMetrics}
      viewMode={viewMode}
      onMetricToggle={handleMetricToggle}
    />

    {/* View Mode Toggle */}
    <ViewModeToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />

    {/* User Filter - Only in comparison mode */}
    {viewMode === 'comparison' && (
      <UserFilter
        allUsers={allUsers}
        selectedUsers={selectedUsers}
        onUserToggle={handleUserToggle}
        onSelectAll={handleSelectAllUsers}
        onClearAll={handleClearAllUsers}
      />
    )}

    {/* Chart */}
    <ReportChart
      viewMode={viewMode}
      selectedMetrics={selectedMetrics}
      selectedUsers={selectedUsers}
      allUsers={allUsers}
      chartData={chartData}
      comparisonChartData={comparisonChartData}
    />

    {/* Description */}
    <div className="mt-4 text-center text-xs text-slate-400">
      {viewMode === 'aggregated'
        ? '数据以天为单位进行聚合统计。展示的是选定时间段内的总量。'
        : selectedUsers.size === 0
          ? '展示所有用户的数据对比。未选择用户时显示全部。'
          : '展示选定用户的数据对比。'}
    </div>
  </div>
)

export default ReportAnalysisDialog
