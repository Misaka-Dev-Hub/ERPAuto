/**
 * Modal Component
 *
 * A reusable modal dialog component.
 */

import React, { useRef, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import FocusLock from 'react-focus-lock'
import { useDialogFocus } from '../../hooks/useDialogFocus'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  /** Additional CSS classes for the modal panel */
  className?: string
  showCloseButton?: boolean
  /** Ref to the element that triggered opening the modal (for focus restoration) */
  triggerRef?: React.RefObject<HTMLElement | null>
  /** ID of the title element (for aria-labelledby) */
  titleId?: string
  /** Selector for the element to focus initially inside the modal */
  initialFocusSelector?: string
  /** ID of the element that describes the modal (for aria-describedby) */
  ariaDescribedBy?: string
  /** Whether this is an alert dialog (role="alertdialog" instead of "dialog") */
  isAlertDialog?: boolean
  /** Whether to disable escape key handling (e.g., during execution) */
  disableEscapeKey?: boolean
  /** Whether to disable closing when clicking on backdrop (e.g., during execution) */
  disableBackdropClick?: boolean
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
  className,
  showCloseButton = true,
  triggerRef,
  titleId,
  initialFocusSelector,
  ariaDescribedBy,
  isAlertDialog = false,
  disableEscapeKey = false,
  disableBackdropClick = false
}: ModalProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [generatedId] = useState(
    () => `modal-title-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`
  )

  // Use provided titleId or generated one
  const generatedTitleId = useMemo((): string => {
    return titleId || generatedId
  }, [titleId, generatedId])

  // Setup focus management (includes Escape key handling)
  const { focusLockProps } = useDialogFocus({
    isOpen,
    dialogRef,
    onClose,
    triggerRef,
    initialFocusSelector,
    shouldCloseOnEscape: !disableEscapeKey
  })

  if (!isOpen) return null

  return (
    <FocusLock {...focusLockProps}>
      <div
        className="fixed inset-0 z-50 overflow-y-auto"
        role={isAlertDialog ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={generatedTitleId}
        aria-describedby={ariaDescribedBy}
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={disableBackdropClick ? undefined : onClose}
          aria-hidden="true"
        />

        {/* Modal container */}
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            ref={dialogRef}
            className={`relative w-full ${sizeStyles[size]} bg-white rounded-lg shadow-xl transform transition-all ${className || ''}`}
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
                    aria-label="关闭对话框"
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
