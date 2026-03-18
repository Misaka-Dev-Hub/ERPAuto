/**
 * Toast Component
 *
 * A toast notification component for displaying messages.
 */

import React from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useAppStore, selectToasts } from '../../stores/useAppStore'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItemProps {
  id: string
  type: ToastType
  message: string
  onClose: (id: string) => void
}

const typeStyles: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: 'text-green-500'
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-500'
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    icon: 'text-yellow-500'
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-500'
  }
}

const ToastIcon: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5" />,
  error: <XCircle className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function ToastItem({ id, type, message, onClose }: ToastItemProps) {
  const styles = typeStyles[type]

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${styles.bg} ${styles.border} shadow-lg min-w-72`}
    >
      <span className={styles.icon}>{ToastIcon[type]}</span>
      <p className="flex-1 text-sm text-gray-800">{message}</p>
      <button
        onClick={() => onClose(id)}
        className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function Toast() {
  const toasts = useAppStore(selectToasts)
  const removeToast = useAppStore((state) => state.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          type={toast.type}
          message={toast.message}
          onClose={removeToast}
        />
      ))}
    </div>
  )
}

export default Toast
