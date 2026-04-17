import React from 'react'
import { Play, Settings2, ToggleLeft, ToggleRight } from 'lucide-react'

interface CleanerExecutionBarProps {
  filteredCount: number
  selectedCount: number
  dryRun: boolean
  setDryRun: (value: boolean) => void
  headless: boolean
  setHeadless: (value: boolean) => void
  processConcurrency: number
  updateProcessConcurrency: (value: number) => void
  recordVideo: boolean
  updateRecordVideo: (value: boolean) => void
  showSettingsMenu: boolean
  setShowSettingsMenu: (open: boolean) => void
  handleExecuteDeletion: () => Promise<void>
  isRunning: boolean
  executeButtonRef: React.RefObject<HTMLButtonElement | null>
}

export function CleanerExecutionBar({
  filteredCount,
  selectedCount,
  dryRun,
  setDryRun,
  headless,
  setHeadless,
  processConcurrency,
  updateProcessConcurrency,
  recordVideo,
  updateRecordVideo,
  showSettingsMenu,
  setShowSettingsMenu,
  handleExecuteDeletion,
  isRunning,
  executeButtonRef
}: CleanerExecutionBarProps): React.JSX.Element {
  return (
    <div className="bg-white border-t border-slate-200 p-4 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="text-sm text-slate-600 font-medium">
          共计 {filteredCount} 条记录 | 已选中{' '}
          <span className="text-blue-600">{selectedCount}</span> 条
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
                      <div className="text-sm font-medium text-slate-800">后台模式 (Headless)</div>
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
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-800">录制处理视频</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        为每个订单详情页生成视频，仅保留最终失败订单的视频
                      </div>
                    </div>
                    <button
                      onClick={() => void updateRecordVideo(!recordVideo)}
                      className={`transition-colors flex-shrink-0 ml-4 ${recordVideo ? 'text-emerald-500' : 'text-slate-300'}`}
                    >
                      {recordVideo ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                    </button>
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <div>
                    <div className="text-sm font-medium text-slate-800">并行处理数量</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      同时处理详情页数量，范围 1-20
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={20}
                        value={processConcurrency}
                        onChange={(e) => updateProcessConcurrency(Number(e.target.value))}
                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <span className="text-sm font-medium text-slate-700 w-8 text-center">
                        {processConcurrency}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => void handleExecuteDeletion()}
          ref={executeButtonRef}
          disabled={isRunning}
          className={`${dryRun ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700 shadow-red-500/30'} text-white px-8 py-2.5 rounded-lg font-medium shadow-md transition-all flex items-center gap-2 disabled:opacity-50 w-[300px] justify-center`}
        >
          <Play size={18} fill="currentColor" /> {dryRun ? '开始预览执行' : '正式执行 ERP 清理'}
        </button>
      </div>
    </div>
  )
}
