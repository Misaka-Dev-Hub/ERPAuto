import React, { useState, useEffect } from 'react'
import {
  Settings as SettingsIcon,
  Save,
  User,
  Key,
  RefreshCw,
  CheckCircle,
  Info,
  X
} from 'lucide-react'
import { showSuccess, showError } from '../stores/useAppStore'
import { useUpdater } from '../hooks/useUpdater'

interface ErpCredentials {
  username: string
  password: string
}

const SettingsPage: React.FC = () => {
  const [credentials, setCredentials] = useState<ErpCredentials>({
    username: '',
    password: ''
  })
  const [isModified, setIsModified] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const { status, version, channel, availableChannels, isAdmin, checkForUpdates, switchChannel } =
    useUpdater()

  useEffect(() => {
    loadCredentials()
  }, [])

  const loadCredentials = async () => {
    try {
      setIsLoading(true)
      // ERP credentials are loaded from database (current user's config)
      const response = await window.electron.settings.getSettings()
      const config = response.success
        ? (response.data as { erp?: ErpCredentials } | undefined)
        : undefined

      // Extract ERP credentials from the config
      if (config?.erp) {
        setCredentials({
          username: config.erp.username || '',
          password: config.erp.password || ''
        })
      } else if (!response.success) {
        showError(response.error || '加载 ERP 配置失败')
      }
      setIsModified(false)
    } catch (error) {
      showError('加载 ERP 配置失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveCredentials = async () => {
    try {
      // Save ERP credentials to database (current user's config)
      const result = await window.electron.settings.saveSettings({
        erp: {
          username: credentials.username,
          password: credentials.password
        }
      })
      const saveData = result.success
        ? (result.data as { success?: boolean; error?: string } | undefined)
        : undefined

      if (result.success && saveData?.success !== false) {
        setIsModified(false)
        showSuccess('ERP 账号密码保存成功')
      } else {
        showError(result.error || saveData?.error || '保存失败')
      }
    } catch (error) {
      showError('保存配置时发生错误')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500 mt-6 pb-12">
      <div className="w-full max-w-xl bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
            <SettingsIcon size={20} className="text-slate-600" />
            ERP 账号配置
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            设置 ERP 系统的登录账号和密码。此配置将存储在数据库中，按用户管理。
          </p>
        </div>

        <div className="p-6 space-y-6 bg-white">
          <div className="w-full max-w-md mx-auto">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <span className="flex items-center gap-2">
                <User size={16} className="text-slate-500" />
                ERP 登录账号
              </span>
            </label>
            <input
              type="text"
              placeholder="输入 ERP 账号"
              value={credentials.username}
              onChange={(e) => {
                setCredentials((prev) => ({ ...prev, username: e.target.value }))
                setIsModified(true)
              }}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
          </div>

          <div className="w-full max-w-md mx-auto">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <span className="flex items-center gap-2">
                <Key size={16} className="text-slate-500" />
                ERP 登录密码
              </span>
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={credentials.password}
              onChange={(e) => {
                setCredentials((prev) => ({ ...prev, password: e.target.value }))
                setIsModified(true)
              }}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
          </div>

          <div className="w-full max-w-md mx-auto pt-6 mt-2 border-t border-slate-100 flex justify-center">
            <button
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white px-8 py-2.5 rounded-lg flex items-center gap-2 font-medium shadow-sm transition-colors"
              onClick={handleSaveCredentials}
              disabled={!isModified}
            >
              <Save size={18} />
              保存并应用配置
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-xl bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
            <RefreshCw size={20} className="text-slate-600" />
            自动更新
          </h2>
        </div>

        <div className="p-6 space-y-6 bg-white">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">当前版本</span>
              <span className="text-sm text-slate-500 flex items-center gap-2">
                v
                {
                  window.electron.process.versions.electron.split(
                    '.'
                  )[0] /* Mocked version for now, ideally grab from package.json or window.api */
                }
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {channel}
                </span>
              </span>
            </div>

            <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-200">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                {status === 'checking' && (
                  <span className="flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin" /> 检查中...
                  </span>
                )}
                {status === 'idle' && version && (
                  <span className="flex items-center gap-2 text-green-600">
                    <CheckCircle size={14} /> 已是最新版本
                  </span>
                )}
                {status === 'available' && (
                  <span className="flex items-center gap-2 text-blue-600">
                    <Info size={14} /> 新版本 v{version} 已就绪
                  </span>
                )}
                {status === 'downloading' && (
                  <span className="flex items-center gap-2 text-blue-600">
                    <RefreshCw size={14} className="animate-spin" /> 正在下载更新...
                  </span>
                )}
                {status === 'downloaded' && (
                  <span className="flex items-center gap-2 text-green-600">
                    <CheckCircle size={14} /> 更新已就绪，请重启安装
                  </span>
                )}
                {status === 'error' && (
                  <span className="flex items-center gap-2 text-red-600">
                    <X size={14} /> 检查更新失败
                  </span>
                )}
              </div>
              <button
                onClick={checkForUpdates}
                disabled={status === 'checking' || status === 'downloading'}
                className="text-sm px-3 py-1.5 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <RefreshCw size={14} className={status === 'checking' ? 'animate-spin' : ''} />
                检查更新
              </button>
            </div>
          </div>

          {isAdmin && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <h3 className="text-sm font-medium text-slate-700 mb-3">更新渠道（仅管理员可见）</h3>
              <div className="space-y-3">
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${channel === 'stable' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <input
                    type="radio"
                    name="channel"
                    value="stable"
                    checked={channel === 'stable'}
                    onChange={() => switchChannel('stable')}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      Stable（稳定版） <span className="text-xs text-blue-600 ml-1">[推荐]</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      经过完整测试的稳定版本，适合生产环境使用
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${channel === 'beta' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <input
                    type="radio"
                    name="channel"
                    value="beta"
                    checked={channel === 'beta'}
                    onChange={() => switchChannel('beta')}
                    className="mt-1"
                    disabled={!availableChannels.includes('beta')}
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      Beta（测试版） <span className="text-xs text-orange-600 ml-1">[新功能]</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      包含最新功能和改进，可能存在未知 Bug
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
