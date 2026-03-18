import React, { useState, useEffect } from 'react'

interface MaterialCodeInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
}

/**
 * MaterialCodeInput - A textarea component for entering line-separated material codes
 * Displays a count of valid material codes entered
 */
export const MaterialCodeInput: React.FC<MaterialCodeInputProps> = ({
  value,
  onChange,
  placeholder = '请输入物料代码，每行一个',
  label = '物料代码列表'
}) => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    // Count non-empty lines
    const lines = value.split('\n').filter((line) => line.trim().length > 0)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCount(lines.length)
  }, [value])

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className="material-code-input">
      <div className="input-header">
        <label>{label}</label>
        <span className="count-badge">{count} 个物料代码</span>
      </div>
      <textarea
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={10}
        className="material-textarea"
      />
      <style>{`
        .material-code-input {
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
          background: #f6ffed;
          color: #52c41a;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }
        .material-textarea {
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
        .material-textarea:focus {
          outline: none;
          border-color: #52c41a;
          box-shadow: 0 0 0 2px rgba(82, 196, 26, 0.2);
        }
        .material-textarea::placeholder {
          color: #bfbfbf;
        }
      `}</style>
    </div>
  )
}

export default MaterialCodeInput
