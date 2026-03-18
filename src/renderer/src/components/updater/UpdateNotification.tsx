import React, { useState, useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { useUpdater } from '../../hooks/useUpdater'

export const UpdateNotification: React.FC = () => {
  const { status, version, channel, installUpdate, postponeInstall } = useUpdater()
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    if (status === 'downloaded') {
      setIsDismissed(false)
    }
  }, [status, version])

  if (status !== 'downloaded' || isDismissed) {
    return null
  }

  const handlePostpone = (): void => {
    setIsDismissed(true)
    postponeInstall()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-lg">
            <CheckCircle2 size={24} className="text-green-500" />
            新版本已就绪
          </div>
          <button
            onClick={handlePostpone}
            className="text-slate-400 hover:text-slate-600 transition-colors rounded-full p-1 hover:bg-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <p className="text-slate-600 mb-6 text-base">
            已下载到最新版本 <strong>v{version}</strong>
            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              [{channel === 'stable' ? 'Stable 稳定版' : 'Beta 测试版'}]
            </span>
          </p>

          <div className="bg-slate-50 rounded-lg p-4 mb-6 border border-slate-200">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">更新内容：</h4>
            <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
              <li>性能优化与 Bug 修复</li>
              <li>更多详细信息请参阅更新日志</li>
            </ul>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handlePostpone}
              className="flex-1 py-2.5 px-4 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              稍后安装
            </button>
            <button
              onClick={installUpdate}
              className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              立即重启安装
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
