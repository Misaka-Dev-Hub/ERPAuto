import React, { useState, useEffect } from 'react'

interface OrderNumberInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
}

/**
 * OrderNumberInput - A textarea component for entering line-separated order numbers
 * Displays a count of valid order numbers entered
 */
export const OrderNumberInput: React.FC<OrderNumberInputProps> = ({
  value,
  onChange,
  placeholder = '请输入订单号，每行一个',
  label = '订单号列表'
}) => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    // Count non-empty lines
    const lines = value.split('\n').filter((line) => line.trim().length > 0)
    setCount(lines.length)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className="order-number-input">
      <div className="input-header">
        <label>{label}</label>
        <span className="count-badge">{count} 个订单号</span>
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
        .count-badge {
          background: #e6f7ff;
          color: #1890ff;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
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
