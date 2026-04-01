import React from 'react'
import { Download, Play, CheckCircle, History } from 'lucide-react'
import OrderNumberInput from '../components/OrderNumberInput'
import { useExtractor } from '../hooks/useExtractor'
import { usePersistentTextState } from '../hooks/usePersistentTextState'
import { useSharedProductionIds } from '../hooks/useSharedProductionIds'
import LogPanel from '../components/ui/LogPanel'
import { SegmentedProgressBar } from '../components/ui/SegmentedProgressBar'
import ExtractorOperationHistoryModal from '../components/ExtractorOperationHistoryModal'
import { useUserStore } from '../stores/useUserStore'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/Button'

const ExtractorPage: React.FC = () => {
  const [orderNumbers, setOrderNumbers] = usePersistentTextState('extractor_orderNumbers')
  const [showHistoryModal, setShowHistoryModal] = React.useState(false)
  const user = useUserStore((state) => state.user)

  const {
    isRunning,
    progress,
    error,
    logs,
    startExtraction,
    clearLogs,
    setError,
    isComplete,
    setComplete
  } = useExtractor()

  const { clearSharedProductionIdsNow } = useSharedProductionIds(orderNumbers)

  const handleExtract = () => {
    startExtraction(orderNumbers)
  }

  const handleReset = () => {
    setOrderNumbers('')
    void clearSharedProductionIdsNow()
    setError(null)
    setComplete(false)
    clearLogs()
  }

  return (
    <div className="flex h-full gap-4 relative">
      <Card className="w-80 flex-shrink-0 flex flex-col shadow-sm rounded-xl overflow-hidden h-full border-slate-200">
        <CardHeader className="p-4 border-b border-slate-100 bg-white pb-3">
          <CardTitle className="text-sm font-semibold text-slate-800">订单号输入</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-4 min-h-0">
          <OrderNumberInput
            value={orderNumbers}
            onChange={setOrderNumbers}
            label=""
            enableFormatStats={true}
            disabled={isRunning}
            showReset={true}
            onReset={handleReset}
          />
        </CardContent>
      </Card>

      <div className="flex-1 min-w-0 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="shadow-sm border-slate-200 rounded-xl p-2">
          <div className="p-3 flex items-center justify-between">
            <div className="flex-1 px-2">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800 mb-1">
                <Download size={20} className="text-blue-600" />
                批量数据提取
              </h2>
              <p className="text-sm text-slate-500">遍历订单列表，自动执行数据导出并保存至数据库</p>
              {error && <p className="text-sm text-destructive mt-2">{error}</p>}
            </div>

            <div className="flex items-center gap-4 px-2">
              <Button
                variant="secondary"
                className="flex items-center gap-2"
                onClick={() => setShowHistoryModal(true)}
                disabled={isRunning}
              >
                <History size={18} />
                操作历史
              </Button>
              <Button
                variant="primary"
                className="flex items-center gap-2"
                onClick={handleExtract}
                disabled={isRunning || !orderNumbers.trim()}
              >
                <Play size={18} fill="currentColor" />
                {isRunning ? '提取中...' : '开始提取'}
              </Button>
            </div>
          </div>
        </Card>

        {showHistoryModal ? (
          <ExtractorOperationHistoryModal
            isOpen={showHistoryModal}
            onClose={() => setShowHistoryModal(false)}
            user={user}
          />
        ) : null}

        {!isRunning && isComplete && (
          <Card className="bg-green-50 border-green-100 shadow-md">
            <CardContent className="p-8 flex items-center justify-center gap-4">
              <CheckCircle className="text-green-600" size={35} />
              <p className="text-4xl font-bold text-green-600">提取完毕</p>
            </CardContent>
          </Card>
        )}

        {isRunning && progress && (
          <SegmentedProgressBar
            progress={progress.progress}
            phase={progress.phase}
            currentBatch={progress.currentBatch}
            totalBatches={progress.totalBatches}
            subProgress={progress.subProgress}
          />
        )}

        <LogPanel logs={logs} onClear={clearLogs} />
      </div>
    </div>
  )
}

export default ExtractorPage
