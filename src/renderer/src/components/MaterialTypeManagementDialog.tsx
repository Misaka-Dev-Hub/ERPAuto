/**
 * Material Type Management Dialog (Modern UI Refactor)
 *
 * Provides a dialog for managing material type keywords used to identify
 * materials for deletion. Admin users can see all records and filter by manager.
 * Regular users can only see and edit their own records.
 */

import React, { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { 
  X, 
  Plus, 
  RotateCcw, 
  Search, 
  Trash2, 
  User, 
  CloudUpload, 
  CheckCircle2,
  AlertCircle,
  Users
} from 'lucide-react'
import { showSuccess, showError, showInfo } from '../stores/useAppStore'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { useConfirmDialog } from './ui/useConfirmDialog'
import { useLogger } from '../hooks/useLogger'

// --- Interfaces ---
interface MaterialTypeRecord {
  id?: number
  materialName: string
  managerName: string
}

interface RowState {
  localId: string // Stable ID for React mapping during edits/filters
  record: MaterialTypeRecord
  state: 'original' | 'new' | 'modified' | 'deleted'
  originalRecord?: MaterialTypeRecord
}

interface MaterialTypeManagementDialogProps {
  isOpen: boolean
  onClose: () => void
  isAdmin: boolean
  currentUsername: string
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}

// Stable ID generator for React keys
const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

// --- KeywordCard Component (Handles individual items) ---
interface KeywordCardProps {
  item: RowState
  isAdmin: boolean
  managers: string[]
  onUpdate: (localId: string, newRecord: Partial<MaterialTypeRecord>) => void
  onDelete: (localId: string) => void
  onRestore: (localId: string) => void
}

const KeywordCard = memo(function KeywordCard({ item, isAdmin, managers, onUpdate, onDelete, onRestore }: KeywordCardProps) {
  const [isEditing, setIsEditing] = useState(item.state === 'new');
  const [text, setText] = useState(item.record.materialName);
  const [manager, setManager] = useState(item.record.managerName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (item.state !== 'new') {
         inputRef.current.select();
      }
    }
  }, [isEditing, item.state]);

  const handleSave = () => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      onDelete(item.localId); // Delete if empty
    } else {
      setIsEditing(false);
      if (trimmedText !== item.record.materialName || manager !== item.record.managerName) {
        onUpdate(item.localId, { materialName: trimmedText, managerName: manager });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setText(item.record.materialName);
      setManager(item.record.managerName);
      setIsEditing(false);
      if (item.state === 'new') onDelete(item.localId);
    }
  };

  // Deleted State View
  if (item.state === 'deleted') {
    return (
      <div className="group relative flex items-center h-10 px-3 bg-red-50/50 border border-red-200 rounded-lg transition-all">
        <span className="flex-1 truncate text-sm text-red-700/60 font-medium line-through mr-6">
          {item.record.materialName}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onRestore(item.localId); }}
          className="absolute right-2 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-md transition-all"
          title="撤销删除"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    );
  }

  // Editing State View
  if (isEditing) {
    return (
      <div 
        className="relative flex items-center h-10 px-3 bg-indigo-50 border border-indigo-400 rounded-lg shadow-sm ring-2 ring-indigo-100 transition-all"
        onBlur={(e) => {
           // Delay save to allow dropdown clicks. Checks if new focus is outside this container.
           if (!e.currentTarget.contains(e.relatedTarget as Node)) {
               handleSave();
           }
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2 flex-shrink-0"></div>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="关键词..."
          className="flex-1 w-full min-w-[80px] bg-transparent outline-none text-sm font-medium text-indigo-900 placeholder-indigo-300"
        />
        {isAdmin && (
          <select
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            className="ml-2 bg-white outline-none text-xs text-indigo-700 border border-indigo-200 rounded px-1 py-0.5 focus:ring-2 focus:ring-indigo-200"
          >
             <option value="">负责人</option>
             {managers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>
    );
  }

  // Normal / Modified State View
  const isModified = item.state === 'modified' || item.state === 'new';
  return (
    <div 
      onClick={() => setIsEditing(true)}
      className={`group relative flex items-center h-10 px-3 bg-white border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md hover:border-indigo-300
        ${isModified ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'}
      `}
    >
      <div className={`w-1.5 h-1.5 rounded-full mr-2 flex-shrink-0 transition-colors
        ${isModified ? 'bg-amber-400' : 'bg-slate-300 group-hover:bg-indigo-400'}
      `}></div>
      
      <span className="flex-1 truncate text-sm text-slate-700 font-medium group-hover:text-indigo-700 transition-colors mr-2">
        {item.record.materialName}
      </span>

      <div className="flex-shrink-0 flex items-center">
        {isAdmin && (
          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded truncate max-w-[60px] group-hover:bg-indigo-50 group-hover:text-indigo-500 group-hover:-translate-x-2 transition-all duration-300 ease-in-out">
            {item.record.managerName || '未指定'}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.localId); }}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md max-w-0 overflow-hidden opacity-0 group-hover:max-w-8 group-hover:opacity-100 transition-all duration-200"
          title="删除"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
});


// --- Main Dialog Component ---
export const MaterialTypeManagementDialog: React.FC<MaterialTypeManagementDialogProps> = ({
  isOpen,
  onClose,
  isAdmin,
  currentUsername,
  // triggerRef // Retained for compatibility, but layout uses custom overlay
}) => {
  const [rows, setRows] = useState<RowState[]>([])
  const [managers, setManagers] = useState<string[]>([])
  const [selectedManagers, setSelectedManagers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const logger = useLogger('MaterialType')

  const { confirm, dialog: confirmDialog } = useConfirmDialog()

  const pendingCount = rows.filter(
    (r) => r.state === 'new' || r.state === 'modified' || r.state === 'deleted'
  ).length
  const isSynced = pendingCount === 0;

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [managersResult, recordsResult] = await Promise.all([
        window.electron.materialType.getManagers(),
        isAdmin
          ? window.electron.materialType.getAll()
          : window.electron.materialType.getByManager(currentUsername)
      ])

      if (managersResult.success && managersResult.data) {
        setManagers(managersResult.data)
        if (isAdmin) {
          setSelectedManagers(new Set(managersResult.data))
        }
      }

      let records: MaterialTypeRecord[] = []
      if (recordsResult.success && recordsResult.data) records = recordsResult.data

      setRows(
        records.map((record) => ({
          localId: generateId(),
          record,
          state: 'original' as const,
          originalRecord: { ...record }
        }))
      )
    } catch (error) {
      logger.error('Failed to load material types', {
        error: error instanceof Error ? error.message : String(error),
        isAdmin,
        currentUsername
      })
    } finally {
      setLoading(false)
    }
  }, [currentUsername, isAdmin, logger])

  useEffect(() => {
    if (isOpen) void loadData()
  }, [isOpen, loadData])

  const filteredRows = useMemo(() => {
    let result = rows;
    if (isAdmin && selectedManagers.size > 0) {
      result = result.filter(row => selectedManagers.has(row.record.managerName) || row.state === 'new');
    }
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(row => row.record.materialName.toLowerCase().includes(lowerQuery));
    }
    return result;
  }, [rows, isAdmin, selectedManagers, searchQuery])


  // --- Row Actions ---
  const handleAdd = useCallback(() => {
    const newRow: RowState = {
      localId: generateId(),
      record: { materialName: '', managerName: isAdmin ? '' : currentUsername },
      state: 'new'
    }
    setRows(prev => [newRow, ...prev])
    setSearchQuery('')
  }, [isAdmin, currentUsername])

  const handleUpdate = useCallback((localId: string, updates: Partial<MaterialTypeRecord>) => {
    setRows(prev => prev.map(row => {
      if (row.localId !== localId) return row;
      return {
        ...row,
        record: { ...row.record, ...updates },
        state: row.state === 'new' ? 'new' : 'modified'
      }
    }))
  }, [])

  const handleDelete = useCallback((localId: string) => {
    setRows(prev => {
      const row = prev.find(r => r.localId === localId);
      if (!row) return prev;
      if (row.state === 'new') return prev.filter(r => r.localId !== localId);
      return prev.map(r => r.localId === localId ? { ...r, state: 'deleted' } : r);
    })
  }, [])

  const handleRestore = useCallback((localId: string) => {
    setRows(prev => prev.map(r => {
      if (r.localId !== localId) return r;
      const wasModified = r.originalRecord?.materialName !== r.record.materialName ||
                          r.originalRecord?.managerName !== r.record.managerName;
      return { ...r, state: wasModified ? 'modified' : 'original' }
    }))
  }, [])

  const handleReset = async () => {
    if (pendingCount === 0) return
    const confirmed = await confirm({
      title: '确认重置',
      message: '确定要放弃所有未保存的更改吗？',
      variant: 'warning'
    })
    if (confirmed) void loadData()
  }

  const handleSave = async () => {
    const toInsert: MaterialTypeRecord[] = []
    const toUpdate: { old: MaterialTypeRecord; new: MaterialTypeRecord }[] = []
    const toDelete: MaterialTypeRecord[] = []

    for (const row of rows) {
      if (row.state === 'new' && row.record.materialName.trim()) {
        toInsert.push(row.record)
      } else if (row.state === 'modified' && row.originalRecord) {
        toUpdate.push({ old: row.originalRecord, new: row.record })
      } else if (row.state === 'deleted' && row.originalRecord) {
        toDelete.push(row.originalRecord)
      }
    }

    if (toInsert.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
      showInfo('没有需要保存的更改')
      return
    }

    const confirmParts: string[] = []
    if (toInsert.length > 0) confirmParts.push(`新增 ${toInsert.length} 条记录`)
    if (toUpdate.length > 0) confirmParts.push(`更新 ${toUpdate.length} 条记录`)
    if (toDelete.length > 0) confirmParts.push(`删除 ${toDelete.length} 条记录`)

    const confirmed = await confirm({
      title: '确认操作',
      message: `确认以下操作？\n\n${confirmParts.join('\n')}`,
      variant: 'warning'
    })
    if (!confirmed) return

    setSaving(true)
    try {
      const result = await window.electron.materialType.upsertBatch({ toInsert, toUpdate, toDelete })
      const payload = result.success ? (result.data as { stats?: { success?: number; failed?: number } } | undefined) : undefined

      if (result.success) {
        showSuccess(`保存完成！\n成功：${payload?.stats?.success || 0} 条\n失败：${payload?.stats?.failed || 0} 条`)
        await loadData()
      } else {
        showError(`保存失败：${result.error || '未知错误'}`)
      }
    } catch (error) {
      showError(`保存失败：${error instanceof Error ? error.message : '未知错误'}`)
      logger.error('Failed to save material types', {
        error: error instanceof Error ? error.message : String(error),
        inserts: toInsert.length, updates: toUpdate.length, deletes: toDelete.length
      })
    } finally {
      setSaving(false)
    }
  }

  const handleClose = async () => {
    if (pendingCount > 0) {
      const confirmed = await confirm({
        title: '确认关闭',
        message: '有未保存的更改，确定要关闭吗？',
        variant: 'warning'
      })
      if (!confirmed) return
    }
    onClose()
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 md:p-8 font-sans">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-slate-200/60 overflow-hidden flex flex-col h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* --- Header --- */}
        <header className="px-6 py-5 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 tracking-wider mb-1 uppercase">
              <span>Material Type Management</span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">物料类型管理</h1>
            <p className="text-sm text-slate-500 mt-1">
              {isAdmin ? '集中维护和管理所有负责人的物料关键词。' : '管理属于您的物料关键词。'}
            </p>
          </div>
          <button 
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </header>

        {/* --- Toolbar --- */}
        <div className="px-6 py-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row justify-between items-center gap-6 z-10">
          <div className="flex items-center space-x-6 w-full sm:w-auto">
            <button 
              onClick={handleAdd}
              className="flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm shadow-indigo-200 transition-all active:scale-95"
            >
              <Plus size={16} className="mr-1.5" /> 新增
            </button>
            <button 
              onClick={handleReset}
              disabled={pendingCount === 0 || loading}
              className="flex items-center justify-center px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw size={16} className="mr-1.5 text-slate-400" /> 重置
            </button>

            <div className="relative hidden sm:block">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={14} className="text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="搜索关键词..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-50 border border-transparent outline-none focus:border-indigo-200 focus:bg-white rounded-lg text-sm text-slate-700 w-56 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center space-x-6 w-full sm:w-auto justify-end">
            <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-100">
              <div className="flex items-center px-4 py-1.5 text-xs text-slate-600 border-r border-slate-200">
                <span className="text-slate-400 mr-1.5">记录</span>
                <span className="font-semibold text-slate-800">{filteredRows.length}</span>
              </div>
              <div className="flex items-center px-4 py-1.5 text-xs text-slate-600 border-r border-slate-200">
                <User size={12} className="mr-1.5 text-slate-400" />
                <span className="truncate max-w-[80px]">{isAdmin ? '管理员视图' : currentUsername}</span>
              </div>
              <div className={`flex items-center px-4 py-1.5 text-xs font-medium ${isSynced ? 'text-emerald-600' : 'text-amber-600'}`}>
                {isSynced ? <><CheckCircle2 size={14} className="mr-1" /> 已同步</> : <><AlertCircle size={14} className="mr-1" /> 待保存 {pendingCount}</>}
              </div>
            </div>

            <button 
              onClick={handleSave}
              disabled={pendingCount === 0 || saving}
              className={`flex items-center justify-center px-5 py-2 text-sm font-medium rounded-lg transition-all duration-300
                ${pendingCount > 0 ? 'bg-slate-800 hover:bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}
              `}
            >
              {saving ? <RotateCcw size={16} className="mr-2 animate-spin" /> : <CloudUpload size={16} className="mr-2" />}
              {saving ? '保存中...' : '保存更改'}
            </button>
          </div>
        </div>

        {/* --- Admin Manager Filter --- */}
        {isAdmin && managers.length > 0 && (
          <div className="px-6 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center overflow-x-auto hide-scrollbar">
            <div className="flex items-center gap-3 text-xs font-medium text-slate-500 mr-8 flex-shrink-0">
              <Users size={14} /> 负责人筛选
            </div>
            <div className="flex gap-3 flex-nowrap">
              <button
                onClick={() => setSelectedManagers(new Set(managers))}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedManagers.size === managers.length ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                全选
              </button>
              {managers.map((manager) => {
                const isSelected = selectedManagers.has(manager);
                return (
                  <button
                    key={manager}
                    onClick={() => {
                      const newSet = new Set(selectedManagers);
                      isSelected ? newSet.delete(manager) : newSet.add(manager);
                      setSelectedManagers(newSet);
                    }}
                    className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                      isSelected ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {manager}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* --- Main Content Grid --- */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center text-slate-400">
                <RotateCcw size={24} className="animate-spin mb-3 opacity-50" />
                <span className="text-sm">加载数据中...</span>
              </div>
            </div>
          ) : filteredRows.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 auto-rows-max">
              {filteredRows.map(row => (
                <KeywordCard 
                  key={row.localId} 
                  item={row} 
                  isAdmin={isAdmin}
                  managers={managers}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onRestore={handleRestore}
                />
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Search size={32} className="opacity-20" />
              <p className="text-sm">未找到匹配的关键词记录</p>
            </div>
          )}
        </div>

        {/* --- Footer --- */}
        <footer className="px-6 py-3 bg-white border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
          <p>支持直接点击卡片编辑名称，回车快速保存，清空内容即为删除。</p>
          <p>展示 <span className="font-semibold text-slate-600">{filteredRows.length}</span> / {rows.length} 条记录</p>
        </footer>

      </div>
      
      {/* Retain the original confirmation dialog */}
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </div>
  )
}

export default MaterialTypeManagementDialog