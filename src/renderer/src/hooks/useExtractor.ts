import { useEffect } from 'react'
import type { LogLevel } from '../stores/extractorStore'
import { useExtractorStore } from '../stores/extractorStore'

function isLogLevel(value: string): value is LogLevel {
  return ['info', 'success', 'warning', 'error', 'system'].includes(value)
}

export function useExtractor() {
  const {
    isRunning,
    isComplete,
    progress,
    error,
    logs,
    setRunning,
    setProgress,
    setError,
    setComplete,
    addLog,
    clearLogs,
    resetState
  } = useExtractorStore()

  useEffect(() => {
    const unsubscribeProgress = window.electron.extractor.onProgress((data) => {
      setProgress({
        message: data.message,
        progress: data.progress,
        phase: data.phase,
        currentBatch: data.currentBatch,
        totalBatches: data.totalBatches,
        subProgress: data.subProgress
      })
    })

    const unsubscribeLog = window.electron.extractor.onLog((data) => {
      addLog(isLogLevel(data.level) ? data.level : 'info', data.message)
    })

    return () => {
      unsubscribeProgress()
      unsubscribeLog()
    }
  }, [setProgress, addLog])

  const startExtraction = async (orderNumbers: string) => {
    if (!orderNumbers.trim()) {
      setError('请输入至少一个订单号')
      return
    }

    resetState()
    setRunning(true)
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
        const { data } = response
        addLog(
          'success',
          `提取完成：下载 ${data.downloadedFiles.length} 个文件，共 ${data.recordCount} 条记录`
        )
        if (data.errors.length > 0) {
          addLog('warning', `存在 ${data.errors.length} 个错误`)
          // Log each error detail for debugging
          data.errors.forEach((err, index) => {
            addLog('error', `错误 ${index + 1}/${data.errors.length}: ${err}`)
          })
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
      setRunning(false)
      setProgress(null)
      setComplete(true)
    }
  }

  return {
    isRunning,
    progress,
    error,
    logs,
    isComplete,
    startExtraction,
    clearLogs,
    setError,
    setComplete,
    resetState
  }
}
