import React from 'react'
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
import MaterialTypeManagementDialog from '../components/MaterialTypeManagementDialog'
import ExecutionReportDialog from '../components/ExecutionReportDialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useCleaner } from '../hooks/useCleaner'

const CleanerPage: React.FC = () => {
  const typeManagementButtonRef = React.useRef<HTMLButtonElement>(null)
  const executeButtonRef = React.useRef<HTMLButtonElement>(null)

  const {
    isAdmin,
    currentUsername,
    dryRun,
    setDryRun,
    valMode,
    setValMode,
    validationResults,
    selectedItems,
    setSelectedItems,
    setHiddenItems,
    managers,
    selectedManagers,
    setSelectedManagers,
    isRunning,
    isExecuting,
    isValidationRunning,
    isExporting,
    isTypeDialogOpen,
    setIsTypeDialogOpen,
    headless,
    setHeadless,
    queryBatchSize,
    setQueryBatchSize,
    processConcurrency,
    setProcessConcurrency,
    showSettingsMenu,
    setShowSettingsMenu,
    filteredResults,
    isReportDialogOpen,
    setIsReportDialogOpen,
    reportData,
    editingCell,
    editValue,
    setEditValue,
    inputRef,
    startEdit,
    saveEdit,
    cancelEdit,
    handleAssignManagerOnSelect,
    progress,
    startTime,
    handleValidation,
    handleCheckboxToggle,
    handleConfirmDeletion,
    handleExecuteDeletion,
    handleExportResults,
    confirmDialog
  } = useCleaner()

  return (
    <div className="h-full flex flex-col xl:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 左栏：数据源与执行控制区 (仅 Admin 可见) */}
      {isAdmin && (
        <div className="w-full xl:w-[380px] flex-shrink-0 flex flex-col gap-5 xl:self-start overflow-auto">
          {/* 1. 数据来源选择 */}
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

          {/* 2. 负责人筛选 */}
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
        </div>
      )}

      {/* 右栏：结果表格与工具栏 */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        {/* 获取物料状态按钮 */}
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <button
            onClick={handleValidation}
            disabled={isValidationRunning}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-3 rounded-lg font-medium transition-colors shadow-sm flex justify-center items-center gap-2 border border-slate-200 disabled:opacity-50"
          >
            <Search size={18} /> {isValidationRunning ? '正在获取...' : '获取并校验物料状态'}
          </button>
        </div>

        {/* 顶部操作条 */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center flex-shrink-0">
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
            <button
              onClick={() => setIsTypeDialogOpen(true)}
              ref={typeManagementButtonRef}
              className="text-xs bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded shadow-sm hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Settings2 size={14} /> 类型管理
            </button>
            <button
              onClick={handleExportResults}
              disabled={isExporting || filteredResults.length === 0}
              className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded shadow-sm hover:bg-blue-100 flex items-center gap-1.5 font-medium disabled:opacity-50"
            >
              <FileSpreadsheet size={14} /> {isExporting ? '导出中...' : '导出结果'}
            </button>
          </div>
        </div>

        {/* 表格区域 */}
        <div className="flex-1 overflow-y-auto">
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
                filteredResults.map((result, rowIndex) => {
                  const isChecked = selectedItems.has(result.materialCode)
                  const trClass = isChecked ? 'bg-blue-50/30' : 'hover:bg-slate-50'
                  const noManager = !result.managerName?.trim()
                  const managerCellClass = noManager
                    ? 'text-amber-500 text-xs italic'
                    : 'text-slate-700'
                  const isEditingManager =
                    editingCell?.rowIndex === rowIndex && editingCell?.field === 'managerName'

                  return (
                    <tr
                      key={result.materialCode}
                      className={`${trClass} transition-colors ${noManager && isChecked ? 'bg-amber-50/20' : ''}`}
                    >
                      <td className="px-4 py-3 text-center truncate">
                        {isChecked ? (
                          <CheckSquare
                            onClick={() => {
                              handleCheckboxToggle(result.materialCode)
                              if (!isAdmin) {
                                handleAssignManagerOnSelect(result.materialCode)
                              }
                            }}
                            size={16}
                            className="text-blue-600 inline cursor-pointer"
                          />
                        ) : (
                          <Square
                            onClick={() => {
                              handleCheckboxToggle(result.materialCode)
                              if (!isAdmin) {
                                handleAssignManagerOnSelect(result.materialCode)
                              }
                            }}
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
                        title={result.managerName || '空 (待分配)'}
                      >
                        {isAdmin && isEditingManager ? (
                          <select
                            ref={inputRef as React.Ref<HTMLSelectElement>}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit()
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                          >
                            <option value="">选择负责人</option>
                            {managers.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        ) : isAdmin ? (
                          <div
                            className="min-h-[24px] cursor-text"
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              startEdit(rowIndex, 'managerName')
                            }}
                          >
                            {result.managerName || (
                              <span className="text-slate-400 italic">双击编辑</span>
                            )}
                          </div>
                        ) : (
                          result.managerName || '空 (待分配)'
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 底部状态与执行区 */}
        <div className="bg-white border-t border-slate-200 p-4 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600 font-medium">
              共计 {filteredResults.length} 条记录 | 已选中{' '}
              <span className="text-blue-600">{selectedItems.size}</span> 条
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative" data-settings-menu>
              <button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className="text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 px-5 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Settings2 size={16} /> 执行设置
              </button>
              {showSettingsMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-lg border border-slate-200 py-3 px-4 min-w-[280px] z-50">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-800">预览模式 (Dry-Run)</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          仅执行页面操作定位，不保存更改
                        </div>
                      </div>
                      <button
                        onClick={() => setDryRun(!dryRun)}
                        className={`transition-colors flex-shrink-0 ml-4 ${dryRun ? 'text-amber-500' : 'text-slate-300'}`}
                      >
                        {dryRun ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                      </button>
                    </div>
                    <div className="border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            后台模式 (Headless)
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            浏览器在后台运行，不显示界面
                          </div>
                        </div>
                        <button
                          onClick={() => setHeadless(!headless)}
                          className={`transition-colors flex-shrink-0 ml-4 ${headless ? 'text-blue-500' : 'text-slate-300'}`}
                        >
                          {headless ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-slate-100 pt-3 space-y-3">
                      <div>
                        <div className="text-sm font-medium text-slate-800">批量查询数量</div>
                        <div className="text-xs text-slate-500 mt-0.5">每批查询订单数，范围 1-100</div>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={queryBatchSize}
                          onChange={(e) => {
                            const raw = Number(e.target.value)
                            if (!Number.isFinite(raw)) return
                            setQueryBatchSize(Math.max(1, Math.min(100, Math.trunc(raw))))
                          }}
                          className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">并行处理数量</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          同时处理详情页数量，范围 1-20
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={processConcurrency}
                          onChange={(e) => {
                            const raw = Number(e.target.value)
                            if (!Number.isFinite(raw)) return
                            setProcessConcurrency(Math.max(1, Math.min(20, Math.trunc(raw))))
                          }}
                          className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleExecuteDeletion}
              ref={executeButtonRef}
              disabled={isRunning}
              className={`${dryRun ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700 shadow-red-500/30'} text-white px-8 py-2.5 rounded-lg font-medium shadow-md transition-all flex items-center gap-2 disabled:opacity-50 w-[300px] justify-center`}
            >
              <Play size={18} fill="currentColor" /> {dryRun ? '开始预览执行' : '正式执行 ERP 清理'}
            </button>
          </div>
        </div>
      </div>

      {/* Material Type Management Dialog */}
      <MaterialTypeManagementDialog
        isOpen={isTypeDialogOpen}
        onClose={() => setIsTypeDialogOpen(false)}
        isAdmin={isAdmin}
        currentUsername={currentUsername}
        triggerRef={typeManagementButtonRef}
      />

      {/* Execution Report Dialog */}
      <ExecutionReportDialog
        isOpen={isReportDialogOpen}
        onClose={() => setIsReportDialogOpen(false)}
        ordersProcessed={reportData?.ordersProcessed}
        materialsDeleted={reportData?.materialsDeleted}
        materialsSkipped={reportData?.materialsSkipped}
        errors={reportData?.errors}
        dryRun={dryRun}
        isExecuting={isExecuting}
        progress={progress}
        startTime={startTime}
        triggerRef={executeButtonRef}
        retriedOrders={reportData?.retriedOrders}
        successfulRetries={reportData?.successfulRetries}
      />

      {/* Confirmation Dialog */}
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </div>
  )
}

export default CleanerPage
