import React, { useState, useEffect } from 'react'
import { OrderNumberInput } from '../components/OrderNumberInput'

// Extractor result type (matches the type from main process)
interface ExtractorResult {
  downloadedFiles: string[]
  mergedFile: string | null
  recordCount: number
  errors: string[]
}

interface ExtractorProgress {
  message: string
  progress: number
}

/**
 * ExtractorPage - Main page for ERP data extraction
 */
export const ExtractorPage: React.FC = () => {
  const [orderNumbers, setOrderNumbers] = useState(() => {
    // Restore from sessionStorage on mount
    return sessionStorage.getItem('extractor_orderNumbers') || ''
  })
  const [batchSize, setBatchSize] = useState(() => {
    const saved = sessionStorage.getItem('extractor_batchSize')
    return saved ? parseInt(saved, 10) : 100
  })
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<ExtractorProgress | null>(null)
  const [result, setResult] = useState<ExtractorResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('unsaved')

  // Save to sessionStorage when orderNumbers changes
  useEffect(() => {
    sessionStorage.setItem('extractor_orderNumbers', orderNumbers)
    // Update shared Production IDs when orderNumbers changes
    if (orderNumbers.trim()) {
      const orderNumberList = orderNumbers
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
      window.electron.validation.setSharedProductionIds(orderNumberList)
    }
  }, [orderNumbers])

  // Save to sessionStorage when batchSize changes
  useEffect(() => {
    sessionStorage.setItem('extractor_batchSize', batchSize.toString())
  }, [batchSize])

  const saveSharedProductionIds = async () => {
    if (!orderNumbers.trim()) {
      setError('请输入至少一个订单号')
      return
    }

    setSaveStatus('saving')
    try {
      const orderNumberList = orderNumbers
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      await window.electron.validation.setSharedProductionIds(orderNumberList)
      console.log(`[Extractor] Stored ${orderNumberList.length} Production IDs for sharing`)
      setSaveStatus('saved')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
      setSaveStatus('unsaved')
    }
  }

  const handleExtract = async () => {
    if (!orderNumbers.trim()) {
      setError('请输入至少一个订单号')
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

      // Store Production IDs for sharing with cleaner page (before extraction starts)
      await window.electron.validation.setSharedProductionIds(orderNumberList)
      console.log(`[Extractor] Stored ${orderNumberList.length} Production IDs for sharing`)

      // Call extractor API through electron
      const response = await window.electron.extractor.runExtractor({
        orderNumbers: orderNumberList,
        batchSize
      })

      if (response.success && response.data) {
        setResult(response.data)
      } else {
        setError(response.error || '提取失败')
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
    setBatchSize(100)
    setResult(null)
    setError(null)
    setProgress(null)
  }

  return (
    <div className="extractor-page">
      <h1 className="page-title">ERP 数据提取</h1>

      <div className="extractor-content">
        {/* Input Section */}
        <div className="input-section">
          <OrderNumberInput
            value={orderNumbers}
            onChange={setOrderNumbers}
            label="订单号列表"
            placeholder="请输入订单号，每行一个&#10;例如：&#10;SC70202602120085&#10;SC70202602120120&#10;SC70202602120137"
          />

          <div className="batch-size-input">
            <label>批量大小：</label>
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
              min={1}
              max={1000}
              disabled={isRunning}
            />
            <span className="hint">每批处理的订单数量</span>
          </div>

          <div className="button-group">
            <button
              className="btn btn-primary"
              onClick={handleExtract}
              disabled={isRunning || !orderNumbers.trim()}
            >
              {isRunning ? '提取中...' : '开始提取'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={saveSharedProductionIds}
              disabled={isRunning || !orderNumbers.trim() || saveStatus === 'saved'}
              title="保存订单号以便在清理页面使用"
            >
              {saveStatus === 'saving' ? '保存中...' : saveStatus === 'saved' ? '已保存' : '保存为共享 ID'}
            </button>
            <button className="btn btn-secondary" onClick={handleReset} disabled={isRunning}>
              重置
            </button>
          </div>
        </div>

        {/* Progress Section */}
        {progress && (
          <div className="progress-section">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress.progress}%` }} />
            </div>
            <p className="progress-message">{progress.message}</p>
          </div>
        )}

        {/* Error Section */}
        {error && (
          <div className="error-section">
            <h3>错误</h3>
            <div className="error-message" title="双击可选中复制">
              {error}
            </div>
            <p className="error-hint">💡 提示：双击错误信息可选中复制</p>
          </div>
        )}

        {/* Result Section */}
        {result && (
          <div className="result-section">
            <h3>提取结果</h3>
            <div className="result-stats">
              <div className="stat-item">
                <span className="stat-label">下载文件数</span>
                <span className="stat-value">{result.downloadedFiles.length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">记录数</span>
                <span className="stat-value">{result.recordCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">错误数</span>
                <span className="stat-value error">{result.errors.length}</span>
              </div>
            </div>

            {result.downloadedFiles.length > 0 && (
              <div className="file-list">
                <h4>下载的文件</h4>
                <ul>
                  {result.downloadedFiles.map((file, index) => (
                    <li key={index}>{file}</li>
                  ))}
                </ul>
              </div>
            )}

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
          </div>
        )}
      </div>

      <style>{`
        .extractor-page {
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
        .extractor-content {
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          padding: 24px;
        }
        .input-section {
          margin-bottom: 24px;
        }
        .batch-size-input {
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .batch-size-input label {
          font-weight: 500;
          font-size: 14px;
        }
        .batch-size-input input {
          padding: 6px 12px;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          font-size: 14px;
          width: 100px;
        }
        .batch-size-input input:disabled {
          background: #f5f5f5;
          cursor: not-allowed;
        }
        .batch-size-input .hint {
          font-size: 12px;
          color: #999;
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
          background: #1890ff;
          color: #fff;
        }
        .btn-primary:hover:not(:disabled) {
          background: #40a9ff;
        }
        .btn-secondary {
          background: #f5f5f5;
          color: #666;
        }
        .btn-secondary:hover:not(:disabled) {
          background: #e8e8e8;
        }
        .btn-secondary[data-saved="true"] {
          background: #52c41a;
          color: #fff;
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
          background: linear-gradient(90deg, #1890ff, #40a9ff);
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
        .error-message {
          background: #fff;
          padding: 12px;
          border-radius: 4px;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 13px;
          color: #333;
          border: 1px solid #ffccc7;
          user-select: text;
          -webkit-user-select: text;
          cursor: text;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .error-message:hover {
          background: #fffbfc;
        }
        .error-hint {
          color: #999;
          font-size: 12px;
          margin: 8px 0 0 0;
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
        .file-list, .error-list {
          margin-top: 16px;
        }
        .file-list h4, .error-list h4 {
          font-size: 14px;
          color: #666;
          margin-bottom: 8px;
        }
        .file-list ul, .error-list ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .file-list li, .error-list li {
          padding: 6px 12px;
          background: #fff;
          border-radius: 4px;
          margin-bottom: 4px;
          font-size: 13px;
          font-family: 'Consolas', 'Monaco', monospace;
        }
        .error-list li {
          background: #fff1f0;
          color: #ff4d4f;
        }
      `}</style>
    </div>
  )
}

export default ExtractorPage
