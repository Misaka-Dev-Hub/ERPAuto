import { useEffect, RefObject } from 'react'
import { useLogger } from './useLogger'

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
  /**
   * Whether Escape key should close the dialog (default: true)
   * Can be a boolean or a function that receives the keyboard event and returns a boolean
   */
  shouldCloseOnEscape?: boolean | ((event: KeyboardEvent) => boolean)
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
 * function MyDialog({ isOpen, onClose, isExecuting }) {
 *   const dialogRef = useRef<HTMLDivElement>(null)
 *   const triggerRef = useRef<HTMLButtonElement>(null)
 *   const { focusLockEnabled, focusLockProps } = useDialogFocus({
 *     isOpen,
 *     dialogRef,
 *     onClose,
 *     triggerRef,
 *     shouldCloseOnEscape: () => !isExecuting // Only close when not executing
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
    lockBodyScroll = true,
    shouldCloseOnEscape = true
  } = options

  const logger = useLogger('DialogFocus')

  // Handle Escape key press
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' || event.keyCode === 27) {
        // Check if we should close on escape
        let shouldClose = true
        if (shouldCloseOnEscape !== undefined) {
          if (typeof shouldCloseOnEscape === 'function') {
            shouldClose = shouldCloseOnEscape(event)
          } else {
            shouldClose = shouldCloseOnEscape
          }
        }

        if (shouldClose) {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, shouldCloseOnEscape])

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

    return (): void => {
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

    const setupFocus = (): void => {
      const dialogElement = dialogRef.current
      if (!dialogElement) return

      // If initialFocusSelector is provided, try to focus that element
      if (initialFocusSelector) {
        const focusElement = dialogElement.querySelector(initialFocusSelector) as HTMLElement
        if (focusElement && typeof focusElement.focus === 'function') {
          // Check if element is visible and focusable
          const style = window.getComputedStyle(focusElement)
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            requestAnimationFrame(() => {
              focusElement.focus({ preventScroll: true })
            })
            return
          }
          // Fallback: element found but not visible, log warning and try default
          logger.warn('Focus element found but not visible', { selector: initialFocusSelector })
        } else {
          // Fallback: element not found, log warning and try default
          logger.warn('Focus element not found for selector', { selector: initialFocusSelector })
        }
      }

      // Otherwise, focus the first interactive element
      const focusableSelectors = [
        'button:not([disabled]):not([tabindex="-1"])',
        'a[href]',
        'input:not([disabled]):not([tabindex="-1"])',
        'select:not([disabled]):not([tabindex="-1"])',
        'textarea:not([disabled]):not([tabindex="-1"])',
        '[tabindex]:not([tabindex="-1"])'
      ]
      const firstFocusable = dialogElement.querySelector(
        focusableSelectors.join(', ')
      ) as HTMLElement
      if (firstFocusable && typeof firstFocusable.focus === 'function') {
        requestAnimationFrame(() => {
          firstFocusable.focus({ preventScroll: true })
        })
      }
    }

    // Delay to ensure portal content is rendered
    requestAnimationFrame(setupFocus)
  }, [isOpen, dialogRef, initialFocusSelector, logger])

  // Restore focus to trigger element when dialog closes
  useEffect(() => {
    if (isOpen || !triggerRef?.current) return

    const restoreFocus = (): void => {
      const triggerElement = triggerRef.current

      // Check if element still exists in DOM
      if (!triggerElement || !document.contains(triggerElement)) {
        logger.warn('Trigger element not found in DOM, cannot restore focus')
        return
      }

      // Check if element has a focus method
      if (typeof triggerElement.focus !== 'function') {
        logger.warn('Trigger element does not have a focus method')
        return
      }

      // Check if element is visible (not display: none)
      const style = window.getComputedStyle(triggerElement)
      if (style.display === 'none') {
        logger.warn('Trigger element is display: none, cannot restore focus')
        return
      }

      if (style.visibility === 'hidden') {
        logger.warn('Trigger element is visibility: hidden, cannot restore focus')
        return
      }

      // Check if element is disabled
      if (triggerElement instanceof HTMLButtonElement && triggerElement.disabled) {
        logger.warn('Trigger element is disabled, cannot restore focus')
        // Try to find nearest enabled ancestor or fallback to body
        const focusableParent = findNearestFocusableElement(triggerElement)
        if (focusableParent) {
          focusableParent.focus({ preventScroll: true })
          logger.debug('Restored focus to nearest focusable ancestor')
        }
        return
      }

      // All checks passed, restore focus
      try {
        triggerElement.focus({ preventScroll: true })
        logger.debug('Successfully restored focus to trigger element')
      } catch (error) {
        logger.error('Error restoring focus', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    // Helper function to find nearest focusable ancestor
    const findNearestFocusableElement = (element: HTMLElement): HTMLElement | null => {
      let parent = element.parentElement
      const focusableSelectors = [
        'button:not([disabled]):not([tabindex="-1"])',
        'a[href]',
        'input:not([disabled]):not([tabindex="-1"])',
        'select:not([disabled]):not([tabindex="-1"])',
        'textarea:not([disabled]):not([tabindex="-1"])',
        '[tabindex]:not([tabindex="-1"])'
      ]

      while (parent && parent !== document.body) {
        // Check if parent itself is focusable
        if (
          focusableSelectors.some((selector) => parent?.matches(selector)) &&
          window.getComputedStyle(parent).display !== 'none' &&
          window.getComputedStyle(parent).visibility !== 'hidden'
        ) {
          return parent
        }
        // Check if parent contains focusable element
        const focusableChild = parent.querySelector(focusableSelectors.join(', ')) as HTMLElement
        if (focusableChild) {
          return focusableChild
        }
        parent = parent.parentElement
      }
      return null
    }

    // Use microtask queue to ensure this runs after DOM cleanup
    queueMicrotask(restoreFocus)
  }, [isOpen, triggerRef, logger])

  // Return focus lock configuration
  return {
    focusLockEnabled: isOpen,
    focusLockProps: {
      disabled: !isOpen
    }
  }
}

export default useDialogFocus
