import React, { useState, useCallback, useEffect } from 'react'

/**
 * Material validation result interface
 */
interface ValidationResult {
  materialName: string
  materialCode: string
  specification: string
  model: string
  managerName: string
  isMarkedForDeletion: boolean
  matchedTypeKeyword?: string
}

/**
 * CleanerPage with material validation functionality
 *
 * This component provides the same functionality as the Python MaterialValidationTab:
 * - Material validation from database (full table or filtered by ProductionID)
 * - Checkbox selection for materials to delete
 * - Manager-based filtering (Admin only)
 * - Two-phase deletion: confirm (mark in DB) + execute (delete from ERP)
 */
export const CleanerPage: React.FC = () => {
  // State with sessionStorage persistence
  const [dryRun] = useState(() => {
    const saved = sessionStorage.getItem('cleaner_dryRun')
    return saved ? saved === 'true' : true
  })
  const [validationMode, setValidationMode] = useState<'database_full' | 'database_filtered'>(() => {
    const saved = sessionStorage.getItem('cleaner_validationMode') as 'database_full' | 'database_filtered'
    return saved || 'database_filtered'
  })
  const [useSharedProductionIds, setUseSharedProductionIds] = useState(() => {
    const saved = sessionStorage.getItem('cleaner_useSharedProductionIds')
    return saved ? saved === 'true' : true
  })

  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<{ message: string; progress?: number } | null>(null)
  const [result, setResult] = useState<{
    ordersProcessed: number
    materialsDeleted: number
    materialsSkipped: number
    errors: string[]
    details: Array<{
      orderNumber: string
      materialsDeleted: number
      materialsSkipped: number
      errors: string[]
    }>
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Validation state
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [managers, setManagers] = useState<string[]>([])
  const [selectedManagers, setSelectedManagers] = useState<Set<string>>(new Set())
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUsername, setCurrentUsername] = useState<string>('')
  const [isValidationRunning, setIsValidationRunning] = useState(false)
  const [validationStats, setValidationStats] = useState<{
    totalRecords: number
    matchedCount: number
    markedCount: number
  } | null>(null)

  // Hidden items state (for user mode hide checked feature)
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set())

  // Filter validation results by selected managers and hidden items
  const filteredResults = React.useMemo(() => {
    let results = validationResults
    if (!isAdmin && currentUsername) {
      // Non-admin users only see their own data
      results = results.filter(r => r.managerName === currentUsername || !r.managerName)
    } else if (managers.length > 0 && selectedManagers.size > 0) {
      // Admin users see selected managers' data
      results = results.filter(
        r => selectedManagers.has(r.managerName) || !r.managerName
      )
    }
    // Filter out hidden items
    results = results.filter(r => !hiddenItems.has(r.materialCode))
    return results
  }, [validationResults, isAdmin, currentUsername, managers, selectedManagers, hiddenItems])

  useEffect(() => {
    sessionStorage.setItem('cleaner_dryRun', dryRun.toString())
  }, [dryRun])

  useEffect(() => {
    sessionStorage.setItem('cleaner_validationMode', validationMode)
  }, [validationMode])

  useEffect(() => {
    sessionStorage.setItem('cleaner_useSharedProductionIds', useSharedProductionIds.toString())
  }, [useSharedProductionIds])

  // Shared Production IDs state
  const [sharedProductionIdsCount, setSharedProductionIdsCount] = useState(0)

  // Check admin status and get shared Production IDs on mount
  React.useEffect(() => {
    const initializePage = async () => {
      const admin = await window.electron.auth.isAdmin()
      const user = await window.electron.auth.getCurrentUser()
      setIsAdmin(admin)
      if (user && user.userInfo) {
        setCurrentUsername(user.userInfo.username)
        if (!admin) {
          // Non-admin users can only see their own data
          setSelectedManagers(new Set([user.userInfo.username]))
        }
      }

      // Get shared Production IDs
      try {
        const result = await window.electron.validation.getSharedProductionIds()
        setSharedProductionIdsCount(result.productionIds.length)
      } catch (err) {
        console.error('Failed to get shared Production IDs:', err)
      }
    }
    initializePage()
  }, [])

  // Load managers for filter (Admin only)
  const loadManagers = useCallback(async () => {
    if (!isAdmin) return
    try {
      const response = await window.electron.materials.getManagers()
      setManagers(response.managers)
      // Select all managers by default
      setSelectedManagers(new Set(response.managers))
    } catch (err) {
      console.error('Failed to load managers:', err)
    }
  }, [isAdmin])

  // Handle validation
  const handleValidation = useCallback(async () => {
    setIsValidationRunning(true)
    setError(null)
    setValidationResults([])
    setSelectedItems(new Set())
    setValidationStats(null)

    try {
      const response = await window.electron.validation.validate({
        mode: validationMode,
        useSharedProductionIds: validationMode === 'database_filtered' ? useSharedProductionIds : undefined
      })

      if (response.success && response.results) {
        setValidationResults(response.results)
        setValidationStats(response.stats || null)

        // Auto-select items that are already marked for deletion
        const markedCodes = new Set(
          response.results
            .filter(r => r.isMarkedForDeletion)
            .map(r => r.materialCode)
        )
        setSelectedItems(markedCodes)

        // Auto-select managers for admin users
        if (isAdmin) {
          const uniqueManagers = new Set(
            response.results
              .map(r => r.managerName)
              .filter(Boolean)
          )
          setManagers([...uniqueManagers])
          setSelectedManagers(uniqueManagers)
        }
      } else {
        setError(response.error || '校验失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '校验过程中发生未知错误')
    } finally {
      setIsValidationRunning(false)
    }
  }, [validationMode, useSharedProductionIds, isAdmin])

  // Handle checkbox toggle
  const handleCheckboxToggle = useCallback((materialCode: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(materialCode)) {
        newSet.delete(materialCode)
      } else {
        newSet.add(materialCode)
      }
      return newSet
    })
  }, [])

  // Handle select all
  const handleSelectAll = useCallback(() => {
    setSelectedItems(new Set(filteredResults.map(r => r.materialCode)))
  }, [filteredResults])

  // Handle deselect all
  const handleDeselectAll = useCallback(() => {
    setSelectedItems(new Set())
  }, [])

  // Handle confirm deletion (mark materials in database)
  const handleConfirmDeletion = useCallback(async () => {
    if (validationResults.length === 0) {
      alert('没有可处理的数据')
      return
    }

    // Collect all data
    const materialsToUpsert: { materialCode: string; managerName: string }[] = []
    const materialsToDelete: string[] = []
    const missingManager: string[] = []

    for (const result of validationResults) {
      // Skip empty material codes
      if (!result.materialCode || !result.materialCode.trim()) {
        continue
      }

      const materialCode = result.materialCode.trim()
      const isChecked = selectedItems.has(materialCode)

      if (isChecked) {
        // Checked: needs to be upserted
        if (!result.managerName || !result.managerName.trim()) {
          missingManager.push(materialCode)
        } else {
          materialsToUpsert.push({
            materialCode,
            managerName: result.managerName.trim()
          })
        }
      } else {
        // Unchecked: needs to be deleted
        materialsToDelete.push(materialCode)
      }
    }

    // Validate: checked items must have manager names
    if (missingManager.length > 0) {
      const msg = `以下已勾选的记录缺少负责人信息，无法保存：\n\n` +
        missingManager.slice(0, 10).join('\n') +
        (missingManager.length > 10 ? `\n... 共 ${missingManager.length} 条` : '')
      alert(msg)
      return
    }

    // Check if there's anything to do
    if (materialsToUpsert.length === 0 && materialsToDelete.length === 0) {
      alert('没有需要处理的记录')
      return
    }

    // Build confirmation message
    const confirmParts: string[] = []
    if (materialsToUpsert.length > 0) {
      confirmParts.push(`写入/更新 ${materialsToUpsert.length} 条记录`)
    }
    if (materialsToDelete.length > 0) {
      confirmParts.push(`删除 ${materialsToDelete.length} 条记录`)
    }

    const confirmed = window.confirm(`确认以下操作吗？\n\n${confirmParts.join('\n')}`)
    if (!confirmed) {
      return
    }

    // Execute the operation
    try {
      setIsRunning(true)

      // Upsert selected materials
      let upsertSuccess = 0
      let upsertFailed = 0
      if (materialsToUpsert.length > 0) {
        const upsertResult = await window.electron.materials.upsertBatch(materialsToUpsert)
        if (upsertResult.success) {
          upsertSuccess = upsertResult.stats?.success || 0
          upsertFailed = upsertResult.stats?.failed || 0
        } else {
          throw new Error(upsertResult.error || '写入物料失败')
        }
      }

      // Delete unselected materials
      let deleteCount = 0
      if (materialsToDelete.length > 0) {
        const deleteResult = await window.electron.materials.delete(materialsToDelete)
        if (deleteResult.success) {
          deleteCount = deleteResult.count || 0
        } else {
          throw new Error(deleteResult.error || '删除物料失败')
        }
      }

      // Show result message
      const msgParts: string[] = []
      if (upsertSuccess > 0) {
        msgParts.push(`写入/更新成功：${upsertSuccess} 条`)
      }
      if (upsertFailed > 0) {
        msgParts.push(`写入/更新失败：${upsertFailed} 条`)
      }
      if (deleteCount > 0) {
        msgParts.push(`删除成功：${deleteCount} 条`)
      }

      const msg = `操作完成！\n\n${msgParts.join('\n')}`

      if (upsertFailed > 0) {
        alert(`完成（部分失败）\n\n${msg}`)
      } else {
        alert(msg)
      }

      // Reload managers to reflect changes
      await loadManagers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setIsRunning(false)
    }
  }, [selectedItems, validationResults, loadManagers])

  // Handle execute deletion (清理)
  const handleExecuteDeletion = useCallback(async () => {
    if (!dryRun) {
      const confirmed = window.confirm('警告：正式执行将删除 ERP 系统中的物料数据，是否继续？')
      if (!confirmed) return
    }

    setIsRunning(true)
    setProgress(null)
    setResult(null)
    setError(null)

    try {
      // Get cleaner data from backend (order numbers from shared Production IDs + material codes from DB)
      const cleanerDataResult = await window.electron.validation.getCleanerData()

      if (!cleanerDataResult.success) {
        setError(cleanerDataResult.error || '获取清理数据失败')
        setIsRunning(false)
        return
      }

      const orderNumberList = cleanerDataResult.orderNumbers || []
      const materialCodeList = cleanerDataResult.materialCodes || []

      if (orderNumberList.length === 0) {
        setError('没有订单号数据。请先到数据提取页面输入 Production ID。')
        setIsRunning(false)
        return
      }

      if (materialCodeList.length === 0) {
        setError('没有物料代码数据。请确认已在物料清理界面勾选要删除的物料。')
        setIsRunning(false)
        return
      }

      console.log('[CleanerPage] Starting cleaner with:', {
        orderNumbers: orderNumberList.length,
        materialCodes: materialCodeList.length,
        dryRun
      })

      const response = await window.electron.cleaner.runCleaner({
        orderNumbers: orderNumberList,
        materialCodes: materialCodeList,
        dryRun
      })

      if (response.success && response.data) {
        setResult(response.data)
      } else {
        setError(response.error || '清理失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误')
    } finally {
      setIsRunning(false)
      setProgress(null)
    }
  }, [dryRun])

  // Handle hide checked items (for user mode)
  const handleHideChecked = useCallback(() => {
    const checkedCodes = filteredResults
      .filter(r => selectedItems.has(r.materialCode))
      .map(r => r.materialCode)

    if (checkedCodes.length === 0) {
      setError('没有已勾选的物料')
      return
    }

    setHiddenItems(prev => new Set([...prev, ...checkedCodes]))
  }, [filteredResults, selectedItems])

  // Handle show all items
  const handleShowAll = useCallback(() => {
    setHiddenItems(new Set())
  }, [])

  return (
    <div className="cleaner-page">
      <h1 className="page-title">ERP 物料清理</h1>

      <div className="cleaner-content">
        {/* Validation Section (Admin only for mode selection) */}
        <div className="validation-section">
          <h2>物料校验</h2>

          {isAdmin && (
            <div className="validation-mode-selector">
              <label>
                <input
                  type="radio"
                  checked={validationMode === 'database_full'}
                  onChange={() => setValidationMode('database_full')}
                  disabled={isValidationRunning}
                />
                数据库 - 全表校验
              </label>
              <label>
                <input
                  type="radio"
                  checked={validationMode === 'database_filtered'}
                  onChange={() => setValidationMode('database_filtered')}
                  disabled={isValidationRunning}
                />
                数据库 - ProductionID 过滤
              </label>
              {validationMode === 'database_filtered' && (
                <div style={{ marginTop: '8px', marginLeft: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={useSharedProductionIds}
                      onChange={(e) => setUseSharedProductionIds(e.target.checked)}
                      disabled={isValidationRunning}
                    />
                    使用数据提取页面的 Production ID
                  </label>
                  {useSharedProductionIds && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: sharedProductionIdsCount > 0 ? '#52c41a' : '#fa8c16' }}>
                      {sharedProductionIdsCount > 0
                        ? `当前有 ${sharedProductionIdsCount} 个共享的 Production ID`
                        : '暂无共享的 Production ID，请先在数据提取页面输入'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {!isAdmin && (
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
              当前模式：数据库 - ProductionID 过滤（使用数据提取页面的数据）
            </p>
          )}

          <div className="button-group">
            <button
              className="btn btn-primary"
              onClick={handleValidation}
              disabled={isValidationRunning}
            >
              {isValidationRunning ? '校验中...' : '开始校验'}
            </button>
            {isAdmin && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={handleSelectAll}
                  disabled={filteredResults.length === 0}
                >
                  全选
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleDeselectAll}
                  disabled={selectedItems.size === 0}
                >
                  取消全选
                </button>
              </>
            )}
          </div>

          {validationStats && (
            <div className="validation-stats">
              <span>总记录数：{validationStats.totalRecords}</span>
              <span>匹配到负责人：{validationStats.matchedCount}</span>
              <span>已标记删除：{validationStats.markedCount}</span>
            </div>
          )}
        </div>

        {/* Manager Filter (Admin only) */}
        {isAdmin && managers.length > 0 && (
          <div className="manager-filter-section">
            <h3>筛选（按负责人）</h3>
            <div className="manager-checkboxes">
              {managers.map(manager => (
                <label key={manager}>
                  <input
                    type="checkbox"
                    checked={selectedManagers.has(manager)}
                    onChange={(e) => {
                      setSelectedManagers(prev => {
                        const newSet = new Set(prev)
                        if (e.target.checked) {
                          newSet.add(manager)
                        } else {
                          newSet.delete(manager)
                        }
                        return newSet
                      })
                    }}
                  />
                  {manager}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Validation Results Table */}
        {filteredResults.length > 0 && (
          <div className="validation-results-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>校验结果</h2>
              {/* Action buttons: left group (Hide Checked, Show All, Confirm Delete) + right button (Execute Delete in red) */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!isAdmin && (
                    <>
                      <button
                        className="btn btn-secondary"
                        onClick={handleHideChecked}
                        disabled={selectedItems.size === 0}
                      >
                        隐藏勾选
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={handleShowAll}
                        disabled={hiddenItems.size === 0}
                      >
                        显示全部
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-warning"
                    onClick={handleConfirmDeletion}
                    disabled={selectedItems.size === 0 || isRunning}
                  >
                    确认删除
                  </button>
                </div>
                <button
                  className="btn btn-danger"
                  onClick={handleExecuteDeletion}
                  disabled={isRunning || validationResults.length === 0}
                  style={{ marginLeft: '16px' }}
                >
                  开始清理
                </button>
              </div>
            </div>
            <table className="validation-results-table">
              <thead>
                <tr>
                  <th>选择</th>
                  <th>材料名称</th>
                  <th>材料代码</th>
                  <th>规格</th>
                  <th>型号</th>
                  <th>负责人</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map(result => (
                  <tr key={result.materialCode}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedItems.has(result.materialCode)}
                        onChange={() => handleCheckboxToggle(result.materialCode)}
                      />
                    </td>
                    <td>{result.materialName}</td>
                    <td>{result.materialCode}</td>
                    <td>{result.specification}</td>
                    <td>{result.model}</td>
                    <td>{result.managerName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Progress Section */}
        {progress && (
          <div className="progress-section">
            {progress.progress !== undefined && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress.progress}%` }} />
              </div>
            )}
            <p className="progress-message">{progress.message}</p>
          </div>
        )}

        {/* Error Section */}
        {error && (
          <div className="error-section">
            <h3>错误</h3>
            <div className="error-message" title="双击可选中复制" onDoubleClick={(e) => {
              const text = e.currentTarget.textContent
              navigator.clipboard.writeText(text || '')
            }}>
              {error}
            </div>
            <p className="error-hint">💡 提示：双击错误信息可选中复制</p>
          </div>
        )}

        {/* Result Section */}
        {result && (
          <div className="result-section">
            <h3>清理结果</h3>
            <div className="result-stats">
              <div className="stat-item">
                <span className="stat-label">处理订单数</span>
                <span className="stat-value">{result.ordersProcessed}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">删除物料数</span>
                <span className="stat-value">{result.materialsDeleted}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">跳过物料数</span>
                <span className="stat-value">{result.materialsSkipped}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">错误数</span>
                <span className="stat-value error">{result.errors.length}</span>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="error-list">
                <h4>错误列表</h4>
                <ul>
                  {result.errors.map((err, index) => (
                    <li key={index} className="error-item">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.details.length > 0 && (
              <div className="details-list">
                <h4>订单详情</h4>
                {result.details.map((detail, index) => (
                  <div key={index} className="detail-item">
                    <div className="detail-order">{detail.orderNumber}</div>
                    <div className="detail-stats">
                      <span>删除：{detail.materialsDeleted}</span>
                      <span>跳过：{detail.materialsSkipped}</span>
                    </div>
                    {detail.errors.length > 0 && (
                      <div className="detail-errors">
                        {detail.errors.map((err, i) => (
                          <div key={i} className="detail-error">
                            {err}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {dryRun && (
              <div className="dry-run-notice">
                <strong>提示：</strong> 本次运行为干运行模式，未实际删除任何数据。
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .cleaner-page {
          padding: 24px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .page-title {
          font-size: 24px;
          font-weight: 600;
          color: #333;
          margin-bottom: 24px;
        }
        .cleaner-content {
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          padding: 24px;
        }
        .validation-section, .manager-filter-section {
          margin-bottom: 24px;
          padding-bottom: 24px;
          border-bottom: 1px solid #e8e8e8;
        }
        .validation-section h2, .manager-filter-section h3 {
          font-size: 18px;
          color: #333;
          margin-bottom: 16px;
        }
        .validation-mode-selector {
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .validation-mode-selector label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
          color: #666;
        }
        .button-group {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }
        .btn {
          padding: 10px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-primary {
          background: #52c41a;
          color: #fff;
        }
        .btn-primary:hover:not(:disabled) {
          background: #73d13d;
        }
        .btn-secondary {
          background: #f5f5f5;
          color: #666;
        }
        .btn-secondary:hover:not(:disabled) {
          background: #e8e8e8;
        }
        .btn-warning {
          background: #fa8c16;
          color: #fff;
        }
        .btn-warning:hover:not(:disabled) {
          background: #ffc069;
        }
        .btn-danger {
          background: #ff4d4f;
          color: #fff;
        }
        .btn-danger:hover:not(:disabled) {
          background: #ff7875;
        }
        .validation-stats {
          display: flex;
          gap: 24px;
          padding: 12px;
          background: #f6ffed;
          border: 1px solid #b7eb8f;
          border-radius: 6px;
          font-size: 14px;
          color: #52c41a;
        }
        .validation-stats span {
          font-weight: 500;
        }
        .manager-filter-section {
          background: #fafafa;
          padding: 16px;
          border-radius: 6px;
        }
        .manager-checkboxes {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        .manager-checkboxes label {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font-size: 14px;
          color: #666;
          background: #fff;
          padding: 6px 12px;
          border-radius: 4px;
          border: 1px solid #d9d9d9;
        }
        .validation-results-section {
          margin-bottom: 24px;
        }
        .validation-results-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .validation-results-table th, .validation-results-table td {
          padding: 12px;
          border: 1px solid #e8e8e8;
          text-align: left;
          color: #000;
        }
        .validation-results-table th {
          background: #fafafa;
          font-weight: 600;
          color: #333;
        }
        .validation-results-table tr:nth-child(even) {
          background: #fafafa;
        }
        .validation-results-table tr:hover {
          background: #e6f7ff;
        }
        .progress-section {
          margin-top: 24px;
          padding: 16px;
          background: #f5f5f5;
          border-radius: 6px;
        }
        .progress-bar {
          height: 8px;
          background: #e8e8e8;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #52c41a, #73d13d);
          transition: width 0.3s;
        }
        .progress-message {
          font-size: 14px;
          color: #666;
          margin: 0;
        }
        .error-section {
          margin-top: 24px;
          padding: 16px;
          background: #fff1f0;
          border: 1px solid #ffa39e;
          border-radius: 6px;
        }
        .error-section h3 {
          color: #ff4d4f;
          margin: 0 0 8px 0;
          font-size: 16px;
        }
        .error-message {
          background: #fff;
          padding: 12px;
          border-radius: 4px;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 13px;
          color: #333;
          border: 1px solid #ffccc7;
          user-select: text;
          -webkit-user-select: text;
          cursor: text;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .error-message:hover {
          background: #fffbfc;
        }
        .error-hint {
          color: #999;
          font-size: 12px;
          margin: 8px 0 0 0;
        }
        .result-section {
          margin-top: 24px;
          padding: 16px;
          background: #f6ffed;
          border: 1px solid #b7eb8f;
          border-radius: 6px;
        }
        .result-section h3 {
          color: #52c41a;
          margin: 0 0 16px 0;
          font-size: 16px;
        }
        .result-stats {
          display: flex;
          gap: 24px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .stat-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .stat-label {
          font-size: 12px;
          color: #999;
        }
        .stat-value {
          font-size: 24px;
          font-weight: 600;
          color: #333;
        }
        .stat-value.error {
          color: #ff4d4f;
        }
        .error-list, .details-list {
          margin-top: 16px;
        }
        .error-list h4, .details-list h4 {
          font-size: 14px;
          color: #666;
          margin-bottom: 8px;
        }
        .error-list ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .error-list li {
          padding: 6px 12px;
          background: #fff1f0;
          border-radius: 4px;
          margin-bottom: 4px;
          font-size: 13px;
          color: #ff4d4f;
        }
        .detail-item {
          background: #fff;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 8px;
          border: 1px solid #d9d9d9;
        }
        .detail-order {
          font-weight: 600;
          font-size: 14px;
          color: #333;
          margin-bottom: 8px;
          font-family: 'Consolas', 'Monaco', monospace;
        }
        .detail-stats {
          display: flex;
          gap: 16px;
          font-size: 13px;
          color: #666;
        }
        .detail-stats span {
          background: #f5f5f5;
          padding: 4px 8px;
          border-radius: 4px;
        }
        .detail-errors {
          margin-top: 8px;
        }
        .detail-error {
          font-size: 12px;
          color: #ff4d4f;
          padding: 4px 0;
        }
        .dry-run-notice {
          margin-top: 16px;
          padding: 12px;
          background: #fffbe6;
          border: 1px solid #ffe58f;
          border-radius: 6px;
          font-size: 13px;
          color: #fa8c16;
        }
        @media (max-width: 768px) {
          .input-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}

export default CleanerPage
