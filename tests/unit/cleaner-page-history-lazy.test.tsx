import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockHistoryModalModuleLoad } = vi.hoisted(() => ({
  mockHistoryModalModuleLoad: vi.fn()
}))

vi.mock('../../src/renderer/src/hooks/useCleaner', () => ({
  useCleaner: () => ({
    isAdmin: false,
    currentUsername: 'tester',
    dryRun: false,
    setDryRun: vi.fn(),
    valMode: 'database_full',
    setValMode: vi.fn(),
    validationResults: [],
    selectedItems: new Set<string>(),
    setSelectedItems: vi.fn(),
    setHiddenItems: vi.fn(),
    managers: [],
    selectedManagers: [],
    setSelectedManagers: vi.fn(),
    isRunning: false,
    isExecuting: false,
    isValidationRunning: false,
    isExporting: false,
    isTypeDialogOpen: false,
    setIsTypeDialogOpen: vi.fn(),
    headless: false,
    setHeadless: vi.fn(),
    processConcurrency: 1,
    updateProcessConcurrency: vi.fn(),
    showSettingsMenu: false,
    setShowSettingsMenu: vi.fn(),
    filteredResults: [],
    isReportDialogOpen: false,
    setIsReportDialogOpen: vi.fn(),
    reportData: null,
    editingCell: null,
    editValue: '',
    setEditValue: vi.fn(),
    inputRef: { current: null },
    startEdit: vi.fn(),
    saveEdit: vi.fn(),
    cancelEdit: vi.fn(),
    handleAssignManagerOnSelect: vi.fn(),
    progress: null,
    startTime: null,
    resetStartTime: vi.fn(),
    handleValidation: vi.fn(),
    handleCheckboxToggle: vi.fn(),
    handleConfirmDeletion: vi.fn(),
    handleExecuteDeletion: vi.fn(),
    handleExportResults: vi.fn(),
    confirmDialog: null
  })
}))

vi.mock('../../src/renderer/src/components/cleaner/CleanerExecutionBar', () => ({
  CleanerExecutionBar: () => React.createElement('div', null, 'execution-bar')
}))

vi.mock('../../src/renderer/src/components/cleaner/CleanerResultsTable', () => ({
  CleanerResultsTable: () => React.createElement('div', null, 'results-table')
}))

vi.mock('../../src/renderer/src/components/cleaner/CleanerSidebar', () => ({
  CleanerSidebar: () => React.createElement('aside', null, 'sidebar')
}))

vi.mock('../../src/renderer/src/components/cleaner/CleanerToolbar', () => ({
  CleanerToolbar: () => React.createElement('div', null, 'toolbar')
}))

vi.mock('../../src/renderer/src/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: () => React.createElement('div', null, 'confirm-dialog')
}))

vi.mock('../../src/renderer/src/components/MaterialTypeManagementDialog', () => ({
  default: () => React.createElement('div', null, 'type-dialog')
}))

vi.mock('../../src/renderer/src/components/ExecutionReportDialog', () => ({
  default: () => React.createElement('div', null, 'report-dialog')
}))

vi.mock('../../src/renderer/src/components/CleanerOperationHistoryModal', () => {
  mockHistoryModalModuleLoad()
  return {
    default: () => React.createElement('div', null, 'history-dialog')
  }
})

import CleanerPage from '../../src/renderer/src/pages/CleanerPage'

describe('CleanerPage history modal lazy loading', () => {
  beforeEach(() => {
    mockHistoryModalModuleLoad.mockClear()
  })

  it('does not load the history modal module on the initial render', () => {
    renderToStaticMarkup(React.createElement(CleanerPage))

    expect(mockHistoryModalModuleLoad).not.toHaveBeenCalled()
  })
})
