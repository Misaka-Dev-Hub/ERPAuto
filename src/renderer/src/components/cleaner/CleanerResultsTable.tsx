import React from 'react'
import { CheckSquare, Square } from 'lucide-react'
import type { ValidationResult } from '../../hooks/cleaner/types'

interface CleanerResultsTableProps {
  validationResults: ValidationResult[]
  filteredResults: ValidationResult[]
  selectedItems: Set<string>
  isAdmin: boolean
  managers: string[]
  editingCell: { rowIndex: number; field: string } | null
  editValue: string
  setEditValue: (value: string) => void
  inputRef: React.RefObject<HTMLInputElement | HTMLSelectElement | null>
  handleCheckboxToggle: (materialCode: string) => void
  handleAssignManagerOnSelect: (materialCode: string) => void
  startEdit: (rowIndex: number, field: string) => void
  saveEdit: () => void
  cancelEdit: () => void
}

export function CleanerResultsTable({
  validationResults,
  filteredResults,
  selectedItems,
  isAdmin,
  managers,
  editingCell,
  editValue,
  setEditValue,
  inputRef,
  handleCheckboxToggle,
  handleAssignManagerOnSelect,
  startEdit,
  saveEdit,
  cancelEdit
}: CleanerResultsTableProps): React.JSX.Element {
  const handleSelectionChange = (materialCode: string) => {
    handleCheckboxToggle(materialCode)

    if (!isAdmin) {
      handleAssignManagerOnSelect(materialCode)
    }
  }

  return (
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
              const noManager = !result.managerName?.trim()
              const isEditingManager =
                editingCell?.rowIndex === rowIndex && editingCell?.field === 'managerName'
              const rowClassName = `${isChecked ? 'bg-blue-50/30' : 'hover:bg-slate-50'} transition-colors ${noManager && isChecked ? 'bg-amber-50/20' : ''}`
              const managerCellClassName = noManager
                ? 'text-amber-500 text-xs italic'
                : 'text-slate-700'

              return (
                <tr key={result.materialCode} className={rowClassName}>
                  <td className="px-4 py-3 text-center truncate">
                    {isChecked ? (
                      <CheckSquare
                        onClick={() => handleSelectionChange(result.materialCode)}
                        size={16}
                        className="text-blue-600 inline cursor-pointer"
                      />
                    ) : (
                      <Square
                        onClick={() => handleSelectionChange(result.materialCode)}
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
                  <td className="px-4 py-3 text-slate-500 text-xs truncate" title={result.model}>
                    {result.model || '-'}
                  </td>
                  <td
                    className={`px-4 py-3 truncate ${managerCellClassName}`}
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
                        {managers.map((manager) => (
                          <option key={manager} value={manager}>
                            {manager}
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
  )
}
