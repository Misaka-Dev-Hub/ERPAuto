/**
 * User Store using Zustand
 *
 * Manages global user authentication state across the application.
 */

import { create } from 'zustand'

// User info interface matching the backend types
interface UserInfo {
  id: number
  username: string
  userType: 'Admin' | 'User' | 'Guest'
  computerName?: string
}

interface UserState {
  user: UserInfo | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null

  // Actions
  setUser: (user: UserInfo | null) => void
  setAuthenticated: (isAuthenticated: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearUser: () => void
}

/**
 * User store for managing authentication state
 */
export const useUserStore = create<UserState>((set) => ({
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: user !== null,
      error: null
    }),

  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  clearUser: () =>
    set({
      user: null,
      isAuthenticated: false,
      error: null
    })
}))

// Selectors for common state access patterns
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const selectUser = (state: UserState) => state.user
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const selectIsAuthenticated = (state: UserState) => state.isAuthenticated
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const selectIsAdmin = (state: UserState) => state.user?.userType === 'Admin'
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const selectUsername = (state: UserState) => state.user?.username ?? ''

export default useUserStore
