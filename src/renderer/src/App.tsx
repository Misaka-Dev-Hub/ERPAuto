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
import LoginDialog from './components/LoginDialog'
import { ExtractorPage } from './pages/ExtractorPage'
import { CleanerPage } from './pages/CleanerPage'

type Page = 'home' | 'extractor' | 'cleaner'

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
  const [errorMessage, setErrorMessage] = useState('')

  // Navigation state
  const [currentPage, setCurrentPage] = useState<Page>('home')

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
          console.log('Admin user needs to select user - logging in anyway')
          // For now, just log in as the current user
          setIsAuthenticated(true)
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
          // TODO: Show user selection dialog
          console.log('Admin user needs to select user')
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

  // Handle logout
  const handleLogout = async () => {
    await window.electron.auth.logout()
    setIsAuthenticated(false)
    setCurrentUser(null)
    setShowLoginDialog(true)
  }

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
    console.log('Render: not authenticated, showLoginDialog:', showLoginDialog, 'computerName:', computerName)
    return (
      <>
        <LoginDialog
          isOpen={showLoginDialog}
          computerName={computerName}
          onLogin={handleLogin}
          onCancel={handleLoginCancel}
          onError={showError}
        />

        {errorMessage && (
          <div className="error-toast">{errorMessage}</div>
        )}

        {/* If showLoginDialog is false but not authenticated, show a message */}
        {!showLoginDialog && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: '#f5f7fa'
          }}>
            <div style={{
              padding: '40px',
              backgroundColor: '#fff',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              textAlign: 'center'
            }}>
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
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f7fa'
    }}>
      {/* Header with user info and logout */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        backgroundColor: '#fff',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        marginBottom: '16px'
      }}>
        <div>
          <span style={{
            fontSize: '14px',
            color: '#666'
          }}>
            欢迎，{currentUser?.username} ({currentUser?.userType})
          </span>
        </div>
        <div>
          <button onClick={handleLogout} style={{
            padding: '8px 16px',
            backgroundColor: '#ff4d4f',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer'
          }}>
            退出登录
          </button>
        </div>
      </header>

      {/* Main content */}
      <div style={{ padding: '24px' }}>
        {currentPage === 'home' && (
          <div>
            <h1 style={{ fontSize: '24px', color: '#333', marginBottom: '24px' }}>主页面</h1>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px'
            }}>
              <div onClick={() => setCurrentPage('extractor')} style={{
                padding: '24px',
                backgroundColor: '#fff',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                cursor: 'pointer',
                textAlign: 'center'
              }}>
                <h3 style={{ margin: '0 0 8px 0', color: '#1890ff' }}>数据提取</h3>
                <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>提取 ERP 数据</p>
              </div>
              <div onClick={() => setCurrentPage('cleaner')} style={{
                padding: '24px',
                backgroundColor: '#fff',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                cursor: 'pointer',
                textAlign: 'center'
              }}>
                <h3 style={{ margin: '0 0 8px 0', color: '#52c41a' }}>物料清理</h3>
                <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>清理 ERP 物料</p>
              </div>
            </div>
          </div>
        )}

        {currentPage === 'extractor' && <ExtractorPage />}
        {currentPage === 'cleaner' && <CleanerPage />}
      </div>
    </div>
  )
}

export default App
