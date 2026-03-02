import React from 'react'
import { Play } from 'lucide-react'
import { useCleanerState } from './cleaner/hooks/useCleanerData'
import { CleanerSidebar } from './cleaner/components/CleanerSidebar'
import { CleanerToolbar } from './cleaner/components/CleanerToolbar'
import { CleanerTable } from './cleaner/components/CleanerTable'

const CleanerPage: React.FC = () => {
  const {
    isAdmin,
    dryRun,
    setDryRun,
    valMode,
    setValMode,
    validationResults,
    selectedItems,
    managers,
    selectedManagers,
    setSelectedManagers,
    isRunning,
    isValidationRunning,
    filteredResults,
    fetchValidationResults,
    toggleSelection,
    selectAll,
    deselectAll,
    hideSelected,
    showAll,
    confirmDeletion,
    executeDeletion,
    resetList
  } = useCleanerState()

  return (
    <div className="h-full flex flex-col xl:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CleanerSidebar
        isAdmin={isAdmin}
        valMode={valMode}
        setValMode={setValMode}
        managers={managers}
        selectedManagers={selectedManagers}
        setSelectedManagers={setSelectedManagers}
        dryRun={dryRun}
        setDryRun={setDryRun}
        isValidationRunning={isValidationRunning}
        fetchValidationResults={fetchValidationResults}
      />

      {/* 右栏：结果表格与工具栏 */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden min-h-[500px]">
        <CleanerToolbar
          selectAll={selectAll}
          deselectAll={deselectAll}
          hideSelected={hideSelected}
          showAll={showAll}
          confirmDeletion={confirmDeletion}
          isRunning={isRunning}
          hasValidationResults={validationResults.length > 0}
        />

        <CleanerTable
          filteredResults={filteredResults}
          validationResults={validationResults}
          selectedItems={selectedItems}
          toggleSelection={toggleSelection}
        />

        {/* 底部状态与执行区 */}
        <div className="bg-white border-t border-slate-200 p-4 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600 font-medium">
              共计 {filteredResults.length} 条记录 | 已选中 <span className="text-blue-600">{selectedItems.size}</span> 条
            </div>
            {isAdmin && dryRun && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded border border-amber-200">
                当前为预览模式
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={resetList}
              className="text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              重置列表
            </button>
            <button
              onClick={executeDeletion}
              disabled={isRunning || validationResults.length === 0}
              className={`${isAdmin && dryRun ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700 shadow-red-500/30'} text-white px-8 py-2.5 rounded-lg font-medium shadow-md transition-all flex items-center gap-2 disabled:opacity-50`}
            >
              <Play size={18} fill="currentColor" /> {isAdmin && dryRun ? '开始预览执行' : '正式执行 ERP 清理'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CleanerPage
