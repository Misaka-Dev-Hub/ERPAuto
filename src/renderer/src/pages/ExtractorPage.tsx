import React, { useState, useEffect } from 'react'
import { Download, Play } from 'lucide-react'
import OrderNumberInput from '../components/OrderNumberInput'
import { useExtractor } from '../hooks/useExtractor'
import LogPanel from '../components/ui/LogPanel'

const ExtractorPage: React.FC = () => {
  const [orderNumbers, setOrderNumbers] = useState(() => {
    return sessionStorage.getItem('extractor_orderNumbers') || ''
  })

  const {
    isRunning,
    progress,
    error,
    logs,
    startExtraction,
    clearLogs,
    setError
  } = useExtractor()

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

  const handleExtract = () => {
    startExtraction(orderNumbers)
  }

  const handleReset = () => {
    setOrderNumbers('')
    setError(null)
    clearLogs()
  }

  return (
    <div className="flex h-full gap-4 relative">
      <aside className="w-80 flex-shrink-0 bg-white border border-slate-200 flex flex-col shadow-sm rounded-xl overflow-hidden h-full">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">订单号输入</h3>
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

        <LogPanel logs={logs} progress={progress} onClear={clearLogs} />
      </div>
    </div>
  )
}

export default ExtractorPage
