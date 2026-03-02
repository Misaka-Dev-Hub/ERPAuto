import React from 'react'
import { CheckSquare, Square } from 'lucide-react'
import type { ValidationResult } from '../hooks/useCleanerData'

interface CleanerTableProps {
  filteredResults: ValidationResult[]
  validationResults: ValidationResult[]
  selectedItems: Set<string>
  toggleSelection: (materialCode: string) => void
}

export const CleanerTable: React.FC<CleanerTableProps> = ({
  filteredResults,
  validationResults,
  selectedItems,
  toggleSelection
}) => {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-left text-sm whitespace-nowrap table-fixed">
        <thead className="bg-slate-100 text-slate-600 sticky top-0 shadow-sm z-10 text-xs font-semibold">
          <tr>
            <th className="px-4 py-3 w-16 text-center">选择</th>
            <th className="px-4 py-3 w-64">材料名称</th>
            <th className="px-4 py-3">材料代码</th>
            <th className="px-4 py-3">规格</th>
            <th className="px-4 py-3">型号</th>
            <th className="px-4 py-3 w-40">负责人 <span className="text-[10px] font-normal text-slate-400">(双击编辑)</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filteredResults.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                {validationResults.length === 0 ? '暂无数据，请点击左侧按钮获取并校验物料' : '当前筛选条件下暂无数据'}
              </td>
            </tr>
          ) : (
            filteredResults.map(result => {
              const isChecked = selectedItems.has(result.materialCode)
              const trClass = isChecked ? 'bg-blue-50/30' : 'hover:bg-slate-50'
              const noManager = !result.managerName?.trim()
              const managerCellClass = noManager ? 'text-amber-500 text-xs italic' : 'text-slate-700'

              return (
                <tr key={result.materialCode} className={`${trClass} transition-colors ${noManager && isChecked ? 'bg-amber-50/20' : ''}`}>
                  <td className="px-4 py-3 text-center truncate">
                    {isChecked ? (
                      <CheckSquare onClick={() => toggleSelection(result.materialCode)} size={16} className="text-blue-600 inline cursor-pointer" />
                    ) : (
                      <Square onClick={() => toggleSelection(result.materialCode)} size={16} className="text-slate-300 inline cursor-pointer" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 truncate" title={result.materialName}>{result.materialName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 truncate" title={result.materialCode}>{result.materialCode}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs truncate" title={result.specification}>{result.specification || '-'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs truncate" title={result.model}>{result.model || '-'}</td>
                  <td className={`px-4 py-3 truncate ${managerCellClass}`} title={result.managerName || '空(待分配)'}>
                    {result.managerName || '空(待分配)'}
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
