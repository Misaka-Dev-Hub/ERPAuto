import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <div className="flex items-center gap-1.5">
          <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-xs font-medium">
            {count} 个
          </span>
          {enableFormatStats && stats.productionIdCount > 0 && (
            <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full text-xs font-medium">
              {stats.productionIdCount} 总排号
            </span>
          )}
          {enableFormatStats && stats.orderNumberCount > 0 && (
            <span className="bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full text-xs font-medium">
              {stats.orderNumberCount} 订单号
            </span>
          )}
          {enableFormatStats && stats.unknownCount > 0 && (
            <span className="bg-red-50 text-red-500 px-2 py-0.5 rounded-full text-xs font-medium">
              {stats.unknownCount} 未知
            </span>
          )}
        </div>
      </div>

      <textarea
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 w-full border border-slate-300 rounded-lg p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          userSelect: disabled ? 'none' : 'text',
          cursor: disabled ? 'not-allowed' : 'text'
        }}
      />

      {showReset && (
        <div className="flex items-center justify-end mt-2">
          <button
            onClick={onReset}
            disabled={disabled}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={14} />
            清空
          </button>
        </div>
      )}
    </div>
  )
}

export default OrderNumberInput
