import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { showSuccess, showError, showWarning, formatListMessage } from '../stores/useAppStore'
import { useLogger } from './useLogger'
import { ConfirmDialogProps } from '../components/ui/ConfirmDialog'
import {
  buildDeletionPlan,
  buildExportItems,
  filterValidationResults,
  getStoredBoolean,
  getStoredValidationMode
} from './cleaner/helpers'
import {
  exportCleanerResults,
  initializeCleanerPage,
  loadCleanerConfig as fetchCleanerConfig,
  reloadManagers,
  runCleanerExecution,
  runValidationRequest,
  saveDeletionPlan
} from './cleaner/api'
import type { CleanerProgress, CleanerReportData, ValidationResult } from './cleaner/types'

export function useCleaner() {
  const logger = useLogger('Cleaner')

  // Authentication & permissions
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUsername, setCurrentUsername] = useState<string>('')

  // State with sessionStorage persistence
  const [dryRun, setDryRun] = useState(() => getStoredBoolean('cleaner_dryRun', false))
  const [valMode, setValMode] = useState<'full' | 'filtered'>(() => getStoredValidationMode())

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
  const [reportData, setReportData] = useState<CleanerReportData | null>(null)

  // Progress state
  const [progress, setProgress] = useState<CleanerProgress | null>(null)
  const [startTime, setStartTime] = useState<number | null>(null)

  // Execution settings state
  const [headless, setHeadless] = useState(() => getStoredBoolean('cleaner_headless', true))
  const [queryBatchSize, setQueryBatchSize] = useState(100)
  const [processConcurrency, setProcessConcurrency] = useState(1)
  const [sessionRefreshOrderThreshold, setSessionRefreshOrderThreshold] = useState(160)
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
        const result = await initializeCleanerPage()
        setIsAdmin(result.isAdmin)
        setCurrentUsername(result.currentUsername)
        setManagers(result.managers)
        setSharedProductionIdsCount(result.sharedProductionIdsCount)

        if (result.isAdmin) {
          setSelectedManagers(new Set(result.managers))
        } else if (result.currentUsername) {
          setSelectedManagers(new Set([result.currentUsername]))
        }
      } catch (err) {
        logger.error('Cleaner page initialization failed', {
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }
    initializePage()
  }, [logger])

  // Subscribe to cleaner progress events
  useEffect(() => {
    const unsubscribeProgress = window.electron.cleaner.onProgress((data) => {
      setProgress(data)
    })

    return () => {
      unsubscribeProgress()
    }
  }, [])

  // Load cleaner config from config.yaml on mount
  useEffect(() => {
    const loadCleanerConfig = async () => {
      try {
        const result = await fetchCleanerConfig()
        if (result) {
          setQueryBatchSize(result.queryBatchSize)
          setProcessConcurrency(result.processConcurrency)
          setSessionRefreshOrderThreshold(result.sessionRefreshOrderThreshold)
        }
      } catch (err) {
        logger.error('Failed to load cleaner config', {
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }
    loadCleanerConfig()
  }, [logger])

  useEffect(() => {
    sessionStorage.setItem('cleaner_dryRun', dryRun.toString())
  }, [dryRun])

  useEffect(() => {
    sessionStorage.setItem('cleaner_headless', headless.toString())
  }, [headless])

  const updateProcessConcurrency = async (value: number) => {
    const clamped = Math.max(1, Math.min(20, value))
    setProcessConcurrency(clamped)
    try {
      await window.electron.config.updateCleaner({ processConcurrency: clamped })
    } catch (err) {
      logger.error('Failed to update process concurrency', {
        error: err instanceof Error ? err.message : String(err),
        value: clamped
      })
    }
  }

  useEffect(() => {
    sessionStorage.setItem('cleaner_validationMode', valMode)
  }, [valMode])

  // Filter validation results by selected managers and hidden items
  const filteredResults = useMemo(() => {
    return filterValidationResults({
      validationResults,
      isAdmin,
      currentUsername,
      managers,
      selectedManagers,
      hiddenItems
    })
  }, [validationResults, isAdmin, currentUsername, managers, selectedManagers, hiddenItems])

  // Handlers
  const handleValidation = async () => {
    setIsValidationRunning(true)
    setValidationResults([])
    setSelectedItems(new Set())
    setHiddenItems(new Set())

    try {
      const validationData = await runValidationRequest({
        mode: valMode === 'full' ? 'database_full' : 'database_filtered',
        useSharedProductionIds: valMode === 'filtered'
      })

      if (validationData?.success && validationData.results) {
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
        showError(validationData?.error || '校验失败')
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

    const { materialsToUpsert, materialsToDelete, missingManager } = buildDeletionPlan(
      resultsToProcess,
      selectedItems
    )

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

      const result = await saveDeletionPlan({ materialsToUpsert, materialsToDelete })
      if (materialsToUpsert.length > 0) msgParts.push(`写入/更新成功：${result.upserted} 条`)
      if (materialsToDelete.length > 0) msgParts.push(`删除成功：${result.deleted} 条`)

      showSuccess(`操作完成！\n\n${msgParts.join('\n')}`)

      // Reload managers if admin
      if (isAdmin) {
        setManagers(await reloadManagers())
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
      const result = await runCleanerExecution({
        dryRun,
        headless,
        queryBatchSize,
        processConcurrency,
        sessionRefreshOrderThreshold,
        selectedManagers: Array.from(selectedManagers)
      })
      setReportData(result)
    } catch (err) {
      showError(err instanceof Error ? err.message : '发生未知错误')
    } finally {
      setIsRunning(false)
      setIsExecuting(false)
      setProgress(null)
      // Note: Don't clear startTime here - it's needed for the execution report dialog
      // startTime will be reset when the dialog closes and a new execution starts
    }
  }

  const resetStartTime = useCallback(() => {
    setStartTime(null)
  }, [])

  const handleExportResults = async () => {
    if (filteredResults.length === 0) {
      showWarning('没有数据可导出')
      return
    }

    setIsExporting(true)
    try {
      const filePath = await exportCleanerResults(buildExportItems(filteredResults, selectedItems))
      showSuccess(`导出成功！\n文件已保存到：${filePath}`)
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
    sessionRefreshOrderThreshold,
    setSessionRefreshOrderThreshold,
    updateProcessConcurrency,
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
    resetStartTime,
    handleValidation,
    handleCheckboxToggle,
    handleConfirmDeletion,
    handleExecuteDeletion,
    handleExportResults,
    confirmDialog
  }
}
