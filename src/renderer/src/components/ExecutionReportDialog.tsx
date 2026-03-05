/**
 * Execution Report Dialog - Shows execution results after cleaner runs
 *
 * Displays:
 * - Orders processed count
 * - Materials deleted count
 * - Materials skipped count
 * - Error list (if any)
 */

import React from 'react'
import { CheckCircle, XCircle, SkipForward, Package } from 'lucide-react'

interface ExecutionReportDialogProps {
  isOpen: boolean
  onClose: () => void
  ordersProcessed: number
  materialsDeleted: number
  materialsSkipped: number
  errors?: string[]
  dryRun?: boolean
}

export const ExecutionReportDialog: React.FC<ExecutionReportDialogProps> = ({
  isOpen,
  onClose,
  ordersProcessed,
  materialsDeleted,
  materialsSkipped,
  errors = [],
  dryRun = false
}) => {
  if (!isOpen) return null

  const hasErrors = errors.length > 0

  return (
    <div className="execution-report-overlay" onClick={onClose}>
      <div className="execution-report-dialog" onClick={(e) => e.stopPropagation()}>
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
          <h2 className="report-title">
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

        <div className="report-body">
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
        </div>

        <div className="report-footer">
          <button className="btn-report-close" onClick={onClose}>
            关闭
          </button>
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

          .execution-report-dialog {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            width: 480px;
            max-width: 90vw;
            animation: slideDown 0.2s ease-out;
          }

          .report-header {
            text-align: center;
            padding: 24px 24px 16px 24px;
            border-bottom: 1px solid #f0f0f0;
          }

          .report-icon-wrapper {
            display: flex;
            justify-content: center;
            margin-bottom: 12px;
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

          .success-icon {
            flex-shrink: 0;
          }

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
  )
}

export default ExecutionReportDialog
