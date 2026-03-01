/**
 * Settings Page
 *
 * System settings configuration page with user type-based access control
 * Admin users see all settings, User users see limited settings
 */

import React, { useState, useEffect } from 'react'
import type {
  SettingsData,
  UserType,
  DatabaseType,
  MatchMode,
  ValidationDataSource
} from '../../../main/types/settings.types'

// Default settings
const DEFAULT_SETTINGS: SettingsData = {
  erp: {
    url: 'https://68.11.34.30:8082/',
    username: '',
    password: '',
    headless: true,
    ignoreHttpsErrors: true,
    autoCloseBrowser: true
  },
  database: {
    dbType: 'mysql',
    server: '',
    mysqlHost: '192.168.31.83',
    mysqlPort: 3306,
    database: 'BLD_DB',
    username: 'remote_user',
    password: ''
  },
  paths: {
    dataDir: 'D:/python/playwrite/data/',
    defaultOutput: '离散备料计划维护_合并.xlsx',
    validationOutput: '物料状态校验结果.xlsx'
  },
  extraction: {
    batchSize: 100,
    verbose: true,
    autoConvert: true,
    mergeBatches: true,
    enableDbPersistence: true
  },
  validation: {
    dataSource: 'database_full',
    batchSize: 2000,
    matchMode: 'substring',
    enableCrud: false,
    defaultManager: ''
  },
  ui: {
    fontFamily: 'Microsoft YaHei UI',
    fontSize: 10,
    productionIdInputWidth: 20
  },
  execution: {
    dryRun: false
  }
}

const SettingsPage: React.FC = () => {
  // User type state
  const [userType, setUserType] = useState<UserType>('Guest')

  // Settings state
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)

  // UI state
  const [isModified, setIsModified] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Password visibility state for User ERP credentials
  const [showPassword, setShowPassword] = useState(false)

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  /**
   * Load user type and settings from main process
   */
  const loadSettings = async () => {
    setIsLoading(true)
    try {
      // Get user type
      const type = await window.electron.settings.getUserType()
      setUserType(type)

      // Get settings (filtered by user type)
      const loadedSettings = await window.electron.settings.getSettings()
      setSettings(loadedSettings)
    } catch (error) {
      console.error('Failed to load settings:', error)
      showMessage('加载设置失败', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Show a message to user
   */
  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  /**
   * Update settings and mark as modified
   */
  const updateSettings = (
    section: keyof SettingsData,
    key: string,
    value: unknown
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }))
    setIsModified(true)
  }

  /**
   * Test ERP connection
   */
  const handleTestErpConnection = async () => {
    try {
      const result = await window.electron.settings.testErpConnection()
      if (result.success) {
        showMessage(result.message || 'ERP 连接测试成功！', 'success')
      } else {
        showMessage(result.message || 'ERP 连接测试失败', 'error')
      }
    } catch (error) {
      console.error('ERP connection test error:', error)
      showMessage('ERP 连接测试失败', 'error')
    }
  }

  /**
   * Test database connection
   */
  const handleTestDbConnection = async () => {
    try {
      const result = await window.electron.settings.testDbConnection()
      if (result.success) {
        showMessage(result.message || '数据库连接测试成功！', 'success')
      } else {
        showMessage(result.message || '数据库连接测试失败', 'error')
      }
    } catch (error) {
      console.error('Database connection test error:', error)
      showMessage('数据库连接测试失败', 'error')
    }
  }

  /**
   * Save settings
   */
  const handleSaveSettings = async () => {
    try {
      const result = await window.electron.settings.saveSettings(settings)
      if (result.success) {
        showMessage('设置已保存', 'success')
        setIsModified(false)
      } else {
        showMessage(result.error || '保存设置失败', 'error')
      }
    } catch (error) {
      console.error('Save settings error:', error)
      showMessage('保存设置失败', 'error')
    }
  }

  /**
   * Reset to default settings (Admin only)
   */
  const handleResetDefaults = async () => {
    if (!window.confirm('确定要恢复默认设置吗？这将覆盖 .env 文件中的所有配置。')) {
      return
    }

    try {
      const result = await window.electron.settings.resetDefaults()
      if (result.success) {
        showMessage('已恢复默认设置', 'success')
        const loadedSettings = await window.electron.settings.getSettings()
        setSettings(loadedSettings)
        setIsModified(false)
      } else {
        showMessage(result.error || '恢复默认设置失败', 'error')
      }
    } catch (error) {
      console.error('Reset defaults error:', error)
      showMessage('恢复默认设置失败', 'error')
    }
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
        <style>{`
          .loading-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: #f5f7fa;
          }
          .loading-content {
            text-align: center;
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #e8e8e8;
            border-top-color: #1890ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  const isUserOnly = userType === 'User'

  return (
    <div className="settings-page">
      {/* Header */}
      <div className="settings-header">
        <h1>系统设置</h1>
        <span className="user-type-badge">
          当前用户类型：{userType === 'Admin' ? '管理员' : userType === 'User' ? '普通用户' : '访客'}
        </span>
      </div>

      {/* Message toast */}
      {message && (
        <div className={`toast toast-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Settings content */}
      <div className="settings-content">
        {/* Admin: ERP System Configuration */}
        {userType === 'Admin' && (
          <>
            <div className="settings-group">
              <h2 className="settings-group-title">ERP 系统配置</h2>
              <div className="settings-form">
                <div className="form-row">
                  <label className="form-label">ERP URL:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.erp.url}
                    onChange={(e) => updateSettings('erp', 'url', e.target.value)}
                    placeholder="https://68.11.34.30:8082/"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">用户名:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.erp.username}
                    onChange={(e) => updateSettings('erp', 'username', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">密码:</label>
                  <input
                    type="password"
                    className="form-input"
                    value={settings.erp.password}
                    onChange={(e) => updateSettings('erp', 'password', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Database Configuration */}
            <div className="settings-group">
              <h2 className="settings-group-title">数据库配置</h2>
              <div className="settings-form">
                <div className="form-row">
                  <label className="form-label">数据库类型:</label>
                  <select
                    className="form-select"
                    value={settings.database.dbType}
                    onChange={(e) => updateSettings('database', 'dbType', e.target.value as DatabaseType)}
                  >
                    <option value="sqlserver">SQL Server</option>
                    <option value="mysql">MySQL</option>
                  </select>
                </div>

                {settings.database.dbType === 'mysql' ? (
                  <>
                    <div className="form-row">
                      <label className="form-label">MySQL 主机:</label>
                      <input
                        type="text"
                        className="form-input"
                        value={settings.database.mysqlHost}
                        onChange={(e) => updateSettings('database', 'mysqlHost', e.target.value)}
                      />
                    </div>
                    <div className="form-row">
                      <label className="form-label">MySQL 端口:</label>
                      <input
                        type="number"
                        className="form-input"
                        value={settings.database.mysqlPort}
                        onChange={(e) => updateSettings('database', 'mysqlPort', parseInt(e.target.value) || 3306)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="form-row">
                    <label className="form-label">SQL Server 服务器:</label>
                    <input
                      type="text"
                      className="form-input"
                      value={settings.database.server}
                      onChange={(e) => updateSettings('database', 'server', e.target.value)}
                    />
                  </div>
                )}

                <div className="form-row">
                  <label className="form-label">数据库名:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.database.database}
                    onChange={(e) => updateSettings('database', 'database', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">数据库用户名:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.database.username}
                    onChange={(e) => updateSettings('database', 'username', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">数据库密码:</label>
                  <input
                    type="password"
                    className="form-input"
                    value={settings.database.password}
                    onChange={(e) => updateSettings('database', 'password', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Browser Settings */}
            <div className="settings-group">
              <h2 className="settings-group-title">浏览器设置</h2>
              <div className="settings-form">
                <div className="form-row checkbox-row">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.erp.headless}
                      onChange={(e) => updateSettings('erp', 'headless', e.target.checked)}
                    />
                    <span>无头模式 (不显示浏览器)</span>
                  </label>
                </div>
                <div className="form-row checkbox-row">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.erp.ignoreHttpsErrors}
                      onChange={(e) => updateSettings('erp', 'ignoreHttpsErrors', e.target.checked)}
                    />
                    <span>忽略 HTTPS 错误</span>
                  </label>
                </div>
                <div className="form-row checkbox-row">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.erp.autoCloseBrowser}
                      onChange={(e) => updateSettings('erp', 'autoCloseBrowser', e.target.checked)}
                    />
                    <span>操作完成后自动关闭浏览器</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Paths Configuration */}
            <div className="settings-group">
              <h2 className="settings-group-title">路径设置</h2>
              <div className="settings-form">
                <div className="form-row">
                  <label className="form-label">数据目录:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.paths.dataDir}
                    onChange={(e) => updateSettings('paths', 'dataDir', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">默认输出文件:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.paths.defaultOutput}
                    onChange={(e) => updateSettings('paths', 'defaultOutput', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">校验输出文件:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.paths.validationOutput}
                    onChange={(e) => updateSettings('paths', 'validationOutput', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Extraction Settings */}
            <div className="settings-group">
              <h2 className="settings-group-title">数据提取设置</h2>
              <div className="settings-form">
                <div className="form-row">
                  <label className="form-label">批次大小:</label>
                  <input
                    type="number"
                    className="form-input input-small"
                    value={settings.extraction.batchSize}
                    onChange={(e) => updateSettings('extraction', 'batchSize', parseInt(e.target.value) || 100)}
                    min="10"
                    max="500"
                  />
                </div>
                <div className="form-row checkbox-row">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.extraction.verbose}
                      onChange={(e) => updateSettings('extraction', 'verbose', e.target.checked)}
                    />
                    <span>启用详细日志</span>
                  </label>
                </div>
                <div className="form-row checkbox-row">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.extraction.autoConvert}
                      onChange={(e) => updateSettings('extraction', 'autoConvert', e.target.checked)}
                    />
                    <span>自动转换 Excel 格式</span>
                  </label>
                </div>
                <div className="form-row checkbox-row">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.extraction.mergeBatches}
                      onChange={(e) => updateSettings('extraction', 'mergeBatches', e.target.checked)}
                    />
                    <span>自动合并批次数据</span>
                  </label>
                </div>
                <div className="form-row checkbox-row">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.extraction.enableDbPersistence}
                      onChange={(e) => updateSettings('extraction', 'enableDbPersistence', e.target.checked)}
                    />
                    <span>保存到数据库</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Validation Settings */}
            <div className="settings-group">
              <h2 className="settings-group-title">物料校验设置</h2>
              <div className="settings-form">
                <div className="form-row">
                  <label className="form-label">默认数据源:</label>
                  <select
                    className="form-select"
                    value={settings.validation.dataSource}
                    onChange={(e) => updateSettings('validation', 'dataSource', e.target.value as ValidationDataSource)}
                  >
                    <option value="database_full">database_full</option>
                    <option value="database_filtered">database_filtered</option>
                    <option value="excel_existing">excel_existing</option>
                    <option value="excel_full">excel_full</option>
                  </select>
                </div>
                <div className="form-row checkbox-row">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.validation.enableCrud}
                      onChange={(e) => updateSettings('validation', 'enableCrud', e.target.checked)}
                    />
                    <span>启用 CRUD 操作（管理待删除物料）</span>
                  </label>
                </div>
                <div className="form-row">
                  <label className="form-label">批次大小:</label>
                  <input
                    type="number"
                    className="form-input input-small"
                    value={settings.validation.batchSize}
                    onChange={(e) => updateSettings('validation', 'batchSize', parseInt(e.target.value) || 2000)}
                    min="100"
                    max="2000"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">匹配模式:</label>
                  <select
                    className="form-select"
                    value={settings.validation.matchMode}
                    onChange={(e) => updateSettings('validation', 'matchMode', e.target.value as MatchMode)}
                  >
                    <option value="substring">模糊匹配 (substring)</option>
                    <option value="exact">精确匹配 (exact)</option>
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">默认负责人:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.validation.defaultManager}
                    onChange={(e) => updateSettings('validation', 'defaultManager', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* UI Settings */}
            <div className="settings-group">
              <h2 className="settings-group-title">界面设置</h2>
              <div className="settings-form">
                <div className="form-row">
                  <label className="form-label">字体:</label>
                  <select
                    className="form-select"
                    value={settings.ui.fontFamily}
                    onChange={(e) => updateSettings('ui', 'fontFamily', e.target.value)}
                  >
                    <option value="Microsoft YaHei UI">Microsoft YaHei UI</option>
                    <option value="SimSun">SimSun (宋体)</option>
                    <option value="KaiTi">KaiTi (楷体)</option>
                    <option value="FangSong">FangSong (仿宋)</option>
                    <option value="Arial">Arial</option>
                    <option value="Segoe UI">Segoe UI</option>
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">字号:</label>
                  <input
                    type="number"
                    className="form-input input-small"
                    value={settings.ui.fontSize}
                    onChange={(e) => updateSettings('ui', 'fontSize', parseInt(e.target.value) || 10)}
                    min="8"
                    max="24"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Production ID 输入框宽度 (字符):</label>
                  <input
                    type="number"
                    className="form-input input-small"
                    value={settings.ui.productionIdInputWidth}
                    onChange={(e) => updateSettings('ui', 'productionIdInputWidth', parseInt(e.target.value) || 20)}
                    min="10"
                    max="100"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* User: ERP Credentials */}
        {isUserOnly && (
          <>
            <div className="settings-group">
              <h2 className="settings-group-title">ERP 登录凭据</h2>
              <div className="settings-form">
                <div className="form-row">
                  <label className="form-label">ERP 用户名:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.erp.username}
                    onChange={(e) => updateSettings('erp', 'username', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">ERP 密码:</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      value={settings.erp.password}
                      onChange={(e) => updateSettings('erp', 'password', e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <label className="form-checkbox-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={showPassword}
                        onChange={(e) => setShowPassword(e.target.checked)}
                      />
                      <span>显示密码</span>
                    </label>
                  </div>
                </div>
                <div className="form-row">
                  <p className="form-hint">
                    提示：此凭据为共享配置，修改后所有用户将使用新的 ERP 账号。
                  </p>
                </div>
              </div>
            </div>

            {/* Paths Configuration (User) */}
            <div className="settings-group">
              <h2 className="settings-group-title">路径设置</h2>
              <div className="settings-form">
                <div className="form-row">
                  <label className="form-label">数据目录:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.paths.dataDir}
                    onChange={(e) => updateSettings('paths', 'dataDir', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">默认输出文件:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.paths.defaultOutput}
                    onChange={(e) => updateSettings('paths', 'defaultOutput', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">校验输出文件:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.paths.validationOutput}
                    onChange={(e) => updateSettings('paths', 'validationOutput', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Execution Settings (User) */}
            <div className="settings-group">
              <h2 className="settings-group-title">执行设置</h2>
              <div className="settings-form">
                <div className="form-row checkbox-row">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.execution.dryRun}
                      onChange={(e) => updateSettings('execution', 'dryRun', e.target.checked)}
                    />
                    <span>预览模式 (执行删除时不保存更改)</span>
                  </label>
                </div>
                <div className="form-row">
                  <p className="form-hint">
                    提示：勾选后，执行删除操作时将只预览不实际保存，用于测试流程。
                  </p>
                </div>
                <div className="form-row checkbox-row">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.erp.headless}
                      onChange={(e) => updateSettings('erp', 'headless', e.target.checked)}
                    />
                    <span>无头模式 (不显示浏览器)</span>
                  </label>
                </div>
                <div className="form-row">
                  <p className="form-hint">
                    提示：勾选后浏览器将在后台运行，不显示窗口。
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Button Group */}
      <div className="settings-buttons">
        <button className="btn btn-primary" onClick={handleTestErpConnection}>
          测试 ERP 连接
        </button>
        <button className="btn btn-primary" onClick={handleTestDbConnection}>
          测试数据库连接
        </button>
        <button
          className="btn btn-success"
          onClick={handleSaveSettings}
          disabled={!isModified}
        >
          保存设置
        </button>
        {userType === 'Admin' && (
          <button className="btn btn-warning" onClick={handleResetDefaults}>
            恢复默认
          </button>
        )}
      </div>

      {/* Styles */}
      <style>{`
        .settings-page {
          padding: 24px;
          background: #f5f7fa;
          min-height: 100vh;
        }

        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 2px solid #e8e8e8;
        }

        .settings-header h1 {
          font-size: 24px;
          color: #333;
          margin: 0;
        }

        .user-type-badge {
          background: #e6f7ff;
          color: #1890ff;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 14px;
        }

        .toast {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 14px;
          z-index: 10000;
          animation: slideDown 0.3s ease-out;
        }

        .toast-success {
          background: #f6ffed;
          border: 1px solid #b7eb8f;
          color: #52c41a;
        }

        .toast-error {
          background: #fff1f0;
          border: 1px solid #ffa39e;
          color: #ff4d4f;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translate(-50%, -20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }

        .settings-content {
          max-width: 900px;
          margin: 0 auto;
        }

        .settings-group {
          background: #fff;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .settings-group-title {
          font-size: 18px;
          color: #333;
          margin: 0 0 16px 0;
          padding-bottom: 12px;
          border-bottom: 1px solid #e8e8e8;
        }

        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .form-row {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .form-label {
          min-width: 120px;
          font-size: 14px;
          color: #666;
          text-align: right;
        }

        .form-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          font-size: 14px;
          transition: all 0.3s;
        }

        .form-input:focus {
          outline: none;
          border-color: #1890ff;
          box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
        }

        .form-input.input-small {
          width: 100px;
          flex: none;
        }

        .form-select {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          font-size: 14px;
          background: #fff;
          cursor: pointer;
        }

        .form-select:focus {
          outline: none;
          border-color: #1890ff;
        }

        .checkbox-row {
          justify-content: flex-start;
        }

        .form-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
          color: #333;
        }

        .form-checkbox-label input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .form-hint {
          color: #999;
          font-size: 12px;
          margin: 4px 0 0 136px;
        }

        .settings-buttons {
          display: flex;
          gap: 12px;
          justify-content: center;
          padding: 24px;
          margin-top: 20px;
        }

        .btn {
          padding: 10px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #1890ff;
          color: #fff;
        }

        .btn-primary:hover:not(:disabled) {
          background: #40a9ff;
        }

        .btn-success {
          background: #52c41a;
          color: #fff;
        }

        .btn-success:hover:not(:disabled) {
          background: #73d13d;
        }

        .btn-warning {
          background: #faad14;
          color: #fff;
        }

        .btn-warning:hover:not(:disabled) {
          background: #ffc53d;
        }
      `}</style>
    </div>
  )
}

export default SettingsPage
