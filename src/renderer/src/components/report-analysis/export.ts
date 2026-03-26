/**
 * Report Analysis Feature Module
 * Centralized exports for the refactored report analysis components
 */

// Main component
export { ReportAnalysisDialog, default } from './index'

// Types
export type {
  ReportMetrics,
  DailyMetrics,
  UserDailyMetrics,
  MetricKey,
  ViewMode,
  ReportAnalysisDialogProps,
  CustomTooltipProps,
  ComparisonTooltipProps
} from './types'

export { METRIC_LABELS, METRIC_COLORS, USER_COLORS } from './types'

// Hooks
export { useReportData } from './hooks/useReportData'
export { useChartData } from './hooks/useChartData'
export { useReportFilters } from './hooks/useReportFilters'

// Components
export { MetricSelector } from './components/MetricSelector'
export { ViewModeToggle } from './components/ViewModeToggle'
export { UserFilter } from './components/UserFilter'
export { ReportChart } from './components/ReportChart'
export { CustomTooltip } from './components/CustomTooltip'
export { ComparisonTooltip } from './components/ComparisonTooltip'

// Utilities
export {
  extractReportValues,
  parseDurationToSeconds,
  formatDateToChinese,
  parseReportData
} from './utils/parser'

export {
  aggregateByDate,
  extractAllUsers,
  aggregateByUserAndDate,
  formatComparisonChartData,
  getUserColor
} from './utils/aggregators'
