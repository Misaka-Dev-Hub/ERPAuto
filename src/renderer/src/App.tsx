/**
 * ERP App - Main application with authentication
 *
 * Mimics the Python ERPApp functionality:
 * - Silent login by computer name on startup
 * - Show login dialog if silent login fails
 * - Show user selection dialog for Admin users
 * - Display main content after successful authentication
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Download,
  Trash2,
  Settings,
  Database,
  User,
  LogOut,
  ArrowUpCircle,
  LoaderCircle
} from 'lucide-react'
import { useLogger } from './hooks/useLogger'
import LoginDialog from './components/LoginDialog'
import UserSelectionDialog, {
  type UserInfo as SelectedUserInfo
} from './components/UserSelectionDialog'
import { Toast } from './components/ui/Toast'
import ExtractorPage from './pages/ExtractorPage'
import CleanerPage from './pages/CleanerPage'
import SettingsPage from './pages/SettingsPage'
import UpdateDialog from './components/UpdateDialog'
import type {
  DownloadReleaseRequest,
  UpdateDialogCatalog,
  UpdateStatus
} from '../../main/types/update.types'

type Page = 'home' | 'extractor' | 'cleaner' | 'settings'

interface CurrentUser {
  username: string
  userType: 'Admin' | 'User' | 'Guest'
}

function App(): React.JSX.Element {
  // Create logger instance for App component
  const logger = useLogger('App')

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(true)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [computerName, setComputerName] = useState('')

  // Dialog state
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [showUserSelection, setShowUserSelection] = useState(false)
  const [allUsers, setAllUsers] = useState<SelectedUserInfo[]>([])
  const [errorMessage, setErrorMessage] = useState('')

  // Track if current session is switched by Admin
  const [isSwitchedByAdmin, setIsSwitchedByAdmin] = useState(false)

  // Ref for logout button (for focus restoration)
  const logoutButtonRef = React.useRef<HTMLButtonElement>(null)

  // Navigation state
  const [currentPage, setCurrentPage] = useState<Page>('extractor') // Default to extractor for the new layout
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [updateCatalog, setUpdateCatalog] = useState<UpdateDialogCatalog | null>(null)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const authInitializationStartedRef = React.useRef(false)

  // Load error message from sessionStorage
  const showError = (message: string) => {
    setErrorMessage(message)
    setTimeout(() => setErrorMessage(''), 3000)
  }

  const refreshUpdateState = useCallback(async () => {
    const result = await window.electron.update.getStatus()
    if (result.success && result.data) {
      setUpdateStatus(result.data)
    }
  }, [])

  const refreshUpdateCatalog = useCallback(async () => {
    const result = await window.electron.update.getCatalog()
    if (result.success && result.data) {
      setUpdateCatalog(result.data)
    }
  }, [])

  const initializeAuth = useCallback(async () => {
    logger.info('=== Starting initializeAuth ===')
    try {
      // Get computer name
      logger.debug('Getting computer name...')
      const computerNameResult = await window.electron.auth.getComputerName()
      const name =
        computerNameResult.success && computerNameResult.data ? computerNameResult.data : ''
      logger.debug('Computer name obtained', { name })
      setComputerName(name)

      // Try silent login
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

        // Check if admin needs user selection
        if (result.requiresUserSelection) {
          logger.info('Admin user needs to select user')
          // Load all users for selection
          const usersResult = await window.electron.auth.getAllUsers()
          setAllUsers(usersResult.success && usersResult.data ? usersResult.data : [])
          setShowUserSelection(true)
        } else {
          logger.info('Setting authenticated to true')
          setIsAuthenticated(true)
        }
      } else {
        logger.info('Silent login failed, showing login dialog')
        // Silent login failed, show login dialog
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

  // Initialize authentication on mount
  useEffect(() => {
    if (authInitializationStartedRef.current) {
      logger.debug('Skipping duplicate auth initialization effect')
      return
    }

    authInitializationStartedRef.current = true
    logger.info('=== Initializing auth... ===')
    void initializeAuth()
  }, [initializeAuth, logger])

  useEffect(() => {
    const unsubscribe = window.electron.update.onStatusChanged((status) => {
      setUpdateStatus(status)
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

  // Handle login dialog submit
  const handleLogin = async (username: string, password: string): Promise<boolean> => {
    try {
      const result = await window.electron.auth.login({ username, password })
      const loginData = result.success ? result.data : undefined

      if (result.success && loginData?.userInfo) {
        setCurrentUser({
          username: loginData.userInfo.username,
          userType: loginData.userInfo.userType
        })

        // Check if admin needs user selection
        if (loginData.userInfo.userType === 'Admin') {
          setShowLoginDialog(false)
          // Load all users for selection
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
      logger.error('Login error', { error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  // Handle login dialog cancel
  const handleLoginCancel = () => {
    // User cancelled, keep showing dialog or exit
    setShowLoginDialog(false)
  }

  // Handle user selection
  const handleUserSelect = async (user: SelectedUserInfo) => {
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
        // Mark as switched by Admin
        setIsSwitchedByAdmin(true)
      }
    } catch (error) {
      logger.error('User selection error', {
        error: error instanceof Error ? error.message : String(error)
      })
      showError('切换用户失败')
    }
  }

  // Handle user selection cancel
  const handleUserSelectionCancel = () => {
    // User cancelled selection, logout and show login dialog
    window.electron.auth.logout()
    setShowUserSelection(false)
    setShowLoginDialog(true)
  }

  // Handle logout
  const handleLogout = async () => {
    await window.electron.auth.logout()
    setIsAuthenticated(false)
    setCurrentUser(null)
    setIsSwitchedByAdmin(false)
    setShowLoginDialog(true)
  }

  const openUpdateDialog = async () => {
    await refreshUpdateCatalog()
    setShowUpdateDialog(true)
  }

  const handleInstallUserRelease = async () => {
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
  }

  const handleAdminDownloadAndInstall = async (release: DownloadReleaseRequest) => {
    const downloadResult = await window.electron.update.downloadRelease(release)
    if (!downloadResult.success) {
      showError(downloadResult.error || '下载更新失败')
      return
    }

    const installResult = await window.electron.update.installDownloaded()
    if (!installResult.success) {
      showError(installResult.error || '启动安装失败')
    }
  }

  // Check if should show logout button
  // Show logout if: user is Admin, OR user was switched by Admin
  const shouldShowLogout = currentUser?.userType === 'Admin' || isSwitchedByAdmin

  // Show loading state during authentication
  if (isAuthenticating) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>认证中...</p>
        </div>
        <style>{`
          .loading-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: #f5f7fa;
          }
          .loading-content {
            text-align: center;
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #e8e8e8;
            border-top-color: #1890ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // Show login dialog if not authenticated
  if (!isAuthenticated) {
    logger.debug('Render: not authenticated', { showLoginDialog, computerName })
    return (
      <>
        <LoginDialog
          isOpen={showLoginDialog}
          computerName={computerName}
          onLogin={handleLogin}
          onCancel={handleLoginCancel}
          onError={showError}
        />

        {/* User Selection Dialog for Admin */}
        <UserSelectionDialog
          isOpen={showUserSelection}
          users={allUsers}
          currentUsername={currentUser?.username || ''}
          onSelectUser={handleUserSelect}
          onCancel={handleUserSelectionCancel}
          triggerRef={logoutButtonRef}
        />

        {errorMessage && <div className="error-toast">{errorMessage}</div>}

        {/* If showLoginDialog is false but not authenticated, show a message */}
        {!showLoginDialog && !showUserSelection && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '100vh',
              backgroundColor: '#f5f7fa'
            }}
          >
            <div
              style={{
                padding: '40px',
                backgroundColor: '#fff',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                textAlign: 'center'
              }}
            >
              <p style={{ color: '#52c41a', fontSize: '18px', fontWeight: 600 }}>
                欢迎，{currentUser?.username}！
              </p>
              <p style={{ color: '#666', marginTop: '16px' }}>正在加载主界面...</p>
            </div>
          </div>
        )}

        <style>{`
          .error-toast {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #fff1f0;
            border: 1px solid #ffa39e;
            padding: 12px 24px;
            border-radius: 6px;
            color: #ff4d4f;
            font-size: 14px;
            z-index: 10000;
            animation: slideDown 0.3s ease-out;
          }
        `}</style>
      </>
    )
  }

  // Show main content when authenticated
  logger.debug('Render: authenticated', { currentUser, currentPage })

  const navItems = [
    { id: 'extractor', label: '数据提取 (Extractor)', icon: <Download size={18} /> },
    { id: 'cleaner', label: '物料验证与清理 (Cleaner)', icon: <Trash2 size={18} /> },
    { id: 'settings', label: '系统设置 (Settings)', icon: <Settings size={18} /> }
  ]

  const showUpdateEntry =
    !!updateStatus &&
    ((currentUser?.userType === 'User' && updateStatus.phase === 'downloaded') ||
      (currentUser?.userType === 'Admin' &&
        (updateStatus.adminHasAnyRelease ||
          updateStatus.phase === 'downloading' ||
          updateStatus.phase === 'downloaded' ||
          updateStatus.phase === 'installing')))

  const updateButtonLabel =
    currentUser?.userType === 'Admin'
      ? updateStatus?.phase === 'downloading'
        ? '下载更新中...'
        : '有可用版本'
      : updateStatus?.phase === 'downloaded'
        ? `发现稳定版 V${updateStatus.latestVersion}`
        : '发现新版本'

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* ================= 顶部导航与标题栏 ================= */}
      <header
        className="h-16 bg-slate-900 text-slate-300 flex items-center justify-between px-4 shadow-md z-20 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center gap-6">
          <div className="flex gap-2 pl-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>

          <div
            className="flex flex-col cursor-pointer"
            onClick={() => setCurrentPage('home')}
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <div className="flex items-center gap-2 text-white font-bold text-lg">
              <LayoutDashboard size={22} className="text-blue-500" />
              <span>ERP Auto</span>
            </div>
            <span className="text-xs text-slate-400 ml-7">
              {__APP_VERSION__}({__GIT_HASH__})
            </span>
          </div>
        </div>

        <nav
          className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id as Page)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                currentPage === item.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div
          className="flex items-center gap-4 text-sm"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {showUpdateEntry && (
            <button
              onClick={() => void openUpdateDialog()}
              className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-100 transition hover:bg-blue-500/20"
              title={updateStatus?.message || '查看更新'}
            >
              {updateStatus?.phase === 'downloading' || updateStatus?.phase === 'installing' ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <ArrowUpCircle size={15} />
              )}
              <span>{updateButtonLabel}</span>
            </button>
          )}
          <div className="flex items-center gap-2 text-xs bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
            <Database size={14} className="text-green-500" />
            <span className="text-slate-300">数据库已连接</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full">
            <User size={16} className="text-slate-400" />
            <span
              className="font-medium text-slate-200"
              title={`User Type: ${currentUser?.userType}`}
            >
              {currentUser?.username}
            </span>
            {shouldShowLogout && (
              <button
                ref={logoutButtonRef}
                onClick={handleLogout}
                className="ml-2 text-slate-400 hover:text-red-400 transition-colors"
                title="退出登录"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ================= 主体内容区域 ================= */}
      <div className="flex flex-1 overflow-hidden relative">
        <main className="flex-1 overflow-hidden bg-slate-50 p-6 h-full">
          {currentPage === 'home' && (
            <div className="h-full overflow-auto">
              <div className="max-w-4xl mx-auto mt-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <LayoutDashboard size={48} className="mx-auto text-blue-500 mb-4" />
                <h1 className="text-3xl font-bold text-slate-800 mb-4">欢迎使用 ERP Auto</h1>
                <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                  自动化处理 ERP 系统中的数据提取和清理任务。请使用上方导航栏选择您需要的功能模块。
                </p>
              </div>
            </div>
          )}
          {currentPage === 'extractor' && <ExtractorPage />}
          {currentPage === 'cleaner' && <CleanerPage />}
          {currentPage === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* Toast Notifications */}
      <Toast />
      <UpdateDialog
        isOpen={showUpdateDialog}
        userType={currentUser?.userType ?? null}
        status={updateStatus}
        catalog={updateCatalog}
        onClose={() => setShowUpdateDialog(false)}
        onInstallUserRelease={handleInstallUserRelease}
        onDownloadAndInstallAdminRelease={async (release) => handleAdminDownloadAndInstall(release)}
        onRefreshCatalog={async () => {
          await window.electron.update.checkNow()
          await refreshUpdateCatalog()
          await refreshUpdateState()
        }}
      />
    </div>
  )
}

export default App
