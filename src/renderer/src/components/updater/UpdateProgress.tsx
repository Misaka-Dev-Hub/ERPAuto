import React from 'react'
import { Download, X } from 'lucide-react'
import { useUpdater } from '../../hooks/useUpdater'

export const UpdateProgress: React.FC = () => {
  const { status, progress, version, cancelDownload } = useUpdater()

  if (status !== 'downloading' || !progress) {
    return null
  }

  const { percent, transferred, total, bytesPerSecond } = progress

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatTime = (bytes: number, speed: number): string => {
    if (speed === 0) return '未知'
    const seconds = Math.floor(bytes / speed)
    if (seconds < 60) return `${seconds} 秒`
    return `约 ${Math.floor(seconds / 60)} 分钟`
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-80 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-medium text-sm">
            <Download size={16} className="text-blue-500 animate-bounce" />
            正在下载更新 v{version}
          </div>
          <button
            onClick={cancelDownload}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          <div className="flex justify-between text-xs text-slate-600 mb-2">
            <span>{percent.toFixed(1)}%</span>
            <span>
              {formatBytes(transferred)} / {formatBytes(total)}
            </span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-2 mb-3 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            ></div>
          </div>

          <div className="flex justify-between text-xs text-slate-500">
            <span>下载速度: {formatBytes(bytesPerSecond)}/s</span>
            <span>剩余时间: {formatTime(total - transferred, bytesPerSecond)}</span>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-center">
            <button
              onClick={cancelDownload}
              className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
            >
              取消下载
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
