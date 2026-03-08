/**
 * Modal Component
 *
 * A reusable modal dialog component.
 */

import React, { useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import FocusLock from 'react-focus-lock'
import { useDialogFocus } from '../../hooks/useDialogFocus'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  showCloseButton?: boolean
  /** Ref to the element that triggered opening the modal (for focus restoration) */
  triggerRef?: React.RefObject<HTMLElement | null>
  /** ID of the title element (for aria-labelledby) */
  titleId?: string
}

const sizeStyles: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl'
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  triggerRef,
  titleId
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Generate unique title ID if not provided
  const generatedTitleId = titleId || `modal-title-${Math.random().toString(36).substr(2, 9)}`

  // Setup focus management
  const { focusLockProps } = useDialogFocus({
    isOpen,
    dialogRef,
    onClose,
    triggerRef: triggerRef || undefined
  })

  // Handle escape key (maintained for backward compatibility, useDialogFocus also handles this)
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return (
    <FocusLock {...focusLockProps}>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal container */}
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            ref={dialogRef}
            className={`relative w-full ${sizeStyles[size]} bg-white rounded-lg shadow-xl transform transition-all`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={generatedTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                {title && (
                  <h3 id={generatedTitleId} className="text-lg font-semibold text-gray-900">
                    {title}
                  </h3>
                )}
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="px-6 py-4">{children}</div>
          </div>
        </div>
      </div>
    </FocusLock>
  )
}

export default Modal
