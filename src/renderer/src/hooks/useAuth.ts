/**
 * IPC Hook for Authentication operations
 *
 * Provides a React-friendly interface for auth IPC calls
 * with loading state, error handling, and user data management.
 */

import { useState, useCallback } from 'react'

// Types based on the user types
interface UserInfo {
  id: number
  username: string
  userType: 'Admin' | 'User' | 'Guest'
  computerName?: string
}

interface LoginCredentials {
  username: string
  password: string
}

interface UseAuthState {
  loading: boolean
  user: UserInfo | null
  error: string | null
  isAuthenticated: boolean
}

interface UseAuthReturn extends UseAuthState {
  login: (credentials: LoginCredentials) => Promise<boolean>
  silentLogin: () => Promise<{ success: boolean; requiresUserSelection?: boolean }>
  logout: () => Promise<void>
  getCurrentUser: () => Promise<UserInfo | null>
  getAllUsers: () => Promise<UserInfo[]>
  switchUser: (userInfo: UserInfo) => Promise<boolean>
  isAdmin: () => Promise<boolean>
  reset: () => void
}

/**
 * Hook for authentication operations
 */
export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<UseAuthState>({
    loading: false,
    user: null,
    error: null,
    isAuthenticated: false
  })

  const login = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const result = (await window.electron.ipcRenderer.invoke('auth:login', credentials)) as {
        success: boolean
        userInfo?: UserInfo
        error?: string
      }

      if (result.success && result.userInfo) {
        setState({
          loading: false,
          user: result.userInfo,
          error: null,
          isAuthenticated: true
        })
        return true
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: result.error || 'Login failed'
        }))
        return false
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setState((prev) => ({ ...prev, loading: false, error: message }))
      return false
    }
  }, [])

  const silentLogin = useCallback(async (): Promise<{
    success: boolean
    requiresUserSelection?: boolean
  }> => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const result = (await window.electron.ipcRenderer.invoke('auth:silentLogin')) as {
        success: boolean
        userInfo?: UserInfo
        error?: string
        requiresUserSelection?: boolean
      }

      if (result.success && result.userInfo) {
        setState({
          loading: false,
          user: result.userInfo,
          error: null,
          isAuthenticated: true
        })
        return { success: true, requiresUserSelection: result.requiresUserSelection }
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: result.error || null
        }))
        return { success: false }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setState((prev) => ({ ...prev, loading: false, error: message }))
      return { success: false }
    }
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    try {
      await window.electron.ipcRenderer.invoke('auth:logout')
      setState({
        loading: false,
        user: null,
        error: null,
        isAuthenticated: false
      })
    } catch (error) {
      console.error('Logout error:', error)
    }
  }, [])

  const getCurrentUser = useCallback(async (): Promise<UserInfo | null> => {
    try {
      const result = (await window.electron.ipcRenderer.invoke('auth:getCurrentUser')) as {
        isAuthenticated: boolean
        userInfo?: UserInfo
      }
      if (result.isAuthenticated && result.userInfo) {
        const userInfo = result.userInfo
        setState((prev) => ({
          ...prev,
          user: userInfo,
          isAuthenticated: true
        }))
        return userInfo
      }
      return null
    } catch {
      return null
    }
  }, [])

  const getAllUsers = useCallback(async (): Promise<UserInfo[]> => {
    try {
      return (await window.electron.ipcRenderer.invoke('auth:getAllUsers')) as UserInfo[]
    } catch {
      return []
    }
  }, [])

  const switchUser = useCallback(async (userInfo: UserInfo): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const result = (await window.electron.ipcRenderer.invoke('auth:switchUser', userInfo)) as {
        success: boolean
        userInfo?: UserInfo
        error?: string
      }

      if (result.success && result.userInfo) {
        setState({
          loading: false,
          user: result.userInfo,
          error: null,
          isAuthenticated: true
        })
        return true
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: result.error || 'Switch user failed'
        }))
        return false
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setState((prev) => ({ ...prev, loading: false, error: message }))
      return false
    }
  }, [])

  const isAdmin = useCallback(async (): Promise<boolean> => {
    try {
      return (await window.electron.ipcRenderer.invoke('auth:isAdmin')) as boolean
    } catch {
      return false
    }
  }, [])

  const reset = useCallback(() => {
    setState({
      loading: false,
      user: null,
      error: null,
      isAuthenticated: false
    })
  }, [])

  return {
    ...state,
    login,
    silentLogin,
    logout,
    getCurrentUser,
    getAllUsers,
    switchUser,
    isAdmin,
    reset
  }
}

export default useAuth
