import React from 'react'
import LoginDialog from '../LoginDialog'
import UserSelectionDialog, { type UserInfo as SelectedUserInfo } from '../UserSelectionDialog'

interface CurrentUser {
  username: string
  userType: 'Admin' | 'User'
}

interface UnauthenticatedAppProps {
  isAuthenticating: boolean
  showLoginDialog: boolean
  showUserSelection: boolean
  computerName: string
  currentUser: CurrentUser | null
  allUsers: SelectedUserInfo[]
  errorMessage: string
  onLogin: (username: string, password: string) => Promise<boolean>
  onLoginCancel: () => void
  onSelectUser: (user: SelectedUserInfo) => Promise<void>
  onUserSelectionCancel: () => void
  onError: (message: string) => void
  logoutButtonRef: React.RefObject<HTMLButtonElement | null>
}

export function UnauthenticatedApp({
  isAuthenticating,
  showLoginDialog,
  showUserSelection,
  computerName,
  currentUser,
  allUsers,
  errorMessage,
  onLogin,
  onLoginCancel,
  onSelectUser,
  onUserSelectionCancel,
  onError,
  logoutButtonRef
}: UnauthenticatedAppProps): React.JSX.Element {
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

  return (
    <>
      <LoginDialog
        isOpen={showLoginDialog}
        computerName={computerName}
        onLogin={onLogin}
        onCancel={onLoginCancel}
        onError={onError}
      />

      <UserSelectionDialog
        isOpen={showUserSelection}
        users={allUsers}
        currentUsername={currentUser?.username || ''}
        onSelectUser={onSelectUser}
        onCancel={onUserSelectionCancel}
        triggerRef={logoutButtonRef}
      />

      {errorMessage && <div className="error-toast">{errorMessage}</div>}

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
