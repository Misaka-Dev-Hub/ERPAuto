/**
 * Execution Report Dialog - Shows execution progress and results after cleaner runs
 *
 * Displays:
 * - Progress bar during execution
 * - Orders processed count, Materials deleted/skipped count after completion
 * - Error list (if any)
 */

import React, { useRef } from 'react'
import { CheckCircle, XCircle, SkipForward, Package, Loader2 } from 'lucide-react'
import FocusLock from 'react-focus-lock'
import { useDialogFocus } from '../hooks/useDialogFocus'

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
  startTime = null
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Setup focus management with custom escape key handling
  const { focusLockProps } = useDialogFocus({
    isOpen,
    dialogRef,
    onClose
  })

  // Custom escape key handling - only close when NOT executing
  React.useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only allow escape to close when not executing
      if ((event.key === 'Escape' || event.keyCode === 27) && !isExecuting) {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isExecuting, onClose])

  if (!isOpen) return null

  const hasErrors = errors.length > 0
  const showProgress = isExecuting && progress

  const [now, setNow] = React.useState(Date.now())

  React.useEffect(() => {
    if (!showProgress || !startTime) return

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [showProgress, startTime])

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
    <FocusLock {...focusLockProps}>
      <div
        className="execution-report-overlay"
        onClick={showProgress ? undefined : onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby={
          showProgress ? 'execution-dialog-progress-title' : 'execution-dialog-report-title'
        }
      >
        <div
          ref={dialogRef}
          className="execution-report-dialog"
          onClick={(e) => e.stopPropagation()}
          style={{ width: showProgress ? '560px' : '480px' }}
        >
          {showProgress ? (
            // Progress View
            <div className="progress-header">
              <div className="progress-icon-wrapper">
                <Loader2 className="progress-icon spinning" />
              </div>
              <h2 id="execution-dialog-progress-title" className="progress-title">
                正在执行清理...
              </h2>
              <p className="progress-subtitle" aria-live="polite" aria-atomic="true">
                {progress?.message || '处理中...'}
              </p>
            </div>
          ) : (
            // Result View
            <div className="report-header">
              <div className="report-icon-wrapper">
                {dryRun ? (
                  <Package className="report-icon preview" />
                ) : hasErrors ? (
                  <XCircle className="report-icon error" />
                ) : (
                  <CheckCircle className="report-icon success" />
                )}
              </div>
              <h2 id="execution-dialog-report-title" className="report-title">
                {dryRun ? '预览执行报告' : hasErrors ? '执行完成 (有错误)' : '执行完成'}
              </h2>
              <p className="report-subtitle">
                {dryRun
                  ? '预览模式 - 未实际删除数据'
                  : hasErrors
                    ? '部分操作未能完成，请查看下方错误信息'
                    : '所有操作已成功完成'}
              </p>
            </div>
          )}

          <div className="report-body">
            {showProgress ? (
              // Progress View Content
              <div className="progress-content">
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${progress?.progress || 0}%` }}
                  />
                </div>

                <div className="progress-stats">
                  <div className="progress-stat-item">
                    <span className="stat-label">订单进度</span>
                    <span className="stat-value">
                      {Math.min(progress!.currentOrderIndex, progress!.totalOrders)} /{' '}
                      {progress!.totalOrders}
                    </span>
                  </div>
                  {progress!.totalMaterialsInOrder > 0 && (
                    <div className="progress-stat-item">
                      <span className="stat-label">物料进度</span>
                      <span className="stat-value">
                        {progress!.currentMaterialIndex} / {progress!.totalMaterialsInOrder}
                      </span>
                    </div>
                  )}
                  <div className="progress-stat-item">
                    <span className="stat-label">总进度</span>
                    <span className="stat-value">{Math.round(progress?.progress || 0)}%</span>
                  </div>
                </div>

                {progress?.currentOrderNumber && (
                  <div className="current-order-info">
                    <Package size={14} className="order-icon" />
                    <span className="order-label">当前订单:</span>
                    <span className="order-number">{progress.currentOrderNumber}</span>
                  </div>
                )}

                {estimatedTime && (
                  <div className="estimated-time-info">
                    <div className="estimated-time-item">
                      <span className="time-label">预估还要</span>
                      <span className="time-value">{estimatedTime.remainingMinutes} 分钟</span>
                    </div>
                    <div className="estimated-time-item">
                      <span className="time-label">将会在</span>
                      <span className="time-value">{estimatedTime.formattedTime}</span>
                      <span className="time-label">执行完毕</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Result View Content
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon orders">
                      <Package size={20} />
                    </div>
                    <div className="stat-content">
                      <div className="stat-label">处理订单</div>
                      <div className="stat-value">{ordersProcessed}</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon deleted">
                      <CheckCircle size={20} />
                    </div>
                    <div className="stat-content">
                      <div className="stat-label">{dryRun ? '拟删除物料' : '删除物料'}</div>
                      <div className="stat-value">{materialsDeleted}</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon skipped">
                      <SkipForward size={20} />
                    </div>
                    <div className="stat-content">
                      <div className="stat-label">跳过物料</div>
                      <div className="stat-value">{materialsSkipped}</div>
                    </div>
                  </div>

                  {hasErrors && (
                    <div className="stat-card">
                      <div className="stat-icon errors">
                        <XCircle size={20} />
                      </div>
                      <div className="stat-content">
                        <div className="stat-label">错误数量</div>
                        <div className="stat-value error">{errors.length}</div>
                      </div>
                    </div>
                  )}
                </div>

                {hasErrors && (
                  <div className="errors-section">
                    <div className="errors-title">错误详情</div>
                    <div className="errors-list">
                      {errors.map((error, index) => (
                        <div key={index} className="error-item">
                          <XCircle size={14} className="error-icon" />
                          <span className="error-text">{error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!hasErrors && !dryRun && (
                  <div className="success-message">
                    <CheckCircle size={16} className="success-icon" />
                    <span>操作已成功完成，数据已同步到 ERP 系统</span>
                  </div>
                )}

                {!hasErrors && dryRun && (
                  <div className="preview-message">
                    <Package size={16} className="preview-icon" />
                    <span>预览模式结束，数据未实际修改。确认无误后可正式执行。</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="report-footer">
            {!showProgress && (
              <button className="btn-report-close" onClick={onClose}>
                关闭
              </button>
            )}
          </div>

          <style>{`
          .execution-report-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            animation: fadeIn 0.2s ease-out;
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          .execution-report-dialog {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            max-width: 90vw;
            animation: slideDown 0.2s ease-out;
            transition: width 0.3s ease;
          }

          .progress-header,
          .report-header {
            text-align: center;
            padding: 24px 24px 16px 24px;
            border-bottom: 1px solid #f0f0f0;
          }

          .progress-icon-wrapper,
          .report-icon-wrapper {
            display: flex;
            justify-content: center;
            margin-bottom: 12px;
          }

          .progress-icon {
            width: 48px;
            height: 48px;
            color: #1890ff;
            animation: spin 1.5s linear infinite;
          }

          .progress-title {
            font-size: 20px;
            font-weight: 600;
            color: #333;
            margin: 0 0 8px 0;
          }

          .progress-subtitle {
            font-size: 13px;
            color: #666;
            margin: 0;
          }

          .report-icon {
            width: 48px;
            height: 48px;
          }

          .report-icon.success {
            color: #52c41a;
          }

          .report-icon.error {
            color: #ff4d4f;
          }

          .report-icon.preview {
            color: #faad14;
          }

          .report-title {
            font-size: 20px;
            font-weight: 600;
            color: #333;
            margin: 0 0 8px 0;
          }

          .report-subtitle {
            font-size: 13px;
            color: #999;
            margin: 0;
          }

          .report-body {
            padding: 20px 24px;
          }

          /* Progress View Styles */
          .progress-content {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .progress-bar-container {
            width: 100%;
            height: 24px;
            background: linear-gradient(90deg, #e6f7ff 0%, #bae7ff 100%);
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #91d5ff;
            position: relative;
          }

          .progress-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #1890ff 0%, #096dd9 100%);
            border-radius: 12px;
            transition: width 0.3s ease;
            position: relative;
            overflow: hidden;
          }

          .progress-bar-fill::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(
              90deg,
              transparent 0%,
              rgba(255, 255, 255, 0.3) 50%,
              transparent 100%
            );
            animation: shimmer 1.5s infinite;
          }

          @keyframes shimmer {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(100%);
            }
          }

          .progress-stats {
            display: flex;
            justify-content: space-around;
            padding: 16px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #e8e8e8;
          }

          .progress-stat-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
          }

          .progress-stat-item .stat-label {
            font-size: 12px;
            color: #666;
          }

          .progress-stat-item .stat-value {
            font-size: 18px;
            font-weight: 600;
            color: #1890ff;
          }

          .current-order-info {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px;
            background: #f0f5ff;
            border-radius: 6px;
            border: 1px solid #d6e4ff;
          }

          .current-order-info .order-icon {
            color: #1890ff;
          }

          .current-order-info .order-label {
            font-size: 13px;
            color: #666;
          }

          .current-order-info .order-number {
            font-size: 14px;
            font-weight: 500;
            color: #333;
            font-family: monospace;
          }

          .estimated-time-info {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            padding: 12px;
            background: #f6ffed;
            border-radius: 6px;
            border: 1px solid #b7eb8f;
          }

          .estimated-time-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
          }

          .estimated-time-item .time-label {
            color: #666;
          }

          .estimated-time-item .time-value {
            font-size: 14px;
            font-weight: 600;
            color: #52c41a;
          }

          /* Result View Styles */
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 16px;
          }

          .stat-card {
            background: #f8f9fa;
            border-radius: 6px;
            padding: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
            border: 1px solid #e8e8e8;
          }

          .stat-card:nth-child(4) {
            grid-column: span 3;
          }

          .stat-icon {
            width: 36px;
            height: 36px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .stat-icon.orders {
            background: #e6f7ff;
            color: #1890ff;
          }

          .stat-icon.deleted {
            background: #f6ffed;
            color: #52c41a;
          }

          .stat-icon.skipped {
            background: #fff7e6;
            color: #faad14;
          }

          .stat-icon.errors {
            background: #fff1f0;
            color: #ff4d4f;
          }

          .stat-content {
            flex: 1;
            min-width: 0;
          }

          .stat-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 4px;
          }

          .stat-value {
            font-size: 20px;
            font-weight: 600;
            color: #333;
            line-height: 1;
          }

          .stat-value.error {
            color: #ff4d4f;
          }

          .errors-section {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid #f0f0f0;
          }

          .errors-title {
            font-size: 13px;
            font-weight: 600;
            color: #ff4d4f;
            margin-bottom: 8px;
          }

          .errors-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 150px;
            overflow-y: auto;
          }

          .error-item {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 8px 10px;
            background: #fff1f0;
            border-radius: 4px;
            border: 1px solid #ffccc7;
          }

          .error-icon {
            color: #ff4d4f;
            flex-shrink: 0;
            margin-top: 1px;
          }

          .error-text {
            font-size: 12px;
            color: #333;
            word-break: break-word;
          }

          .success-message,
          .preview-message {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px;
            border-radius: 6px;
            font-size: 13px;
          }

          .success-message {
            background: #f6ffed;
            color: #52c41a;
            border: 1px solid #b7eb8f;
          }

          .preview-message {
            background: #fff7e6;
            color: #faad14;
            border: 1px solid #ffd591;
          }

          .success-icon,
          .preview-icon {
            flex-shrink: 0;
          }

          .report-footer {
            padding: 16px 24px;
            border-top: 1px solid #f0f0f0;
            display: flex;
            justify-content: center;
          }

          .btn-report-close {
            background: #1890ff;
            color: #fff;
            border: none;
            border-radius: 6px;
            padding: 10px 32px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s;
          }

          .btn-report-close:hover {
            background: #40a9ff;
          }

          .btn-report-close:active {
            background: #096dd9;
          }
        `}</style>
        </div>
      </div>
    </FocusLock>
  )
}

export default ExecutionReportDialog
