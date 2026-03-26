import React, { startTransition } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { DownloadCloud, LoaderCircle, RefreshCw } from 'lucide-react'
import Modal from './ui/Modal'
import { useUpdateDialogState } from '../hooks/useUpdateDialogState'
import type { UserType } from '../../../main/types/user.types'
import type {
  DownloadReleaseRequest,
  UpdateDialogCatalog,
  UpdateRelease,
  UpdateStatus
} from '../../../main/types/update.types'

interface UpdateDialogProps {
  isOpen: boolean
  userType: UserType | null
  status: UpdateStatus | null
  catalog: UpdateDialogCatalog | null
  onClose: () => void
  onInstallUserRelease: () => Promise<void>
  onDownloadAndInstallAdminRelease: (release: DownloadReleaseRequest) => Promise<void>
  onRefreshCatalog: () => Promise<void>
}

export default function UpdateDialog({
  isOpen,
  userType,
  status,
  catalog,
  onClose,
  onInstallUserRelease,
  onDownloadAndInstallAdminRelease,
  onRefreshCatalog
}: UpdateDialogProps): React.JSX.Element {
  const { selectedRelease, setSelectedRelease, changelog, isLoadingChangelog, isSelectedRelease } =
    useUpdateDialogState(isOpen, catalog)

  const isBusy =
    status?.phase === 'downloading' ||
    status?.phase === 'installing' ||
    status?.phase === 'checking'

  const renderReleaseList = (title: string, releases: UpdateRelease[]) => {
    if (releases.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
          暂无版本
        </div>
      )
    }

    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
        {releases.map((release) => {
          const selected = isSelectedRelease(release)
          return (
            <button
              key={`${release.channel}:${release.version}`}
              onClick={() => {
                startTransition(() => {
                  setSelectedRelease(release)
                })
              }}
              className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                selected
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">V{release.version}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs uppercase text-slate-600">
                  {release.channel}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{release.publishedAt}</div>
              {release.notesSummary && (
                <div className="mt-2 text-xs text-slate-600">{release.notesSummary}</div>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={isBusy ? () => undefined : onClose}
      title="应用更新"
      size="3xl"
      disableBackdropClick={isBusy}
      disableEscapeKey={isBusy}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <div className="text-slate-600">
            当前版本 <span className="font-semibold text-slate-900">V{status?.currentVersion}</span>
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs uppercase text-slate-700">
              {status?.currentChannel ?? __APP_CHANNEL__}
            </span>
          </div>
          <button
            onClick={() => void onRefreshCatalog()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            disabled={isBusy}
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>

        {catalog?.mode === 'admin' ? (
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="space-y-4">
              {renderReleaseList('Stable', catalog.channels?.stable ?? [])}
              {renderReleaseList('Preview', catalog.channels?.preview ?? [])}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">
                  {selectedRelease
                    ? `${selectedRelease.channel.toUpperCase()} V${selectedRelease.version}`
                    : '请选择一个版本'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {selectedRelease?.notesSummary ?? '选择版本后可查看详细更新说明。'}
                </div>
              </div>
              <div className="max-h-[420px] overflow-auto px-4 py-4 prose prose-slate max-w-none prose-headings:mb-2 prose-p:my-2 prose-li:my-1">
                {isLoadingChangelog ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <LoaderCircle size={16} className="animate-spin" />
                    正在加载更新说明...
                  </div>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {changelog || '暂无更新说明。'}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">
                {selectedRelease ? `发现稳定版 V${selectedRelease.version}` : '暂无可用更新'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {status?.currentChannel === 'preview'
                  ? '当前设备正在运行预览版，普通用户将更新回稳定版。'
                  : '更新包已在后台准备完成，确认后将自动关闭并重启应用。'}
              </div>
            </div>
            <div className="max-h-[420px] overflow-auto px-4 py-4 prose prose-slate max-w-none prose-headings:mb-2 prose-p:my-2 prose-li:my-1">
              {isLoadingChangelog ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <LoaderCircle size={16} className="animate-spin" />
                  正在加载更新说明...
                </div>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {changelog || '暂无更新说明。'}
                </ReactMarkdown>
              )}
            </div>
          </div>
        )}

        {status?.error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {status.error}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <div className="text-sm text-slate-500">{status?.message ?? ' '}</div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              disabled={isBusy}
            >
              稍后
            </button>
            {userType === 'Admin' ? (
              <button
                onClick={() =>
                  selectedRelease
                    ? void onDownloadAndInstallAdminRelease(selectedRelease)
                    : undefined
                }
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                disabled={!selectedRelease || isBusy}
              >
                {isBusy ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <DownloadCloud size={16} />
                )}
                下载并更新
              </button>
            ) : (
              <button
                onClick={() => void onInstallUserRelease()}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                disabled={!selectedRelease || isBusy}
              >
                {isBusy ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <DownloadCloud size={16} />
                )}
                立即更新
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
