import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Input, Badge, Space, Typography, Button } from 'antd'

const { Text } = Typography
const { TextArea } = Input

interface OrderNumberInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  enableFormatStats?: boolean
  disabled?: boolean
  showReset?: boolean
  onReset?: () => void
}

interface FormatStats {
  productionIdCount: number
  orderNumberCount: number
  unknownCount: number
}

const ORDER_PATTERNS = {
  PRODUCTION_ID: /^\d{2}[A-Za-z]\d+$/,
  ORDER_NUMBER: /^SC\d{14}$/
}

const OrderNumberInput: React.FC<OrderNumberInputProps> = ({
  value,
  onChange,
  placeholder = '每行输入一个订单号\n支持格式：\n- 总排号: 22A1, 22A123\n- 生产订单号: SC70202602120085',
  label = '订单号列表',
  enableFormatStats = true,
  disabled = false,
  showReset = false,
  onReset
}) => {
  const [count, setCount] = useState(0)
  const [stats, setStats] = useState<FormatStats>({
    productionIdCount: 0,
    orderNumberCount: 0,
    unknownCount: 0
  })

  const recognizeType = (input: string): 'productionId' | 'orderNumber' | 'unknown' => {
    const trimmed = input.trim()
    if (!trimmed) return 'unknown'
    if (ORDER_PATTERNS.ORDER_NUMBER.test(trimmed)) return 'orderNumber'
    if (ORDER_PATTERNS.PRODUCTION_ID.test(trimmed)) return 'productionId'
    return 'unknown'
  }

  useEffect(() => {
    const lines = value.split('\n').filter((line) => line.trim().length > 0)
    setCount(lines.length)

    const newStats: FormatStats = {
      productionIdCount: 0,
      orderNumberCount: 0,
      unknownCount: 0
    }

    for (const line of lines) {
      const type = recognizeType(line)
      if (type === 'productionId') newStats.productionIdCount++
      else if (type === 'orderNumber') newStats.orderNumberCount++
      else newStats.unknownCount++
    }

    setStats(newStats)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <Text strong className="text-sm">{label}</Text>
        <Space size="small">
          <Badge
            className="site-badge-count-109"
            count={`${count} 个`}
            style={{ backgroundColor: '#e6f4ff', color: '#1677ff' }}
          />
          {enableFormatStats && stats.productionIdCount > 0 && (
            <Badge
              className="site-badge-count-109"
              count={`${stats.productionIdCount} 总排号`}
              style={{ backgroundColor: '#f6ffed', color: '#52c41a' }}
            />
          )}
          {enableFormatStats && stats.orderNumberCount > 0 && (
            <Badge
              className="site-badge-count-109"
              count={`${stats.orderNumberCount} 订单号`}
              style={{ backgroundColor: '#fffbe6', color: '#faad14' }}
            />
          )}
          {enableFormatStats && stats.unknownCount > 0 && (
            <Badge
              className="site-badge-count-109"
              count={`${stats.unknownCount} 未知`}
              style={{ backgroundColor: '#fff2f0', color: '#ff4d4f' }}
            />
          )}
        </Space>
      </div>

      <TextArea
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          height: '100%',
          resize: 'none',
          fontFamily: 'monospace',
          backgroundColor: '#fafafa'
        }}
      />

      {showReset && (
        <div className="flex items-center justify-end mt-2">
          <Button
            type="text"
            danger
            icon={<X size={14} />}
            onClick={onReset}
            disabled={disabled}
            size="small"
          >
            清空
          </Button>
        </div>
      )}
    </div>
  )
}

export default OrderNumberInput
