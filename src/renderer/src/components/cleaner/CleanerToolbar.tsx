import React from 'react'
import {
  CheckSquare,
  Eye,
  EyeOff,
  FileSpreadsheet,
  HardDrive,
  History,
  Search,
  Settings2,
  Square
} from 'lucide-react'
import type { ValidationResult } from '../../hooks/cleaner/types'

interface CleanerToolbarProps {
  validationResults: ValidationResult[]
  filteredResults: ValidationResult[]
  selectedItems: Set<string>
  setSelectedItems: React.Dispatch<React.SetStateAction<Set<string>>>
  setHiddenItems: React.Dispatch<React.SetStateAction<Set<string>>>
  isValidationRunning: boolean
  isRunning: boolean
  isExporting: boolean
  isTypeDialogOpen: boolean
  setIsTypeDialogOpen: (open: boolean) => void
  handleValidation: () => Promise<void>
  handleConfirmDeletion: () => Promise<void>
  handleExportResults: () => Promise<void>
  setShowHistoryModal: (open: boolean) => void
  typeManagementButtonRef: React.RefObject<HTMLButtonElement | null>
}

export function CleanerToolbar({
  validationResults,
  filteredResults,
  selectedItems,
  setSelectedItems,
  setHiddenItems,
  isValidationRunning,
  isRunning,
  isExporting,
  setIsTypeDialogOpen,
  handleValidation,
  handleConfirmDeletion,
  handleExportResults,
  setShowHistoryModal,
  typeManagementButtonRef
}: CleanerToolbarProps): React.JSX.Element {
  return (
    <>
      <div className="p-4 border-b border-slate-200 flex-shrink-0">
        <button
          onClick={() => void handleValidation()}
          disabled={isValidationRunning}
          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-3 rounded-lg font-medium transition-colors shadow-sm flex justify-center items-center gap-2 border border-slate-200 disabled:opacity-50"
        >
          <Search size={18} /> {isValidationRunning ? '正在获取...' : '获取并校验物料状态'}
        </button>
      </div>

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
              const visibleCodes = new Set(filteredResults.map((r) => r.materialCode))
              setSelectedItems((prev) => {
                const next = new Set(prev)
                for (const code of visibleCodes) {
                  next.delete(code)
                }
                return next
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
              if (checkedCodes.length) {
                setHiddenItems((prev) => new Set([...prev, ...checkedCodes]))
              }
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
            onClick={() => void handleConfirmDeletion()}
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
            onClick={() => setShowHistoryModal(true)}
            className="text-xs bg-violet-50 border border-violet-200 text-violet-700 px-3 py-1.5 rounded shadow-sm hover:bg-violet-100 flex items-center gap-1.5 font-medium transition-colors"
          >
            <History size={14} /> 操作历史
          </button>
          <button
            onClick={() => void handleExportResults()}
            disabled={isExporting || filteredResults.length === 0}
            className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded shadow-sm hover:bg-blue-100 flex items-center gap-1.5 font-medium disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> {isExporting ? '导出中...' : '导出结果'}
          </button>
        </div>
      </div>
    </>
  )
}
