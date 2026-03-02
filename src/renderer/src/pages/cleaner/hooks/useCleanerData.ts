import { useState, useEffect, useMemo, useCallback } from 'react'

export interface ValidationResult {
  materialName: string
  materialCode: string
  specification: string
  model: string
  managerName: string
  isMarkedForDeletion: boolean
  matchedTypeKeyword?: string
}

export const useCleanerState = () => {
  // Authentication & permissions
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUsername, setCurrentUsername] = useState<string>('')

  // State with sessionStorage persistence
  const [dryRun, setDryRun] = useState(() => {
    const saved = sessionStorage.getItem('cleaner_dryRun')
    return saved ? saved === 'true' : true
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

  // Shared Production IDs state
  const [sharedProductionIdsCount, setSharedProductionIdsCount] = useState(0)

  // Initialization
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

  // Persist settings
  useEffect(() => {
    sessionStorage.setItem('cleaner_dryRun', dryRun.toString())
  }, [dryRun])

  useEffect(() => {
    sessionStorage.setItem('cleaner_validationMode', valMode)
  }, [valMode])

  // Computed: Filtered results
  const filteredResults = useMemo(() => {
    let results = validationResults
    if (!isAdmin && currentUsername) {
      results = results.filter(r => r.managerName === currentUsername || !r.managerName)
    } else if (managers.length > 0 && selectedManagers.size > 0) {
      results = results.filter(
        r => selectedManagers.has(r.managerName) || !r.managerName
      )
    }
    results = results.filter(r => !hiddenItems.has(r.materialCode))
    return results
  }, [validationResults, isAdmin, currentUsername, managers, selectedManagers, hiddenItems])

  // Handlers
  const fetchValidationResults = useCallback(async () => {
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
          response.results
            .filter((r: ValidationResult) => r.isMarkedForDeletion)
            .map((r: ValidationResult) => r.materialCode)
        )
        setSelectedItems(markedCodes)

        if (isAdmin) {
          const uniqueManagers = new Set(
            response.results
              .map((r: ValidationResult) => r.managerName)
              .filter(Boolean)
          )
          setManagers([...uniqueManagers] as string[])
          setSelectedManagers(uniqueManagers as Set<string>)
        }
      } else {
        alert(response.error || '校验失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '校验过程中发生未知错误')
    } finally {
      setIsValidationRunning(false)
    }
  }, [valMode, isAdmin])

  const toggleSelection = useCallback((materialCode: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(materialCode)) newSet.delete(materialCode)
      else newSet.add(materialCode)
      return newSet
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedItems(new Set(filteredResults.map(r => r.materialCode)))
  }, [filteredResults])

  const deselectAll = useCallback(() => {
    setSelectedItems(new Set())
  }, [])

  const hideSelected = useCallback(() => {
    const checkedCodes = filteredResults.filter(r => selectedItems.has(r.materialCode)).map(r => r.materialCode)
    if (checkedCodes.length) setHiddenItems(prev => new Set([...prev, ...checkedCodes]))
  }, [filteredResults, selectedItems])

  const showAll = useCallback(() => {
    setHiddenItems(new Set())
  }, [])

  const confirmDeletion = useCallback(async () => {
    if (validationResults.length === 0) return alert('没有可处理的数据')

    const materialsToUpsert: { materialCode: string; managerName: string }[] = []
    const materialsToDelete: string[] = []
    const missingManager: string[] = []

    for (const result of validationResults) {
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
      alert(`以下已勾选的记录缺少负责人信息，无法保存：\n\n${missingManager.slice(0, 10).join('\n')}`)
      return
    }

    if (materialsToUpsert.length === 0 && materialsToDelete.length === 0) return alert('没有需要处理的记录')

    const confirmParts: string[] = []
    if (materialsToUpsert.length > 0) confirmParts.push(`写入/更新 ${materialsToUpsert.length} 条记录`)
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

      if (isAdmin) {
         const resp = await window.electron.materials.getManagers()
         setManagers(resp.managers)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    } finally {
      setIsRunning(false)
    }
  }, [validationResults, selectedItems, isAdmin])

  const executeDeletion = useCallback(async () => {
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

      if (orderNumberList.length === 0) throw new Error('没有订单号数据。请先到数据提取页面输入 Production ID。')
      if (materialCodeList.length === 0) throw new Error('没有物料代码数据。请确认已在物料清理界面确认要删除的物料。')

      const response = await window.electron.cleaner.runCleaner({
        orderNumbers: orderNumberList,
        materialCodes: materialCodeList,
        dryRun
      })

      if (response.success && response.data) {
         let msg = `清理执行完毕:\n处理订单: ${response.data.ordersProcessed}\n删除物料: ${response.data.materialsDeleted}\n跳过物料: ${response.data.materialsSkipped}`
         if (response.data.errors.length) {
            msg += `\n错误: ${response.data.errors.join(', ')}`
         }
         alert(msg)
      } else {
        throw new Error(response.error || '清理失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '发生未知错误')
    } finally {
      setIsRunning(false)
    }
  }, [dryRun])

  const resetList = useCallback(() => {
    setValidationResults([])
    setSelectedItems(new Set())
    setHiddenItems(new Set())
  }, [])

  return {
    isAdmin,
    dryRun,
    setDryRun,
    valMode,
    setValMode,
    validationResults,
    selectedItems,
    managers,
    selectedManagers,
    setSelectedManagers,
    isRunning,
    isValidationRunning,
    sharedProductionIdsCount,
    filteredResults,
    fetchValidationResults,
    toggleSelection,
    selectAll,
    deselectAll,
    hideSelected,
    showAll,
    confirmDeletion,
    executeDeletion,
    resetList
  }
}
