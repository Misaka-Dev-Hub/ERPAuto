/**
 * Cleaner Operation History Modal
 *
 * Displays cleaner operation history with batch statistics, execution records,
 * order details, and material-level details.
 * Admin users see all users' records, regular users see only their own.
 */

import React, { useState, useEffect, useCallback, useTransition } from 'react'
import { Modal } from './ui/Modal'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { useConfirmDialog } from './ui/useConfirmDialog'
import { useLogger } from '../hooks/useLogger'
import {
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Copy,
  FlaskConical,
  Search,
  X
} from 'lucide-react'
import type { UserInfo } from './UserSelectionDialog'
import type {
  CleanerHistoryBatchStats,
  CleanerHistoryOrderRecord,
  CleanerHistoryMaterialRecord,
  CleanerHistorySearchResult
} from '../hooks/cleaner/types'
import {
  canStartHistoryLoad,
  getNextHistoryLoadState,
  type HistoryLoadState
} from './cleaner-history-load-state'
import { highlightText } from './cleaner-history-highlight'
import {
  getCleanerHistoryStatusDisplay,
  getCleanerMaterialResultDisplay
} from './cleaner-history-status'

// The preload API returns Date for time fields, but IPC serialization converts them to strings.
// Use a local type that accommodates both to satisfy TypeScript.
interface ExecutionRecord {
  id?: number
  batchId: string
  attemptNumber: number
  userId: number
  username: string
  operationTime: string | Date
  endTime: string | Date | null
  status: string
  isDryRun: boolean
  totalOrders: number
  ordersProcessed: number
  totalMaterialsDeleted: number
  totalMaterialsSkipped: number
  totalMaterialsFailed: number
  totalUncertainDeletions: number
  errorMessage: string | null
  appVersion: string | null
}
import { showSuccess, showError, showWarning } from '../stores/useAppStore'

interface CleanerOperationHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  user?: { username: string; userType: string } | null
}

interface BatchItemProps {
  batch: CleanerHistoryBatchStats
  isAdmin: boolean
  onDelete: (batchId: string) => void
  onRequestDelete: (batchId: string) => Promise<boolean>
  searchQuery?: string
  preloadedExecutions?: ExecutionRecord[]
  preloadedOrders?: Array<{
    order: CleanerHistoryOrderRecord
    materials: CleanerHistoryMaterialRecord[]
  }>
}

const BATCH_PAGE_SIZE = 5

const formatDateTime = (dateStr: string | Date | null | undefined): string => {
  if (!dateStr) return '-'
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr

  if (isNaN(date.getTime())) {
    return String(dateStr)
  }

  // Use local time instead of UTC for display
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

const formatDuration = (startTime: string | Date | null, endTime: string | Date | null) => {
  if (!startTime || !endTime) return '-'
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '-'

  const diffMs = end.getTime() - start.getTime()
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}秒`

  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  if (minutes < 60) return `${minutes}分${remainSeconds}秒`

  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return `${hours}时${remainMinutes}分`
}

// ====== BatchItem Component ======
// Extracted from the modal so that expanding one batch doesn't re-render siblings.
// Each BatchItem manages its own details, orders, and material state locally.
const BatchItem = React.memo(({ batch, isAdmin, onDelete, onRequestDelete, searchQuery, preloadedExecutions, preloadedOrders }: BatchItemProps) => {
  const [isExpanded, setIsExpanded] = useState(() => !!searchQuery)
  const [executions, setExecutions] = useState<ExecutionRecord[]>([])
  const [orders, setOrders] = useState<CleanerHistoryOrderRecord[]>([])
  const [currentAttempt, setCurrentAttempt] = useState<number | undefined>()
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(() => new Set())
  const [orderMaterials, setOrderMaterials] = useState<Map<string, CleanerHistoryMaterialRecord[]>>(
    () => new Map()
  )
  const [loadingMaterials, setLoadingMaterials] = useState<Set<string>>(() => new Set())
  const [materialLoadStates, setMaterialLoadStates] = useState<Map<string, HistoryLoadState>>(
    () => new Map()
  )
  const [detailsLoadState, setDetailsLoadState] = useState<HistoryLoadState>('idle')
  const [isDeleting, setIsDeleting] = useState(false)

  const logger = useLogger('BatchItem')

  // Initialize from preloaded data in search mode
  useEffect(() => {
    if (searchQuery && preloadedExecutions && preloadedOrders) {
      setExecutions(preloadedExecutions)
      setDetailsLoadState('success')

      const orders = preloadedOrders.map(p => p.order)
      setOrders(orders)

      if (preloadedExecutions.length > 0) {
        setCurrentAttempt(Math.max(...preloadedExecutions.map(e => e.attemptNumber)))
      }

      // Pre-populate materials map
      const materialsMap = new Map<string, CleanerHistoryMaterialRecord[]>()
      const expandedSet = new Set<string>()
      for (const { order, materials } of preloadedOrders) {
        if (materials.length > 0) {
          const cacheKey = `${order.attemptNumber}:${order.orderNumber}`
          materialsMap.set(cacheKey, materials)
          expandedSet.add(cacheKey)
        }
      }
      setOrderMaterials(materialsMap)
      setExpandedOrders(expandedSet)

      // Mark all materials as loaded
      const loadStatesMap = new Map<string, HistoryLoadState>()
      for (const { order } of preloadedOrders) {
        const cacheKey = `${order.attemptNumber}:${order.orderNumber}`
        loadStatesMap.set(cacheKey, 'success')
      }
      setMaterialLoadStates(loadStatesMap)
    }
  }, [searchQuery, preloadedExecutions, preloadedOrders])

  const fetchDetails = useCallback(async () => {
    if (!canStartHistoryLoad(detailsLoadState)) return

    setDetailsLoadState((prev) => getNextHistoryLoadState(prev, 'start'))
    try {
      const result = await window.electron.cleaner.getHistoryBatchDetails(batch.batchId)
      if (result.success && result.data) {
        setExecutions(result.data.executions)
        setOrders(result.data.orders)

        const execs = result.data.executions
        if (execs.length > 0) {
          setCurrentAttempt(Math.max(...execs.map((e) => e.attemptNumber)))
        }

        setDetailsLoadState('success')
      } else {
        setDetailsLoadState('error')
      }
    } catch (err) {
      setDetailsLoadState('error')
      logger.error('Failed to fetch batch details', {
        error: err instanceof Error ? err.message : String(err),
        batchId: batch.batchId
      })
    }
  }, [batch.batchId, detailsLoadState, logger])

  const fetchMaterials = useCallback(
    async (attemptNumber: number, orderNumber: string) => {
      const cacheKey = `${attemptNumber}:${orderNumber}`
      const loadState = materialLoadStates.get(cacheKey) ?? 'idle'
      if (!canStartHistoryLoad(loadState)) return

      setMaterialLoadStates((prev) => {
        const next = new Map(prev)
        next.set(cacheKey, getNextHistoryLoadState(prev.get(cacheKey) ?? 'idle', 'start'))
        return next
      })
      setLoadingMaterials((prev) => new Set(prev).add(cacheKey))
      try {
        const result = await window.electron.cleaner.getHistoryMaterialDetails(
          batch.batchId,
          attemptNumber,
          orderNumber
        )
        if (result.success && result.data) {
          setOrderMaterials((prev) => new Map(prev).set(cacheKey, result.data!))
          setMaterialLoadStates((prev) => {
            const next = new Map(prev)
            next.set(cacheKey, 'success')
            return next
          })
        } else {
          setMaterialLoadStates((prev) => {
            const next = new Map(prev)
            next.set(cacheKey, 'error')
            return next
          })
        }
      } catch (err) {
        setMaterialLoadStates((prev) => {
          const next = new Map(prev)
          next.set(cacheKey, 'error')
          return next
        })
        logger.error('Failed to fetch material details', {
          error: err instanceof Error ? err.message : String(err),
          batchId: batch.batchId,
          attemptNumber,
          orderNumber
        })
      } finally {
        setLoadingMaterials((prev) => {
          const newSet = new Set(prev)
          newSet.delete(cacheKey)
          return newSet
        })
      }
    },
    [batch.batchId, logger, materialLoadStates]
  )

  const toggleBatchExpansion = () => {
    const nextExpanded = !isExpanded
    setIsExpanded(nextExpanded)
    if (nextExpanded) {
      void fetchDetails()
    }
  }

  const toggleOrderExpansion = (attemptNumber: number, orderNumber: string) => {
    const cacheKey = `${attemptNumber}:${orderNumber}`
    const isCurrentlyExpanded = expandedOrders.has(cacheKey)
    setExpandedOrders((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(cacheKey)) {
        newSet.delete(cacheKey)
      } else {
        newSet.add(cacheKey)
      }
      return newSet
    })
    if (!isCurrentlyExpanded) {
      void fetchMaterials(attemptNumber, orderNumber)
    }
  }

  const handleDelete = async () => {
    if (isDeleting) return
    const confirmed = await onRequestDelete(batch.batchId)
    if (!confirmed) return

    setIsDeleting(true)
    try {
      const result = await window.electron.cleaner.deleteHistoryBatch(batch.batchId)
      if (result.success) {
        onDelete(batch.batchId)
      } else {
        alert(result.error || '删除失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
    } finally {
      setIsDeleting(false)
    }
  }

  const filteredOrders =
    currentAttempt !== undefined ? orders.filter((order) => order.attemptNumber === currentAttempt) : orders
  const visibleExecutions =
    currentAttempt !== undefined
      ? executions.filter((execution) => execution.attemptNumber === currentAttempt)
      : executions
  const batchStatusDisplay = getCleanerHistoryStatusDisplay(batch.status)

  const handleCopyColumn = (field: keyof CleanerHistoryOrderRecord) => {
    const values = filteredOrders
      .map((o) => String(o[field] ?? ''))
      .filter((v) => v && v !== '-')
      .join('\n')

    if (!values) {
      showWarning('没有可复制的数据')
      return
    }

    navigator.clipboard
      .writeText(values)
      .then(() => showSuccess(`已复制 ${values.split('\n').length} 条数据`))
      .catch(() => showError('复制失败，请手动复制'))
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Batch summary */}
      <div
        className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
          isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'
        }`}
        onClick={toggleBatchExpansion}
      >
        <div className="flex items-center gap-4 flex-1">
          <button className="p-1 hover:bg-gray-200 rounded">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>

          <div className="flex-1 grid grid-cols-7 gap-3 text-sm">
            <div>
              <div className="text-gray-500 text-xs">操作时间</div>
              <div className="font-medium text-gray-900">{formatDateTime(batch.operationTime)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">操作用户</div>
              <div className="font-medium text-gray-900">{batch.username}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">状态</div>
              <div className="flex items-center gap-1">
                {batchStatusDisplay.icon}
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${batchStatusDisplay.badgeClassName}`}
                >
                  {batchStatusDisplay.label}
                </span>
              </div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">订单数</div>
              <div className="font-medium text-gray-900">{batch.totalOrders}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">已删除</div>
              <div className="font-medium text-green-600">{batch.totalMaterialsDeleted}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">失败</div>
              <div className="font-medium text-gray-900">
                {batch.totalMaterialsFailed > 0 ? (
                  <span className="text-red-600">{batch.totalMaterialsFailed}</span>
                ) : (
                  '0'
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {batch.isDryRun && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                  <FlaskConical size={12} />
                  试运行
                </span>
              )}
              {batch.totalAttempts > 1 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                  {batch.totalAttempts}次尝试
                </span>
              )}
            </div>
          </div>
        </div>

        {isAdmin && (
          <button
            className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded transition-colors disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation()
              void handleDelete()
            }}
            disabled={isDeleting}
            title="删除批次"
          >
            <Trash2 size={16} className={isDeleting ? 'animate-pulse' : ''} />
          </button>
        )}
      </div>

      {/* Batch details */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-white">
          {/* Execution records */}
          {executions.length > 0 && (
            <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
              <div className="text-xs font-medium text-gray-500 mb-2">执行记录</div>
              {executions.length > 1 && (
                <div className="flex gap-1 mb-2">
                  {executions.map((exec) => (
                    <button
                      key={exec.attemptNumber}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        currentAttempt === exec.attemptNumber
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                      onClick={() => setCurrentAttempt(exec.attemptNumber)}
                    >
                      第{exec.attemptNumber}次
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                {visibleExecutions.map((exec) => (
                  <React.Fragment key={exec.attemptNumber}>
                    <span>耗时：{formatDuration(exec.operationTime, exec.endTime)}</span>
                    <span>
                      订单：{exec.ordersProcessed}/{exec.totalOrders}
                    </span>
                    <span>删除：{exec.totalMaterialsDeleted}</span>
                    {exec.totalMaterialsFailed > 0 && (
                      <span className="text-red-600">失败：{exec.totalMaterialsFailed}</span>
                    )}
                    {exec.totalUncertainDeletions > 0 && (
                      <span className="text-amber-600">
                        不确定：{exec.totalUncertainDeletions}
                      </span>
                    )}
                    {exec.errorMessage && (
                      <span className="text-red-600" title={exec.errorMessage}>
                        错误：{exec.errorMessage.substring(0, 80)}
                        {exec.errorMessage.length > 80 ? '...' : ''}
                      </span>
                    )}
                    {exec.appVersion && <span className="text-gray-400">v{exec.appVersion}</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Order table */}
          {detailsLoadState === 'loading' && executions.length === 0 && orders.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">加载详情中...</div>
          ) : detailsLoadState === 'error' && executions.length === 0 && orders.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-red-600">
              加载详情失败，请折叠后重新展开重试
            </div>
          ) : filteredOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600 w-8" />
                    <th className="px-4 py-2 text-left font-medium text-gray-600 w-12 text-center">
                      序号
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">总排号</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">
                      <div className="flex items-center gap-2">
                        订单号
                        <button
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                          onClick={() => handleCopyColumn('orderNumber')}
                          title="复制所有订单号"
                        >
                          <Copy size={14} className="text-gray-500 hover:text-gray-700" />
                        </button>
                      </div>
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">状态</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">重试</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">已删除</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">已跳过</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">失败</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">不确定</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">错误信息</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOrders.map((order, index) => {
                    const orderKey = `${currentAttempt ?? order.attemptNumber}:${order.orderNumber}`
                    const isOrderExpanded = expandedOrders.has(orderKey)
                    const materials = orderMaterials.get(orderKey) || []
                    const isLoadingMaterials = loadingMaterials.has(orderKey)
                    const materialLoadState = materialLoadStates.get(orderKey) ?? 'idle'
                    const orderStatusDisplay = getCleanerHistoryStatusDisplay(order.status)

                    return (
                      <React.Fragment key={orderKey}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() =>
                            toggleOrderExpansion(
                              currentAttempt ?? order.attemptNumber,
                              order.orderNumber
                            )
                          }
                        >
                          <td className="px-4 py-2">
                            {isOrderExpanded ? (
                              <ChevronDown size={14} className="text-gray-400" />
                            ) : (
                              <ChevronRight size={14} className="text-gray-400" />
                            )}
                          </td>
                          <td className="px-4 py-2 text-gray-500 font-medium text-xs text-center">
                            {index + 1}
                          </td>
                          <td className="px-4 py-2 text-gray-900 font-mono text-xs">
                            {order.productionId
                              ? (searchQuery ? highlightText(order.productionId, searchQuery) : order.productionId)
                              : '-'}
                          </td>
                          <td className="px-4 py-2 text-gray-900 font-mono text-xs">
                            {order.status === 'not_found'
                              ? '-'
                              : (searchQuery ? highlightText(order.orderNumber, searchQuery) : order.orderNumber)}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${orderStatusDisplay.badgeClassName}`}
                            >
                              {orderStatusDisplay.icon}
                              {orderStatusDisplay.label}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            {order.retryCount > 0 ? (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                                  <RefreshCw size={10} />
                                  重试{order.retryCount}次
                                </span>
                                {order.retrySuccess && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                    <CheckCircle size={10} />
                                    成功
                                  </span>
                                )}
                                {!order.retrySuccess && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                    <XCircle size={10} />
                                    失败
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-green-600">{order.materialsDeleted}</td>
                          <td className="px-4 py-2 text-gray-500">{order.materialsSkipped}</td>
                          <td className="px-4 py-2 text-red-600">{order.materialsFailed || '-'}</td>
                          <td className="px-4 py-2 text-amber-600">
                            {order.uncertainDeletions || '-'}
                          </td>
                          <td className="px-4 py-2 text-red-600 text-xs max-w-xs truncate">
                            {order.errorMessage || '-'}
                          </td>
                        </tr>

                        {/* Material details */}
                        {isOrderExpanded && (
                          <tr>
                            <td colSpan={11} className="bg-gray-50/50 px-8 py-3">
                              {isLoadingMaterials ? (
                                <div className="text-xs text-gray-500">加载物料详情...</div>
                              ) : materialLoadState === 'error' ? (
                                <div className="text-xs text-red-600">
                                  加载物料详情失败，请折叠后重新展开重试
                                </div>
                              ) : materials.length > 0 ? (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="px-3 py-1.5 text-left font-medium w-12 text-center">
                                        序号
                                      </th>
                                      <th className="px-3 py-1.5 text-left font-medium">
                                        物料编码
                                      </th>
                                      <th className="px-3 py-1.5 text-left font-medium">
                                        物料名称
                                      </th>
                                      <th className="px-3 py-1.5 text-left font-medium">行号</th>
                                      <th className="px-3 py-1.5 text-left font-medium">结果</th>
                                      <th className="px-3 py-1.5 text-left font-medium">原因</th>
                                      <th className="px-3 py-1.5 text-left font-medium">
                                        尝试次数
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {materials.map((mat, idx) => (
                                      <MaterialDetailRow key={idx} index={idx} material={mat} searchQuery={searchQuery} />
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <div className="text-xs text-gray-500">暂无物料详情</div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-gray-500">暂无订单记录</div>
          )}
        </div>
      )}
    </div>
  )
})

BatchItem.displayName = 'BatchItem'

interface MaterialDetailRowProps {
  index: number
  material: CleanerHistoryMaterialRecord
  searchQuery?: string
}

const MaterialDetailRow = ({ index, material, searchQuery }: MaterialDetailRowProps): React.JSX.Element => {
  const resultDisplay = getCleanerMaterialResultDisplay(material.result)

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-1.5 text-gray-500 font-medium text-xs text-center">{index + 1}</td>
      <td className="px-3 py-1.5 font-mono text-gray-700">
        {searchQuery ? highlightText(material.materialCode, searchQuery) : material.materialCode}
      </td>
      <td className="px-3 py-1.5 text-gray-700">
        {searchQuery ? highlightText(material.materialName, searchQuery) : material.materialName}
      </td>
      <td className="px-3 py-1.5 text-gray-600">{material.rowNumber}</td>
      <td className="px-3 py-1.5">
        {resultDisplay.icon ? (
          <span className="inline-block cursor-help" title={resultDisplay.title}>
            {resultDisplay.icon}
          </span>
        ) : (
          <span className="text-gray-500">{resultDisplay.title}</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-gray-600 max-w-xs truncate">
        {material.reason ? (searchQuery ? highlightText(material.reason, searchQuery) : material.reason) : '-'}
      </td>
      <td className="px-3 py-1.5 text-gray-600">
        {material.attemptCount > 1 ? (
          <span className="text-amber-600">{material.attemptCount}</span>
        ) : (
          '1'
        )}
      </td>
    </tr>
  )
}

// ====== Main Modal Component ======
export const CleanerOperationHistoryModal: React.FC<CleanerOperationHistoryModalProps> = ({
  isOpen,
  onClose,
  user
}) => {
  const [batches, setBatches] = useState<CleanerHistoryBatchStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allUsers, setAllUsers] = useState<string[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [isFilterPending, startFilterTransition] = useTransition()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchResult, setSearchResult] = useState<CleanerHistorySearchResult | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const logger = useLogger('CleanerOperationHistory')

  const isAdmin = user?.userType === 'Admin'
  const hasPreviousPage = currentPage > 0
  const hasNextPage = batches.length === BATCH_PAGE_SIZE

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const options =
        isAdmin && selectedUsers.length > 0
          ? {
              limit: BATCH_PAGE_SIZE,
              offset: currentPage * BATCH_PAGE_SIZE,
              usernames: selectedUsers
            }
          : { limit: BATCH_PAGE_SIZE, offset: currentPage * BATCH_PAGE_SIZE }

      const result = await window.electron.cleaner.getHistoryBatches(options)
      if (result.success && result.data) {
        setBatches(result.data)
      } else {
        setError(result.error || '获取历史记录失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取历史记录失败')
    } finally {
      setLoading(false)
    }
  }, [currentPage, isAdmin, selectedUsers])

  const fetchAllUsers = useCallback(async () => {
    try {
      const result = await window.electron.auth.getAllUsers()
      if (result.success && result.data) {
        const usernames = result.data.map((u: UserInfo) => u.username)
        setAllUsers(usernames)
      }
    } catch (err) {
      logger.error('Failed to fetch users list', {
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }, [logger])

  useEffect(() => {
    if (isOpen) {
      void fetchBatches()
      if (isAdmin) {
        void fetchAllUsers()
      }
    }
  }, [isOpen, fetchBatches, fetchAllUsers, isAdmin])

  const handleDeleteBatch = useCallback((batchId: string) => {
    setBatches((prev) => prev.filter((b) => b.batchId !== batchId))
  }, [])

  const requestDeleteConfirmation = useCallback(
    async (batchId: string) => {
      const batch = batches.find((item) => item.batchId === batchId)
      const ownerLabel = batch ? `操作人：${batch.username}` : '此操作不可撤销。'

      return confirm({
        title: '确认删除历史批次',
        message: (
          <div className="space-y-3">
            <p className="text-gray-700">确定要删除这条清理操作历史吗？</p>
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              <div>该操作会一并删除批次、订单和物料明细记录。</div>
              <div className="mt-1 text-red-600/90">{ownerLabel}</div>
            </div>
          </div>
        ),
        confirmText: '删除',
        cancelText: '取消',
        variant: 'danger'
      })
    },
    [batches, confirm]
  )

  const toggleUserFilter = (username: string) => {
    startFilterTransition(() => {
      setCurrentPage(0)
      setSelectedUsers((prev) =>
        prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]
      )
    })
  }

  const clearUserFilters = () => {
    startFilterTransition(() => {
      setCurrentPage(0)
      setSelectedUsers([])
    })
  }

  const executeSearch = useCallback(async () => {
    const trimmed = searchInput.trim()
    if (!trimmed) {
      setSearchQuery('')
      setSearchResult(null)
      return
    }

    setIsSearching(true)
    setSearchQuery(trimmed)
    try {
      const options =
        isAdmin && selectedUsers.length > 0
          ? { query: trimmed, usernames: selectedUsers }
          : { query: trimmed }

      const result = await window.electron.cleaner.searchHistoryRecords(options)
      if (result.success && result.data) {
        // IPC serialization converts Date to string, so cast to renderer type
        setSearchResult(result.data as unknown as CleanerHistorySearchResult)
      } else {
        setSearchResult({ batches: [], totalMatches: 0 })
      }
    } catch {
      setSearchResult({ batches: [], totalMatches: 0 })
    } finally {
      setIsSearching(false)
    }
  }, [searchInput, isAdmin, selectedUsers])

  const clearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
    setSearchResult(null)
  }

  const goToPreviousPage = () => {
    setCurrentPage((prev) => Math.max(0, prev - 1))
  }

  const goToNextPage = () => {
    if (!hasNextPage) return
    setCurrentPage((prev) => prev + 1)
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="清理操作历史"
      size="3xl"
      className="!max-w-[68rem]"
    >
      <div className="flex flex-col h-[70vh]">
        {/* Toolbar */}
        <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-200">
          <div className="flex-1">
            {/* Search bar */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void executeSearch()
                  }}
                  placeholder="搜索批次ID、订单号、物料编码/名称..."
                  className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
                {searchInput && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={clearSearch}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                onClick={() => void executeSearch()}
                disabled={isSearching || !searchInput.trim()}
              >
                {isSearching ? '搜索中...' : '搜索'}
              </button>
            </div>
            {isAdmin && allUsers.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-2">筛选用户：</div>
                <div className="flex flex-wrap gap-2">
                  {allUsers.map((username) => {
                    const isSelected = selectedUsers.includes(username)
                    return (
                      <button
                        key={username}
                        onClick={() => toggleUserFilter(username)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {username}
                      </button>
                    )
                  })}
                  {selectedUsers.length > 0 && (
                    <button
                      onClick={clearUserFilters}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-all"
                    >
                      清空筛选
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {isAdmin ? (
                  <span className="text-amber-600 font-medium">
                    管理员模式：
                    {selectedUsers.length > 0
                      ? `已选择 ${selectedUsers.length} 个用户`
                      : '显示所有用户记录'}
                  </span>
                ) : (
                  <span>仅显示您的操作记录</span>
                )}
              </span>
              {batches.length > 0 && (
                <span className="text-sm text-gray-500">本页 {batches.length} 条批次</span>
              )}
              {isFilterPending && <span className="text-sm text-blue-600">正在更新筛选...</span>}
            </div>
          </div>
          <button
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
            onClick={() => void fetchBatches()}
            disabled={loading}
            title="刷新"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Batch list */}
        <div className="flex-1 overflow-y-auto">
          {searchQuery ? (
            // Search mode
            isSearching ? (
              <div className="flex items-center justify-center h-32 text-gray-500">搜索中...</div>
            ) : searchResult && searchResult.batches.length > 0 ? (
              <div className="flex flex-col gap-3">
                {searchResult.batches.map((result) => (
                  <BatchItem
                    key={result.batch.batchId}
                    batch={result.batch}
                    isAdmin={isAdmin}
                    onDelete={handleDeleteBatch}
                    onRequestDelete={requestDeleteConfirmation}
                    searchQuery={searchQuery}
                    preloadedExecutions={result.executions}
                    preloadedOrders={result.orders}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-500">
                未找到匹配「{searchQuery}」的记录
              </div>
            )
          ) : (
            // Browse mode (existing logic unchanged)
            <>
              {loading && batches.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-500">加载中...</div>
              ) : batches.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-500">暂无操作记录</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {batches.map((batch) => (
                    <BatchItem
                      key={batch.batchId}
                      batch={batch}
                      isAdmin={isAdmin}
                      onDelete={handleDeleteBatch}
                      onRequestDelete={requestDeleteConfirmation}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-gray-200 flex justify-center">
          {searchQuery && searchResult ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                找到 {searchResult.totalMatches} 个匹配批次
                {searchResult.totalMatches > searchResult.batches.length &&
                  `（显示前 ${searchResult.batches.length} 个）`}
              </span>
              <button
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
                onClick={clearSearch}
              >
                清除搜索
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              <button
                className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                onClick={goToPreviousPage}
                disabled={loading || !hasPreviousPage}
              >
                上一页
              </button>
              <div className="mx-1 min-w-[5.5rem] rounded-full bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white">
                第 {currentPage + 1} 页
              </div>
              <button
                className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                onClick={goToNextPage}
                disabled={loading || !hasNextPage}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </Modal>
  )
}

export default CleanerOperationHistoryModal
