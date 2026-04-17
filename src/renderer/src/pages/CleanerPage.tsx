import React, { Suspense } from 'react'
import { CleanerExecutionBar } from '../components/cleaner/CleanerExecutionBar'
import { CleanerResultsTable } from '../components/cleaner/CleanerResultsTable'
import { CleanerSidebar } from '../components/cleaner/CleanerSidebar'
import { CleanerToolbar } from '../components/cleaner/CleanerToolbar'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useCleaner } from '../hooks/useCleaner'

const MaterialTypeManagementDialog = React.lazy(
  () => import('../components/MaterialTypeManagementDialog')
)
const ExecutionReportDialog = React.lazy(() => import('../components/ExecutionReportDialog'))
const CleanerOperationHistoryModal = React.lazy(
  () => import('../components/CleanerOperationHistoryModal')
)

const CleanerPage: React.FC = () => {
  const typeManagementButtonRef = React.useRef<HTMLButtonElement>(null)
  const executeButtonRef = React.useRef<HTMLButtonElement>(null)

  const {
    isAdmin,
    currentUsername,
    dryRun,
    setDryRun,
    valMode,
    setValMode,
    validationResults,
    selectedItems,
    setSelectedItems,
    setHiddenItems,
    managers,
    selectedManagers,
    setSelectedManagers,
    isRunning,
    isExecuting,
    isValidationRunning,
    isExporting,
    isTypeDialogOpen,
    setIsTypeDialogOpen,
    headless,
    setHeadless,
    processConcurrency,
    updateProcessConcurrency,
    recordVideo,
    updateRecordVideo,
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
  } = useCleaner()

  const [showHistoryModal, setShowHistoryModal] = React.useState(false)

  return (
    <div className="h-full flex flex-col xl:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {isAdmin && (
        <CleanerSidebar
          valMode={valMode}
          setValMode={setValMode}
          managers={managers}
          selectedManagers={selectedManagers}
          setSelectedManagers={setSelectedManagers}
        />
      )}

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <CleanerToolbar
          validationResults={validationResults}
          filteredResults={filteredResults}
          selectedItems={selectedItems}
          setSelectedItems={setSelectedItems}
          setHiddenItems={setHiddenItems}
          isValidationRunning={isValidationRunning}
          isRunning={isRunning}
          isExporting={isExporting}
          isTypeDialogOpen={isTypeDialogOpen}
          setIsTypeDialogOpen={setIsTypeDialogOpen}
          handleValidation={handleValidation}
          handleConfirmDeletion={handleConfirmDeletion}
          handleExportResults={handleExportResults}
          setShowHistoryModal={setShowHistoryModal}
          typeManagementButtonRef={typeManagementButtonRef}
        />

        <CleanerResultsTable
          validationResults={validationResults}
          filteredResults={filteredResults}
          selectedItems={selectedItems}
          isAdmin={isAdmin}
          managers={managers}
          editingCell={editingCell}
          editValue={editValue}
          setEditValue={setEditValue}
          inputRef={inputRef}
          handleCheckboxToggle={handleCheckboxToggle}
          handleAssignManagerOnSelect={handleAssignManagerOnSelect}
          startEdit={startEdit}
          saveEdit={saveEdit}
          cancelEdit={cancelEdit}
        />

        <CleanerExecutionBar
          filteredCount={filteredResults.length}
          selectedCount={selectedItems.size}
          dryRun={dryRun}
          setDryRun={setDryRun}
          headless={headless}
          setHeadless={setHeadless}
          processConcurrency={processConcurrency}
          updateProcessConcurrency={updateProcessConcurrency}
          recordVideo={recordVideo}
          updateRecordVideo={updateRecordVideo}
          showSettingsMenu={showSettingsMenu}
          setShowSettingsMenu={setShowSettingsMenu}
          handleExecuteDeletion={handleExecuteDeletion}
          isRunning={isRunning}
          executeButtonRef={executeButtonRef}
        />
      </div>

      <Suspense fallback={null}>
        <MaterialTypeManagementDialog
          isOpen={isTypeDialogOpen}
          onClose={() => setIsTypeDialogOpen(false)}
          isAdmin={isAdmin}
          currentUsername={currentUsername}
          triggerRef={typeManagementButtonRef}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ExecutionReportDialog
          isOpen={isReportDialogOpen}
          onClose={() => {
            setIsReportDialogOpen(false)
            resetStartTime()
          }}
          ordersProcessed={reportData?.ordersProcessed}
          materialsDeleted={reportData?.materialsDeleted}
          materialsSkipped={reportData?.materialsSkipped}
          errors={reportData?.errors}
          dryRun={dryRun}
          isExecuting={isExecuting}
          progress={progress}
          startTime={startTime}
          triggerRef={executeButtonRef}
          retriedOrders={reportData?.retriedOrders}
          successfulRetries={reportData?.successfulRetries}
          materialsFailed={reportData?.materialsFailed}
          uncertainDeletions={reportData?.uncertainDeletions}
        />
      </Suspense>

      {showHistoryModal ? (
        <Suspense fallback={null}>
          <CleanerOperationHistoryModal
            isOpen={showHistoryModal}
            onClose={() => setShowHistoryModal(false)}
            user={
              currentUsername
                ? { username: currentUsername, userType: isAdmin ? 'Admin' : 'User' }
                : null
            }
          />
        </Suspense>
      ) : null}

      {/* Confirmation Dialog */}
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </div>
  )
}

export default CleanerPage
