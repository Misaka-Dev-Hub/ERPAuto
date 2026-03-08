import React, { useState, useEffect } from 'react'
import { Download, Play, CheckCircle } from 'lucide-react'
import { Card, Typography, Button, Space, Result, Layout } from 'antd'
import OrderNumberInput from '../components/OrderNumberInput'
import { useExtractor } from '../hooks/useExtractor'
import LogPanel from '../components/ui/LogPanel'

const { Title, Text } = Typography
const { Sider, Content } = Layout
import { SegmentedProgressBar } from '../components/ui/SegmentedProgressBar'

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
    setError,
    isComplete,
    setComplete
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
    setComplete(false)
    clearLogs()
  }

  return (
    <Layout className="h-full bg-transparent flex flex-row gap-4 relative">
      <Sider
        width={320}
        theme="light"
        className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden h-full flex flex-col"
        style={{ backgroundColor: 'white' }}
      >
        <div className="p-4 border-b border-slate-100 flex-shrink-0">
          <Text strong className="text-slate-800">订单号输入</Text>
        </div>
        <div className="flex-1 flex flex-col p-4 min-h-0 overflow-hidden">
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
      </Sider>

      <Content className="flex-1 min-w-0 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
        <Card
          className="shadow-sm border-slate-200 w-full"
          bodyStyle={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div className="flex-1">
            <Title level={4} className="flex items-center gap-2 mb-1" style={{ marginTop: 0 }}>
              <Download size={20} className="text-blue-600" />
              批量数据提取
            </Title>
            <Text type="secondary" className="block">遍历订单列表，自动执行数据导出并保存至数据库</Text>
            {error && <Text type="danger" className="mt-2 block">{error}</Text>}
          </div>

          <Space>
            <Button
              type="primary"
              size="large"
              icon={<Play size={18} fill="currentColor" />}
              onClick={handleExtract}
              disabled={isRunning || !orderNumbers.trim()}
              loading={isRunning}
              className="flex items-center gap-2 font-medium"
            >
              {isRunning ? '提取中...' : '开始提取'}
            </Button>
          </Space>
        </Card>

        {!isRunning && isComplete && (
          <Result
            status="success"
            title="提取完毕"
            className="bg-green-50 rounded-xl shadow-md p-8 m-0"
            icon={<CheckCircle className="text-green-600 mx-auto" size={48} />}
          />
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
      </Content>
    </Layout>
  )
}

export default ExtractorPage
