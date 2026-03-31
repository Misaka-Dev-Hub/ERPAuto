/**
 * Extractor Operation History Modal
 *
 * Displays extraction operation history with batch statistics and details.
 * Admin users see all users' records, regular users see only their own.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Modal } from './ui/Modal'
import {
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react'
import type { UserInfo } from './UserSelectionDialog'
import type {
  BatchStats,
  OperationHistoryRecord
} from '../../../main/types/operation-history.types'

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
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
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

  const isAdmin = user?.userType === 'Admin'

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electron.operationHistory.getBatches({ limit: 100 })
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
  }, [])

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
        console.error('Failed to fetch batch details:', err)
      }
    },
    [batchDetails]
  )

  // Fetch batches when modal opens
  useEffect(() => {
    if (isOpen) {
      void fetchBatches()
    }
  }, [isOpen, fetchBatches])

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

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="操作历史" size="3xl">
      <div className="flex flex-col h-[70vh]">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {isAdmin ? (
                <span className="text-amber-600 font-medium">管理员模式：显示所有用户记录</span>
              ) : (
                <span>仅显示您的操作记录</span>
              )}
            </span>
            {batches.length > 0 && (
              <span className="text-sm text-gray-500">共 {batches.length} 条批次</span>
            )}
          </div>
          <button
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
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
                    </div>

                    {/* Batch details */}
                    {isExpanded && details.length > 0 && (
                      <div className="border-t border-gray-200 bg-white">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left font-medium text-gray-600">
                                  总排号
                                </th>
                                <th className="px-4 py-2 text-left font-medium text-gray-600">
                                  订单号
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
