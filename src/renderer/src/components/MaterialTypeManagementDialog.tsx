/**
 * Material Type Management Dialog
 *
 * Provides a dialog for managing material type keywords used to identify
 * materials for deletion. Admin users can see all records and filter by manager.
 * Regular users can only see and edit their own records.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Save, RotateCcw, Users } from 'lucide-react'
import { Modal } from './ui/Modal'

interface MaterialTypeRecord {
  id?: number
  materialName: string
  managerName: string
}

interface RowState {
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

export const MaterialTypeManagementDialog: React.FC<MaterialTypeManagementDialogProps> = ({
  isOpen,
  onClose,
  isAdmin,
  currentUsername,
  triggerRef
}) => {
  const [rows, setRows] = useState<RowState[]>([])
  const [managers, setManagers] = useState<string[]>([])
  const [selectedManagers, setSelectedManagers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)

  const tableRef = useRef<HTMLTableElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Calculate pending changes count
  const pendingCount = rows.filter(
    (r) => r.state === 'new' || r.state === 'modified' || r.state === 'deleted'
  ).length

  // Load data when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen, isAdmin, currentUsername])

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load managers list
      const managersResult = await window.electron.materialType.getManagers()
      if (managersResult.success && managersResult.data) {
        setManagers(managersResult.data)
        if (isAdmin) {
          setSelectedManagers(new Set(managersResult.data))
        }
      }

      // Load records
      let records: MaterialTypeRecord[] = []
      if (isAdmin) {
        const result = await window.electron.materialType.getAll()
        if (result.success && result.data) {
          records = result.data
        }
      } else {
        const result = await window.electron.materialType.getByManager(currentUsername)
        if (result.success && result.data) {
          records = result.data
        }
      }

      setRows(
        records.map((record) => ({
          record,
          state: 'original' as const,
          originalRecord: { ...record }
        }))
      )
      setSelectedRowIndex(null)
    } catch (error) {
      console.error('Failed to load material types:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter rows by selected managers (admin only)
  const filteredRows = React.useMemo(() => {
    if (!isAdmin) return rows
    if (selectedManagers.size === 0) return rows
    return rows.filter((row) => selectedManagers.has(row.record.managerName) || row.state === 'new')
  }, [rows, isAdmin, selectedManagers])

  // Insert new row
  const insertNewRow = useCallback(() => {
    const newRow: RowState = {
      record: {
        materialName: '',
        managerName: isAdmin ? '' : currentUsername
      },
      state: 'new'
    }

    // 在 setRows 回调中计算索引并设置编辑状态
    setRows((prev) => {
      const newIndex = prev.length
      setTimeout(() => {
        setEditingCell({ rowIndex: newIndex, field: 'materialName' })
        setEditValue('')
      }, 0)
      return [...prev, newRow]
    })
  }, [isAdmin, currentUsername])

  // Delete row
  const deleteRow = useCallback((index: number) => {
    setRows((prev) => {
      const newRows = [...prev]
      const row = newRows[index]
      if (row.state === 'new') {
        // Remove new rows directly
        newRows.splice(index, 1)
      } else {
        // Mark existing rows as deleted
        newRows[index] = { ...row, state: 'deleted' }
      }
      return newRows
    })
    setSelectedRowIndex(null)
  }, [])

  // Start editing a cell
  const startEdit = useCallback(
    (rowIndex: number, field: string) => {
      const row = rows[rowIndex]
      if (row.state === 'deleted') return

      setEditingCell({ rowIndex, field })
      setEditValue(row.record[field as keyof MaterialTypeRecord] as string)
    },
    [rows]
  )

  // Save edit
  const saveEdit = useCallback(() => {
    if (!editingCell) return

    const { rowIndex, field } = editingCell
    setRows((prev) => {
      const newRows = [...prev]
      const row = newRows[rowIndex]
      const newValue = editValue.trim()

      // Update the record
      newRows[rowIndex] = {
        ...row,
        record: {
          ...row.record,
          [field]: newValue
        },
        state: row.state === 'new' ? 'new' : 'modified'
      }
      return newRows
    })

    setEditingCell(null)
    setEditValue('')
  }, [editingCell, editValue])

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (editingCell) {
        if (event.key === 'Enter') {
          saveEdit()
        } else if (event.key === 'Escape') {
          cancelEdit()
        }
        return
      }

      if (event.key === 'Insert') {
        event.preventDefault()
        insertNewRow()
      } else if (event.key === 'Delete' && selectedRowIndex !== null) {
        event.preventDefault()
        deleteRow(selectedRowIndex)
      }
    },
    [editingCell, selectedRowIndex, insertNewRow, deleteRow, saveEdit, cancelEdit]
  )

  // Save all changes
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
      alert('没有需要保存的更改')
      return
    }

    const confirmParts: string[] = []
    if (toInsert.length > 0) confirmParts.push(`新增 ${toInsert.length} 条记录`)
    if (toUpdate.length > 0) confirmParts.push(`更新 ${toUpdate.length} 条记录`)
    if (toDelete.length > 0) confirmParts.push(`删除 ${toDelete.length} 条记录`)

    if (!window.confirm(`确认以下操作？\n\n${confirmParts.join('\n')}`)) return

    setSaving(true)
    try {
      const result = await window.electron.materialType.upsertBatch({
        toInsert,
        toUpdate,
        toDelete
      })
      const payload = result.success
        ? (result.data as { stats?: { success?: number; failed?: number } } | undefined)
        : undefined

      if (result.success) {
        alert(
          `保存完成！\n成功：${payload?.stats?.success || 0} 条\n失败：${payload?.stats?.failed || 0} 条`
        )
        await loadData()
      } else {
        alert(`保存失败：${result.error || '未知错误'}`)
      }
    } catch (error) {
      alert(`保存失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  // Reset changes
  const handleReset = () => {
    if (pendingCount === 0) return
    if (!window.confirm('确定要放弃所有未保存的更改吗？')) return
    loadData()
  }

  // Handle close with unsaved changes warning
  const handleClose = () => {
    if (pendingCount > 0) {
      if (!window.confirm('有未保存的更改，确定要关闭吗？')) return
    }
    onClose()
  }

  // Get row background color
  const getRowStyle = (row: RowState): React.CSSProperties => {
    if (row.state === 'deleted') {
      return { backgroundColor: '#fee2e2', textDecoration: 'line-through', opacity: 0.6 }
    }
    if (row.state === 'new') {
      return { backgroundColor: '#dcfce7' }
    }
    if (row.state === 'modified') {
      return { backgroundColor: '#fef9c3' }
    }
    return {}
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="物料类型管理"
      size="2xl"
      triggerRef={triggerRef}
    >
      <div onKeyDown={handleKeyDown}>
        {/* Manager filter (admin only) */}
        {isAdmin && (
          <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Users size={16} />
                按负责人筛选
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedManagers(new Set(managers))}
                  className="text-xs text-blue-600 hover:underline"
                >
                  全选
                </button>
                <button
                  onClick={() => setSelectedManagers(new Set())}
                  className="text-xs text-slate-500 hover:underline"
                >
                  取消全选
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {managers.map((manager) => (
                <label
                  key={manager}
                  className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:bg-white px-2 py-1 rounded"
                >
                  <input
                    type="checkbox"
                    className="rounded text-blue-600"
                    checked={selectedManagers.has(manager)}
                    onChange={(e) => {
                      setSelectedManagers((prev) => {
                        const newSet = new Set(prev)
                        if (e.target.checked) newSet.add(manager)
                        else newSet.delete(manager)
                        return newSet
                      })
                    }}
                  />
                  {manager}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={insertNewRow}
              className="flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded hover:bg-green-100"
            >
              <Plus size={14} /> 新增 (Insert)
            </button>
            <button
              onClick={() => selectedRowIndex !== null && deleteRow(selectedRowIndex)}
              disabled={selectedRowIndex === null}
              className="flex items-center gap-1.5 text-xs bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={14} /> 删除 (Delete)
            </button>
            <button
              onClick={handleReset}
              disabled={pendingCount === 0}
              className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw size={14} /> 重置
            </button>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                {pendingCount} 项待保存
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || pendingCount === 0}
              className="flex items-center gap-1.5 text-xs bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={14} /> {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500">加载中...</div>
          ) : (
            <table ref={tableRef} className="w-full text-sm">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-700 w-64">
                    物料名称关键词
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">负责人</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.filter((r) => r.state !== 'deleted').length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                      暂无数据，点击"新增"按钮添加物料类型关键词
                    </td>
                  </tr>
                ) : (
                  filteredRows
                    .filter((r) => r.state !== 'deleted')
                    .map((row, index) => {
                      const originalIndex = rows.indexOf(row)
                      const isSelected = selectedRowIndex === originalIndex
                      const isEditingMaterial =
                        editingCell?.rowIndex === originalIndex &&
                        editingCell?.field === 'materialName'
                      const isEditingManager =
                        editingCell?.rowIndex === originalIndex &&
                        editingCell?.field === 'managerName'

                      return (
                        <tr
                          key={index}
                          style={getRowStyle(row)}
                          className={`${isSelected ? 'ring-2 ring-blue-300 ring-inset' : ''} hover:bg-slate-50 cursor-pointer`}
                          onClick={() => setSelectedRowIndex(originalIndex)}
                        >
                          <td className="px-4 py-2 border-r border-slate-100">
                            {isEditingMaterial ? (
                              <input
                                ref={inputRef}
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={saveEdit}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit()
                                  if (e.key === 'Escape') cancelEdit()
                                }}
                                className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            ) : (
                              <div
                                className="min-h-[24px] cursor-text"
                                onDoubleClick={() => startEdit(originalIndex, 'materialName')}
                              >
                                {row.record.materialName || (
                                  <span className="text-slate-400 italic">双击编辑</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {isEditingManager ? (
                              isAdmin ? (
                                <select
                                  ref={inputRef as any}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={saveEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEdit()
                                    if (e.key === 'Escape') cancelEdit()
                                  }}
                                  className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">选择负责人</option>
                                  {managers.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  ref={inputRef}
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={saveEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEdit()
                                    if (e.key === 'Escape') cancelEdit()
                                  }}
                                  className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              )
                            ) : (
                              <div
                                className="min-h-[24px] cursor-text"
                                onDoubleClick={() => startEdit(originalIndex, 'managerName')}
                              >
                                {row.record.managerName || (
                                  <span className="text-slate-400 italic">双击编辑</span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-3 text-xs text-slate-500 flex justify-between">
          <span>
            双击单元格编辑 | Insert 新增 | Delete 删除
            {isAdmin && ' | 绿色=新增 | 黄色=已修改'}
          </span>
          <span>共 {filteredRows.filter((r) => r.state !== 'deleted').length} 条记录</span>
        </div>
      </div>
    </Modal>
  )
}

export default MaterialTypeManagementDialog
