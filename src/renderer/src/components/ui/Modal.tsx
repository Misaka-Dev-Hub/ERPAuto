/**
 * Modal Component
 *
 * A reusable modal dialog component refactored to use shadcn/ui Dialog.
 */

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from './dialog'

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
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl'
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  disableEscapeKey = false,
  disableBackdropClick = false
}: ModalProps): React.JSX.Element | null {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent
        className={`${sizeStyles[size]} !p-0 gap-0 overflow-hidden`}
        hideCloseButton={!showCloseButton}
        onEscapeKeyDown={(e) => {
          if (disableEscapeKey) {
            e.preventDefault()
          }
        }}
        onPointerDownOutside={(e) => {
          if (disableBackdropClick) {
            e.preventDefault()
          }
        }}
        onInteractOutside={(e) => {
          if (disableBackdropClick) {
            e.preventDefault()
          }
        }}
      >
        {(title || showCloseButton) && (
          <DialogHeader className="px-6 py-4 border-b border-gray-200 m-0">
            {title && <DialogTitle className="text-lg font-semibold text-gray-900 m-0">{title}</DialogTitle>}
            {!title && <DialogTitle className="sr-only">Dialog</DialogTitle>}
            {/* Accessibility requires a description or Title */}
            <DialogDescription className="sr-only">Dialog content</DialogDescription>
          </DialogHeader>
        )}
        <div className="px-6 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

export default Modal
