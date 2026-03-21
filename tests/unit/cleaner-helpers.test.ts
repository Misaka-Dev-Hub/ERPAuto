import { describe, expect, it } from 'vitest'
import {
  buildDeletionPlan,
  buildExportItems,
  filterValidationResults
} from '../../src/renderer/src/hooks/cleaner/helpers'
import type { ValidationResult } from '../../src/renderer/src/hooks/cleaner/types'

const sampleResults: ValidationResult[] = [
  {
    materialName: 'A',
    materialCode: 'M1',
    specification: '',
    model: '',
    managerName: 'alice',
    isMarkedForDeletion: true
  },
  {
    materialName: 'B',
    materialCode: 'M2',
    specification: '',
    model: '',
    managerName: '',
    isMarkedForDeletion: false
  },
  {
    materialName: 'C',
    materialCode: 'M3',
    specification: '',
    model: '',
    managerName: 'bob',
    isMarkedForDeletion: false
  }
]

describe('cleaner helpers', () => {
  it('filters results for non-admin users and hidden items', () => {
    const filtered = filterValidationResults({
      validationResults: sampleResults,
      isAdmin: false,
      currentUsername: 'alice',
      managers: [],
      selectedManagers: new Set(),
      hiddenItems: new Set(['M2'])
    })

    expect(filtered.map((item) => item.materialCode)).toEqual(['M1'])
  })

  it('builds deletion plan with missing managers', () => {
    const plan = buildDeletionPlan(sampleResults, new Set(['M1', 'M2']))

    expect(plan.materialsToUpsert).toEqual([{ materialCode: 'M1', managerName: 'alice' }])
    expect(plan.materialsToDelete).toEqual(['M3'])
    expect(plan.missingManager).toEqual(['M2'])
  })

  it('builds export items with selection state', () => {
    const items = buildExportItems(sampleResults.slice(0, 1), new Set(['M1']))

    expect(items).toEqual([
      {
        materialName: 'A',
        materialCode: 'M1',
        specification: '',
        model: '',
        managerName: 'alice',
        isMarkedForDeletion: true,
        isSelected: true
      }
    ])
  })
})
