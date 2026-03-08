import { useEffect, RefObject } from 'react'

/**
 * Options for configuring dialog focus management
 */
export interface UseDialogFocusOptions {
  /** Whether the dialog is currently open */
  isOpen: boolean
  /** Ref to the dialog container element */
  dialogRef: RefObject<HTMLElement | null>
  /** Callback to close the dialog */
  onClose: () => void
  /** Optional ref to the element that triggered opening the dialog */
  triggerRef?: RefObject<HTMLElement | null>
  /** Optional selector for the element to focus initially inside the dialog */
  initialFocusSelector?: string
  /** Whether to lock body scroll when dialog is open (default: true) */
  lockBodyScroll?: boolean
}

/**
 * Return type for useDialogFocus hook
 */
export interface UseDialogFocusReturn {
  /** Whether focus lock should be enabled */
  focusLockEnabled: boolean
  /** Props to spread on FocusLock component */
  focusLockProps: {
    disabled: boolean
  }
}

/**
 * React Hook for managing focus in modal dialogs
 *
 * Integrates with react-focus-lock to provide:
 * - Focus trapping within dialog
 * - Initial focus management (first interactive element or custom selector)
 * - Focus restoration to trigger element on close
 * - Escape key handling
 * - Body scroll locking
 *
 * @param options - Configuration options for focus management
 * @returns Focus lock props and state
 *
 * @example
 * ```typescript
 * function MyDialog({ isOpen, onClose }) {
 *   const dialogRef = useRef<HTMLDivElement>(null)
 *   const triggerRef = useRef<HTMLButtonElement>(null)
 *   const { focusLockEnabled, focusLockProps } = useDialogFocus({
 *     isOpen,
 *     dialogRef,
 *     onClose,
 *     triggerRef
 *   })
 *
 *   return (
 *     <FocusLock {...focusLockProps}>
 *       <div ref={dialogRef} role="dialog" aria-modal="true">
 *         <h2>Dialog Title</h2>
 *         <button onClick={onClose}>Close</button>
 *       </div>
 *     </FocusLock>
 *   )
 * }
 * ```
 */
export function useDialogFocus(options: UseDialogFocusOptions): UseDialogFocusReturn {
  const {
    isOpen,
    dialogRef,
    onClose,
    triggerRef,
    initialFocusSelector,
    lockBodyScroll = true
  } = options

  // Handle Escape key press
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.keyCode === 27) {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Manage body scroll locking
  useEffect(() => {
    if (!lockBodyScroll) return

    if (isOpen) {
      // Store current scroll position
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
      document.body.style.overflow = 'hidden'
    } else {
      // Restore scroll position
      const scrollY = document.body.style.top
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY, 10) * -1)
      }
    }

    return () => {
      // Cleanup on unmount or when isOpen changes
      if (isOpen) {
        const scrollY = document.body.style.top
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.overflow = ''
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY, 10) * -1)
        }
      }
    }
  }, [isOpen, lockBodyScroll])

  // Manage initial focus when dialog opens
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return

    const setupFocus = () => {
      const dialogElement = dialogRef.current
      if (!dialogElement) return

      // If initialFocusSelector is provided, try to focus that element
      if (initialFocusSelector) {
        const focusElement = dialogElement.querySelector(initialFocusSelector) as HTMLElement
        if (focusElement && typeof focusElement.focus === 'function') {
          // Delay focus to ensure DOM is ready
          requestAnimationFrame(() => {
            focusElement.focus()
          })
          return
        }
      }

      // Otherwise, focus the first interactive element
      const focusableSelectors = [
        'button:not([disabled])',
        'a[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ]
      const firstFocusable = dialogElement.querySelector(
        focusableSelectors.join(', ')
      ) as HTMLElement
      if (firstFocusable && typeof firstFocusable.focus === 'function') {
        requestAnimationFrame(() => {
          firstFocusable.focus()
        })
      }
    }

    // Delay to ensure portal content is rendered
    requestAnimationFrame(setupFocus)
  }, [isOpen, dialogRef, initialFocusSelector])

  // Restore focus to trigger element when dialog closes
  useEffect(() => {
    if (isOpen || !triggerRef?.current) return

    const restoreFocus = () => {
      const triggerElement = triggerRef.current
      if (triggerElement && typeof triggerElement.focus === 'function') {
        // Delay to ensure dialog is fully unmounted
        requestAnimationFrame(() => {
          triggerElement.focus()
        })
      }
    }

    // Wait for next tick to ensure dialog is closed
    setTimeout(restoreFocus, 0)
  }, [isOpen, triggerRef])

  // Return focus lock configuration
  return {
    focusLockEnabled: isOpen,
    focusLockProps: {
      disabled: !isOpen
    }
  }
}

export default useDialogFocus
