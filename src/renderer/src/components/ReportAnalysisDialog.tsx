/**
 * ReportAnalysisDialog Component - Re-export
 *
 * This file now re-exports the refactored component from the report-analysis module.
 * All functionality has been preserved while improving code organization.
 *
 * The refactored version is located at: ./report-analysis/index.tsx
 *
 * Refactoring changes:
 * - Split into 11 focused files (was 948 lines, now ~150 lines per file)
 * - Extracted custom hooks for business logic
 * - Separated UI components for better reusability
 * - Centralized type definitions
 * - Isolated utility functions for easier testing
 *
 * @see ./report-analysis/ for the refactored implementation
 */

// Re-export everything from the refactored module
export { ReportAnalysisDialog as default, ReportAnalysisDialog } from './report-analysis'

// Re-export types for external use
export type {
  ReportMetrics,
  DailyMetrics,
  UserDailyMetrics,
  MetricKey,
  ViewMode,
  ReportAnalysisDialogProps,
  CustomTooltipProps,
  ComparisonTooltipProps
} from './report-analysis/types'

// Re-export constants
export { METRIC_LABELS, METRIC_COLORS, USER_COLORS } from './report-analysis/types'
