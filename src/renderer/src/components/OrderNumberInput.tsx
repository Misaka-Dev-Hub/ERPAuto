import React, { useState, useEffect } from 'react'

interface OrderNumberInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  enableFormatStats?: boolean // Whether to show format statistics
}

interface FormatStats {
  productionIdCount: number
  orderNumberCount: number
  unknownCount: number
}

// Regular expression patterns for order number recognition
const ORDER_PATTERNS = {
  // productionID: 2 digits + 1 letter + serial number (1+)
  PRODUCTION_ID: /^\d{2}[A-Za-z]\d+$/,
  // 生产订单号：SC + 14 digits
  ORDER_NUMBER: /^SC\d{14}$/
}

/**
 * OrderNumberInput - A textarea component for entering line-separated order numbers
 * Supports automatic recognition of productionID and 生产订单号 formats
 */
export const OrderNumberInput: React.FC<OrderNumberInputProps> = ({
  value,
  onChange,
  placeholder = '请输入订单号，每行一个\n支持两种格式：\n- productionID: 22A1, 22A123\n- 生产订单号：SC70202602120085',
  label = '订单号列表',
  enableFormatStats = true
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

    if (ORDER_PATTERNS.ORDER_NUMBER.test(trimmed)) {
      return 'orderNumber'
    }
    if (ORDER_PATTERNS.PRODUCTION_ID.test(trimmed)) {
      return 'productionId'
    }
    return 'unknown'
  }

  useEffect(() => {
    // Count non-empty lines and categorize by format
    const lines = value.split('\n').filter((line) => line.trim().length > 0)
    setCount(lines.length)

    // Calculate format statistics
    const newStats: FormatStats = {
      productionIdCount: 0,
      orderNumberCount: 0,
      unknownCount: 0
    }

    for (const line of lines) {
      const type = recognizeType(line)
      if (type === 'productionId') {
        newStats.productionIdCount++
      } else if (type === 'orderNumber') {
        newStats.orderNumberCount++
      } else {
        newStats.unknownCount++
      }
    }

    setStats(newStats)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className="order-number-input">
      <div className="input-header">
        <label>{label}</label>
        <div className="stats-wrapper">
          <span className="count-badge">{count} 个</span>
          {enableFormatStats && stats.productionIdCount > 0 && (
            <span className="stat-badge production-id">{stats.productionIdCount} 总排号</span>
          )}
          {enableFormatStats && stats.orderNumberCount > 0 && (
            <span className="stat-badge order-number">{stats.orderNumberCount} 订单号</span>
          )}
          {enableFormatStats && stats.unknownCount > 0 && (
            <span className="stat-badge unknown">{stats.unknownCount} 未知格式</span>
          )}
        </div>
      </div>
      <textarea
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={10}
        className="order-textarea"
      />
      <style>{`
        .order-number-input {
          margin-bottom: 16px;
        }
        .input-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .input-header label {
          font-weight: 600;
          font-size: 14px;
          color: #333;
        }
        .stats-wrapper {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .count-badge {
          background: #e6f7ff;
          color: #1890ff;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }
        .stat-badge {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
        }
        .stat-badge.production-id {
          background: #f6ffed;
          color: #52c41a;
        }
        .stat-badge.order-number {
          background: #fff7e6;
          color: #fa8c16;
        }
        .stat-badge.unknown {
          background: #fff1f0;
          color: #ff4d4f;
        }
        .order-textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #d9d9d9;
          border-radius: 6px;
          font-size: 14px;
          font-family: 'Consolas', 'Monaco', monospace;
          resize: vertical;
          transition: border-color 0.3s;
          box-sizing: border-box;
        }
        .order-textarea:focus {
          outline: none;
          border-color: #1890ff;
          box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
        }
        .order-textarea::placeholder {
          color: #bfbfbf;
        }
      `}</style>
    </div>
  )
}

export default OrderNumberInput
