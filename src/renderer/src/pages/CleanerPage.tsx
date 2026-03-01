import React, { useState } from 'react'
import { OrderNumberInput } from '../components/OrderNumberInput'
import { MaterialCodeInput } from '../components/MaterialCodeInput'

interface CleanerResult {
  ordersProcessed: number
  materialsDeleted: number
  materialsSkipped: number
  errors: string[]
  details: Array<{
    orderNumber: string
    materialsDeleted: number
    materialsSkipped: number
    errors: string[]
  }>
}

interface CleanerProgress {
  message: string
  progress?: number
}

/**
 * CleanerPage - Main page for ERP material cleaning
 */
export const CleanerPage: React.FC = () => {
  const [orderNumbers, setOrderNumbers] = useState('')
  const [materialCodes, setMaterialCodes] = useState('')
  const [dryRun, setDryRun] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<CleanerProgress | null>(null)
  const [result, setResult] = useState<CleanerResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleClean = async () => {
    if (!orderNumbers.trim()) {
      setError('请输入至少一个订单号')
      return
    }
    if (!materialCodes.trim()) {
      setError('请输入至少一个物料代码')
      return
    }

    setIsRunning(true)
    setProgress(null)
    setResult(null)
    setError(null)

    try {
      const orderNumberList = orderNumbers
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      const materialCodeList = materialCodes
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      // Call cleaner API through electron
      const response = await window.electron.cleaner.runCleaner({
        orderNumbers: orderNumberList,
        materialCodes: materialCodeList,
        dryRun
      })

      if (response.success && response.data) {
        setResult(response.data)
      } else {
        setError(response.error || '清理失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误')
    } finally {
      setIsRunning(false)
      setProgress(null)
    }
  }

  const handleReset = () => {
    setOrderNumbers('')
    setMaterialCodes('')
    setDryRun(true)
    setResult(null)
    setError(null)
    setProgress(null)
  }

  return (
    <div className="cleaner-page">
      <h1 className="page-title">ERP 物料清理</h1>

      <div className="cleaner-content">
        {/* Input Section */}
        <div className="input-section">
          <OrderNumberInput
            value={orderNumbers}
            onChange={setOrderNumbers}
            label="订单号列表"
            placeholder="请输入订单号，每行一个"
          />

          <MaterialCodeInput
            value={materialCodes}
            onChange={setMaterialCodes}
            label="物料代码列表"
            placeholder="请输入物料代码，每行一个"
          />

          <div className="dry-run-option">
            <label>
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={isRunning}
              />
              <span>干运行模式（不实际删除，仅预览）</span>
            </label>
          </div>

          <div className="button-group">
            <button
              className="btn btn-primary"
              onClick={handleClean}
              disabled={isRunning || !orderNumbers.trim() || !materialCodes.trim()}
            >
              {isRunning ? '清理中...' : '开始清理'}
            </button>
            <button className="btn btn-secondary" onClick={handleReset} disabled={isRunning}>
              重置
            </button>
          </div>
        </div>

        {/* Progress Section */}
        {progress && (
          <div className="progress-section">
            {progress.progress !== undefined && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress.progress}%` }} />
              </div>
            )}
            <p className="progress-message">{progress.message}</p>
          </div>
        )}

        {/* Error Section */}
        {error && (
          <div className="error-section">
            <h3>错误</h3>
            <p>{error}</p>
          </div>
        )}

        {/* Result Section */}
        {result && (
          <div className="result-section">
            <h3>清理结果</h3>
            <div className="result-stats">
              <div className="stat-item">
                <span className="stat-label">处理订单数</span>
                <span className="stat-value">{result.ordersProcessed}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">删除物料数</span>
                <span className="stat-value">{result.materialsDeleted}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">跳过物料数</span>
                <span className="stat-value">{result.materialsSkipped}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">错误数</span>
                <span className="stat-value error">{result.errors.length}</span>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="error-list">
                <h4>错误列表</h4>
                <ul>
                  {result.errors.map((err, index) => (
                    <li key={index} className="error-item">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.details.length > 0 && (
              <div className="details-list">
                <h4>订单详情</h4>
                {result.details.map((detail, index) => (
                  <div key={index} className="detail-item">
                    <div className="detail-order">{detail.orderNumber}</div>
                    <div className="detail-stats">
                      <span>删除：{detail.materialsDeleted}</span>
                      <span>跳过：{detail.materialsSkipped}</span>
                    </div>
                    {detail.errors.length > 0 && (
                      <div className="detail-errors">
                        {detail.errors.map((err, i) => (
                          <div key={i} className="detail-error">
                            {err}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {dryRun && (
              <div className="dry-run-notice">
                <strong>提示：</strong> 本次运行为干运行模式，未实际删除任何数据。
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .cleaner-page {
          padding: 24px;
          max-width: 800px;
          margin: 0 auto;
        }
        .page-title {
          font-size: 24px;
          font-weight: 600;
          color: #333;
          margin-bottom: 24px;
        }
        .cleaner-content {
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          padding: 24px;
        }
        .input-section {
          margin-bottom: 24px;
        }
        .dry-run-option {
          margin-bottom: 16px;
          padding: 12px;
          background: #f5f5f5;
          border-radius: 6px;
        }
        .dry-run-option label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
          color: #666;
        }
        .dry-run-option input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }
        .dry-run-option input:disabled {
          cursor: not-allowed;
        }
        .button-group {
          display: flex;
          gap: 12px;
        }
        .btn {
          padding: 10px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-primary {
          background: #52c41a;
          color: #fff;
        }
        .btn-primary:hover:not(:disabled) {
          background: #73d13d;
        }
        .btn-secondary {
          background: #f5f5f5;
          color: #666;
        }
        .btn-secondary:hover:not(:disabled) {
          background: #e8e8e8;
        }
        .progress-section {
          margin-top: 24px;
          padding: 16px;
          background: #f5f5f5;
          border-radius: 6px;
        }
        .progress-bar {
          height: 8px;
          background: #e8e8e8;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #52c41a, #73d13d);
          transition: width 0.3s;
        }
        .progress-message {
          font-size: 14px;
          color: #666;
          margin: 0;
        }
        .error-section {
          margin-top: 24px;
          padding: 16px;
          background: #fff1f0;
          border: 1px solid #ffa39e;
          border-radius: 6px;
        }
        .error-section h3 {
          color: #ff4d4f;
          margin: 0 0 8px 0;
          font-size: 16px;
        }
        .error-section p {
          color: #666;
          margin: 0;
        }
        .result-section {
          margin-top: 24px;
          padding: 16px;
          background: #f6ffed;
          border: 1px solid #b7eb8f;
          border-radius: 6px;
        }
        .result-section h3 {
          color: #52c41a;
          margin: 0 0 16px 0;
          font-size: 16px;
        }
        .result-stats {
          display: flex;
          gap: 24px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .stat-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .stat-label {
          font-size: 12px;
          color: #999;
        }
        .stat-value {
          font-size: 24px;
          font-weight: 600;
          color: #333;
        }
        .stat-value.error {
          color: #ff4d4f;
        }
        .error-list, .details-list {
          margin-top: 16px;
        }
        .error-list h4, .details-list h4 {
          font-size: 14px;
          color: #666;
          margin-bottom: 8px;
        }
        .error-list ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .error-list li {
          padding: 6px 12px;
          background: #fff1f0;
          border-radius: 4px;
          margin-bottom: 4px;
          font-size: 13px;
          color: #ff4d4f;
        }
        .detail-item {
          background: #fff;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 8px;
          border: 1px solid #d9d9d9;
        }
        .detail-order {
          font-weight: 600;
          font-size: 14px;
          color: #333;
          margin-bottom: 8px;
          font-family: 'Consolas', 'Monaco', monospace;
        }
        .detail-stats {
          display: flex;
          gap: 16px;
          font-size: 13px;
          color: #666;
        }
        .detail-stats span {
          background: #f5f5f5;
          padding: 4px 8px;
          border-radius: 4px;
        }
        .detail-errors {
          margin-top: 8px;
        }
        .detail-error {
          font-size: 12px;
          color: #ff4d4f;
          padding: 4px 0;
        }
        .dry-run-notice {
          margin-top: 16px;
          padding: 12px;
          background: #fffbe6;
          border: 1px solid #ffe58f;
          border-radius: 6px;
          font-size: 13px;
          color: #fa8c16;
        }
      `}</style>
    </div>
  )
}

export default CleanerPage
