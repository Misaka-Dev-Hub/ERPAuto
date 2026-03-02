import React from 'react'
import {
  DatabaseZap,
  Layers,
  Users,
  Search,
  ToggleLeft,
  ToggleRight
} from 'lucide-react'

interface CleanerSidebarProps {
  isAdmin: boolean
  valMode: 'full' | 'filtered'
  setValMode: (mode: 'full' | 'filtered') => void
  managers: string[]
  selectedManagers: Set<string>
  setSelectedManagers: React.Dispatch<React.SetStateAction<Set<string>>>
  dryRun: boolean
  setDryRun: (value: boolean) => void
  isValidationRunning: boolean
  fetchValidationResults: () => void
}

export const CleanerSidebar: React.FC<CleanerSidebarProps> = ({
  isAdmin,
  valMode,
  setValMode,
  managers,
  selectedManagers,
  setSelectedManagers,
  dryRun,
  setDryRun,
  isValidationRunning,
  fetchValidationResults
}) => {
  return (
    <div className="xl:w-[380px] flex-shrink-0 flex flex-col gap-5">
      {/* 1. 数据来源选择 (仅 Admin 可见) */}
      {isAdmin && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2 text-slate-800">
            <DatabaseZap size={18} className="text-blue-500" />
            校验数据来源
          </h3>

          <div className="space-y-3">
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${valMode === 'full' ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50 border-slate-200'}`}>
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

            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${valMode === 'filtered' ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50 border-slate-200'}`}>
              <input
                type="radio"
                name="valMode"
                className="mt-1"
                checked={valMode === 'filtered'}
                onChange={() => setValMode('filtered')}
              />
              <div className="w-full">
                <div className="text-sm font-medium text-slate-800">数据库 - ProductionID 过滤</div>
                <div className="text-xs text-slate-500 mt-0.5">仅校验指定订单号相关的物料</div>
                {valMode === 'filtered' && (
                  <div className="mt-3 text-xs text-blue-700 bg-blue-100/50 rounded p-2 flex items-start gap-1.5">
                    <Layers size={14} className="mt-0.5 flex-shrink-0" />
                    <span>自动使用<strong>【数据提取】</strong>模块中共享的订单号列表进行过滤。</span>
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
              >全选</button>
              <button
                onClick={() => setSelectedManagers(new Set())}
                className="text-xs text-slate-500 hover:underline"
              >取消全选</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3 max-h-[120px] overflow-y-auto pr-1">
            {managers.map(manager => (
              <label key={manager} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 p-1.5 rounded">
                <input
                  type="checkbox"
                  className="rounded text-blue-600"
                  checked={selectedManagers.has(manager)}
                  onChange={(e) => {
                    setSelectedManagers(prev => {
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
            {managers.length === 0 && <div className="text-sm text-slate-400">暂无负责人数据</div>}
          </div>
        </div>
      )}

      {/* 3. 基础执行控制区 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mt-auto">
        {isAdmin && (
          <div className="flex items-center justify-between bg-amber-50/50 p-3 rounded-lg border border-amber-200 mb-4">
            <div>
              <div className="font-semibold text-sm text-amber-900">预览模式 (Dry-Run)</div>
              <div className="text-xs text-amber-700/80 mt-0.5">仅执行页面操作定位，不保存更改</div>
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
            onClick={fetchValidationResults}
            disabled={isValidationRunning}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-3 rounded-lg font-medium transition-colors shadow-sm flex justify-center items-center gap-2 border border-slate-200 disabled:opacity-50"
          >
            <Search size={18} /> {isValidationRunning ? '正在获取...' : '获取并校验物料状态'}
          </button>
        </div>
      </div>
    </div>
  )
}
