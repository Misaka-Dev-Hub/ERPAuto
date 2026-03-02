import React from 'react'
import { CheckSquare, Square, EyeOff, Eye, HardDrive, Settings2, FileSpreadsheet } from 'lucide-react'

interface CleanerToolbarProps {
  selectAll: () => void
  deselectAll: () => void
  hideSelected: () => void
  showAll: () => void
  confirmDeletion: () => void
  isRunning: boolean
  hasValidationResults: boolean
}

export const CleanerToolbar: React.FC<CleanerToolbarProps> = ({
  selectAll,
  deselectAll,
  hideSelected,
  showAll,
  confirmDeletion,
  isRunning,
  hasValidationResults
}) => {
  return (
    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={selectAll}
          className="text-xs bg-white border border-slate-300 text-slate-700 px-2.5 py-1.5 rounded shadow-sm hover:bg-slate-50 flex items-center gap-1"
        >
          <CheckSquare size={14} className="text-blue-600"/> 全选
        </button>
        <button
          onClick={deselectAll}
          className="text-xs bg-white border border-slate-300 text-slate-700 px-2.5 py-1.5 rounded shadow-sm hover:bg-slate-50 flex items-center gap-1"
        >
          <Square size={14} className="text-slate-400"/> 取消
        </button>

        <div className="w-px h-4 bg-slate-300 mx-1"></div>

        <button
          onClick={hideSelected}
          className="text-xs bg-white border border-slate-300 text-slate-700 px-2.5 py-1.5 rounded shadow-sm hover:bg-slate-50 flex items-center gap-1"
        >
          <EyeOff size={14}/> 隐藏勾选
        </button>
        <button
          onClick={showAll}
          className="text-xs bg-white border border-slate-300 text-slate-700 px-2.5 py-1.5 rounded shadow-sm hover:bg-slate-50 flex items-center gap-1"
        >
          <Eye size={14}/> 显示全部
        </button>

        <div className="w-px h-4 bg-slate-300 mx-1"></div>

        <button
          onClick={confirmDeletion}
          disabled={isRunning || !hasValidationResults}
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
  )
}
