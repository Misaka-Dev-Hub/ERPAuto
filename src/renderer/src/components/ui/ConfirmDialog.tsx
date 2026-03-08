/**
 * ConfirmDialog Component
 *
 * A confirmation dialog component for displaying confirmation prompts.
 * Extends the Modal component with consistent styling and behavior.
 */

import React, { useState, useCallback, useEffect } from 'react'
import { AlertTriangle, Info, AlertCircle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

export type ConfirmDialogVariant = 'danger' | 'warning' | 'info'

export interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string | React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: ConfirmDialogVariant
  onConfirm: () => void
  onCancel: () => void
}

const variantStyles: Record<
  ConfirmDialogVariant,
  { icon: React.ReactNode; iconColor: string; buttonVariant: 'danger' | 'primary' }
> = {
  danger: {
    icon: <AlertCircle className="w-6 h-6" />,
    iconColor: 'text-red-500',
    buttonVariant: 'danger'
  },
  warning: {
    icon: <AlertTriangle className="w-6 h-6" />,
    iconColor: 'text-yellow-500',
    buttonVariant: 'primary'
  },
  info: {
    icon: <Info className="w-6 h-6" />,
    iconColor: 'text-blue-500',
    buttonVariant: 'primary'
  }
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'info',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    },
    [isOpen, onConfirm, onCancel]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  const styles = variantStyles[variant]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      size="md"
      showCloseButton={false}
      isAlertDialog={true}
      initialFocusSelector="[data-autofocus]"
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`flex-shrink-0 ${styles.iconColor}`}>{styles.icon}</div>

        {/* Message */}
        <div className="flex-1">
          {typeof message === 'string' ? (
            <p className="text-gray-700 whitespace-pre-wrap">{message}</p>
          ) : (
            message
          )}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="secondary" onClick={onCancel}>
          {cancelText}
        </Button>
        <Button
          data-autofocus="true"
          variant={styles.buttonVariant}
          onClick={onConfirm}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  )
}

/**
 * Hook for using confirmation dialogs
 * Returns a confirm function that shows a dialog and resolves with user's choice
 */
export function useConfirmDialog() {
  const [config, setConfig] = useState<
    (Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'> & {
      resolve: (value: boolean) => void
    }) | null>(null)

  const confirm = useCallback(
    (
      options: Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>
    ): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        setConfig({
          ...options,
          resolve
        })
      })
    },
    []
  )

  const handleConfirm = useCallback(() => {
    if (config) {
      config.resolve(true)
      setConfig(null)
    }
  }, [config])

  const handleCancel = useCallback(() => {
    if (config) {
      config.resolve(false)
      setConfig(null)
    }
  }, [config])

  const dialog = config
    ? {
        ...config,
        isOpen: true,
        onConfirm: handleConfirm,
        onCancel: handleCancel
      }
    : null

  return { confirm, dialog }
}

export default ConfirmDialog
