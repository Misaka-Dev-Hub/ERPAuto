import React, { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Save, User, Key } from 'lucide-react'
import { showSuccess, showError } from '../stores/useAppStore'

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

  useEffect(() => {
    loadCredentials()
  }, [])

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
    } catch {
      showError('加载 ERP 配置失败')
    } finally {
      setIsLoading(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
    } catch {
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
    <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-500 mt-6">
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
    </div>
  )
}

export default SettingsPage
