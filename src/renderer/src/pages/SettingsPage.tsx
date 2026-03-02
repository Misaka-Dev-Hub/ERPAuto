import React, { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Save } from 'lucide-react'

interface Settings {
  erp: {
    url?: string
    username?: string
    password?: string
  }
}

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<Settings>({
    erp: {
      url: '',
      username: '',
      password: ''
    }
  })

  const [isModified, setIsModified] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info'
    text: string
  } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setIsLoading(true)
      const config = await window.electron.settings.getSettings()
      setSettings(config as unknown as Settings)
      setIsModified(false)
    } catch (error) {
      showMessage('error', '加载设置失败')
    } finally {
      setIsLoading(false)
    }
  }

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const updateSettings = (category: string, key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...(prev as any)[category],
        [key]: value
      }
    }))
    setIsModified(true)
  }

  const handleSaveSettings = async () => {
    try {
      const result = await window.electron.settings.saveSettings(settings as any)
      if (result.success) {
        setIsModified(false)
        showMessage('success', '设置保存成功')
      } else {
        showMessage('error', result.error || '保存失败')
      }
    } catch (error) {
      showMessage('error', '保存设置时发生错误')
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
    <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 mt-6">
      {message && (
        <div
          className={`fixed top-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-[10000] text-sm font-medium transition-all ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
            <SettingsIcon size={20} className="text-slate-600" />
            环境与认证配置
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            设置 ERP 系统的入口地址及自动化登录凭证。此配置将自动同步至本地 <code>.env</code> 文件。
          </p>
        </div>

        <div className="p-6 space-y-6 bg-white">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              ERP 基础访问地址 (URL)
            </label>
            <input
              type="url"
              placeholder="https://erp.example.com"
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              value={settings.erp?.url || ''}
              onChange={(e) => updateSettings('erp', 'url', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                登录账号 (Username)
              </label>
              <input
                type="text"
                placeholder="输入 ERP 账号"
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                value={settings.erp?.username || ''}
                onChange={(e) => updateSettings('erp', 'username', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                登录密码 (Password)
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                value={settings.erp?.password || ''}
                onChange={(e) => updateSettings('erp', 'password', e.target.value)}
              />
            </div>
          </div>

          <div className="pt-6 mt-2 border-t border-slate-100 flex justify-end">
            <button
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white px-8 py-2.5 rounded-lg flex items-center gap-2 font-medium shadow-sm transition-colors"
              onClick={handleSaveSettings}
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
