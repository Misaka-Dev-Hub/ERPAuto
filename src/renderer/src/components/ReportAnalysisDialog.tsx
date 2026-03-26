import React, { useCallback, useEffect, useState, useMemo } from 'react'
import { X, BarChart3, Loader2, AlertCircle } from 'lucide-react'
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

interface ReportAnalysisDialogProps {
  isOpen: boolean
  onClose: () => void
  isAdmin: boolean
}

// Extracted metrics from a single report
interface ReportMetrics {
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

// Aggregated daily metrics
interface DailyMetrics {
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

// User-specific daily metrics for comparison view
interface UserDailyMetrics {
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

type MetricKey = keyof Omit<DailyMetrics, 'date' | 'users' | 'reportCount' | 'avgExecutionTimeSecs'>

const METRIC_LABELS: Record<MetricKey, string> = {
  processedOrders: '处理订单数',
  deletedMaterials: '删除物料数',
  skippedMaterials: '跳过物料数',
  errors: '错误数量',
  retriedOrders: '重试订单数',
  successfulRetries: '成功重试数',
  executionTimeSecs: '每订单平均耗时(秒)'
}

const METRIC_COLORS: Record<MetricKey, string> = {
  processedOrders: '#3b82f6', // blue-500
  deletedMaterials: '#ef4444', // red-500
  skippedMaterials: '#eab308', // yellow-500
  errors: '#000000', // black
  retriedOrders: '#8b5cf6', // violet-500
  successfulRetries: '#10b981', // emerald-500
  executionTimeSecs: '#f97316' // orange-500
}

// User colors for comparison view
const USER_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16'  // lime-500
]

const getUserColor = (user: string, users: string[]): string => {
  const index = users.indexOf(user)
  return USER_COLORS[index % USER_COLORS.length]
}

export const ReportAnalysisDialog: React.FC<ReportAnalysisDialogProps> = ({
  isOpen,
  onClose,
  isAdmin
}) => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportData, setReportData] = useState<ReportMetrics[]>([])

  // Selected metrics for the chart
  const [selectedMetrics, setSelectedMetrics] = useState<Set<MetricKey>>(
    new Set(['processedOrders', 'deletedMaterials', 'errors'])
  )

  // View mode: aggregated (by date) or comparison (by user)
  const [viewMode, setViewMode] = useState<'aggregated' | 'comparison'>('aggregated')

  // Selected users for comparison view
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())

  const parseDurationToSeconds = (durationStr: string): number => {
    // Handle empty or zero case
    if (!durationStr || durationStr === '0秒' || durationStr === '0分0秒') {
      return 0
    }

    // Remove any remaining backticks
    const cleanStr = durationStr.replace(/\`/g, '').trim()

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

  const loadAndAnalyzeReports = useCallback(async () => {
    if (!isAdmin) return

    setIsLoading(true)
    setError(null)
    try {
      // 1. Fetch report list
      const listResult = await window.electron.report.listAll()
      if (!listResult.success || !listResult.data) {
        throw new Error(listResult.error || '获取报告列表失败')
      }

      const reports = listResult.data
      const metricsList: ReportMetrics[] = []

      // 2. Fetch content for each report (in chunks to avoid memory/network issues if there are many)
      const chunkSize = 10
      for (let i = 0; i < reports.length; i += chunkSize) {
        const chunk = reports.slice(i, i + chunkSize)
        const contentPromises = chunk.map(async (report) => {
          try {
            const contentResult = await window.electron.report.download(report.key)
            if (contentResult.success && contentResult.data) {
              return { report, content: contentResult.data }
            }
          } catch (e) {
            console.warn(`Failed to fetch content for report ${report.key}`, e)
          }
          return null
        })

        const chunkContents = await Promise.all(contentPromises)

        // 3. Parse each report's markdown content
        for (const item of chunkContents) {
          if (!item) continue

          const { report, content } = item

          // Regex to extract values from the markdown table
          const extractValue = (key: string): string | null => {
            // Try multiple patterns in order of specificity
            const patterns = [
              // Pattern 1: Standard format with backticks
              new RegExp(`\\|\\s*\\*\\*${key}\\*\\*\\s*\\|\\s*\`([^\`]+)\`\\s*\\|`),
              // Pattern 2: Without backticks (fallback for older formats)
              new RegExp(`\\|\\s*\\*\\*${key}\\*\\*\\s*\\|\\s*([^\\|\\s]+(?:\\s+[^\\|\\s]+)*)\\s*\\|`),
              // Pattern 3: More relaxed - any content between pipes
              new RegExp(`\\|\\s*\\*\\*${key}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|`)
            ]

            for (const pattern of patterns) {
              const match = content.match(pattern)
              if (match && match[1]) {
                const value = match[1].trim()
                // Remove backticks if they're still present
                return value.replace(/\`/g, '')
              }
            }

            return null
          }

          const execTimeStr = extractValue('执行时间')
          const user = extractValue('操作用户') || report.username || 'unknown'
          const processedOrders = parseInt(extractValue('处理订单数') || '0', 10)
          const deletedMaterials = parseInt(extractValue('删除物料数') || '0', 10)
          const skippedMaterials = parseInt(extractValue('跳过物料数') || '0', 10)
          const errors = parseInt(extractValue('错误数量') || '0', 10)
          const retriedOrders = parseInt(extractValue('重试订单数') || '0', 10)
          const successfulRetries = parseInt(extractValue('成功重试数') || '0', 10)
          const executionTimeStr = extractValue('执行耗时') || '0秒'
          if (executionTimeStr === '0秒') {
            console.warn('Failed to extract execution time from report:', report.key)
          }

          const executionTimeSecs = parseDurationToSeconds(executionTimeStr)

          // Try to parse the date
          let dateStr = '未知日期'
          let timestamp = report.lastModified ? new Date(report.lastModified).getTime() : 0

          if (execTimeStr) {
            try {
              const parsedDate = new Date(execTimeStr)
              if (!isNaN(parsedDate.getTime())) {
                dateStr = parsedDate
                  .toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                  })
                  .replace(/\//g, '-')
                timestamp = parsedDate.getTime()
              }
            } catch {
              // Fallback to report lastModified
            }
          }

          if (dateStr === '未知日期' && report.lastModified) {
            const d = new Date(report.lastModified)
            dateStr = d
              .toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
              })
              .replace(/\//g, '-')
          }

          metricsList.push({
            date: dateStr,
            user,
            processedOrders,
            deletedMaterials,
            skippedMaterials,
            errors,
            retriedOrders,
            successfulRetries,
            executionTimeSecs,
            timestamp
          })
        }
      }

      setReportData(metricsList)
    } catch (err: any) {
      setError(err.message || '分析报告时发生错误')
    } finally {
      setIsLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (isOpen && isAdmin) {
      void loadAndAnalyzeReports()
    } else {
      setReportData([])
      setError(null)
    }
  }, [isOpen, isAdmin, loadAndAnalyzeReports])

  // Aggregate data by date
  const chartData = useMemo(() => {
    if (!reportData.length) return []

    const dailyMap = new Map<string, DailyMetrics>()

    for (const data of reportData) {
      const { date } = data

      if (!dailyMap.has(date)) {
        dailyMap.set(date, {
          date,
          processedOrders: 0,
          deletedMaterials: 0,
          skippedMaterials: 0,
          errors: 0,
          retriedOrders: 0,
          successfulRetries: 0,
          executionTimeSecs: 0,
          avgExecutionTimeSecs: 0,
          users: [],
          reportCount: 0
        })
      }

      const day = dailyMap.get(date)!
      day.processedOrders += data.processedOrders
      day.deletedMaterials += data.deletedMaterials
      day.skippedMaterials += data.skippedMaterials
      day.errors += data.errors
      day.retriedOrders += data.retriedOrders
      day.successfulRetries += data.successfulRetries
      day.executionTimeSecs += data.executionTimeSecs
      day.reportCount += 1

      if (!day.users.includes(data.user)) {
        day.users.push(data.user)
      }
    }

    // Calculate average execution time per order for each day
    // Formula: total execution time / total processed orders (efficiency metric)
    for (const day of dailyMap.values()) {
      day.avgExecutionTimeSecs = day.processedOrders > 0
        ? day.executionTimeSecs / day.processedOrders
        : 0
      // Replace executionTimeSecs with avgExecutionTimeSecs for chart display
      day.executionTimeSecs = day.avgExecutionTimeSecs
    }

    // Convert map to array and sort by date
    const sortedData = Array.from(dailyMap.values()).sort((a, b) => {
      // Basic string comparison works for YYYY-MM-DD
      return a.date.localeCompare(b.date)
    })

    return sortedData
  }, [reportData])

  // Extract all unique users from report data
  const allUsers = useMemo(() => {
    const userSet = new Set<string>()
    reportData.forEach(data => userSet.add(data.user))
    return Array.from(userSet).sort()
  }, [reportData])

  // Aggregate data by date AND user for comparison view
  const comparisonData = useMemo(() => {
    if (!reportData.length) return []

    // Filter by selected users if any
    const filteredData = selectedUsers.size > 0
      ? reportData.filter(data => selectedUsers.has(data.user))
      : reportData

    // Group by date + user
    const keyMap = new Map<string, UserDailyMetrics>()

    for (const data of filteredData) {
      const key = `${data.date}|${data.user}`

      if (!keyMap.has(key)) {
        keyMap.set(key, {
          date: data.date,
          user: data.user,
          processedOrders: 0,
          deletedMaterials: 0,
          skippedMaterials: 0,
          errors: 0,
          retriedOrders: 0,
          successfulRetries: 0,
          executionTimeSecs: 0,
          reportCount: 0
        })
      }

      const entry = keyMap.get(key)!
      entry.processedOrders += data.processedOrders
      entry.deletedMaterials += data.deletedMaterials
      entry.skippedMaterials += data.skippedMaterials
      entry.errors += data.errors
      entry.retriedOrders += data.retriedOrders
      entry.successfulRetries += data.successfulRetries
      entry.executionTimeSecs += data.executionTimeSecs
      entry.reportCount += 1
    }

    // Calculate average execution time per order for each entry
    // Formula: total execution time / total processed orders (efficiency metric)
    for (const entry of keyMap.values()) {
      entry.executionTimeSecs = entry.processedOrders > 0
        ? entry.executionTimeSecs / entry.processedOrders
        : 0
    }

    return Array.from(keyMap.values())
      .sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date)
        if (dateCompare !== 0) return dateCompare
        return a.user.localeCompare(b.user)
      })
  }, [reportData, selectedUsers])

  // Format comparison data for chart rendering
  const comparisonChartData = useMemo(() => {
    if (!comparisonData.length) return []

    const dates = [...new Set(comparisonData.map(d => d.date))].sort()
    const users = [...new Set(comparisonData.map(d => d.user))]
      .filter(user => selectedUsers.size === 0 || selectedUsers.has(user))
      .sort()

    const lookup = new Map<string, UserDailyMetrics>()
    comparisonData.forEach(d => {
      lookup.set(`${d.date}|${d.user}`, d)
    })

    return dates.map(date => {
      const point: any = { date }
      users.forEach(user => {
        const key = `${date}|${user}`
        const data = lookup.get(key)

        Array.from(selectedMetrics).forEach(metric => {
          const userKey = `${user}_${metric}` as any
          point[userKey] = data ? (data as any)[metric] : 0
        })
      })
      return point
    })
  }, [comparisonData, selectedMetrics, selectedUsers])

  const handleMetricToggle = (metric: MetricKey) => {
    // In comparison view, only allow single metric selection
    if (viewMode === 'comparison') {
      setSelectedMetrics(new Set([metric]))
    } else {
      // In aggregated view, allow multiple metric selection
      const next = new Set(selectedMetrics)
      if (next.has(metric)) {
        if (next.size > 1) {
          // Ensure at least one metric is selected
          next.delete(metric)
        }
      } else {
        next.add(metric)
      }
      setSelectedMetrics(next)
    }
  }

  const handleViewModeChange = (newMode: 'aggregated' | 'comparison') => {
    setViewMode(newMode)
    // When switching to comparison view, keep only the first selected metric
    if (newMode === 'comparison' && selectedMetrics.size > 1) {
      const firstMetric = Array.from(selectedMetrics)[0]
      setSelectedMetrics(new Set([firstMetric]))
    }
  }

  // Custom Tooltip formatter
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Find the original daily data
      const dailyData = chartData.find((d) => d.date === label)

      return (
        <div className="bg-white p-4 border border-slate-200 shadow-lg rounded-lg max-w-sm">
          <p className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-2">
            {label}
          </p>

          <div className="space-y-1.5 text-sm">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex justify-between items-center gap-4">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  ></span>
                  {entry.name}:
                </span>
                <span className="font-medium text-slate-900">
                  {entry.value} {entry.dataKey === 'executionTimeSecs' ? '秒' : ''}
                </span>
              </div>
            ))}
          </div>

          {dailyData && (
            <div className="mt-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
              <p>操作用户: {dailyData.users.join(', ')}</p>
              <p className="mt-1">报告总数: {dailyData.reportCount}</p>
              <p className="mt-1">每订单平均耗时: {dailyData.avgExecutionTimeSecs.toFixed(1)} 秒</p>
            </div>
          )}
        </div>
      )
    }
    return null
  }

  // Comparison Tooltip for user-specific data
  const ComparisonTooltip = ({ active, payload, label, users, selectedUsers }: any) => {
    if (active && payload && payload.length) {
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
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: userEntry.color }} />
                    {user || '未分配'}:
                  </span>
                  <span className="font-medium text-slate-900">
                    {userEntry.value} {firstMetric === 'executionTimeSecs' ? '秒' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    return null
  }

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
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <Loader2 size={32} className="animate-spin text-blue-500 mb-4" />
              <p>正在分析报告数据，可能需要几秒钟...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-red-500 p-8 text-center">
              <AlertCircle size={48} className="mb-4 opacity-80" />
              <p className="text-lg font-medium mb-2">分析失败</p>
              <p className="text-sm opacity-80">{error}</p>
              <button
                onClick={loadAndAnalyzeReports}
                className="mt-6 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
              >
                重试
              </button>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <BarChart3 size={48} className="mb-4 opacity-50 text-slate-300" />
              <p>暂无报告数据可供分析</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              {/* Controls */}
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
                        onClick={() => handleMetricToggle(key)}
                        className={`
                          px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5
                          ${
                            isSelected
                              ? 'bg-blue-50 border-blue-200 text-blue-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }
                        `}
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

              {/* View Mode Toggle */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-slate-700 mb-3">视图模式</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewModeChange('aggregated')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      viewMode === 'aggregated'
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    按日期聚合
                  </button>
                  <button
                    onClick={() => handleViewModeChange('comparison')}
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

              {/* User Filter Chips - Only in comparison mode */}
              {viewMode === 'comparison' && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-slate-700">筛选用户</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedUsers(new Set(allUsers))}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        全选
                      </button>
                      <button
                        onClick={() => setSelectedUsers(new Set())}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        清空
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {allUsers.map((user) => {
                      const isSelected = selectedUsers.has(user)
                      const color = getUserColor(user, allUsers)

                      return (
                        <button
                          key={user}
                          onClick={() => {
                            const next = new Set(selectedUsers)
                            if (next.has(user)) {
                              next.delete(user)
                            } else {
                              next.add(user)
                            }
                            setSelectedUsers(next)
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-white border-current'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                          style={isSelected ? { color, borderColor: color } : {}}
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: isSelected ? color : '#cbd5e1' }}
                          />
                          {user || '未分配'}
                        </button>
                      )
                    })}
                  </div>

                  {selectedUsers.size === 0 && (
                    <p className="text-xs text-slate-500 mt-2">
                      未选择用户时将显示所有用户数据
                    </p>
                  )}
                </div>
              )}

              {/* Chart */}
              <div className="flex-1 min-h-[400px]">
                {viewMode === 'aggregated' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartData}
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
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                      />
                      <Tooltip content={<CustomTooltip />} />
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
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                      />
                      <Tooltip content={<ComparisonTooltip users={allUsers} selectedUsers={selectedUsers} />} />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />

                      {selectedUsers.size === 0 || selectedUsers.size > 1
                        ? // Multiple users: show first metric for each user
                          allUsers.filter(user => selectedUsers.size === 0 || selectedUsers.has(user)).map((user) => (
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
                          })
                      }
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="mt-4 text-center text-xs text-slate-400">
                {viewMode === 'aggregated'
                  ? '数据以天为单位进行聚合统计。展示的是选定时间段内的总量。'
                  : selectedUsers.size === 0
                    ? '展示所有用户的数据对比。未选择用户时显示全部。'
                    : '展示选定用户的数据对比。'
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReportAnalysisDialog
