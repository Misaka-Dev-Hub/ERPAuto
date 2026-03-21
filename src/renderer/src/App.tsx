import React from 'react'
import { AuthenticatedAppShell } from './components/app/AuthenticatedAppShell'
import { UnauthenticatedApp } from './components/app/UnauthenticatedApp'
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
    showError,
    handleLogin,
    handleLoginCancel,
    handleUserSelect,
    handleUserSelectionCancel,
    handleLogout,
    openUpdateDialog,
    handleInstallUserRelease,
    handleAdminDownloadAndInstall,
    refreshUpdateDialogState
  } = useAppBootstrap()

  const shouldShowLogout = currentUser?.userType === 'Admin' || isSwitchedByAdmin

  if (!isAuthenticated) {
    return (
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
    )
  }

  return (
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
  )
}

export default App
