/**
 * ERP App - Main application with authentication
 *
 * Mimics the Python ERPApp functionality:
 * - Silent login by computer name on startup
 * - Show login dialog if silent login fails
 * - Show user selection dialog for Admin users
 * - Display main content after successful authentication
 */

import React, { useState, useEffect } from 'react'
import { LayoutDashboard, Download, Trash2, Settings, Database, User, LogOut } from 'lucide-react'
import LoginDialog from './components/LoginDialog'
import UserSelectionDialog, {
  type UserInfo as SelectedUserInfo
} from './components/UserSelectionDialog'
import ExtractorPage from './pages/ExtractorPage'
import CleanerPage from './pages/CleanerPage'
import SettingsPage from './pages/SettingsPage'

type Page = 'home' | 'extractor' | 'cleaner' | 'settings'

interface CurrentUser {
  username: string
  userType: 'Admin' | 'User' | 'Guest'
}

function App(): React.JSX.Element {
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

  // Navigation state
  const [currentPage, setCurrentPage] = useState<Page>('extractor') // Default to extractor for the new layout

  // Load error message from sessionStorage
  const showError = (message: string) => {
    setErrorMessage(message)
    setTimeout(() => setErrorMessage(''), 3000)
  }

  // Initialize authentication on mount
  useEffect(() => {
    console.log('=== App: Initializing auth... ===')
    initializeAuth()
  }, [])

  const initializeAuth = async () => {
    console.log('=== App: Starting initializeAuth ===')
    try {
      // Get computer name
      console.log('Getting computer name...')
      const name = await window.electron.auth.getComputerName()
      console.log('Computer name:', name)
      setComputerName(name)

      // Try silent login
      console.log('Trying silent login...')
      const result = await window.electron.auth.silentLogin()
      console.log('Silent login result:', result)

      if (result.success && result.userInfo) {
        console.log('Silent login success:', result.userInfo)
        setCurrentUser({
          username: result.userInfo.username,
          userType: result.userInfo.userType
        })

        // Check if admin needs user selection
        if (result.requiresUserSelection) {
          console.log('Admin user needs to select user')
          // Load all users for selection
          const users = await window.electron.auth.getAllUsers()
          setAllUsers(users)
          setShowUserSelection(true)
        } else {
          console.log('Setting authenticated to true')
          setIsAuthenticated(true)
        }
      } else {
        console.log('Silent login failed, showing login dialog')
        // Silent login failed, show login dialog
        setShowLoginDialog(true)
      }
    } catch (error) {
      console.error('Auth initialization error:', error)
      setShowLoginDialog(true)
    } finally {
      console.log('Setting isAuthenticating to false')
      setIsAuthenticating(false)
    }
    console.log('=== App: Auth initialization complete ===')
  }

  // Handle login dialog submit
  const handleLogin = async (username: string, password: string): Promise<boolean> => {
    try {
      const result = await window.electron.auth.login({ username, password })

      if (result.success && result.userInfo) {
        setCurrentUser({
          username: result.userInfo.username,
          userType: result.userInfo.userType
        })

        // Check if admin needs user selection
        if (result.userInfo.userType === 'Admin') {
          setShowLoginDialog(false)
          // Load all users for selection
          const users = await window.electron.auth.getAllUsers()
          setAllUsers(users)
          setShowUserSelection(true)
        } else {
          setIsAuthenticated(true)
          setShowLoginDialog(false)
        }
        return true
      }
      return false
    } catch (error) {
      console.error('Login error:', error)
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
      if (result.success) {
        setCurrentUser({
          username: result.userInfo?.username || user.username,
          userType: result.userInfo?.userType || user.userType
        })
        setIsAuthenticated(true)
        setShowUserSelection(false)
        // Mark as switched by Admin
        setIsSwitchedByAdmin(true)
      }
    } catch (error) {
      console.error('User selection error:', error)
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
    console.log(
      'Render: not authenticated, showLoginDialog:',
      showLoginDialog,
      'computerName:',
      computerName
    )
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
  console.log('Render: authenticated, currentUser:', currentUser, 'currentPage:', currentPage)

  const navItems = [
    { id: 'extractor', label: '数据提取 (Extractor)', icon: <Download size={18} /> },
    { id: 'cleaner', label: '物料验证与清理 (Cleaner)', icon: <Trash2 size={18} /> },
    { id: 'settings', label: '系统设置 (Settings)', icon: <Settings size={18} /> }
  ]

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
            className="flex items-center gap-2 text-white font-bold text-lg cursor-pointer"
            onClick={() => setCurrentPage('home')}
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <LayoutDashboard size={22} className="text-blue-500" />
            <span>ERP Auto</span>
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
    </div>
  )
}

export default App
