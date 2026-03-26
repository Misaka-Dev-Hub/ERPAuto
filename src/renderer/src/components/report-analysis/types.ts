/**
 * Type definitions for Report Analysis feature
 * Centralized type management for better maintainability
 */

// ============================================================================
// Domain Types
// ============================================================================

/**
 * Extracted metrics from a single report
 */
export interface ReportMetrics {
  date: string
  user: string
  processedOrders: number
  deletedMaterials: number
  skippedMaterials: number
  errors: number
  retriedOrders: number
  successfulRetries: number
  executionTimeSecs: number
  timestamp: number
}

/**
 * Aggregated daily metrics
 */
export interface DailyMetrics {
  date: string
  processedOrders: number
  deletedMaterials: number
  skippedMaterials: number
  errors: number
  retriedOrders: number
  successfulRetries: number
  executionTimeSecs: number
  avgExecutionTimeSecs: number
  users: string[] // Unique users who ran reports on this day
  reportCount: number
}

/**
 * User-specific daily metrics for comparison view
 */
export interface UserDailyMetrics {
  date: string
  user: string
  processedOrders: number
  deletedMaterials: number
  skippedMaterials: number
  errors: number
  retriedOrders: number
  successfulRetries: number
  executionTimeSecs: number
  reportCount: number
}

// ============================================================================
// UI Types
// ============================================================================

/**
 * Available metric keys for chart display
 */
export type MetricKey = keyof Omit<
  DailyMetrics,
  'date' | 'users' | 'reportCount' | 'avgExecutionTimeSecs'
>

/**
 * View mode for the analysis display
 */
export type ViewMode = 'aggregated' | 'comparison'

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * Props for the main ReportAnalysisDialog component
 */
export interface ReportAnalysisDialogProps {
  isOpen: boolean
  onClose: () => void
  isAdmin: boolean
}

/**
 * Props for custom tooltip component
 */
export interface CustomTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
  chartData: DailyMetrics[]
}

/**
 * Props for comparison tooltip component
 */
export interface ComparisonTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
  users: string[]
  selectedUsers: Set<string>
  selectedMetrics: Set<MetricKey>
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Metric labels mapping
 */
export const METRIC_LABELS: Record<MetricKey, string> = {
  processedOrders: '处理订单数',
  deletedMaterials: '删除物料数',
  skippedMaterials: '跳过物料数',
  errors: '错误数量',
  retriedOrders: '重试订单数',
  successfulRetries: '成功重试数',
  executionTimeSecs: '每订单平均耗时(秒)'
}

/**
 * Metric colors mapping
 */
export const METRIC_COLORS: Record<MetricKey, string> = {
  processedOrders: '#3b82f6', // blue-500
  deletedMaterials: '#ef4444', // red-500
  skippedMaterials: '#eab308', // yellow-500
  errors: '#000000', // black
  retriedOrders: '#8b5cf6', // violet-500
  successfulRetries: '#10b981', // emerald-500
  executionTimeSecs: '#f97316' // orange-500
}

/**
 * User colors for comparison view
 */
export const USER_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16' // lime-500
]
