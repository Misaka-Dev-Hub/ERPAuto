import { useState, useEffect, useMemo } from 'react'

export interface ValidationResult {
  materialName: string
  materialCode: string
  specification: string
  model: string
  managerName: string
  isMarkedForDeletion: boolean
  matchedTypeKeyword?: string
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
  } | null>(null)

  // Execution settings state
  const [headless, setHeadless] = useState(() => {
    const saved = sessionStorage.getItem('cleaner_headless')
    return saved ? saved === 'true' : true
  })
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)

  // Check admin status and get shared Production IDs on mount
  useEffect(() => {
    const initializePage = async () => {
      try {
        const admin = await window.electron.auth.isAdmin()
        const user = await window.electron.auth.getCurrentUser()
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
          setManagers(resp.managers)
          setSelectedManagers(new Set(resp.managers))
        }

        // Get shared Production IDs
        const result = await window.electron.validation.getSharedProductionIds()
        setSharedProductionIdsCount(result.productionIds.length)
      } catch (err) {
        console.error('Initialization failed:', err)
      }
    }
    initializePage()
  }, [])

  useEffect(() => {
    sessionStorage.setItem('cleaner_dryRun', dryRun.toString())
  }, [dryRun])

  useEffect(() => {
    sessionStorage.setItem('cleaner_headless', headless.toString())
  }, [headless])

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

      if (response.success && response.results) {
        setValidationResults(response.results)
        const markedCodes = new Set(
          response.results.filter((r) => r.isMarkedForDeletion).map((r) => r.materialCode)
        )
        setSelectedItems(markedCodes)

        if (isAdmin) {
          const uniqueManagers = new Set(response.results.map((r) => r.managerName).filter(Boolean))
          setManagers([...uniqueManagers])
          setSelectedManagers(uniqueManagers)
        }
      } else {
        alert(response.error || '校验失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '校验过程中发生未知错误')
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

  const handleConfirmDeletion = async () => {
    const resultsToProcess = isAdmin ? validationResults : filteredResults

    if (resultsToProcess.length === 0) return alert('没有可处理的数据')

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
      alert(
        `以下已勾选的记录缺少负责人信息，无法保存：\n\n${missingManager.slice(0, 10).join('\n')}`
      )
      return
    }

    if (materialsToUpsert.length === 0 && materialsToDelete.length === 0)
      return alert('没有需要处理的记录')

    const confirmParts: string[] = []
    if (materialsToUpsert.length > 0)
      confirmParts.push(`写入/更新 ${materialsToUpsert.length} 条记录`)
    if (materialsToDelete.length > 0) confirmParts.push(`删除 ${materialsToDelete.length} 条记录`)

    if (!window.confirm(`确认以下操作吗？\n\n${confirmParts.join('\n')}`)) return

    try {
      setIsRunning(true)
      let msgParts: string[] = []

      if (materialsToUpsert.length > 0) {
        const res = await window.electron.materials.upsertBatch(materialsToUpsert)
        if (!res.success) throw new Error(res.error || '写入物料失败')
        msgParts.push(`写入/更新成功：${res.stats?.success || 0} 条`)
      }

      if (materialsToDelete.length > 0) {
        const res = await window.electron.materials.delete(materialsToDelete)
        if (!res.success) throw new Error(res.error || '删除物料失败')
        msgParts.push(`删除成功：${res.count || 0} 条`)
      }

      alert(`操作完成！\n\n${msgParts.join('\n')}`)

      // Reload managers if admin
      if (isAdmin) {
        const resp = await window.electron.materials.getManagers()
        setManagers(resp.managers)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    } finally {
      setIsRunning(false)
    }
  }

  const handleExecuteDeletion = async () => {
    if (!dryRun) {
      if (!window.confirm('警告：正式执行将删除 ERP 系统中的物料数据，是否继续？')) return
    }

    setIsRunning(true)
    try {
      const cleanerDataResult = await window.electron.validation.getCleanerData()
      if (!cleanerDataResult.success) {
        throw new Error(cleanerDataResult.error || '获取清理数据失败')
      }

      const orderNumberList = cleanerDataResult.orderNumbers || []
      const materialCodeList = cleanerDataResult.materialCodes || []

      if (orderNumberList.length === 0)
        throw new Error('没有订单号数据。请先到数据提取页面输入 Production ID。')
      if (materialCodeList.length === 0)
        throw new Error('没有物料代码数据。请确认已在物料清理界面确认要删除的物料。')

      const response = await window.electron.cleaner.runCleaner({
        orderNumbers: orderNumberList,
        materialCodes: materialCodeList,
        dryRun,
        headless
      })

      if (response.success && response.data) {
        setReportData({
          ordersProcessed: response.data.ordersProcessed,
          materialsDeleted: response.data.materialsDeleted,
          materialsSkipped: response.data.materialsSkipped,
          errors: response.data.errors
        })
        setIsReportDialogOpen(true)
      } else {
        throw new Error(response.error || '清理失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '发生未知错误')
    } finally {
      setIsRunning(false)
    }
  }

  const handleExportResults = async () => {
    if (filteredResults.length === 0) {
      alert('没有数据可导出')
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

      if (response.success) {
        alert(`导出成功！\n文件已保存到：${response.filePath}`)
      } else {
        throw new Error(response.error || '导出失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '导出过程中发生错误')
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
    isValidationRunning,
    isExporting,
    sharedProductionIdsCount,
    isTypeDialogOpen,
    setIsTypeDialogOpen,
    headless,
    setHeadless,
    showSettingsMenu,
    setShowSettingsMenu,
    filteredResults,
    isReportDialogOpen,
    setIsReportDialogOpen,
    reportData,
    handleValidation,
    handleCheckboxToggle,
    handleConfirmDeletion,
    handleExecuteDeletion,
    handleExportResults
  }
}
