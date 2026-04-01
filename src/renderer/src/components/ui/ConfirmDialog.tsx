/**
 * ConfirmDialog Component
 *
 * A confirmation dialog component for displaying confirmation prompts using shadcn/ui.
 */

import React, { useCallback, useEffect } from 'react'
import { AlertTriangle, Info, AlertCircle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './alert-dialog'
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
    <AlertDialog open={isOpen} onOpenChange={(open) => {
      if (!open) onCancel()
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span className={styles.iconColor}>{styles.icon}</span>
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="pt-2">
              {typeof message === 'string' ? (
                <p className="text-gray-700 whitespace-pre-wrap">{message}</p>
              ) : (
                message
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant={styles.buttonVariant} onClick={onConfirm}>{confirmText}</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default ConfirmDialog
