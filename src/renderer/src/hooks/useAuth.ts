import { useState, useCallback } from 'react'

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

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<UseAuthState>({
    loading: false,
    user: null,
    error: null,
    isAuthenticated: false
  })

  const login = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const result = await window.electron.auth.login(credentials)

    if (!result.success || !result.data?.userInfo) {
      setState((prev) => ({ ...prev, loading: false, error: result.error ?? 'Login failed' }))
      return false
    }

    setState({
      loading: false,
      user: result.data.userInfo,
      error: null,
      isAuthenticated: true
    })
    return true
  }, [])

  const silentLogin = useCallback(async (): Promise<{
    success: boolean
    requiresUserSelection?: boolean
  }> => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const result = await window.electron.auth.silentLogin()

    if (!result.success || !result.data?.userInfo) {
      setState((prev) => ({ ...prev, loading: false, error: result.error || null }))
      return { success: false }
    }

    setState({
      loading: false,
      user: result.data.userInfo,
      error: null,
      isAuthenticated: true
    })
    return { success: true, requiresUserSelection: result.data.requiresUserSelection }
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    await window.electron.auth.logout()
    setState({
      loading: false,
      user: null,
      error: null,
      isAuthenticated: false
    })
  }, [])

  const getCurrentUser = useCallback(async (): Promise<UserInfo | null> => {
    const result = await window.electron.auth.getCurrentUser()
    if (!result.success || !result.data?.isAuthenticated || !result.data.userInfo) {
      return null
    }

    setState((prev) => ({
      ...prev,
      user: result.data!.userInfo!,
      isAuthenticated: true
    }))
    return result.data.userInfo
  }, [])

  const getAllUsers = useCallback(async (): Promise<UserInfo[]> => {
    const result = await window.electron.auth.getAllUsers()
    return result.success && result.data ? result.data : []
  }, [])

  const switchUser = useCallback(async (userInfo: UserInfo): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const result = await window.electron.auth.switchUser(userInfo)

    if (!result.success || !result.data?.userInfo) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: result.error || 'Switch user failed'
      }))
      return false
    }

    setState({
      loading: false,
      user: result.data.userInfo,
      error: null,
      isAuthenticated: true
    })
    return true
  }, [])

  const isAdmin = useCallback(async (): Promise<boolean> => {
    const result = await window.electron.auth.isAdmin()
    return result.success && Boolean(result.data)
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
