import React, { useEffect, useState, useCallback } from 'react'
import { DownloadCloud, LoaderCircle, X } from 'lucide-react'
import Modal from './ui/Modal'
import { useLogger } from '../hooks/useLogger'
interface DownloadProgress {
  percent: number // 0-100
  downloadedBytes: number
  totalBytes: number
  currentFile: string
  speed: number // bytes/s
  eta?: number // seconds
}

interface PlaywrightDownloadDialogProps {
  isOpen: boolean
  onClose: () => void
  onDownloadComplete: () => void
}

export default function PlaywrightDownloadDialog({
  isOpen,
  onClose,
  onDownloadComplete
}: PlaywrightDownloadDialogProps): React.JSX.Element {
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const logger = useLogger('PlaywrightDownload')

  // Format bytes to human-readable string
  const formatBytes = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }, [])

  // Format ETA to human-readable string
  const formatETA = useCallback((seconds: number | undefined): string => {
    if (seconds === undefined || seconds < 0 || !Number.isFinite(seconds)) {
      return '计算中...'
    }
    if (seconds === 0) return '已完成'
    if (seconds < 60) return `${Math.round(seconds)}秒`
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}分${secs}秒`
  }, [])

  // Subscribe to progress events
  useEffect(() => {
    if (!isOpen) return

    const unsubscribe = window.electron.playwrightBrowser.onProgress((data) => {
      setProgress(data)
      setError(null)
    })

    return unsubscribe
  }, [isOpen])

  // Start download when dialog opens
  useEffect(() => {
    if (!isOpen) return

    let mounted = true
    setIsDownloading(true)
    setError(null)
    setProgress(null)

    const startDownload = async () => {
      try {
        const result = await window.electron.playwrightBrowser.download()
        if (mounted) {
          if (result.success) {
            setIsDownloading(false)
            onDownloadComplete()
          } else {
            setError(result.error || '下载失败')
            setIsDownloading(false)
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : '下载失败')
          setIsDownloading(false)
        }
      }
    }

    void startDownload()

    return () => {
      mounted = false
    }
  }, [isOpen, onDownloadComplete])

  const handleCancel = useCallback(async () => {
    try {
      await window.electron.playwrightBrowser.cancel()
    } catch (err) {
      logger.error('Failed to cancel download', {
        error: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setShowCancelConfirm(false)
      setIsDownloading(false)
      onClose()
    }
  }, [onClose, logger])

  const handleConfirmCancel = useCallback(() => {
    void handleCancel()
  }, [handleCancel])

  const handleCancelDownloadClick = useCallback(() => {
    setShowCancelConfirm(true)
  }, [])

  const handleCloseConfirm = useCallback(() => {
    setShowCancelConfirm(false)
  }, [])

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={isDownloading ? () => undefined : onClose}
        title="下载 Playwright 浏览器"
        size="lg"
        disableBackdropClick={isDownloading}
        disableEscapeKey={isDownloading}
        showCloseButton={!isDownloading}
      >
        <div className="space-y-4">
          {/* Progress Section */}
          {isDownloading && (
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">下载进度</span>
                  <span className="font-semibold text-blue-600">{progress?.percent ?? 0}%</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out"
                    style={{ width: `${progress?.percent ?? 0}%` }}
                  />
                </div>
              </div>

              {/* Current File */}
              {progress?.currentFile && (
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <div className="text-xs font-medium text-slate-500">当前文件</div>
                  <div
                    className="mt-1 truncate text-sm text-slate-700"
                    title={progress.currentFile}
                  >
                    {progress.currentFile}
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 px-4 py-3">
                  <div className="text-xs text-slate-500">已下载</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {progress ? formatBytes(progress.downloadedBytes) : '0 B'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 px-4 py-3">
                  <div className="text-xs text-slate-500">总大小</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {progress && progress.totalBytes > 0
                      ? formatBytes(progress.totalBytes)
                      : '计算中...'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 px-4 py-3">
                  <div className="text-xs text-slate-500">速度</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {progress && progress.speed >= 0
                      ? `${formatBytes(progress.speed)}/秒`
                      : '计算中...'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 px-4 py-3">
                  <div className="text-xs text-slate-500">剩余时间</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {progress?.eta !== undefined && progress.eta >= 0
                      ? formatETA(progress.eta)
                      : '计算中...'}
                  </div>
                </div>
              </div>

              {/* Cancel Button */}
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleCancelDownloadClick}
                  className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 hover:bg-rose-100"
                >
                  <X size={16} />
                  取消下载
                </button>
              </div>
            </div>
          )}

          {/* Error Section */}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <div className="font-medium">下载失败</div>
              <div className="mt-1">{error}</div>
            </div>
          )}

          {/* Success Section (shown briefly before closing) */}
          {!isDownloading && !error && progress?.percent === 100 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <div className="flex items-center gap-2">
                <DownloadCloud size={18} />
                <span className="font-medium">下载完成</span>
              </div>
              <div className="mt-1">Playwright 浏览器已准备就绪。</div>
            </div>
          )}

          {/* Initial Loading State */}
          {isDownloading && !progress && (
            <div className="flex flex-col items-center justify-center py-8">
              <LoaderCircle size={48} className="animate-spin text-blue-500" />
              <div className="mt-4 text-sm text-slate-600">正在初始化下载...</div>
            </div>
          )}
        </div>
      </Modal>

      {/* Cancel Confirmation Dialog */}
      <Modal
        isOpen={showCancelConfirm}
        onClose={handleCloseConfirm}
        title="确认取消"
        size="md"
        isAlertDialog
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="font-medium">确定要取消下载吗？</div>
            <div className="mt-1">这将退出应用程序，您需要重新启动来继续下载。</div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={handleCloseConfirm}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              继续下载
            </button>
            <button
              onClick={handleConfirmCancel}
              className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
            >
              <X size={16} />
              取消并退出
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
