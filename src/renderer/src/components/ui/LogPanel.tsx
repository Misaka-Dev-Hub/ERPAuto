import React, { useEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'
import type { LogEntry, LogLevel, ExtractorProgress } from '../../hooks/useExtractor'

interface LogPanelProps {
  logs: LogEntry[]
  progress: ExtractorProgress | null
  onClear: () => void
}

const getLogColor = (level: LogLevel): string => {
  switch (level) {
    case 'error':
      return 'text-red-400'
    case 'warning':
      return 'text-amber-400'
    case 'success':
      return 'text-emerald-400'
    case 'system':
      return 'text-blue-400'
    default:
      return 'text-slate-400'
  }
}

const LogPanel: React.FC<LogPanelProps> = ({ logs, progress, onClear }) => {
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col min-h-[300px] flex-1">
      <div className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Terminal size={16} />
          <span>执行日志</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">进度: {progress?.progress || 0}%</span>
          <button
            className="text-xs text-slate-400 hover:text-white transition-colors"
            onClick={onClear}
          >
            清空
          </button>
        </div>
      </div>
      <div className="flex-1 p-4 font-mono text-sm overflow-y-auto leading-relaxed">
        {logs.length === 0 ? (
          <div className="text-slate-500 text-center py-8">等待执行...</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={getLogColor(log.level)}>
              <span className="text-slate-600">[{log.timestamp}]</span>{' '}
              <span className="text-slate-500">[{log.level.toUpperCase()}]</span> {log.message}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  )
}

export default LogPanel
