/**
 * Application Store using Zustand
 *
 * Manages global application state including errors, notifications, and UI state.
 */

import { create } from 'zustand'

// Toast/notification type
interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

interface AppState {
  // Global error state
  globalError: string | null

  // Toast notifications
  toasts: Toast[]

  // UI state
  sidebarCollapsed: boolean
  currentPage: string

  // Actions
  setGlobalError: (error: string | null) => void
  clearGlobalError: () => void

  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearToasts: () => void

  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setCurrentPage: (page: string) => void
}

/**
 * Generate a unique ID for toasts
 */
const generateId = (): string => {
  return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Application store for managing global state
 */
export const useAppStore = create<AppState>((set, get) => ({
  globalError: null,
  toasts: [],
  sidebarCollapsed: false,
  currentPage: 'extractor',

  setGlobalError: (error) => set({ globalError: error }),

  clearGlobalError: () => set({ globalError: null }),

  addToast: (toast) => {
    const id = generateId()
    const newToast = { ...toast, id }

    set((state) => ({
      toasts: [...state.toasts, newToast]
    }))

    // Auto-remove toast after duration (default 5 seconds)
    const duration = toast.duration ?? 5000
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id)
      }, duration)
    }
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    })),

  clearToasts: () => set({ toasts: [] }),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setCurrentPage: (page) => set({ currentPage: page })
}))

// Convenience functions for toast notifications
export const showSuccess = (message: string, duration?: number) => {
  useAppStore.getState().addToast({ type: 'success', message, duration })
}

export const showError = (message: string, duration?: number) => {
  useAppStore.getState().addToast({ type: 'error', message, duration })
}

export const showWarning = (message: string, duration?: number) => {
  useAppStore.getState().addToast({ type: 'warning', message, duration })
}

export const showInfo = (message: string, duration?: number) => {
  useAppStore.getState().addToast({ type: 'info', message, duration })
}

// Selectors
export const selectGlobalError = (state: AppState) => state.globalError
export const selectToasts = (state: AppState) => state.toasts
export const selectSidebarCollapsed = (state: AppState) => state.sidebarCollapsed
export const selectCurrentPage = (state: AppState) => state.currentPage

export default useAppStore
