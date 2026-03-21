import React, { Suspense } from 'react'
import {
  ArrowUpCircle,
  Database,
  Download,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Settings,
  Trash2,
  User
} from 'lucide-react'
import type {
  DownloadReleaseRequest,
  UpdateDialogCatalog,
  UpdateStatus
} from '../../../../main/types/update.types'
import type { CurrentUser, Page } from '../../hooks/useAppBootstrap'
import { Toast } from '../ui/Toast'
import CleanerPage from '../../pages/CleanerPage'
import ExtractorPage from '../../pages/ExtractorPage'
import SettingsPage from '../../pages/SettingsPage'

const UpdateDialog = React.lazy(() => import('../UpdateDialog'))

interface AuthenticatedAppShellProps {
  currentUser: CurrentUser | null
  currentPage: Page
  onNavigate: (page: Page) => void
  updateStatus: UpdateStatus | null
  updateCatalog: UpdateDialogCatalog | null
  showUpdateDialog: boolean
  onOpenUpdateDialog: () => Promise<void>
  onCloseUpdateDialog: () => void
  onInstallUserRelease: () => Promise<void>
  onDownloadAndInstallAdminRelease: (release: DownloadReleaseRequest) => Promise<void>
  onRefreshCatalog: () => Promise<void>
  shouldShowLogout: boolean
  onLogout: () => Promise<void>
  logoutButtonRef: React.RefObject<HTMLButtonElement | null>
}

export function AuthenticatedAppShell({
  currentUser,
  currentPage,
  onNavigate,
  updateStatus,
  updateCatalog,
  showUpdateDialog,
  onOpenUpdateDialog,
  onCloseUpdateDialog,
  onInstallUserRelease,
  onDownloadAndInstallAdminRelease,
  onRefreshCatalog,
  shouldShowLogout,
  onLogout,
  logoutButtonRef
}: AuthenticatedAppShellProps): React.JSX.Element {
  const navItems = [
    { id: 'extractor' as const, label: '数据提取 (Extractor)', icon: <Download size={18} /> },
    { id: 'cleaner' as const, label: '物料验证与清理 (Cleaner)', icon: <Trash2 size={18} /> },
    { id: 'settings' as const, label: '系统设置 (Settings)', icon: <Settings size={18} /> }
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
      <header
        className="h-16 bg-slate-900 text-slate-300 flex items-center justify-between px-4 shadow-md z-20 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-6">
          <div className="flex gap-2 pl-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>

          <div
            className="flex flex-col cursor-pointer"
            onClick={() => onNavigate('home')}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
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
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {showUpdateEntry && (
            <button
              onClick={() => void onOpenUpdateDialog()}
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
                onClick={() => void onLogout()}
                className="ml-2 text-slate-400 hover:text-red-400 transition-colors"
                title="退出登录"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

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

      <Toast />

      <Suspense fallback={null}>
        <UpdateDialog
          isOpen={showUpdateDialog}
          userType={currentUser?.userType ?? null}
          status={updateStatus}
          catalog={updateCatalog}
          onClose={onCloseUpdateDialog}
          onInstallUserRelease={onInstallUserRelease}
          onDownloadAndInstallAdminRelease={async (release) =>
            onDownloadAndInstallAdminRelease(release)
          }
          onRefreshCatalog={onRefreshCatalog}
        />
      </Suspense>
    </div>
  )
}
