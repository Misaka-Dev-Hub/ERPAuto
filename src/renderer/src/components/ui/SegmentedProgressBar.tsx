import React from 'react'
import type { ExtractionPhase } from '../../stores/extractorStore'

interface SegmentedProgressBarProps {
  progress: number
  phase?: ExtractionPhase
  currentBatch?: number
  totalBatches?: number
  subProgress?: {
    step: string
    current: number
    total: number
  }
}

const PHASES: { key: ExtractionPhase; label: string; color: string }[] = [
  { key: 'login', label: '登录', color: 'bg-purple-500' },
  { key: 'downloading', label: '下载', color: 'bg-blue-500' },
  { key: 'merging', label: '合并', color: 'bg-amber-500' },
  { key: 'importing', label: '入库', color: 'bg-emerald-500' }
]

export const SegmentedProgressBar: React.FC<SegmentedProgressBarProps> = ({
  progress,
  phase,
  currentBatch,
  totalBatches,
  subProgress
}) => {
  // Calculate phase boundaries
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const getPhaseBoundaries = () => {
    if (!totalBatches) {
      return { loginEnd: 10, downloadingEnd: 90, mergingEnd: 95 }
    }
    const totalPoints = 1 + totalBatches + 2
    const progressPerPoint = 100 / totalPoints
    const loginEnd = progressPerPoint
    const downloadingEnd = (1 + totalBatches) * progressPerPoint
    const mergingEnd = (1 + totalBatches + 1) * progressPerPoint
    return { loginEnd, downloadingEnd, mergingEnd }
  }

  const { loginEnd, downloadingEnd, mergingEnd } = getPhaseBoundaries()

  const getCurrentPhaseIndex = (): number => {
    if (phase === 'downloading') return 1
    if (phase === 'merging') return 2
    if (phase === 'importing') return 3
    return 0
  }

  const currentPhaseIndex = getCurrentPhaseIndex()

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const getPhaseStatus = (index: number) => {
    if (index < currentPhaseIndex) return 'completed'
    if (index === currentPhaseIndex) return 'active'
    return 'pending'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const getStatusDot = (status: string) => {
    if (status === 'completed') return 'bg-emerald-600'
    if (status === 'active') return 'bg-blue-600 animate-pulse'
    return 'bg-slate-300'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const getStatusText = (status: string) => {
    if (status === 'completed') return 'text-emerald-600'
    if (status === 'active') return 'text-blue-600 font-semibold'
    return 'text-slate-400'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const getDetailText = () => {
    if (phase === 'login' && subProgress) {
      return `${subProgress.step} (${subProgress.current}/${subProgress.total})`
    }
    if (phase === 'downloading' && currentBatch !== undefined && totalBatches !== undefined) {
      return `批次 ${currentBatch}/${totalBatches}`
    }
    if (phase === 'merging') {
      return '正在合并 Excel 文件...'
    }
    if (phase === 'importing') {
      return '正在写入数据库...'
    }
    return '准备中...'
  }

  // Calculate segment fills based on current phase
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const getSegments = () => {
    // Login phase: simple 0-10% range
    if (phase === 'login') {
      return [{ end: 10, fill: progress }]
    }

    // Unknown phase or missing data: simple progress bar
    if (!phase || !totalBatches) {
      return [{ end: 100, fill: progress }]
    }

    // Multi-phase progress
    return [
      {
        end: loginEnd,
        fill: Math.min(progress, loginEnd)
      },
      {
        end: downloadingEnd,
        fill: Math.min(Math.max(progress, loginEnd), downloadingEnd)
      },
      {
        end: mergingEnd,
        fill: Math.min(Math.max(progress, downloadingEnd), mergingEnd)
      },
      {
        end: 100,
        fill: Math.min(Math.max(progress, mergingEnd), 100)
      }
    ]
  }

  const segments = getSegments()

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      {/* 阶段标签 */}
      <div className="flex justify-between mb-3">
        {PHASES.map((p, index) => {
          const status = getPhaseStatus(index)
          return (
            <div
              key={p.key}
              className={`flex items-center gap-2 ${getStatusText(status)} transition-colors`}
            >
              <div className={`w-3 h-3 rounded-full ${getStatusDot(status)} transition-colors`} />
              <span className="text-sm">{p.label}</span>
            </div>
          )
        })}
      </div>

      {/* 分段进度条 */}
      <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden mb-3">
        {segments.map((segment, index) => {
          const prevEnd = index === 0 ? 0 : segments[index - 1].end
          const segmentWidth = segment.end - prevEnd
          const filledWidth = Math.max(0, segment.fill - prevEnd)

          return (
            <div
              key={index}
              className="absolute h-full"
              style={{
                left: `${prevEnd}%`,
                width: `${segmentWidth}%`
              }}
            >
              <div
                className={`h-full transition-all duration-300 ${PHASES[index].color}`}
                style={{
                  width: `${segmentWidth > 0 ? (filledWidth / segmentWidth) * 100 : 0}%`
                }}
              />
              {index < PHASES.length - 1 && (
                <div className="absolute right-0 top-0 h-full w-px bg-white/50" />
              )}
            </div>
          )
        })}
      </div>

      {/* 详细信息 */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-slate-600">
          <span className="text-slate-500">当前进度：</span>
          <span className="text-slate-800">{getDetailText()}</span>
        </div>
        <div className="text-xl font-bold text-slate-800">{Math.round(progress)}%</div>
      </div>
    </div>
  )
}
