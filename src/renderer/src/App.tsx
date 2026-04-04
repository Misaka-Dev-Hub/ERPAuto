import React from 'react'
import { AuthenticatedAppShell } from './components/app/AuthenticatedAppShell'
import { UnauthenticatedApp } from './components/app/UnauthenticatedApp'
import { ErrorBoundary } from './components/ErrorBoundary'
import PlaywrightDownloadDialog from './components/PlaywrightDownloadDialog'
import { useAppBootstrap } from './hooks/useAppBootstrap'

function App(): React.JSX.Element {
  const logoutButtonRef = React.useRef<HTMLButtonElement>(null)

  const {
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
  } = useAppBootstrap()

  const handlePlaywrightDownloadComplete = React.useCallback(() => {
    setShowPlaywrightDownload(false)
    // Re-trigger authentication after download completes
    void initializeAuth()
  }, [setShowPlaywrightDownload, initializeAuth])

  const shouldShowLogout = currentUser?.userType === 'Admin' || isSwitchedByAdmin

  // Show Playwright download dialog first (before authentication check)
  if (showPlaywrightDownload) {
    return (
      <ErrorBoundary scope="PlaywrightDownload">
        <PlaywrightDownloadDialog
          isOpen={showPlaywrightDownload}
          onClose={() => {}}
          onDownloadComplete={handlePlaywrightDownloadComplete}
        />
      </ErrorBoundary>
    )
  }

  if (!isAuthenticated) {
    return (
      <ErrorBoundary scope="UnauthenticatedApp">
        <UnauthenticatedApp
          isAuthenticating={isAuthenticating}
          showLoginDialog={showLoginDialog}
          showUserSelection={showUserSelection}
          computerName={computerName}
          currentUser={currentUser}
          allUsers={allUsers}
          errorMessage={errorMessage}
          onLogin={handleLogin}
          onLoginCancel={handleLoginCancel}
          onSelectUser={handleUserSelect}
          onUserSelectionCancel={handleUserSelectionCancel}
          onError={showError}
          logoutButtonRef={logoutButtonRef}
        />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary scope="AuthenticatedApp">
      <AuthenticatedAppShell
        currentUser={currentUser}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        updateStatus={updateStatus}
        updateCatalog={updateCatalog}
        showUpdateDialog={showUpdateDialog}
        onOpenUpdateDialog={openUpdateDialog}
        onCloseUpdateDialog={() => setShowUpdateDialog(false)}
        onInstallUserRelease={handleInstallUserRelease}
        onDownloadAndInstallAdminRelease={handleAdminDownloadAndInstall}
        onRefreshCatalog={refreshUpdateDialogState}
        shouldShowLogout={shouldShowLogout}
        onLogout={handleLogout}
        logoutButtonRef={logoutButtonRef}
      />
    </ErrorBoundary>
  )
}

export default App
