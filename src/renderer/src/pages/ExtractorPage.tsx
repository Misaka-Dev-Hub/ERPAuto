import React, { useState, useEffect, useRef } from 'react'
import { Download, Play, Terminal, PanelLeftClose, PanelLeft } from 'lucide-react'
import OrderNumberInput from '../components/OrderNumberInput'

interface ExtractorProgress {
  message: string
  progress: number
}

type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'system'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
}

const getLogColor = (level: LogLevel): string => {
  switch (level) {
    case 'error':
      return 'text-red-400'
    case 'warning':
      return 'text-amber-400'
    case 'success':
      return 'text-emerald-400'
    case 'system':
      return 'text-blue-400'
    default:
      return 'text-slate-400'
  }
}

const ExtractorPage: React.FC = () => {
  const [orderNumbers, setOrderNumbers] = useState(() => {
    return sessionStorage.getItem('extractor_orderNumbers') || ''
  })
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<ExtractorProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sessionStorage.setItem('extractor_orderNumbers', orderNumbers)
    if (orderNumbers.trim()) {
      const orderNumberList = orderNumbers
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      window.electron.validation.setSharedProductionIds(orderNumberList)
    }
  }, [orderNumbers])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = (level: LogLevel, message: string) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setLogs((prev) => [...prev, { timestamp, level, message }])
  }

  const handleExtract = async () => {
    if (!orderNumbers.trim()) {
      setError('请输入至少一个订单号')
      return
    }

    setIsRunning(true)
    setProgress(null)
    setError(null)
    setLogs([])

    addLog('system', '提取引擎启动，准备执行...')

    try {
      const orderNumberList = orderNumbers
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      await window.electron.validation.setSharedProductionIds(orderNumberList)
      addLog('info', `已存储 ${orderNumberList.length} 个订单号用于跨模块共享`)

      const response = await window.electron.extractor.runExtractor({
        orderNumbers: orderNumberList
      })

      if (response.success && response.data) {
        addLog(
          'success',
          `提取完成：下载 ${response.data.downloadedFiles.length} 个文件，共 ${response.data.recordCount} 条记录`
        )
        if (response.data.errors.length > 0) {
          addLog('warning', `存在 ${response.data.errors.length} 个错误`)
        }
      } else {
        setError(response.error || '提取失败')
        addLog('error', response.error || '提取失败')
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '发生未知错误'
      setError(errMsg)
      addLog('error', errMsg)
    } finally {
      setIsRunning(false)
      setProgress(null)
    }
  }

  useEffect(() => {
    if (progress) {
      addLog('info', progress.message)
    }
  }, [progress])

  const handleReset = () => {
    setOrderNumbers('')
    setError(null)
    setProgress(null)
    setLogs([])
  }

  return (
    <div className="flex h-full gap-4 relative">
      {!sidebarCollapsed && (
        <aside className="w-80 flex-shrink-0 bg-white border border-slate-200 flex flex-col shadow-sm rounded-xl overflow-hidden h-full animate-in slide-in-from-left duration-300">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">订单号输入</h3>
            <p className="text-xs text-slate-500 mt-1">
              数据将在"数据提取"与"物料清理"模块间自动共享
            </p>
          </div>
          <div className="flex-1 flex flex-col p-4 min-h-0">
            <OrderNumberInput
              value={orderNumbers}
              onChange={setOrderNumbers}
              label=""
              enableFormatStats={true}
              disabled={isRunning}
              showReset={true}
              onReset={handleReset}
            />
          </div>
        </aside>
      )}

      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-200 rounded-r-lg p-1.5 shadow-sm hover:bg-slate-50 transition-colors"
        style={{ left: sidebarCollapsed ? 0 : '320px' }}
        title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
      >
        {sidebarCollapsed ? (
          <PanelLeft size={18} className="text-slate-600" />
        ) : (
          <PanelLeftClose size={18} className="text-slate-600" />
        )}
      </button>

      <div className="flex-1 min-w-0 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800 mb-1">
              <Download size={20} className="text-blue-600" />
              批量数据提取
            </h2>
            <p className="text-sm text-slate-500">遍历订单列表，自动执行数据导出并保存至数据库</p>
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          </div>

          <div className="flex items-center gap-4">
            <button
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 font-medium shadow-sm transition-colors"
              onClick={handleExtract}
              disabled={isRunning || !orderNumbers.trim()}
            >
              <Play size={18} fill="currentColor" />
              {isRunning ? '提取中...' : '开始提取'}
            </button>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col min-h-[300px] flex-1">
          <div className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-700 flex-shrink-0">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Terminal size={16} />
              <span>执行日志</span>
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
            {logs.length === 0 ? (
              <div className="text-slate-500 text-center py-8">等待执行...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={getLogColor(log.level)}>
                  <span className="text-slate-600">[{log.timestamp}]</span>{' '}
                  <span className="text-slate-500">[{log.level.toUpperCase()}]</span> {log.message}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ExtractorPage
