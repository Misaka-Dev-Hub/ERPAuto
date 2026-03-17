/**
 * Execution Report Dialog - Shows execution progress and results after cleaner runs
 *
 * Displays:
 * - Progress bar during execution
 * - Orders processed count, Materials deleted/skipped count after completion
 * - Error list (if any)
 */

import React from 'react'
import { CheckCircle, XCircle, SkipForward, Package, Loader2 } from 'lucide-react'
import { Modal } from './ui/Modal'

interface CleanerProgress {
  message: string
  progress: number
  currentOrderIndex: number
  totalOrders: number
  currentMaterialIndex: number
  totalMaterialsInOrder: number
  currentOrderNumber?: string
  phase: 'login' | 'processing' | 'complete'
}

interface ExecutionReportDialogProps {
  isOpen: boolean
  onClose: () => void
  ordersProcessed?: number
  materialsDeleted?: number
  materialsSkipped?: number
  errors?: string[]
  dryRun?: boolean
  isExecuting?: boolean
  progress?: CleanerProgress | null
  startTime?: number | null
  triggerRef?: React.RefObject<HTMLElement | null>
  // Retry-related props
  retriedOrders?: number
  successfulRetries?: number
}

export const ExecutionReportDialog: React.FC<ExecutionReportDialogProps> = ({
  isOpen,
  onClose,
  ordersProcessed = 0,
  materialsDeleted = 0,
  materialsSkipped = 0,
  errors = [],
  dryRun = false,
  isExecuting = false,
  progress = null,
  startTime = null,
  triggerRef,
  retriedOrders = 0,
  successfulRetries = 0
}) => {
  const [now, setNow] = React.useState(() => Date.now())

  const hasErrors = errors.length > 0
  const hasRetries = retriedOrders > 0
  const showProgress = isExecuting && progress
  const isProgressing = !!showProgress

  // Update timer during progress
  React.useEffect(() => {
    if (!showProgress || !startTime) return

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [showProgress, startTime])

  // Update time when execution completes
  React.useEffect(() => {
    if (showProgress === false && startTime && isExecuting === false) {
      setNow(Date.now())
    }
  }, [showProgress, isExecuting, startTime])

  const elapsedTime = React.useMemo(() => {
    if (!startTime) return null

    const elapsedMs = now - startTime
    const elapsedSeconds = Math.floor(elapsedMs / 1000)
    const minutes = Math.floor(elapsedSeconds / 60)
    const seconds = elapsedSeconds % 60

    return {
      totalSeconds: elapsedSeconds,
      formatted: minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`
    }
  }, [startTime, now])

  const estimatedTime = React.useMemo(() => {
    if (!showProgress || !startTime || !progress) return null

    const currentProgress = progress.progress
    if (currentProgress < 5) return null

    const elapsedMs = now - startTime
    const elapsedMinutes = elapsedMs / 60000

    const totalEstimatedMinutes = elapsedMinutes / (currentProgress / 100)
    const remainingMinutes = Math.max(0, totalEstimatedMinutes - elapsedMinutes)
    const remainingRounded = Math.round(remainingMinutes)

    const endTime = new Date(now + remainingMinutes * 60000)
    const hours = endTime.getHours()
    const minutes = endTime.getMinutes()
    const seconds = endTime.getSeconds()
    const period = hours >= 12 ? '下午' : '上午'
    const displayHours = hours % 12 || 12
    const formattedTime = `${period} ${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

    return {
      remainingMinutes: remainingRounded,
      formattedTime
    }
  }, [showProgress, startTime, progress, now])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isProgressing
          ? '正在执行清理...'
          : dryRun
            ? '预览执行报告'
            : hasErrors
              ? '执行完成 (有错误)'
              : '执行完成'
      }
      size={isProgressing ? 'lg' : 'md'}
      showCloseButton={!isExecuting}
      triggerRef={triggerRef}
      isAlertDialog={isProgressing}
      disableEscapeKey={isProgressing}
      disableBackdropClick={isProgressing}
      ariaDescribedBy={isProgressing ? 'execution-dialog-progress-desc' : undefined}
      initialFocusSelector={!isProgressing ? '.btn-report-close' : undefined}
    >
      {isProgressing ? (
        // Progress View
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            </div>
          </div>
          <p
            id="execution-dialog-progress-desc"
            className="text-sm text-gray-600 mb-4"
            aria-live="polite"
            aria-atomic="true"
          >
            {progress?.message || '处理中...'}
          </p>
        </div>
      ) : (
        // Result View
        <div className="text-center mb-4">
          <div className="flex justify-center mb-4">
            {dryRun ? (
              <Package className="w-12 h-12 text-amber-500" />
            ) : hasErrors ? (
              <XCircle className="w-12 h-12 text-red-500" />
            ) : (
              <CheckCircle className="w-12 h-12 text-green-500" />
            )}
          </div>
          <p className="text-sm text-gray-600">
            {dryRun
              ? '预览模式 - 未实际删除数据'
              : hasErrors
                ? '部分操作未能完成，请查看下方错误信息'
                : '所有操作已成功完成'}
          </p>
        </div>
      )}

      {isProgressing ? (
        // Progress View Content
        <div className="space-y-4">
          <div className="progress-bar-container w-full h-6 bg-gradient-to-r from-blue-50 to-sky-100 rounded-full overflow-hidden border border-blue-200 relative">
            <div
              className="progress-bar-fill h-full bg-gradient-to-r from-blue-500 to-blue-700 transition-all duration-300 relative overflow-hidden"
              style={{ width: `${progress?.progress || 0}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            </div>
          </div>

          <div className="flex justify-around py-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex flex-col items-center">
              <span className="text-xs text-gray-600">订单进度</span>
              <span className="text-lg font-semibold text-blue-600">
                {Math.min(progress!.currentOrderIndex, progress!.totalOrders)} /{' '}
                {progress!.totalOrders}
              </span>
            </div>
            {progress!.totalMaterialsInOrder > 0 && (
              <div className="flex flex-col items-center">
                <span className="text-xs text-gray-600">物料进度</span>
                <span className="text-lg font-semibold text-blue-600">
                  {progress!.currentMaterialIndex} / {progress!.totalMaterialsInOrder}
                </span>
              </div>
            )}
            <div className="flex flex-col items-center">
              <span className="text-xs text-gray-600">总进度</span>
              <span className="text-lg font-semibold text-blue-600">
                {Math.round(progress?.progress || 0)}%
              </span>
            </div>
          </div>

          {progress?.currentOrderNumber && (
            <div className="flex items-center justify-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <Package size={14} className="text-blue-600" />
              <span className="text-sm text-gray-600">当前订单:</span>
              <span className="text-sm font-medium text-gray-900 font-mono">
                {progress.currentOrderNumber}
              </span>
            </div>
          )}

          {elapsedTime && (
            <div className="flex flex-col items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200 mb-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">已运行</span>
                <span className="font-semibold text-blue-600">{elapsedTime.formatted}</span>
              </div>
            </div>
          )}

          {estimatedTime && (
            <div className="flex flex-col items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">预估还要</span>
                <span className="font-semibold text-green-600">
                  {estimatedTime.remainingMinutes} 分钟
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">将会在</span>
                <span className="font-semibold text-green-600">{estimatedTime.formattedTime}</span>
                <span className="text-gray-600">执行完毕</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Result View Content
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3 border border-gray-200">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Package size={20} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-600">处理订单</div>
                <div className="text-xl font-semibold text-gray-900">{ordersProcessed}</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3 border border-gray-200">
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-600">{dryRun ? '拟删除物料' : '删除物料'}</div>
                <div className="text-xl font-semibold text-gray-900">{materialsDeleted}</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3 border border-gray-200">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <SkipForward size={20} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-600">跳过物料</div>
                <div className="text-xl font-semibold text-gray-900">{materialsSkipped}</div>
              </div>
            </div>

            {hasErrors && (
              <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3 border border-gray-200 col-span-3">
                <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <XCircle size={20} className="text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-600">错误数量</div>
                  <div className="text-xl font-semibold text-red-600">{errors.length}</div>
                </div>
              </div>
            )}

            {hasRetries && (
              <>
                <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3 border border-gray-200">
                  <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-purple-600"
                    >
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 21h5v-5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-600">重试订单</div>
                    <div className="text-xl font-semibold text-gray-900">{retriedOrders}</div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3 border border-gray-200">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <CheckCircle size={20} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-600">成功重试</div>
                    <div className="text-xl font-semibold text-gray-900">{successfulRetries}</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {elapsedTime && (
            <div className="flex items-center justify-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200 text-blue-700 text-sm mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>
                总耗时：<span className="font-semibold">{elapsedTime.formatted}</span>
              </span>
            </div>
          )}

          {hasErrors && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="text-sm font-semibold text-red-600 mb-2">错误详情</div>
              <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                {errors.map((error, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 p-2 bg-red-50 rounded border border-red-200"
                  >
                    <XCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-900 break-words">{error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasErrors && !dryRun && (
            <div className="flex items-center justify-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200 text-green-700 text-sm">
              <CheckCircle size={16} className="flex-shrink-0" />
              <span>操作已成功完成，数据已同步到 ERP 系统</span>
            </div>
          )}

          {!hasErrors && dryRun && (
            <div className="flex items-center justify-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-700 text-sm">
              <Package size={16} className="flex-shrink-0" />
              <span>预览模式结束，数据未实际修改。确认无误后可正式执行。</span>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

export default ExecutionReportDialog
