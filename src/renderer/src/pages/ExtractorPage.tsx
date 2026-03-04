import React, { useState, useEffect } from 'react'
import { Download, Play, Terminal, Database } from 'lucide-react'

// Import result type (matches the type from main process)
interface ImportResult {
  success: boolean
  recordsRead: number
  recordsDeleted: number
  recordsImported: number
  uniqueSourceNumbers: number
  errors: string[]
}

// Extractor result type (matches the type from main process)
interface ExtractorResult {
  downloadedFiles: string[]
  mergedFile: string | null
  recordCount: number
  errors: string[]
  importResult?: ImportResult
}

interface ExtractorProgress {
  message: string
  progress: number
}

/**
 * ExtractorPage - Main page for ERP data extraction
 */
const ExtractorPage: React.FC = () => {
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

  // Save to sessionStorage when orderNumbers changes
  useEffect(() => {
    sessionStorage.setItem('extractor_orderNumbers', orderNumbers)
    // Update shared Production IDs when orderNumbers changes
    if (orderNumbers.trim()) {
      const orderNumberList = orderNumbers
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      window.electron.validation.setSharedProductionIds(orderNumberList)
    }
  }, [orderNumbers])

  // Save to sessionStorage when batchSize changes
  useEffect(() => {
    sessionStorage.setItem('extractor_batchSize', batchSize.toString())
  }, [batchSize])

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

  const [logs, setLogs] = useState<string[]>([
    '[10:00:01] [System] 提取引擎已就绪。',
    '[10:00:02] [Info] 等待读取生产订单列表...'
  ])

  useEffect(() => {
    if (progress) {
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] [Info] ${progress.message}`
      ])
    }
  }, [progress])

  return (
    <div className="flex h-full gap-6">
      {/* 左侧：共享数据区 (仅在数据提取页面显示) */}
      <aside className="w-80 bg-white border border-slate-200 flex flex-col shadow-sm z-10 flex-shrink-0 animate-in slide-in-from-left duration-300 rounded-xl overflow-hidden h-full">
        <div className="flex-1 flex flex-col p-5 space-y-3 h-full">
          <div>
            <label className="text-sm font-medium text-slate-700">
              支持输入总排号或者生产订单号
            </label>
            <p className="text-xs text-slate-500 leading-relaxed mt-1">
              在此输入的数据将在“数据提取”与“物料清理”模块中自动共享，每行一个。
            </p>
          </div>

          <textarea
            className="flex-1 w-full border border-slate-300 rounded-lg p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none shadow-inner bg-slate-50 h-full"
            style={{ userSelect: 'text', cursor: 'text' }}
            placeholder="PO-20231024-001&#10;PO-20231024-002&#10;PO-20231024-003..."
            value={orderNumbers}
            onChange={(e) => setOrderNumbers(e.target.value)}
            disabled={isRunning}
          ></textarea>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
            <span>
              共解析:{' '}
              <strong className="text-slate-700">
                {orderNumbers.split('\n').filter((l) => l.trim()).length}
              </strong>{' '}
              个订单
            </span>
            <button
              className="text-slate-400 hover:text-slate-600"
              onClick={handleReset}
              disabled={isRunning}
            >
              清空
            </button>
          </div>
        </div>
      </aside>

      {/* 右侧：动态功能面板 */}
      <div className="flex-1 max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800 mb-1">
              <Download size={20} className="text-blue-600" />
              批量数据提取
            </h2>
            <p className="text-sm text-slate-500">
              将遍历左侧列表中的所有生产订单，依次自动执行数据导出并保存。
            </p>
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          </div>

          <button
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg flex items-center gap-2 font-medium shadow-sm transition-colors text-base"
            onClick={handleExtract}
            disabled={isRunning || !orderNumbers.trim()}
          >
            <Play size={20} fill="currentColor" />
            {isRunning ? '提取中...' : '开始提取'}
          </button>
        </div>

        {/* 结果展示 */}
        {result && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-4">
            <h3 className="text-emerald-600 font-semibold text-lg border-b pb-2">提取结果</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col items-center justify-center">
                <span className="text-slate-500 text-sm">下载文件数</span>
                <span className="text-2xl font-bold text-slate-800">
                  {result.downloadedFiles.length}
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col items-center justify-center">
                <span className="text-slate-500 text-sm">记录数</span>
                <span className="text-2xl font-bold text-slate-800">{result.recordCount}</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col items-center justify-center">
                <span className="text-slate-500 text-sm">错误数</span>
                <span
                  className={`text-2xl font-bold ${result.errors.length > 0 ? 'text-red-500' : 'text-slate-800'}`}
                >
                  {result.errors.length}
                </span>
              </div>
            </div>
            {result.mergedFile && (
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <span className="text-slate-500 text-sm block mb-1">合并文件路径</span>
                <span className="text-sm font-mono text-slate-700 select-all break-all">
                  {result.mergedFile}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Database import results */}
        {result?.importResult && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-lg border-b pb-2 flex items-center gap-2">
              <Database
                size={20}
                className={result.importResult.success ? 'text-emerald-600' : 'text-red-500'}
              />
              <span className={result.importResult.success ? 'text-emerald-600' : 'text-red-500'}>
                数据库写入结果
              </span>
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col items-center justify-center">
                <span className="text-slate-500 text-sm">读取记录</span>
                <span className="text-2xl font-bold text-slate-800">
                  {result.importResult.recordsRead}
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col items-center justify-center">
                <span className="text-slate-500 text-sm">删除旧记录</span>
                <span className="text-2xl font-bold text-amber-600">
                  {result.importResult.recordsDeleted}
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col items-center justify-center">
                <span className="text-slate-500 text-sm">写入新记录</span>
                <span className="text-2xl font-bold text-emerald-600">
                  {result.importResult.recordsImported}
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col items-center justify-center">
                <span className="text-slate-500 text-sm">来源单号数</span>
                <span className="text-2xl font-bold text-blue-600">
                  {result.importResult.uniqueSourceNumbers}
                </span>
              </div>
            </div>
            {result.importResult.errors.length > 0 && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <span className="text-red-600 text-sm font-medium block mb-1">错误信息</span>
                <ul className="text-sm text-red-500 list-disc list-inside">
                  {result.importResult.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col h-[500px]">
          <div className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Terminal size={16} />
              <span>执行日志 (Console)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">进度: {progress?.progress || 0}%</span>
              <button
                className="text-xs text-slate-400 hover:text-white transition-colors"
                onClick={() => setLogs([])}
              >
                清空
              </button>
            </div>
          </div>
          <div className="flex-1 p-4 font-mono text-sm overflow-y-auto leading-relaxed">
            {logs.map((log, index) => (
              <div
                key={index}
                className={
                  log.includes('[System]')
                    ? 'text-emerald-500'
                    : log.includes('error') || log.includes('失败')
                      ? 'text-red-400'
                      : 'text-slate-400'
                }
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ExtractorPage
