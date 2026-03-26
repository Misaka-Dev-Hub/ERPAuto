import type { ValidationResult } from './types'

export interface MaterialBatchChange {
  materialCode: string
  managerName: string
}

export interface DeletionPlan {
  materialsToUpsert: MaterialBatchChange[]
  materialsToDelete: string[]
  missingManager: string[]
}

export interface CleanerExportItem {
  materialName: string
  materialCode: string
  specification: string
  model: string
  managerName: string
  isMarkedForDeletion: boolean
  isSelected: boolean
}

export function getStoredBoolean(key: string, fallback: boolean): boolean {
  const saved = sessionStorage.getItem(key)
  return saved ? saved === 'true' : fallback
}

export function getStoredValidationMode(): 'full' | 'filtered' {
  const saved = sessionStorage.getItem('cleaner_validationMode')
  return saved === 'full' ? 'full' : 'filtered'
}

export function filterValidationResults(params: {
  validationResults: ValidationResult[]
  isAdmin: boolean
  currentUsername: string
  managers: string[]
  selectedManagers: Set<string>
  hiddenItems: Set<string>
}): ValidationResult[] {
  const { validationResults, isAdmin, currentUsername, managers, selectedManagers, hiddenItems } =
    params

  let results = validationResults
  if (!isAdmin && currentUsername) {
    results = results.filter((result) => {
      return result.managerName === currentUsername || !result.managerName
    })
  } else if (managers.length > 0 && selectedManagers.size > 0) {
    results = results.filter((result) => {
      return selectedManagers.has(result.managerName) || !result.managerName
    })
  }

  return results.filter((result) => !hiddenItems.has(result.materialCode))
}

export function buildDeletionPlan(
  resultsToProcess: ValidationResult[],
  selectedItems: Set<string>
): DeletionPlan {
  const materialsToUpsert: MaterialBatchChange[] = []
  const materialsToDelete: string[] = []
  const missingManager: string[] = []

  for (const result of resultsToProcess) {
    if (!result.materialCode?.trim()) {
      continue
    }

    const code = result.materialCode.trim()
    if (selectedItems.has(code)) {
      if (!result.managerName?.trim()) {
        missingManager.push(code)
      } else {
        materialsToUpsert.push({
          materialCode: code,
          managerName: result.managerName.trim()
        })
      }
    } else {
      materialsToDelete.push(code)
    }
  }

  return {
    materialsToUpsert,
    materialsToDelete,
    missingManager
  }
}

export function buildExportItems(
  filteredResults: ValidationResult[],
  selectedItems: Set<string>
): CleanerExportItem[] {
  return filteredResults.map((result) => ({
    materialName: result.materialName,
    materialCode: result.materialCode,
    specification: result.specification || '',
    model: result.model || '',
    managerName: result.managerName || '',
    isMarkedForDeletion: result.isMarkedForDeletion,
    isSelected: selectedItems.has(result.materialCode)
  }))
}
