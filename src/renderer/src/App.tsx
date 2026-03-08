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
import { Layout, Menu, Typography, ConfigProvider, theme, Spin, message as antdMessage } from 'antd'
import { useLogger } from './hooks/useLogger'
import LoginDialog from './components/LoginDialog'
import UserSelectionDialog, {
  type UserInfo as SelectedUserInfo
} from './components/UserSelectionDialog'
import { Toast } from './components/ui/Toast'
import ExtractorPage from './pages/ExtractorPage'
import CleanerPage from './pages/CleanerPage'
import SettingsPage from './pages/SettingsPage'

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

  // Track if current session is switched by Admin
  const [isSwitchedByAdmin, setIsSwitchedByAdmin] = useState(false)

  // Ref for logout button (for focus restoration)
  const logoutButtonRef = React.useRef<HTMLButtonElement>(null)

  const { Header, Content } = Layout;
  const { Title, Text } = Typography;

  // Navigation state
  const [currentPage, setCurrentPage] = useState<Page>('extractor') // Default to extractor for the new layout
  const [messageApi, contextHolder] = antdMessage.useMessage();

  // Load error message from sessionStorage
  const showError = (message: string) => {
    messageApi.error(message)
  }

  // Initialize authentication on mount
  useEffect(() => {
    logger.info('=== Initializing auth... ===')
    initializeAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initializeAuth = async () => {
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
  }

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

  // Check if should show logout button
  // Show logout if: user is Admin, OR user was switched by Admin
  const shouldShowLogout = currentUser?.userType === 'Admin' || isSwitchedByAdmin

  // Show loading state during authentication
  if (isAuthenticating) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f7fa' }}>
        <Spin size="large" tip="认证中...">
          <div style={{ padding: '50px' }} />
        </Spin>
      </div>
    )
  }

  // Show login dialog if not authenticated
  if (!isAuthenticated) {
    logger.debug('Render: not authenticated', { showLoginDialog, computerName })
    return (
      <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
        {contextHolder}
        <LoginDialog
          isOpen={showLoginDialog}
          computerName={computerName}
          onLogin={handleLogin}
          onCancel={handleLoginCancel}
          onError={(msg) => messageApi.error(msg)}
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
      </ConfigProvider>
    )
  }

  // Show main content when authenticated
  logger.debug('Render: authenticated', { currentUser, currentPage })

  const navItems = [
    { key: 'extractor', label: '数据提取 (Extractor)', icon: <Download size={18} /> },
    { key: 'cleaner', label: '物料验证与清理 (Cleaner)', icon: <Trash2 size={18} /> },
    { key: 'settings', label: '系统设置 (Settings)', icon: <Settings size={18} /> }
  ]

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      {contextHolder}
      <Layout className="h-screen overflow-hidden bg-slate-50">
        {/* ================= 顶部导航与标题栏 ================= */}
        <Header
          className="flex items-center justify-between px-4 shadow-md z-20 flex-shrink-0"
          style={{ WebkitAppRegion: 'drag', backgroundColor: '#0f172a', height: '64px' } as any}
        >
          <div className="flex items-center gap-6 h-full">
            <div className="flex gap-2 pl-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>

            <div
              className="flex items-center gap-2 text-white font-bold text-lg cursor-pointer h-full"
              onClick={() => setCurrentPage('home')}
              style={{ WebkitAppRegion: 'no-drag' } as any}
            >
              <LayoutDashboard size={22} className="text-blue-500" />
              <span>ERP Auto</span>
            </div>
          </div>

          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[currentPage]}
            items={navItems}
            onClick={(e) => setCurrentPage(e.key as Page)}
            style={{ WebkitAppRegion: 'no-drag', backgroundColor: 'transparent', flex: 1, justifyContent: 'center', borderBottom: 'none', lineHeight: '64px' } as any}
          />

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
        </Header>

        {/* ================= 主体内容区域 ================= */}
        <Layout className="flex-1 overflow-hidden bg-slate-50 relative">
          <Content className="overflow-auto p-6 h-full">
            {currentPage === 'home' && (
              <div className="h-full overflow-auto">
                <div className="max-w-4xl mx-auto mt-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <LayoutDashboard size={48} className="mx-auto text-blue-500 mb-4" />
                  <Title level={2} className="text-slate-800 mb-4" style={{ marginTop: 0 }}>欢迎使用 ERP Auto</Title>
                  <Text className="text-slate-500 text-lg max-w-2xl mx-auto block">
                    自动化处理 ERP 系统中的数据提取和清理任务。请使用上方导航栏选择您需要的功能模块。
                  </Text>
                </div>
              </div>
            )}
            {currentPage === 'extractor' && <ExtractorPage />}
            {currentPage === 'cleaner' && <CleanerPage />}
            {currentPage === 'settings' && <SettingsPage />}
          </Content>
        </Layout>

        {/* Toast Notifications */}
        <Toast />
      </Layout>
    </ConfigProvider>
  )
}

export default App
