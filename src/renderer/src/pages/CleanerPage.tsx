import React, { useState, useEffect } from 'react'
import {
  Play,
  ToggleLeft,
  ToggleRight,
  DatabaseZap,
  Layers,
  Users,
  Search,
  CheckSquare,
  Square,
  EyeOff,
  Eye,
  HardDrive,
  Settings2,
  FileSpreadsheet
} from 'lucide-react'

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

const CleanerPage: React.FC = () => {
  // Authentication & permissions
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUsername, setCurrentUsername] = useState<string>('')

  // State with sessionStorage persistence
  const [dryRun, setDryRun] = useState(() => {
    const saved = sessionStorage.getItem('cleaner_dryRun')
    return saved ? saved === 'true' : true
  })

  const [valMode, setValMode] = useState<'full' | 'filtered'>(() => {
    const saved = sessionStorage.getItem('cleaner_validationMode')
    return saved === 'full' ? 'full' : 'filtered'
  })

  // Validation state
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set())
  const [managers, setManagers] = useState<string[]>([])
  const [selectedManagers, setSelectedManagers] = useState<Set<string>>(new Set())

  // Execution state
  const [isRunning, setIsRunning] = useState(false)
  const [isValidationRunning, setIsValidationRunning] = useState(false)

  // Shared Production IDs state
  const [sharedProductionIdsCount, setSharedProductionIdsCount] = useState(0)
  console.log(sharedProductionIdsCount)

  // Check admin status and get shared Production IDs on mount
  React.useEffect(() => {
    const initializePage = async () => {
      try {
        const admin = await window.electron.auth.isAdmin()
        const user = await window.electron.auth.getCurrentUser()
        setIsAdmin(admin)
        if (user && user.userInfo) {
          setCurrentUsername(user.userInfo.username)
          if (!admin) {
            setSelectedManagers(new Set([user.userInfo.username]))
          }
        }

        // Load managers
        if (admin) {
          const resp = await window.electron.materials.getManagers()
          setManagers(resp.managers)
          setSelectedManagers(new Set(resp.managers))
        }

        // Get shared Production IDs
        const result = await window.electron.validation.getSharedProductionIds()
        setSharedProductionIdsCount(result.productionIds.length)
      } catch (err) {
        console.error('Initialization failed:', err)
      }
    }
    initializePage()
  }, [])

  useEffect(() => {
    sessionStorage.setItem('cleaner_dryRun', dryRun.toString())
  }, [dryRun])

  useEffect(() => {
    sessionStorage.setItem('cleaner_validationMode', valMode)
  }, [valMode])

  // Filter validation results by selected managers and hidden items
  const filteredResults = React.useMemo(() => {
    let results = validationResults
    if (!isAdmin && currentUsername) {
      results = results.filter((r) => r.managerName === currentUsername || !r.managerName)
    } else if (managers.length > 0 && selectedManagers.size > 0) {
      results = results.filter((r) => selectedManagers.has(r.managerName) || !r.managerName)
    }
    results = results.filter((r) => !hiddenItems.has(r.materialCode))
    return results
  }, [validationResults, isAdmin, currentUsername, managers, selectedManagers, hiddenItems])

  // Handlers
  const handleValidation = async () => {
    setIsValidationRunning(true)
    setValidationResults([])
    setSelectedItems(new Set())
    setHiddenItems(new Set())

    try {
      const response = await window.electron.validation.validate({
        mode: valMode === 'full' ? 'database_full' : 'database_filtered',
        useSharedProductionIds: valMode === 'filtered'
      })

      if (response.success && response.results) {
        setValidationResults(response.results)
        const markedCodes = new Set(
          response.results.filter((r) => r.isMarkedForDeletion).map((r) => r.materialCode)
        )
        setSelectedItems(markedCodes)

        if (isAdmin) {
          const uniqueManagers = new Set(response.results.map((r) => r.managerName).filter(Boolean))
          setManagers([...uniqueManagers])
          setSelectedManagers(uniqueManagers)
        }
      } else {
        alert(response.error || '校验失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '校验过程中发生未知错误')
    } finally {
      setIsValidationRunning(false)
    }
  }

  const handleCheckboxToggle = (materialCode: string) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(materialCode)) newSet.delete(materialCode)
      else newSet.add(materialCode)
      return newSet
    })
  }

  const handleConfirmDeletion = async () => {
    // For non-admin users, only process visible filtered results
    // For admin users, process all validation results
    const resultsToProcess = isAdmin ? validationResults : filteredResults

    if (resultsToProcess.length === 0) return alert('没有可处理的数据')

    const materialsToUpsert: { materialCode: string; managerName: string }[] = []
    const materialsToDelete: string[] = []
    const missingManager: string[] = []

    for (const result of resultsToProcess) {
      if (!result.materialCode?.trim()) continue

      const code = result.materialCode.trim()
      if (selectedItems.has(code)) {
        if (!result.managerName?.trim()) missingManager.push(code)
        else materialsToUpsert.push({ materialCode: code, managerName: result.managerName.trim() })
      } else {
        materialsToDelete.push(code)
      }
    }

    if (missingManager.length > 0) {
      alert(
        `以下已勾选的记录缺少负责人信息，无法保存：\n\n${missingManager.slice(0, 10).join('\n')}`
      )
      return
    }

    if (materialsToUpsert.length === 0 && materialsToDelete.length === 0)
      return alert('没有需要处理的记录')

    const confirmParts: string[] = []
    if (materialsToUpsert.length > 0)
      confirmParts.push(`写入/更新 ${materialsToUpsert.length} 条记录`)
    if (materialsToDelete.length > 0) confirmParts.push(`删除 ${materialsToDelete.length} 条记录`)

    if (!window.confirm(`确认以下操作吗？\n\n${confirmParts.join('\n')}`)) return

    try {
      setIsRunning(true)
      const msgParts: string[] = []

      if (materialsToUpsert.length > 0) {
        const res = await window.electron.materials.upsertBatch(materialsToUpsert)
        if (!res.success) throw new Error(res.error || '写入物料失败')
        msgParts.push(`写入/更新成功：${res.stats?.success || 0} 条`)
      }

      if (materialsToDelete.length > 0) {
        const res = await window.electron.materials.delete(materialsToDelete)
        if (!res.success) throw new Error(res.error || '删除物料失败')
        msgParts.push(`删除成功：${res.count || 0} 条`)
      }

      alert(`操作完成！\n\n${msgParts.join('\n')}`)

      // Reload managers if admin
      if (isAdmin) {
        const resp = await window.electron.materials.getManagers()
        setManagers(resp.managers)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    } finally {
      setIsRunning(false)
    }
  }

  const handleExecuteDeletion = async () => {
    if (!dryRun) {
      if (!window.confirm('警告：正式执行将删除 ERP 系统中的物料数据，是否继续？')) return
    }

    setIsRunning(true)
    try {
      const cleanerDataResult = await window.electron.validation.getCleanerData()
      if (!cleanerDataResult.success) {
        throw new Error(cleanerDataResult.error || '获取清理数据失败')
      }

      const orderNumberList = cleanerDataResult.orderNumbers || []
      const materialCodeList = cleanerDataResult.materialCodes || []

      if (orderNumberList.length === 0)
        throw new Error('没有订单号数据。请先到数据提取页面输入 Production ID。')
      if (materialCodeList.length === 0)
        throw new Error('没有物料代码数据。请确认已在物料清理界面确认要删除的物料。')

      const response = await window.electron.cleaner.runCleaner({
        orderNumbers: orderNumberList,
        materialCodes: materialCodeList,
        dryRun
      })

      if (response.success && response.data) {
        let msg = `清理执行完毕:\n处理订单: ${response.data.ordersProcessed}\n删除物料: ${response.data.materialsDeleted}\n跳过物料: ${response.data.materialsSkipped}`
        if (response.data.errors.length) {
          msg += `\n错误: ${response.data.errors.join(', ')}`
        }
        alert(msg)
      } else {
        throw new Error(response.error || '清理失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '发生未知错误')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="h-full flex flex-col xl:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 左栏：数据源与执行控制区 */}
      <div className="xl:w-[380px] flex-shrink-0 flex flex-col gap-5">
        {/* 1. 数据来源选择 (仅 Admin 可见) */}
        {isAdmin && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2 text-slate-800">
              <DatabaseZap size={18} className="text-blue-500" />
              校验数据来源
            </h3>

            <div className="space-y-3">
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${valMode === 'full' ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50 border-slate-200'}`}
              >
                <input
                  type="radio"
                  name="valMode"
                  className="mt-1"
                  checked={valMode === 'full'}
                  onChange={() => setValMode('full')}
                />
                <div>
                  <div className="text-sm font-medium text-slate-800">数据库 - 全表校验</div>
                  <div className="text-xs text-slate-500 mt-0.5">校验数据库中所有待处理物料</div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${valMode === 'filtered' ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50 border-slate-200'}`}
              >
                <input
                  type="radio"
                  name="valMode"
                  className="mt-1"
                  checked={valMode === 'filtered'}
                  onChange={() => setValMode('filtered')}
                />
                <div className="w-full">
                  <div className="text-sm font-medium text-slate-800">
                    数据库 - ProductionID 过滤
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">仅校验指定订单号相关的物料</div>
                  {valMode === 'filtered' && (
                    <div className="mt-3 text-xs text-blue-700 bg-blue-100/50 rounded p-2 flex items-start gap-1.5">
                      <Layers size={14} className="mt-0.5 flex-shrink-0" />
                      <span>
                        自动使用<strong>【数据提取】</strong>模块中共享的订单号列表进行过滤。
                      </span>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>
        )}

        {/* 2. 负责人筛选 (仅 Admin 可见) */}
        {isAdmin && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold flex items-center gap-2 text-slate-800">
                <Users size={18} className="text-indigo-500" />
                筛选 (按负责人)
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedManagers(new Set(managers))}
                  className="text-xs text-blue-600 hover:underline"
                >
                  全选
                </button>
                <button
                  onClick={() => setSelectedManagers(new Set())}
                  className="text-xs text-slate-500 hover:underline"
                >
                  取消全选
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 max-h-[120px] overflow-y-auto pr-1">
              {managers.map((manager) => (
                <label
                  key={manager}
                  className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 p-1.5 rounded"
                >
                  <input
                    type="checkbox"
                    className="rounded text-blue-600"
                    checked={selectedManagers.has(manager)}
                    onChange={(e) => {
                      setSelectedManagers((prev) => {
                        const newSet = new Set(prev)
                        if (e.target.checked) newSet.add(manager)
                        else newSet.delete(manager)
                        return newSet
                      })
                    }}
                  />
                  {manager || '未分配'}
                </label>
              ))}
              {managers.length === 0 && (
                <div className="text-sm text-slate-400">暂无负责人数据</div>
              )}
            </div>
          </div>
        )}

        {/* 3. 基础执行控制区 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mt-auto">
          {isAdmin && (
            <div className="flex items-center justify-between bg-amber-50/50 p-3 rounded-lg border border-amber-200 mb-4">
              <div>
                <div className="font-semibold text-sm text-amber-900">预览模式 (Dry-Run)</div>
                <div className="text-xs text-amber-700/80 mt-0.5">
                  仅执行页面操作定位，不保存更改
                </div>
              </div>
              <button
                onClick={() => setDryRun(!dryRun)}
                className={`transition-colors flex-shrink-0 ml-4 ${dryRun ? 'text-amber-500' : 'text-slate-300'}`}
              >
                {dryRun ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
              </button>
            </div>
          )}

          <div className="space-y-2.5">
            <button
              onClick={handleValidation}
              disabled={isValidationRunning}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-3 rounded-lg font-medium transition-colors shadow-sm flex justify-center items-center gap-2 border border-slate-200 disabled:opacity-50"
            >
              <Search size={18} /> {isValidationRunning ? '正在获取...' : '获取并校验物料状态'}
            </button>
          </div>
        </div>
      </div>

      {/* 右栏：结果表格与工具栏 */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden min-h-[500px]">
        {/* 顶部操作条 */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedItems(new Set(filteredResults.map((r) => r.materialCode)))}
              className="text-xs bg-white border border-slate-300 text-slate-700 px-2.5 py-1.5 rounded shadow-sm hover:bg-slate-50 flex items-center gap-1"
            >
              <CheckSquare size={14} className="text-blue-600" /> 全选
            </button>
            <button
              onClick={() => {
                // Only uncheck items that are visible in filteredResults
                const visibleCodes = new Set(filteredResults.map((r) => r.materialCode))
                setSelectedItems((prev) => {
                  const newSet = new Set(prev)
                  for (const code of visibleCodes) {
                    newSet.delete(code)
                  }
                  return newSet
                })
              }}
              className="text-xs bg-white border border-slate-300 text-slate-700 px-2.5 py-1.5 rounded shadow-sm hover:bg-slate-50 flex items-center gap-1"
            >
              <Square size={14} className="text-slate-400" /> 取消
            </button>

            <div className="w-px h-4 bg-slate-300 mx-1"></div>

            <button
              onClick={() => {
                const checkedCodes = filteredResults
                  .filter((r) => selectedItems.has(r.materialCode))
                  .map((r) => r.materialCode)
                if (checkedCodes.length)
                  setHiddenItems((prev) => new Set([...prev, ...checkedCodes]))
              }}
              className="text-xs bg-white border border-slate-300 text-slate-700 px-2.5 py-1.5 rounded shadow-sm hover:bg-slate-50 flex items-center gap-1"
            >
              <EyeOff size={14} /> 隐藏勾选
            </button>
            <button
              onClick={() => setHiddenItems(new Set())}
              className="text-xs bg-white border border-slate-300 text-slate-700 px-2.5 py-1.5 rounded shadow-sm hover:bg-slate-50 flex items-center gap-1"
            >
              <Eye size={14} /> 显示全部
            </button>

            <div className="w-px h-4 bg-slate-300 mx-1"></div>

            <button
              onClick={handleConfirmDeletion}
              disabled={isRunning || validationResults.length === 0}
              className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded shadow-sm hover:bg-indigo-100 flex items-center gap-1.5 font-medium transition-colors disabled:opacity-50"
            >
              <HardDrive size={14} /> 确认删除 (同步数据库)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button className="text-xs bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded shadow-sm hover:bg-slate-50 flex items-center gap-1.5">
              <Settings2 size={14} /> 类型管理
            </button>
            <button className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded shadow-sm hover:bg-blue-100 flex items-center gap-1.5 font-medium">
              <FileSpreadsheet size={14} /> 导出结果
            </button>
          </div>
        </div>

        {/* 表格区域 */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap table-fixed">
            <thead className="bg-slate-100 text-slate-600 sticky top-0 shadow-sm z-10 text-xs font-semibold">
              <tr>
                <th className="px-4 py-3 w-16 text-center">选择</th>
                <th className="px-4 py-3 w-64">材料名称</th>
                <th className="px-4 py-3">材料代码</th>
                <th className="px-4 py-3">规格</th>
                <th className="px-4 py-3">型号</th>
                <th className="px-4 py-3 w-40">
                  负责人 <span className="text-[10px] font-normal text-slate-400">(双击编辑)</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                    {validationResults.length === 0
                      ? '暂无数据，请点击左侧按钮获取并校验物料'
                      : '当前筛选条件下暂无数据'}
                  </td>
                </tr>
              ) : (
                filteredResults.map((result) => {
                  const isChecked = selectedItems.has(result.materialCode)
                  const trClass = isChecked ? 'bg-blue-50/30' : 'hover:bg-slate-50'
                  const noManager = !result.managerName?.trim()
                  const managerCellClass = noManager
                    ? 'text-amber-500 text-xs italic'
                    : 'text-slate-700'

                  return (
                    <tr
                      key={result.materialCode}
                      className={`${trClass} transition-colors ${noManager && isChecked ? 'bg-amber-50/20' : ''}`}
                    >
                      <td className="px-4 py-3 text-center truncate">
                        {isChecked ? (
                          <CheckSquare
                            onClick={() => handleCheckboxToggle(result.materialCode)}
                            size={16}
                            className="text-blue-600 inline cursor-pointer"
                          />
                        ) : (
                          <Square
                            onClick={() => handleCheckboxToggle(result.materialCode)}
                            size={16}
                            className="text-slate-300 inline cursor-pointer"
                          />
                        )}
                      </td>
                      <td
                        className="px-4 py-3 font-medium text-slate-800 truncate"
                        title={result.materialName}
                      >
                        {result.materialName}
                      </td>
                      <td
                        className="px-4 py-3 font-mono text-xs text-slate-600 truncate"
                        title={result.materialCode}
                      >
                        {result.materialCode}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-500 text-xs truncate"
                        title={result.specification}
                      >
                        {result.specification || '-'}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-500 text-xs truncate"
                        title={result.model}
                      >
                        {result.model || '-'}
                      </td>
                      <td
                        className={`px-4 py-3 truncate ${managerCellClass}`}
                        title={result.managerName || '空(待分配)'}
                      >
                        {result.managerName || '空(待分配)'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 底部状态与执行区 */}
        <div className="bg-white border-t border-slate-200 p-4 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600 font-medium">
              共计 {filteredResults.length} 条记录 | 已选中{' '}
              <span className="text-blue-600">{selectedItems.size}</span> 条
            </div>
            {isAdmin && dryRun && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded border border-amber-200">
                当前为预览模式
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setValidationResults([])
                setSelectedItems(new Set())
                setHiddenItems(new Set())
              }}
              className="text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              重置列表
            </button>
            <button
              onClick={handleExecuteDeletion}
              disabled={isRunning || validationResults.length === 0}
              className={`${isAdmin && dryRun ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700 shadow-red-500/30'} text-white px-8 py-2.5 rounded-lg font-medium shadow-md transition-all flex items-center gap-2 disabled:opacity-50`}
            >
              <Play size={18} fill="currentColor" />{' '}
              {isAdmin && dryRun ? '开始预览执行' : '正式执行 ERP 清理'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CleanerPage
