import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { showSuccess, showError, showWarning, formatListMessage } from '../stores/useAppStore'
import { ConfirmDialogProps } from '../components/ui/ConfirmDialog'

export interface ValidationResult {
  materialName: string
  materialCode: string
  specification: string
  model: string
  managerName: string
  isMarkedForDeletion: boolean
  matchedTypeKeyword?: string
}

export interface CleanerProgress {
  message: string
  progress: number
  currentOrderIndex: number
  totalOrders: number
  currentMaterialIndex: number
  totalMaterialsInOrder: number
  currentOrderNumber?: string
  phase: 'login' | 'processing' | 'complete'
}

export function useCleaner() {
  // Authentication & permissions
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUsername, setCurrentUsername] = useState<string>('')

  // State with sessionStorage persistence
  const [dryRun, setDryRun] = useState(() => {
    const saved = sessionStorage.getItem('cleaner_dryRun')
    return saved ? saved === 'true' : false
  })

  const [valMode, setValMode] = useState<'full' | 'filtered'>(() => {
    const saved = sessionStorage.getItem('cleaner_validationMode')
    return saved === 'full' ? 'full' : 'filtered'
  })

  // Validation state
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set())
  const [managers, setManagers] = useState<string[]>([])
  const [selectedManagers, setSelectedManagers] = useState<Set<string>>(new Set())

  // Execution state
  const [isRunning, setIsRunning] = useState(false)
  const [isValidationRunning, setIsValidationRunning] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)

  // Shared Production IDs state
  const [sharedProductionIdsCount, setSharedProductionIdsCount] = useState(0)

  // Material type management dialog state
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false)

  // Execution report dialog state
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)
  const [reportData, setReportData] = useState<{
    ordersProcessed: number
    materialsDeleted: number
    materialsSkipped: number
    errors: string[]
    retriedOrders?: number
    successfulRetries?: number
  } | null>(null)

  // Progress state
  const [progress, setProgress] = useState<CleanerProgress | null>(null)
  const [startTime, setStartTime] = useState<number | null>(null)

  // Execution settings state
  const [headless, setHeadless] = useState(() => {
    const saved = sessionStorage.getItem('cleaner_headless')
    return saved ? saved === 'true' : true
  })
  const [queryBatchSize, setQueryBatchSize] = useState(() => {
    const saved = sessionStorage.getItem('cleaner_queryBatchSize')
    const value = saved ? Number(saved) : 100
    if (!Number.isFinite(value)) return 100
    return Math.min(100, Math.max(1, Math.trunc(value)))
  })
  const [processConcurrency, setProcessConcurrency] = useState(() => {
    const saved = sessionStorage.getItem('cleaner_processConcurrency')
    const value = saved ? Number(saved) : 1
    if (!Number.isFinite(value)) return 1
    return Math.min(20, Math.max(1, Math.trunc(value)))
  })
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)

  // Inline editing state for manager field (Admin only)
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogProps | null>(null)

  /**
   * Show a confirmation dialog and return user's choice
   */
  const showConfirmDialog = useCallback(
    (options: Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        setConfirmDialog({
          ...options,
          isOpen: true,
          onConfirm: () => {
            setConfirmDialog(null)
            resolve(true)
          },
          onCancel: () => {
            setConfirmDialog(null)
            resolve(false)
          }
        })
      })
    },
    []
  )

  // Check admin status and get shared Production IDs on mount
  useEffect(() => {
    const initializePage = async () => {
      try {
        const adminResult = await window.electron.auth.isAdmin()
        const userResult = await window.electron.auth.getCurrentUser()
        const admin = adminResult.success && Boolean(adminResult.data)
        const user = userResult.success ? userResult.data : undefined
        setIsAdmin(admin)
        if (user && user.userInfo) {
          setCurrentUsername(user.userInfo.username)
          if (!admin) {
            setSelectedManagers(new Set([user.userInfo.username]))
          }
        }

        // Load managers
        if (admin) {
          const resp = await window.electron.materials.getManagers()
          const managersPayload = resp.success
            ? (resp.data as { managers: string[] } | undefined)
            : undefined
          const managerList = managersPayload?.managers ?? []
          setManagers(managerList)
          setSelectedManagers(new Set(managerList))
        }

        // Get shared Production IDs
        const result = await window.electron.validation.getSharedProductionIds()
        const idsPayload = result.success
          ? (result.data as { productionIds?: string[] } | undefined)
          : undefined
        setSharedProductionIdsCount(idsPayload?.productionIds?.length ?? 0)
      } catch (err) {
        console.error('Initialization failed:', err)
      }
    }
    initializePage()
  }, [])

  // Subscribe to cleaner progress events
  useEffect(() => {
    const unsubscribeProgress = window.electron.cleaner.onProgress((data) => {
      setProgress(data)
    })

    return () => {
      unsubscribeProgress()
    }
  }, [])

  useEffect(() => {
    sessionStorage.setItem('cleaner_dryRun', dryRun.toString())
  }, [dryRun])

  useEffect(() => {
    sessionStorage.setItem('cleaner_headless', headless.toString())
  }, [headless])

  useEffect(() => {
    sessionStorage.setItem('cleaner_queryBatchSize', queryBatchSize.toString())
  }, [queryBatchSize])

  useEffect(() => {
    sessionStorage.setItem('cleaner_processConcurrency', processConcurrency.toString())
  }, [processConcurrency])

  useEffect(() => {
    sessionStorage.setItem('cleaner_validationMode', valMode)
  }, [valMode])

  // Filter validation results by selected managers and hidden items
  const filteredResults = useMemo(() => {
    let results = validationResults
    if (!isAdmin && currentUsername) {
      results = results.filter((r) => r.managerName === currentUsername || !r.managerName)
    } else if (managers.length > 0 && selectedManagers.size > 0) {
      results = results.filter((r) => selectedManagers.has(r.managerName) || !r.managerName)
    }
    results = results.filter((r) => !hiddenItems.has(r.materialCode))
    return results
  }, [validationResults, isAdmin, currentUsername, managers, selectedManagers, hiddenItems])

  // Handlers
  const handleValidation = async () => {
    setIsValidationRunning(true)
    setValidationResults([])
    setSelectedItems(new Set())
    setHiddenItems(new Set())

    try {
      const response = await window.electron.validation.validate({
        mode: valMode === 'full' ? 'database_full' : 'database_filtered',
        useSharedProductionIds: valMode === 'filtered'
      })
      const validationData = response.success ? (response.data as any) : null

      if (response.success && validationData?.success && validationData.results) {
        setValidationResults(validationData.results)
        const markedCodes = new Set<string>(
          validationData.results
            .filter((r: ValidationResult) => r.isMarkedForDeletion)
            .map((r: ValidationResult) => r.materialCode)
        )
        setSelectedItems(markedCodes)

        if (isAdmin) {
          const uniqueManagers = new Set<string>(
            validationData.results
              .map((r: ValidationResult) => r.managerName)
              .filter((name: string) => Boolean(name))
          )
          setManagers(Array.from(uniqueManagers))
          setSelectedManagers(uniqueManagers)
        }
        showSuccess('校验完成')
      } else {
        showError(response.error || validationData?.error || '校验失败')
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : '校验过程中发生未知错误')
    } finally {
      setIsValidationRunning(false)
    }
  }

  const handleCheckboxToggle = (materialCode: string) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(materialCode)) newSet.delete(materialCode)
      else newSet.add(materialCode)
      return newSet
    })
  }

  const startEdit = (rowIndex: number, field: string) => {
    const row = filteredResults[rowIndex]
    if (!row) return
    setEditingCell({ rowIndex, field })
    setEditValue(row[field as keyof ValidationResult] as string)
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        if (inputRef.current instanceof HTMLInputElement) {
          inputRef.current.select()
        }
      }
    }, 0)
  }

  const saveEdit = () => {
    if (!editingCell) return
    const { rowIndex } = editingCell
    const row = filteredResults[rowIndex]
    if (!row) return

    const newValue = editValue.trim()
    if (row.managerName === newValue) {
      setEditingCell(null)
      return
    }

    setValidationResults((prev) =>
      prev.map((r) => (r.materialCode === row.materialCode ? { ...r, managerName: newValue } : r))
    )
    setEditingCell(null)
  }

  const cancelEdit = () => {
    setEditingCell(null)
  }

  const handleAssignManagerOnSelect = (materialCode: string) => {
    if (!isAdmin && currentUsername) {
      const result = validationResults.find((r) => r.materialCode === materialCode)
      if (result && (!result.managerName || result.managerName !== currentUsername)) {
        setValidationResults((prev) =>
          prev.map((r) =>
            r.materialCode === materialCode ? { ...r, managerName: currentUsername } : r
          )
        )
      }
    }
  }

  const handleConfirmDeletion = async () => {
    const resultsToProcess = isAdmin ? validationResults : filteredResults

    if (resultsToProcess.length === 0) {
      showWarning('没有可处理的数据')
      return
    }

    const materialsToUpsert: { materialCode: string; managerName: string }[] = []
    const materialsToDelete: string[] = []
    const missingManager: string[] = []

    for (const result of resultsToProcess) {
      if (!result.materialCode?.trim()) continue

      const code = result.materialCode.trim()
      if (selectedItems.has(code)) {
        if (!result.managerName?.trim()) missingManager.push(code)
        else materialsToUpsert.push({ materialCode: code, managerName: result.managerName.trim() })
      } else {
        materialsToDelete.push(code)
      }
    }

    if (missingManager.length > 0) {
      showError(
        `以下已勾选的记录缺少负责人信息，无法保存：\n\n${formatListMessage(missingManager, 10)}`
      )
      return
    }

    if (materialsToUpsert.length === 0 && materialsToDelete.length === 0) {
      showWarning('没有需要处理的记录')
      return
    }

    const confirmParts: string[] = []
    if (materialsToUpsert.length > 0)
      confirmParts.push(`写入/更新 ${materialsToUpsert.length} 条记录`)
    if (materialsToDelete.length > 0) confirmParts.push(`删除 ${materialsToDelete.length} 条记录`)

    const confirmed = await showConfirmDialog({
      title: '确认操作',
      message: `确认以下操作吗？\n\n${confirmParts.join('\n')}`,
      variant: 'warning'
    })
    if (!confirmed) return

    try {
      setIsRunning(true)
      const msgParts: string[] = []

      if (materialsToUpsert.length > 0) {
        const res = await window.electron.materials.upsertBatch(materialsToUpsert)
        const payload = res.success
          ? (res.data as { stats?: { success?: number } } | undefined)
          : undefined
        if (!res.success) throw new Error(res.error || '写入物料失败')
        msgParts.push(`写入/更新成功：${payload?.stats?.success || 0} 条`)
      }

      if (materialsToDelete.length > 0) {
        const res = await window.electron.materials.delete(materialsToDelete)
        const payload = res.success ? (res.data as { count?: number } | undefined) : undefined
        if (!res.success) throw new Error(res.error || '删除物料失败')
        msgParts.push(`删除成功：${payload?.count || 0} 条`)
      }

      showSuccess(`操作完成！\n\n${msgParts.join('\n')}`)

      // Reload managers if admin
      if (isAdmin) {
        const resp = await window.electron.materials.getManagers()
        const payload = resp.success
          ? (resp.data as { managers?: string[] } | undefined)
          : undefined
        setManagers(payload?.managers ?? [])
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setIsRunning(false)
    }
  }

  const handleExecuteDeletion = async () => {
    if (!dryRun) {
      const confirmed = await showConfirmDialog({
        title: '警告',
        message: '正式执行将删除 ERP 系统中的物料数据，是否继续？',
        variant: 'danger',
        confirmText: '继续',
        cancelText: '取消'
      })
      if (!confirmed) return
    }

    setIsRunning(true)
    // Initialize progress state BEFORE opening dialog to ensure progress view shows first
    setProgress({
      message: '正在初始化...',
      progress: 0,
      currentOrderIndex: 0,
      totalOrders: 0,
      currentMaterialIndex: 0,
      totalMaterialsInOrder: 0,
      phase: 'login'
    })
    setIsExecuting(true)
    setStartTime(Date.now())
    setIsReportDialogOpen(true)

    try {
      const cleanerDataResult = await window.electron.validation.getCleanerData()
      const cleanerData = cleanerDataResult.success ? (cleanerDataResult.data as any) : null
      if (!cleanerDataResult.success || cleanerData?.success === false) {
        throw new Error(cleanerDataResult.error || '获取清理数据失败')
      }

      const orderNumberList = cleanerData?.orderNumbers || []
      const materialCodeList = cleanerData?.materialCodes || []

      if (orderNumberList.length === 0)
        throw new Error('没有订单号数据。请先到数据提取页面输入 Production ID。')
      if (materialCodeList.length === 0)
        throw new Error('没有物料代码数据。请确认已在物料清理界面确认要删除的物料。')

      const response = await window.electron.cleaner.runCleaner({
        orderNumbers: orderNumberList,
        materialCodes: materialCodeList,
        dryRun,
        headless,
        queryBatchSize,
        processConcurrency
      })
      const cleanerRunData = response.success ? (response.data as any) : null

      if (response.success && cleanerRunData) {
        setReportData({
          ordersProcessed: cleanerRunData.ordersProcessed,
          materialsDeleted: cleanerRunData.materialsDeleted,
          materialsSkipped: cleanerRunData.materialsSkipped,
          errors: cleanerRunData.errors,
          retriedOrders: cleanerRunData.retriedOrders,
          successfulRetries: cleanerRunData.successfulRetries
        })
      } else {
        throw new Error(response.error || '清理失败')
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : '发生未知错误')
    } finally {
      setIsRunning(false)
      setIsExecuting(false)
      setProgress(null)
      setStartTime(null)
    }
  }

  const handleExportResults = async () => {
    if (filteredResults.length === 0) {
      showWarning('没有数据可导出')
      return
    }

    setIsExporting(true)
    try {
      // Prepare export data from filtered results
      const exportItems = filteredResults.map((result) => ({
        materialName: result.materialName,
        materialCode: result.materialCode,
        specification: result.specification || '',
        model: result.model || '',
        managerName: result.managerName || '',
        isMarkedForDeletion: result.isMarkedForDeletion,
        isSelected: selectedItems.has(result.materialCode)
      }))

      const response = await window.electron.cleaner.exportResults(exportItems)
      const exportData = response.success ? (response.data as any) : null

      if (response.success && exportData?.success !== false) {
        showSuccess(`导出成功！\n文件已保存到：${exportData?.filePath ?? ''}`)
      } else {
        throw new Error(response.error || exportData?.error || '导出失败')
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : '导出过程中发生错误')
    } finally {
      setIsExporting(false)
    }
  }

  return {
    isAdmin,
    currentUsername,
    dryRun,
    setDryRun,
    valMode,
    setValMode,
    validationResults,
    selectedItems,
    setSelectedItems,
    hiddenItems,
    setHiddenItems,
    managers,
    selectedManagers,
    setSelectedManagers,
    isRunning,
    isExecuting,
    isValidationRunning,
    isExporting,
    sharedProductionIdsCount,
    isTypeDialogOpen,
    setIsTypeDialogOpen,
    headless,
    setHeadless,
    queryBatchSize,
    setQueryBatchSize,
    processConcurrency,
    setProcessConcurrency,
    showSettingsMenu,
    setShowSettingsMenu,
    filteredResults,
    isReportDialogOpen,
    setIsReportDialogOpen,
    reportData,
    editingCell,
    editValue,
    setEditValue,
    inputRef,
    startEdit,
    saveEdit,
    cancelEdit,
    handleAssignManagerOnSelect,
    progress,
    startTime,
    handleValidation,
    handleCheckboxToggle,
    handleConfirmDeletion,
    handleExecuteDeletion,
    handleExportResults,
    confirmDialog
  }
}
