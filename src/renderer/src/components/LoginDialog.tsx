/**
 * Login Dialog - Modal dialog for user authentication
 *
 * Mimics the Python LoginDialog functionality:
 * - Modal dialog for username/password input
 * - Display computer name
 * - Enter key to submit
 */

import React, { useState, useRef } from 'react'
import { Modal } from './ui/Modal'

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
  const errorRef = useRef<HTMLDivElement>(null)

  // Display error message with aria-live
  const showError = (message: string): void => {
    setErrorMessage(message)
    onError(message)
  }

  const handleLogin = async (): Promise<void> => {
    setErrorMessage('')

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

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      handleLogin()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="请登录"
      size="md"
      showCloseButton={true}
      initialFocusSelector='input[type="text"]'
      ariaDescribedBy={errorMessage ? 'login-dialog-error' : undefined}
    >
      <div onKeyDown={handleKeyDown}>
        {/* Error message area with aria-live for screen readers */}
        {errorMessage && (
          <div
            ref={errorRef}
            id="login-dialog-error"
            className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm"
            role="alert"
            aria-live="polite"
            tabIndex={-1}
          >
            {errorMessage}
          </div>
        )}

        <div className="space-y-4">
          <div className="text-sm text-gray-600">当前计算机：{computerName}</div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">用户名:</label>
            <input
              ref={usernameInputRef}
              type="text"
              className="border border-slate-300 rounded-md p-2 w-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              disabled={isLoggingIn}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">密码:</label>
            <input
              type="password"
              className="border border-slate-300 rounded-md p-2 w-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              disabled={isLoggingIn}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="px-4 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            onClick={onCancel}
            disabled={isLoggingIn}
          >
            取消
          </button>
          <button
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
            onClick={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? '登录中...' : '登录'}
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-400 text-right">v1.0</div>
      </div>
    </Modal>
  )
}

export default LoginDialog
