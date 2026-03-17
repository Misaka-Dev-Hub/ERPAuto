import React, { useEffect, useState } from 'react'
import { X, FileText, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ReportMetadata {
  key: string
  filename: string
  username: string
  lastModified?: Date
  size?: number
}

interface ReportViewerDialogProps {
  isOpen: boolean
  onClose: () => void
  isAdmin: boolean
  currentUsername: string
}

export const ReportViewerDialog: React.FC<ReportViewerDialogProps> = ({
  isOpen,
  onClose,
  isAdmin,
  currentUsername
}) => {
  const [reports, setReports] = useState<ReportMetadata[]>([])
  const [selectedReportKey, setSelectedReportKey] = useState<string>('')
  const [reportContent, setReportContent] = useState<string>('')
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false)
  const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadReports()
    } else {
      // Reset state when closed
      setReports([])
      setSelectedReportKey('')
      setReportContent('')
      setError(null)
    }
  }, [isOpen, isAdmin, currentUsername])

  const loadReports = async () => {
    setIsLoadingList(true)
    setError(null)
    try {
      let result
      if (isAdmin) {
        result = await window.electron.report.listAll()
      } else {
        result = await window.electron.report.listByUser(currentUsername)
      }

      if (result.success && result.data) {
        setReports(result.data)
      } else {
        setError(result.error || '无法获取报告列表')
      }
    } catch (err) {
      setError('获取报告列表时发生错误')
    } finally {
      setIsLoadingList(false)
    }
  }

  const handleReportChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value
    setSelectedReportKey(key)

    if (!key) {
      setReportContent('')
      return
    }

    setIsLoadingContent(true)
    setError(null)
    try {
      const result = await window.electron.report.download(key)
      if (result.success && result.data) {
        setReportContent(result.data)
      } else {
        setError(result.error || '无法获取报告内容')
        setReportContent('')
      }
    } catch (err) {
      setError('获取报告内容时发生错误')
      setReportContent('')
    } finally {
      setIsLoadingContent(false)
    }
  }

  if (!isOpen) return null

  // Format date to local string
  const formatDate = (dateString?: Date | string) => {
    if (!dateString) return '未知时间'
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-[900px] max-w-[90vw] h-[80vh] flex flex-col border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2 text-slate-800">
            <FileText size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold">执行报告浏览器</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 p-1.5 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-slate-700 flex-shrink-0">选择报告:</label>
            <div className="relative flex-1 max-w-2xl">
              <select
                value={selectedReportKey}
                onChange={handleReportChange}
                disabled={isLoadingList}
                className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-700 py-2 pl-3 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 disabled:opacity-50 text-sm"
              >
                <option value="">请选择要查看的报告...</option>
                {reports.map((report) => (
                  <option key={report.key} value={report.key}>
                    {isAdmin ? `[${report.username}] ` : ''}
                    {report.filename} ({formatDate(report.lastModified)})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <svg
                  className="fill-current h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
            {isLoadingList && <Loader2 size={16} className="text-blue-500 animate-spin" />}
          </div>
          {error && <div className="mt-3 text-sm text-red-600 flex items-center gap-1.5 bg-red-50 p-2 rounded">{error}</div>}
        </div>

        {/* Content */}
        <div className="flex-1 bg-slate-50 overflow-hidden relative">
          {isLoadingContent ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-white/80 z-10">
              <Loader2 size={32} className="animate-spin text-blue-500 mb-4" />
              <p>正在加载报告内容...</p>
            </div>
          ) : reportContent ? (
            <div className="h-full overflow-y-auto p-8">
              <div className="prose prose-slate prose-sm max-w-none bg-white p-8 rounded-xl shadow-sm border border-slate-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportContent}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
              <FileText size={48} className="mb-4 text-slate-300 opacity-50" />
              <p>请在上方选择一个报告进行浏览</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReportViewerDialog
