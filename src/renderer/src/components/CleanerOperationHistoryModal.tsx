/**
 * Cleaner Operation History Modal
 *
 * Displays cleaner operation history with batch statistics, execution records,
 * order details, and material-level details.
 * Admin users see all users' records, regular users see only their own.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Modal } from './ui/Modal'
import { useLogger } from '../hooks/useLogger'
import {
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  FlaskConical
} from 'lucide-react'
import type { UserInfo } from './UserSelectionDialog'
import type {
  CleanerHistoryBatchStats,
  CleanerHistoryOrderRecord,
  CleanerHistoryMaterialRecord
} from '../hooks/cleaner/types'

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

const statusStyles: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  crashed: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-700'
}

const statusLabels: Record<string, string> = {
  success: '成功',
  partial: '部分成功',
  failed: '失败',
  crashed: '崩溃',
  pending: '进行中'
}

const statusIcons: Record<string, React.ReactNode> = {
  success: <CheckCircle size={16} className="text-green-600" />,
  partial: <Clock size={16} className="text-amber-600" />,
  failed: <XCircle size={16} className="text-red-600" />,
  crashed: <XCircle size={16} className="text-red-600" />,
  pending: <Clock size={16} className="text-gray-500" />
}

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

export const CleanerOperationHistoryModal: React.FC<CleanerOperationHistoryModalProps> = ({
  isOpen,
  onClose,
  user
}) => {
  const [batches, setBatches] = useState<CleanerHistoryBatchStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const [batchExecutions, setBatchExecutions] = useState<Map<string, ExecutionRecord[]>>(new Map())
  const [batchOrders, setBatchOrders] = useState<Map<string, CleanerHistoryOrderRecord[]>>(
    new Map()
  )
  const [orderMaterials, setOrderMaterials] = useState<Map<string, CleanerHistoryMaterialRecord[]>>(
    new Map()
  )
  const [selectedAttempt, setSelectedAttempt] = useState<Map<string, number>>(new Map())
  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [allUsers, setAllUsers] = useState<string[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [loadingMaterials, setLoadingMaterials] = useState<Set<string>>(new Set())
  const logger = useLogger('CleanerOperationHistory')

  const isAdmin = user?.userType === 'Admin'

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const options =
        isAdmin && selectedUsers.length > 0
          ? { limit: 100, usernames: selectedUsers }
          : { limit: 100 }

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
  }, [isAdmin, selectedUsers])

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

  const fetchBatchDetails = useCallback(
    async (batchId: string) => {
      if (batchExecutions.has(batchId) && batchOrders.has(batchId)) {
        return
      }

      try {
        const result = await window.electron.cleaner.getHistoryBatchDetails(batchId)
        if (result.success && result.data) {
          setBatchExecutions((prev) => new Map(prev).set(batchId, result.data!.executions))
          setBatchOrders((prev) => new Map(prev).set(batchId, result.data!.orders))

          // Set default selected attempt to the latest (max attempt number)
          const executions = result.data.executions
          if (executions.length > 0) {
            const maxAttempt = Math.max(...executions.map((e) => e.attemptNumber))
            setSelectedAttempt((prev) => new Map(prev).set(batchId, maxAttempt))
          }
        }
      } catch (err) {
        logger.error('Failed to fetch batch details', {
          error: err instanceof Error ? err.message : String(err),
          batchId
        })
      }
    },
    [batchExecutions, batchOrders, logger]
  )

  const fetchMaterialDetails = useCallback(
    async (batchId: string, attemptNumber: number, orderNumber: string) => {
      const cacheKey = `${batchId}:${attemptNumber}:${orderNumber}`
      if (orderMaterials.has(cacheKey)) return

      setLoadingMaterials((prev) => new Set(prev).add(cacheKey))
      try {
        const result = await window.electron.cleaner.getHistoryMaterialDetails(
          batchId,
          attemptNumber,
          orderNumber
        )
        if (result.success && result.data) {
          setOrderMaterials((prev) => new Map(prev).set(cacheKey, result.data!))
        }
      } catch (err) {
        logger.error('Failed to fetch material details', {
          error: err instanceof Error ? err.message : String(err),
          batchId,
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
    [orderMaterials, logger]
  )

  useEffect(() => {
    if (isOpen) {
      void fetchBatches()
      if (isAdmin) {
        void fetchAllUsers()
      }
    }
  }, [isOpen, fetchBatches, fetchAllUsers, isAdmin])

  const toggleBatchExpansion = (batchId: string) => {
    setExpandedBatches((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(batchId)) {
        newSet.delete(batchId)
      } else {
        newSet.add(batchId)
        void fetchBatchDetails(batchId)
      }
      return newSet
    })
  }

  const toggleOrderExpansion = (batchId: string, attemptNumber: number, orderNumber: string) => {
    const cacheKey = `${batchId}:${attemptNumber}:${orderNumber}`
    setExpandedOrders((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(cacheKey)) {
        newSet.delete(cacheKey)
      } else {
        newSet.add(cacheKey)
        void fetchMaterialDetails(batchId, attemptNumber, orderNumber)
      }
      return newSet
    })
  }

  const handleDeleteBatch = async (batchId: string) => {
    if (deleting.has(batchId)) return

    const confirmed = confirm('确定要删除此批次记录吗？此操作不可撤销。')
    if (!confirmed) return

    setDeleting((prev) => new Set(prev).add(batchId))

    try {
      const result = await window.electron.cleaner.deleteHistoryBatch(batchId)
      if (result.success) {
        setBatches((prev) => prev.filter((b) => b.batchId !== batchId))
        setBatchExecutions((prev) => {
          const newMap = new Map(prev)
          newMap.delete(batchId)
          return newMap
        })
        setBatchOrders((prev) => {
          const newMap = new Map(prev)
          newMap.delete(batchId)
          return newMap
        })
        setExpandedBatches((prev) => {
          const newSet = new Set(prev)
          newSet.delete(batchId)
          return newSet
        })
      } else {
        alert(result.error || '删除失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting((prev) => {
        const newSet = new Set(prev)
        newSet.delete(batchId)
        return newSet
      })
    }
  }

  const handleCopyColumn = (field: keyof CleanerHistoryOrderRecord, batchId: string) => {
    const attempt = selectedAttempt.get(batchId)
    const orders = batchOrders.get(batchId) || []
    const filteredOrders =
      attempt !== undefined ? orders.filter((o) => o.attemptNumber === attempt) : orders
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

  const toggleUserFilter = (username: string) => {
    setSelectedUsers((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]
    )
  }

  const clearUserFilters = () => {
    setSelectedUsers([])
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="清理操作历史" size="3xl">
      <div className="flex flex-col h-[70vh]">
        {/* Toolbar */}
        <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-200">
          <div className="flex-1">
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
                <span className="text-sm text-gray-500">共 {batches.length} 条批次</span>
              )}
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
          {loading && batches.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500">加载中...</div>
          ) : batches.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500">暂无操作记录</div>
          ) : (
            <div className="flex flex-col gap-3">
              {batches.map((batch) => {
                const isExpanded = expandedBatches.has(batch.batchId)
                const executions = batchExecutions.get(batch.batchId) || []
                const orders = batchOrders.get(batch.batchId) || []
                const isDeleting = deleting.has(batch.batchId)
                const currentAttempt = selectedAttempt.get(batch.batchId)
                const filteredOrders =
                  currentAttempt !== undefined
                    ? orders.filter((o) => o.attemptNumber === currentAttempt)
                    : orders

                return (
                  <div
                    key={batch.batchId}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    {/* Batch summary */}
                    <div
                      className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => toggleBatchExpansion(batch.batchId)}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <button className="p-1 hover:bg-gray-200 rounded">
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>

                        <div className="flex-1 grid grid-cols-7 gap-3 text-sm">
                          <div>
                            <div className="text-gray-500 text-xs">操作时间</div>
                            <div className="font-medium text-gray-900">
                              {formatDateTime(batch.operationTime)}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 text-xs">操作用户</div>
                            <div className="font-medium text-gray-900">{batch.username}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 text-xs">状态</div>
                            <div className="flex items-center gap-1">
                              {statusIcons[batch.status] || statusIcons.pending}
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  statusStyles[batch.status] || statusStyles.pending
                                }`}
                              >
                                {statusLabels[batch.status] || batch.status}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 text-xs">订单数</div>
                            <div className="font-medium text-gray-900">{batch.totalOrders}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 text-xs">已删除</div>
                            <div className="font-medium text-green-600">
                              {batch.totalMaterialsDeleted}
                            </div>
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
                            void handleDeleteBatch(batch.batchId)
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
                                    onClick={() =>
                                      setSelectedAttempt((prev) =>
                                        new Map(prev).set(batch.batchId, exec.attemptNumber)
                                      )
                                    }
                                  >
                                    第{exec.attemptNumber}次
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                              {executions
                                .filter(
                                  (e) =>
                                    currentAttempt === undefined ||
                                    e.attemptNumber === currentAttempt
                                )
                                .map((exec) => (
                                  <React.Fragment key={exec.attemptNumber}>
                                    <span>
                                      耗时：{formatDuration(exec.operationTime, exec.endTime)}
                                    </span>
                                    <span>
                                      订单：{exec.ordersProcessed}/{exec.totalOrders}
                                    </span>
                                    <span>删除：{exec.totalMaterialsDeleted}</span>
                                    {exec.totalMaterialsFailed > 0 && (
                                      <span className="text-red-600">
                                        失败：{exec.totalMaterialsFailed}
                                      </span>
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
                                    {exec.appVersion && (
                                      <span className="text-gray-400">v{exec.appVersion}</span>
                                    )}
                                  </React.Fragment>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Order table */}
                        {filteredOrders.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left font-medium text-gray-600 w-8" />
                                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                                    <div className="flex items-center gap-2">
                                      订单号
                                      <button
                                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                                        onClick={() =>
                                          handleCopyColumn('orderNumber', batch.batchId)
                                        }
                                        title="复制所有订单号"
                                      >
                                        <Copy
                                          size={14}
                                          className="text-gray-500 hover:text-gray-700"
                                        />
                                      </button>
                                    </div>
                                  </th>
                                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                                    状态
                                  </th>
                                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                                    重试
                                  </th>
                                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                                    已删除
                                  </th>
                                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                                    已跳过
                                  </th>
                                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                                    失败
                                  </th>
                                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                                    不确定
                                  </th>
                                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                                    错误信息
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {filteredOrders.map((order) => {
                                  const orderKey = `${batch.batchId}:${currentAttempt ?? order.attemptNumber}:${order.orderNumber}`
                                  const isOrderExpanded = expandedOrders.has(orderKey)
                                  const materials = orderMaterials.get(orderKey) || []
                                  const isLoadingMaterials = loadingMaterials.has(orderKey)

                                  return (
                                    <React.Fragment key={orderKey}>
                                      <tr
                                        className="hover:bg-gray-50 cursor-pointer"
                                        onClick={() =>
                                          toggleOrderExpansion(
                                            batch.batchId,
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
                                        <td className="px-4 py-2 text-gray-900 font-mono text-xs">
                                          {order.orderNumber}
                                        </td>
                                        <td className="px-4 py-2">
                                          <span
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                              statusStyles[order.status] || statusStyles.pending
                                            }`}
                                          >
                                            {statusIcons[order.status]}
                                            {statusLabels[order.status] || order.status}
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
                                        <td className="px-4 py-2 text-green-600">
                                          {order.materialsDeleted}
                                        </td>
                                        <td className="px-4 py-2 text-gray-500">
                                          {order.materialsSkipped}
                                        </td>
                                        <td className="px-4 py-2 text-red-600">
                                          {order.materialsFailed || '-'}
                                        </td>
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
                                          <td colSpan={8} className="bg-gray-50/50 px-8 py-3">
                                            {isLoadingMaterials ? (
                                              <div className="text-xs text-gray-500">
                                                加载物料详情...
                                              </div>
                                            ) : materials.length > 0 ? (
                                              <table className="w-full text-xs">
                                                <thead>
                                                  <tr className="text-gray-500">
                                                    <th className="px-3 py-1.5 text-left font-medium">
                                                      物料编码
                                                    </th>
                                                    <th className="px-3 py-1.5 text-left font-medium">
                                                      物料名称
                                                    </th>
                                                    <th className="px-3 py-1.5 text-left font-medium">
                                                      行号
                                                    </th>
                                                    <th className="px-3 py-1.5 text-left font-medium">
                                                      结果
                                                    </th>
                                                    <th className="px-3 py-1.5 text-left font-medium">
                                                      原因
                                                    </th>
                                                    <th className="px-3 py-1.5 text-left font-medium">
                                                      尝试次数
                                                    </th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                  {materials.map((mat, idx) => (
                                                    <tr key={idx} className="hover:bg-gray-50">
                                                      <td className="px-3 py-1.5 font-mono text-gray-700">
                                                        {mat.materialCode}
                                                      </td>
                                                      <td className="px-3 py-1.5 text-gray-700">
                                                        {mat.materialName}
                                                      </td>
                                                      <td className="px-3 py-1.5 text-gray-600">
                                                        {mat.rowNumber}
                                                      </td>
                                                      <td className="px-3 py-1.5">
                                                        <span
                                                          className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                                            mat.result === 'deleted'
                                                              ? 'bg-green-100 text-green-700'
                                                              : mat.result === 'skipped'
                                                                ? 'bg-gray-100 text-gray-700'
                                                                : mat.result === 'failed'
                                                                  ? 'bg-red-100 text-red-700'
                                                                  : mat.result === 'uncertain'
                                                                    ? 'bg-amber-100 text-amber-700'
                                                                    : 'bg-gray-100 text-gray-700'
                                                          }`}
                                                        >
                                                          {mat.result === 'deleted'
                                                            ? '已删除'
                                                            : mat.result === 'skipped'
                                                              ? '已跳过'
                                                              : mat.result === 'failed'
                                                                ? '失败'
                                                                : mat.result === 'uncertain'
                                                                  ? '不确定'
                                                                  : mat.result}
                                                        </span>
                                                      </td>
                                                      <td className="px-3 py-1.5 text-gray-600 max-w-xs truncate">
                                                        {mat.reason || '-'}
                                                      </td>
                                                      <td className="px-3 py-1.5 text-gray-600">
                                                        {mat.attemptCount > 1 ? (
                                                          <span className="text-amber-600">
                                                            {mat.attemptCount}
                                                          </span>
                                                        ) : (
                                                          '1'
                                                        )}
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            ) : (
                                              <div className="text-xs text-gray-500">
                                                暂无物料详情
                                              </div>
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
                          <div className="px-4 py-6 text-center text-sm text-gray-500">
                            暂无订单记录
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-gray-200 flex justify-end">
          <button
            className="px-6 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default CleanerOperationHistoryModal
