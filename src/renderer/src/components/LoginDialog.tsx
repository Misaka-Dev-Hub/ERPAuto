/**
 * Login Dialog - Modal dialog for user authentication
 *
 * Mimics the Python LoginDialog functionality:
 * - Modal dialog for username/password input
 * - Display computer name
 * - Enter key to submit
 */

import React, { useState, useEffect, useRef } from 'react'
import FocusLock from 'react-focus-lock'
import { useDialogFocus } from '../hooks/useDialogFocus'

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
  const [errorMessage, setErrorMessage] = useState('')
  const usernameInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  // Setup focus management with useDialogFocus hook
  const { focusLockProps } = useDialogFocus({
    isOpen,
    dialogRef,
    onClose: onCancel,
    initialFocusSelector: 'input[type="text"]' // Focus username input initially
  })

  // Display error message with aria-live
  const showError = (message: string) => {
    setErrorMessage(message)
    // Also call the original onError callback for backward compatibility
    onError(message)
  }

  // Focus on username input when dialog opens (maintained for compatibility)
  useEffect(() => {
    if (isOpen && usernameInputRef.current) {
      usernameInputRef.current.focus()
    }
    // Clear error message when dialog opens
    setErrorMessage('')
  }, [isOpen])

  const handleLogin = async () => {
    if (!username.trim()) {
      showError('请输入用户名')
      usernameInputRef.current?.focus()
      return
    }

    if (!password.trim()) {
      showError('请输入密码')
      return
    }

    setIsLoggingIn(true)
    const success = await onLogin(username.trim(), password.trim())
    setIsLoggingIn(false)

    if (!success) {
      showError('用户名或密码错误')
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
    <FocusLock {...focusLockProps}>
      <div
        className="login-overlay"
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
      >
        <div className="login-dialog" ref={dialogRef}>
          <div className="login-header">
            <h2 id="login-dialog-title" className="login-title">
              请登录
            </h2>
            <p className="computer-name">当前计算机：{computerName}</p>
          </div>

          {/* Error message area with aria-live for screen readers */}
          {errorMessage && (
            <div
              ref={errorRef}
              className="error-message mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm"
              role="alert"
              aria-live="polite"
              tabIndex={-1}
            >
              {errorMessage}
            </div>
          )}

          <div className="login-body">
            <div className="form-group">
              <label className="form-label text-slate-700">用户名:</label>
              <input
                ref={usernameInputRef}
                type="text"
                className="form-input border border-slate-300 rounded-md p-2 w-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="form-input border border-slate-300 rounded-md p-2 w-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          <div className="login-version">v1.0</div>
        </div>
      </div>
    </FocusLock>
  )
}

export default LoginDialog

// Styles are now handled by Tailwind classes in the component
