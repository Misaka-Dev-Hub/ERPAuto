/**
 * Login Dialog - Modal dialog for user authentication
 *
 * Mimics the Python LoginDialog functionality:
 * - Modal dialog for username/password input
 * - Display computer name
 * - Enter key to submit
 */

import React, { useState, useEffect, useRef } from 'react'

interface LoginDialogProps {
  isOpen: boolean
  computerName: string
  onLogin: (username: string, password: string) => Promise<boolean>
  onCancel: () => void
  onError: (message: string) => void
}

export const LoginDialog: React.FC<LoginDialogProps> = ({
  isOpen,
  computerName,
  onLogin,
  onCancel,
  onError
}) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const usernameInputRef = useRef<HTMLInputElement>(null)

  // Focus on username input when dialog opens
  useEffect(() => {
    if (isOpen && usernameInputRef.current) {
      usernameInputRef.current.focus()
    }
  }, [isOpen])

  const handleLogin = async () => {
    if (!username.trim()) {
      onError('请输入用户名')
      usernameInputRef.current?.focus()
      return
    }

    if (!password.trim()) {
      onError('请输入密码')
      return
    }

    setIsLoggingIn(true)
    const success = await onLogin(username.trim(), password.trim())
    setIsLoggingIn(false)

    if (!success) {
      onError('用户名或密码错误')
      setPassword('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  if (!isOpen) return null

  return (
    <div className="login-overlay" onKeyDown={handleKeyDown}>
      <div className="login-dialog">
        <div className="login-header">
          <h2 className="login-title">请登录</h2>
          <p className="computer-name">当前计算机：{computerName}</p>
        </div>

        <div className="login-body">
          <div className="form-group">
            <label className="form-label text-slate-700">用户名:</label>
            <input
              ref={usernameInputRef}
              type="text"
              className="form-input border border-slate-300 rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              disabled={isLoggingIn}
            />
          </div>

          <div className="form-group mt-4">
            <label className="form-label text-slate-700">密码:</label>
            <input
              type="password"
              className="form-input border border-slate-300 rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              disabled={isLoggingIn}
            />
          </div>
        </div>

        <div className="login-footer mt-6 flex justify-end gap-3">
          <button
            className="btn btn-secondary px-4 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            onClick={onCancel}
            disabled={isLoggingIn}
          >
            取消
          </button>
          <button
            className="btn btn-primary px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
            onClick={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? '登录中...' : '登录'}
          </button>
        </div>

        <div className="login-version">
          v1.0
        </div>
      </div>

      <style>{`
        .login-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }

        .login-dialog {
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          width: 400px;
          padding: 24px;
          animation: slideDown 0.2s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .login-header {
          text-align: center;
          margin-bottom: 20px;
        }

        .login-title {
          font-size: 20px;
          font-weight: 600;
          color: #333;
          margin: 0 0 8px 0;
        }

        .computer-name {
          font-size: 12px;
          color: #999;
          margin: 0;
        }

        .login-body {
          margin-bottom: 20px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-label {
          display: block;
          font-size: 14px;
          color: #666;
          margin-bottom: 6px;
          font-weight: 500;
        }

        .form-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #d9d9d9;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.3s, box-shadow 0.3s;
          box-sizing: border-box;
        }

        .form-input:focus {
          outline: none;
          border-color: #1890ff;
          box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
        }

        .form-input:disabled {
          background: #f5f5f5;
          cursor: not-allowed;
        }

        .login-footer {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .btn {
          padding: 10px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #1890ff;
          color: #fff;
        }

        .btn-primary:hover:not(:disabled) {
          background: #40a9ff;
        }

        .btn-secondary {
          background: #f5f5f5;
          color: #666;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #e8e8e8;
        }

        .login-version {
          text-align: center;
          font-size: 12px;
          color: #999;
          margin-top: 16px;
        }
      `}</style>
    </div>
  )
}

export default LoginDialog
