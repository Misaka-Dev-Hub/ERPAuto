import { useState, useEffect } from 'react'

export interface ExtractorProgress {
  message: string
  progress: number
}

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'system'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
}

export function useExtractor() {
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<ExtractorProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])

  const addLog = (level: LogLevel, message: string) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setLogs((prev) => [...prev, { timestamp, level, message }])
  }

  useEffect(() => {
    if (progress) {
      addLog('info', progress.message)
    }
  }, [progress])

  const clearLogs = () => {
    setLogs([])
  }

  const startExtraction = async (orderNumbers: string) => {
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

  return {
    isRunning,
    progress,
    error,
    logs,
    startExtraction,
    clearLogs,
    setError
  }
}
