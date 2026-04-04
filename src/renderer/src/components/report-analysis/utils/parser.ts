/**
 * Parser utilities for extracting report data from markdown content
 * Optimized for performance with pre-compiled regex patterns
 */

// ============================================================================
// Result Types
// ============================================================================

interface ExtractValueResult {
  execTimeStr: string | null
  user: string
  processedOrders: number
  deletedMaterials: number
  skippedMaterials: number
  errors: number
  retriedOrders: number
  successfulRetries: number
  executionTimeStr: string
}

interface ParsedReportData {
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

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Extracts values from markdown report content using pre-compiled regex patterns.
 * Patterns are created once and reused for better performance.
 *
 * @param content - The markdown content to parse
 * @returns Extracted metrics values
 */
export const extractReportValues = (content: string): ExtractValueResult => {
  // Pre-compile regex patterns for better performance (js-hoist-regexp)
  const createPattern = (key: string) => ({
    standard: new RegExp(`\\|\\s*\\*\\*${key}\\*\\*\\s*\\|\\s*\`([^\`]+)\`\\s*\\|`),
    noBackticks: new RegExp(
      `\\|\\s*\\*\\*${key}\\*\\*\\s*\\|\\s*([^\\|\\s]+(?:\\s+[^\\|\\s]+)*)\\s*\\|`
    ),
    relaxed: new RegExp(`\\|\\s*\\*\\*${key}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|`)
  })

  const extractValue = (key: string): string | null => {
    const patterns = createPattern(key)

    for (const pattern of Object.values(patterns)) {
      const match = content.match(pattern)
      if (match && match[1]) {
        const value = match[1].trim()
        return value.replace(/`/g, '')
      }
    }
    return null
  }

  return {
    execTimeStr: extractValue('执行时间'),
    user: extractValue('操作用户') || 'unknown',
    processedOrders: parseInt(extractValue('处理订单数') || '0', 10),
    deletedMaterials: parseInt(extractValue('删除物料数') || '0', 10),
    skippedMaterials: parseInt(extractValue('跳过物料数') || '0', 10),
    errors: parseInt(extractValue('错误数量') || '0', 10),
    retriedOrders: parseInt(extractValue('重试订单数') || '0', 10),
    successfulRetries: parseInt(extractValue('成功重试数') || '0', 10),
    executionTimeStr: extractValue('执行耗时') || '0秒'
  }
}

/**
 * Parses duration string (e.g., "5分30秒", "120秒") to total seconds
 *
 * @param durationStr - Duration string to parse
 * @returns Total seconds
 */
export const parseDurationToSeconds = (durationStr: string): number => {
  // Handle empty or zero case
  if (!durationStr || durationStr === '0秒' || durationStr === '0分0秒') {
    return 0
  }

  // Remove any remaining backticks
  const cleanStr = durationStr.replace(/`/g, '').trim()

  let totalSeconds = 0
  const minutesMatch = cleanStr.match(/(\d+)分/)
  if (minutesMatch) {
    totalSeconds += parseInt(minutesMatch[1], 10) * 60
  }
  const secondsMatch = cleanStr.match(/(\d+)秒/)
  if (secondsMatch) {
    totalSeconds += parseInt(secondsMatch[1], 10)
  }

  return totalSeconds
}

/**
 * Formats a date object to Chinese date string format (YYYY-MM-DD)
 *
 * @param date - Date object to format
 * @returns Formatted date string
 */
export const formatDateToChinese = (date: Date): string => {
  return date
    .toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    .replace(/\//g, '-')
}

/**
 * Parses report metadata and content into a structured ReportMetrics object
 *
 * @param report - Report metadata with key, username, lastModified
 * @param content - Markdown content of the report
 * @returns Parsed report metrics
 */
export const parseReportData = (
  report: { key: string; username?: string; lastModified?: string | number | Date },
  content: string
): ParsedReportData => {
  const values = extractReportValues(content)
  const user = values.user || report.username || 'unknown'
  const executionTimeSecs = parseDurationToSeconds(values.executionTimeStr)

  if (values.executionTimeStr === '0秒') {
    try {
      window.electron?.logger?.log?.('warn', 'Failed to extract execution time from report', {
        reportKey: report.key,
        context: 'ReportParser'
      })
    } catch {
      // Gracefully degrade if logger unavailable
    }
  }

  // Try to parse the date
  let dateStr = '未知日期'
  let timestamp = report.lastModified ? new Date(report.lastModified).getTime() : 0

  if (values.execTimeStr) {
    try {
      const parsedDate = new Date(values.execTimeStr)
      if (!isNaN(parsedDate.getTime())) {
        dateStr = formatDateToChinese(parsedDate)
        timestamp = parsedDate.getTime()
      }
    } catch {
      // Fallback to report lastModified
    }
  }

  if (dateStr === '未知日期' && report.lastModified) {
    const d = new Date(report.lastModified)
    dateStr = formatDateToChinese(d)
  }

  return {
    date: dateStr,
    user,
    processedOrders: values.processedOrders,
    deletedMaterials: values.deletedMaterials,
    skippedMaterials: values.skippedMaterials,
    errors: values.errors,
    retriedOrders: values.retriedOrders,
    successfulRetries: values.successfulRetries,
    executionTimeSecs,
    timestamp
  }
}
