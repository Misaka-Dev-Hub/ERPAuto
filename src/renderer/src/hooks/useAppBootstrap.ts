import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { useLogger } from './useLogger'
import type { UserType } from '../../../main/types/user.types'
import type {
  DownloadReleaseRequest,
  UpdateDialogCatalog,
  UpdateStatus
} from '../../../main/types/update.types'

export type Page = 'home' | 'extractor' | 'cleaner' | 'settings'

export interface CurrentUser {
  username: string
  userType: UserType
}

export interface SelectedUserInfo {
  id: number
  username: string
  userType: 'Admin' | 'User'
  computerName?: string
}

export function useAppBootstrap() {
  const logger = useLogger('App')

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(true)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [computerName, setComputerName] = useState('')
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [showUserSelection, setShowUserSelection] = useState(false)
  const [allUsers, setAllUsers] = useState<SelectedUserInfo[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [isSwitchedByAdmin, setIsSwitchedByAdmin] = useState(false)
  const [currentPage, setCurrentPage] = useState<Page>('extractor')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [updateCatalog, setUpdateCatalog] = useState<UpdateDialogCatalog | null>(null)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [showPlaywrightDownload, setShowPlaywrightDownload] = useState(false)

  const authInitializationStartedRef = useRef(false)

  const showError = useCallback((message: string) => {
    setErrorMessage(message)
    setTimeout(() => setErrorMessage(''), 3000)
  }, [])

  const refreshUpdateState = useCallback(async () => {
    const result = await window.electron.update.getStatus()
    const nextStatus = result.success ? result.data : undefined
    if (nextStatus) {
      startTransition(() => {
        setUpdateStatus(nextStatus)
      })
    }
  }, [])

  const refreshUpdateCatalog = useCallback(async () => {
    const result = await window.electron.update.getCatalog()
    const nextCatalog = result.success ? result.data : undefined
    if (nextCatalog) {
      startTransition(() => {
        setUpdateCatalog(nextCatalog)
      })
    }
  }, [])

  const initializeAuth = useCallback(async () => {
    logger.info('=== Starting initializeAuth ===')

    // Fetch log level early so client-side filtering takes effect
    await window.electron.logger.fetchLevel()

    try {
      logger.debug('Getting computer name...')
      const computerNameResult = await window.electron.auth.getComputerName()
      const name =
        computerNameResult.success && computerNameResult.data ? computerNameResult.data : ''
      logger.debug('Computer name obtained', { name })
      setComputerName(name)

      logger.debug('Trying silent login...')
      const silentLoginResult = await window.electron.auth.silentLogin()
      const result = silentLoginResult.data
      logger.debug('Silent login result', { result })

      if (silentLoginResult.success && result?.success && result.userInfo) {
        logger.info('Silent login success', { username: result.userInfo.username })
        setCurrentUser({
          username: result.userInfo.username,
          userType: result.userInfo.userType
        })

        if (result.requiresUserSelection) {
          logger.info('Admin user needs to select user')
          const usersResult = await window.electron.auth.getAllUsers()
          setAllUsers(usersResult.success && usersResult.data ? usersResult.data : [])
          setShowUserSelection(true)
        } else {
          logger.info('Setting authenticated to true')
          setIsAuthenticated(true)
        }
      } else {
        logger.info('Silent login failed, showing login dialog')
        setShowLoginDialog(true)
      }
    } catch (error) {
      logger.error('Auth initialization error', {
        error: error instanceof Error ? error.message : String(error)
      })
      setShowLoginDialog(true)
    } finally {
      logger.debug('Setting isAuthenticating to false')
      setIsAuthenticating(false)
    }
    logger.info('=== Auth initialization complete ===')
  }, [logger])

  useEffect(() => {
    if (authInitializationStartedRef.current) {
      logger.debug('Skipping duplicate auth initialization effect')
      return
    }

    authInitializationStartedRef.current = true
    logger.info('=== Initializing auth... ===')

    // Check if Playwright browsers are installed
    const checkPlaywrightBrowsers = async () => {
      try {
        const result = await window.electron.playwrightBrowser.check()
        if (result.success && !result.data) {
          logger.info('Playwright browsers not found, showing download dialog')
          setShowPlaywrightDownload(true)
        } else {
          logger.info('Playwright browsers found, continuing auth')
          void initializeAuth()
        }
      } catch (error) {
        logger.error('Failed to check Playwright browsers', {
          error: error instanceof Error ? error.message : String(error)
        })
        // Continue with auth even if check fails
        void initializeAuth()
      }
    }

    void checkPlaywrightBrowsers()
  }, [initializeAuth, logger])

  useEffect(() => {
    const unsubscribe = window.electron.update.onStatusChanged((status) => {
      startTransition(() => {
        setUpdateStatus(status)
      })

      if (
        status.phase === 'available' ||
        status.phase === 'downloaded' ||
        status.phase === 'idle'
      ) {
        void refreshUpdateCatalog()
      }
    })

    void refreshUpdateState()

    return unsubscribe
  }, [refreshUpdateCatalog, refreshUpdateState])

  useEffect(() => {
    if (isAuthenticated) {
      void refreshUpdateState()
      void refreshUpdateCatalog()
      return
    }

    setUpdateStatus(null)
    setUpdateCatalog(null)
    setShowUpdateDialog(false)
  }, [isAuthenticated, refreshUpdateCatalog, refreshUpdateState])

  const handleLogin = useCallback(
    async (username: string, password: string): Promise<boolean> => {
      try {
        const result = await window.electron.auth.login({ username, password })
        const loginData = result.success ? result.data : undefined

        if (result.success && loginData?.userInfo) {
          setCurrentUser({
            username: loginData.userInfo.username,
            userType: loginData.userInfo.userType
          })

          if (loginData.userInfo.userType === 'Admin') {
            setShowLoginDialog(false)
            const usersResult = await window.electron.auth.getAllUsers()
            setAllUsers(usersResult.success && usersResult.data ? usersResult.data : [])
            setShowUserSelection(true)
          } else {
            setIsAuthenticated(true)
            setShowLoginDialog(false)
          }
          return true
        }
        return false
      } catch (error) {
        logger.error('Login error', {
          error: error instanceof Error ? error.message : String(error)
        })
        return false
      }
    },
    [logger]
  )

  const handleLoginCancel = useCallback(() => {
    setShowLoginDialog(false)
  }, [])

  const handleUserSelect = useCallback(
    async (user: SelectedUserInfo) => {
      try {
        const result = await window.electron.auth.switchUser(user)
        const switchData = result.success ? result.data : undefined
        if (result.success && switchData) {
          setCurrentUser({
            username: switchData.userInfo?.username || user.username,
            userType: switchData.userInfo?.userType || user.userType
          })
          setIsAuthenticated(true)
          setShowUserSelection(false)
          setIsSwitchedByAdmin(true)
        }
      } catch (error) {
        logger.error('User selection error', {
          error: error instanceof Error ? error.message : String(error)
        })
        showError('切换用户失败')
      }
    },
    [logger, showError]
  )

  const handleUserSelectionCancel = useCallback(() => {
    void window.electron.auth.logout()
    setShowUserSelection(false)
    setShowLoginDialog(true)
  }, [])

  const handleLogout = useCallback(async () => {
    // 退出登录，清空后端状态
    await window.electron.auth.logout()

    // 清空前端状态
    setIsAuthenticated(false)
    setCurrentUser(null)
    setIsSwitchedByAdmin(false)
    setShowUserSelection(false)
    setShowLoginDialog(false)

    // 重新进行静默登录，如果是 Admin 会自动弹出用户选择界面
    await initializeAuth()
  }, [initializeAuth])

  const openUpdateDialog = useCallback(async () => {
    await Promise.all([refreshUpdateCatalog(), refreshUpdateState()])
    setShowUpdateDialog(true)
  }, [refreshUpdateCatalog, refreshUpdateState])

  const handleInstallUserRelease = useCallback(async () => {
    if (!updateCatalog?.recommendedRelease) {
      showError('暂无可安装更新')
      return
    }

    if (updateStatus?.phase !== 'downloaded') {
      const downloadResult = await window.electron.update.downloadRelease(
        updateCatalog.recommendedRelease
      )
      if (!downloadResult.success) {
        showError(downloadResult.error || '下载更新失败')
        return
      }
    }

    const installResult = await window.electron.update.installDownloaded()
    if (!installResult.success) {
      showError(installResult.error || '启动安装失败')
    }
  }, [showError, updateCatalog, updateStatus?.phase])

  const handleAdminDownloadAndInstall = useCallback(
    async (release: DownloadReleaseRequest) => {
      const downloadResult = await window.electron.update.downloadRelease(release)
      if (!downloadResult.success) {
        showError(downloadResult.error || '下载更新失败')
        return
      }

      const installResult = await window.electron.update.installDownloaded()
      if (!installResult.success) {
        showError(installResult.error || '启动安装失败')
      }
    },
    [showError]
  )

  const refreshUpdateDialogState = useCallback(async () => {
    await window.electron.update.checkNow()
    await Promise.all([refreshUpdateCatalog(), refreshUpdateState()])
  }, [refreshUpdateCatalog, refreshUpdateState])

  return {
    isAuthenticated,
    isAuthenticating,
    currentUser,
    computerName,
    showLoginDialog,
    showUserSelection,
    allUsers,
    errorMessage,
    isSwitchedByAdmin,
    currentPage,
    setCurrentPage,
    updateStatus,
    updateCatalog,
    showUpdateDialog,
    setShowUpdateDialog,
    showPlaywrightDownload,
    setShowPlaywrightDownload,
    showError,
    refreshUpdateState,
    refreshUpdateCatalog,
    handleLogin,
    handleLoginCancel,
    handleUserSelect,
    handleUserSelectionCancel,
    handleLogout,
    openUpdateDialog,
    handleInstallUserRelease,
    handleAdminDownloadAndInstall,
    refreshUpdateDialogState,
    initializeAuth
  }
}
