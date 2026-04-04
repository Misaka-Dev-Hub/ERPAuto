/**
 * Extractor Operation History Modal
 *
 * Displays extraction operation history with batch statistics and details.
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
  Copy
} from 'lucide-react'
import type { UserInfo } from './UserSelectionDialog'
import type {
  BatchStats,
  OperationHistoryRecord
} from '../../../main/types/operation-history.types'
import { showSuccess, showError, showWarning } from '../stores/useAppStore'

interface ExtractorOperationHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  user?: UserInfo | null
}

const statusStyles: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-700'
}

const statusLabels: Record<string, string> = {
  success: '成功',
  partial: '部分成功',
  failed: '失败',
  pending: '进行中'
}

const statusIcons: Record<string, React.ReactNode> = {
  success: <CheckCircle size={16} className="text-green-600" />,
  partial: <Clock size={16} className="text-amber-600" />,
  failed: <XCircle size={16} className="text-red-600" />,
  pending: <Clock size={16} className="text-gray-500" />
}

const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr)

  // Check if the date is valid
  if (isNaN(date.getTime())) {
    return dateStr // Return original if invalid
  }

  // Use UTC methods to display the time as stored in database (without timezone conversion)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export const ExtractorOperationHistoryModal: React.FC<ExtractorOperationHistoryModalProps> = ({
  isOpen,
  onClose,
  user
}) => {
  const [batches, setBatches] = useState<BatchStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [batchDetails, setBatchDetails] = useState<Map<string, OperationHistoryRecord[]>>(new Map())
  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [allUsers, setAllUsers] = useState<string[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const logger = useLogger('OperationHistory')

  const isAdmin = user?.userType === 'Admin'

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Admin user can pass usernames filter
      const options =
        isAdmin && selectedUsers.length > 0
          ? { limit: 100, usernames: selectedUsers }
          : { limit: 100 }

      const result = await window.electron.operationHistory.getBatches(options)
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
      // If already loaded, don't fetch again
      if (batchDetails.has(batchId)) {
        return
      }

      try {
        const result = await window.electron.operationHistory.getBatchDetails(batchId)
        if (result.success && result.data) {
          setBatchDetails((prev) => new Map(prev).set(batchId, result.data!))
        }
      } catch (err) {
        logger.error('Failed to fetch batch details', {
          error: err instanceof Error ? err.message : String(err),
          batchId
        })
      }
    },
    [batchDetails, logger]
  )

  // Fetch batches when modal opens
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

  const handleDeleteBatch = async (batchId: string) => {
    if (deleting.has(batchId)) return

    const confirmed = confirm('确定要删除此批次记录吗？此操作不可撤销。')
    if (!confirmed) return

    setDeleting((prev) => new Set(prev).add(batchId))

    try {
      const result = await window.electron.operationHistory.deleteBatch(batchId)
      if (result.success) {
        // Remove from local state
        setBatches((prev) => prev.filter((b) => b.batchId !== batchId))
        setBatchDetails((prev) => {
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

  const handleCopyColumn = async (field: 'productionId' | 'orderNumber', batchId: string) => {
    const details = batchDetails.get(batchId) || []
    const values = details
      .map((d) => (field === 'productionId' ? d.productionId : d.orderNumber))
      .filter(Boolean) // 移除空值
      .join('\n') // 使用换行符分隔

    if (!values) {
      showWarning('没有可复制的数据')
      return
    }

    try {
      await navigator.clipboard.writeText(values)
      showSuccess(`已复制 ${values.split('\n').length} 条数据`)
    } catch {
      showError('复制失败，请手动复制')
    }
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
    <Modal isOpen={isOpen} onClose={onClose} title="操作历史" size="3xl">
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
                const details = batchDetails.get(batch.batchId) || []
                const isDeleting = deleting.has(batch.batchId)

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

                        <div className="flex-1 grid grid-cols-6 gap-4 text-sm">
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
                            <div className="text-gray-500 text-xs">记录数</div>
                            <div className="font-medium text-gray-900">{batch.totalRecords}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 text-xs">成功/失败</div>
                            <div className="font-medium text-gray-900">
                              <span className="text-green-600">{batch.successCount}</span>
                              {batch.failedCount > 0 && (
                                <>
                                  {' / '}
                                  <span className="text-red-600">{batch.failedCount}</span>
                                </>
                              )}
                            </div>
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
                    {isExpanded && details.length > 0 && (
                      <div className="border-t border-gray-200 bg-white">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left font-medium text-gray-600">
                                  <div className="flex items-center gap-2">
                                    总排号
                                    <button
                                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                                      onClick={() =>
                                        void handleCopyColumn('productionId', batch.batchId)
                                      }
                                      title="复制所有总排号"
                                    >
                                      <Copy
                                        size={14}
                                        className="text-gray-500 hover:text-gray-700"
                                      />
                                    </button>
                                  </div>
                                </th>
                                <th className="px-4 py-2 text-left font-medium text-gray-600">
                                  <div className="flex items-center gap-2">
                                    订单号
                                    <button
                                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                                      onClick={() =>
                                        void handleCopyColumn('orderNumber', batch.batchId)
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
                                  记录数
                                </th>
                                <th className="px-4 py-2 text-left font-medium text-gray-600">
                                  错误信息
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {details.map((detail) => (
                                <tr key={detail.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-2 text-gray-900">
                                    {detail.productionId || '-'}
                                  </td>
                                  <td className="px-4 py-2 text-gray-900 font-mono text-xs">
                                    {detail.orderNumber}
                                  </td>
                                  <td className="px-4 py-2">
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                        statusStyles[detail.status] || statusStyles.pending
                                      }`}
                                    >
                                      {statusIcons[detail.status]}
                                      {statusLabels[detail.status] || detail.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-gray-900">
                                    {detail.recordCount ?? '-'}
                                  </td>
                                  <td className="px-4 py-2 text-red-600 text-xs max-w-xs truncate">
                                    {detail.errorMessage || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
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

export default ExtractorOperationHistoryModal
