import type { FrameLocator, Locator, Page } from 'playwright'
import { DeletionErrorCategory, DeletionOutcome } from '../../../types/cleaner.types'
import type { MaterialDeletionAttempt } from '../../../types/cleaner.types'
import { ERP_LOCATORS } from '../locators'
import { evaluateDeletionSignals } from './deletion-signals'
import { delay } from './utils'

type CleanerLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => void
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
}

export interface DeleteWithVerificationParams {
  childForm: FrameLocator | Locator
  detailInnerFrame: FrameLocator | Locator
  deleteRowBtn: Locator
  materialCode: string
  materialName: string
  currentRowNumber: string
  materialCountBefore: number
  maxAttempts?: number
  attemptDelayMs?: number
}

export interface DeleteWithVerificationResult {
  outcome: DeletionOutcome
  errorCategory?: DeletionErrorCategory
  errorMessage?: string
  attempts: MaterialDeletionAttempt[]
}

export class MaterialDeletionVerifier {
  private static readonly MATERIAL_RETRY_MAX_ATTEMPTS = 3
  private static readonly MATERIAL_RETRY_DELAY_MS = 1000
  private static readonly VERIFICATION_TIMEOUT_MS = 8000

  constructor(private readonly log: CleanerLogger) {}

  async readMaterialCount(detailInnerFrame: FrameLocator | Locator): Promise<number | null> {
    try {
      const text = await detailInnerFrame.getByText(/^详细信息 \(\d+\)$/).innerText()
      const match = text.match(/\((\d+)\)/)
      return match ? parseInt(match[1], 10) : null
    } catch {
      return null
    }
  }

  async deleteWithVerification(
    params: DeleteWithVerificationParams
  ): Promise<DeleteWithVerificationResult> {
    const {
      childForm,
      detailInnerFrame,
      deleteRowBtn,
      materialCode,
      materialName,
      currentRowNumber,
      materialCountBefore,
      maxAttempts = MaterialDeletionVerifier.MATERIAL_RETRY_MAX_ATTEMPTS,
      attemptDelayMs = MaterialDeletionVerifier.MATERIAL_RETRY_DELAY_MS
    } = params

    const attempts: MaterialDeletionAttempt[] = []

    for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
      const attemptStart = Date.now()

      const btnEnabled = await this.isButtonEnabled(deleteRowBtn)
      if (!btnEnabled) {
        attempts.push({
          attempt: attemptNum,
          outcome: DeletionOutcome.FailedButtonDisabled,
          errorCategory: DeletionErrorCategory.UiUnexpected,
          errorMessage: '删行按钮不可用',
          rowNumberBefore: currentRowNumber,
          rowNumberAfter: currentRowNumber,
          materialCountBefore,
          materialCountAfter: materialCountBefore,
          timestamp: attemptStart,
          durationMs: Date.now() - attemptStart
        })
        return {
          outcome: DeletionOutcome.FailedButtonDisabled,
          errorCategory: DeletionErrorCategory.UiUnexpected,
          errorMessage: '删行按钮不可用',
          attempts
        }
      }

      await deleteRowBtn.click()

      const msgCheck = await this.checkErpMessages(detailInnerFrame)
      if (msgCheck.hasConfirmDialog) {
        await this.handleConfirmDialog(detailInnerFrame)
      }

      if (msgCheck.hasError) {
        const attempt: MaterialDeletionAttempt = {
          attempt: attemptNum,
          outcome: DeletionOutcome.FailedErpError,
          errorCategory: DeletionErrorCategory.ErpRejection,
          errorMessage: msgCheck.errorText,
          rowNumberBefore: currentRowNumber,
          rowNumberAfter: currentRowNumber,
          materialCountBefore,
          materialCountAfter: materialCountBefore,
          timestamp: attemptStart,
          durationMs: Date.now() - attemptStart
        }
        attempts.push(attempt)
        return {
          outcome: DeletionOutcome.FailedErpError,
          errorCategory: DeletionErrorCategory.ErpRejection,
          errorMessage: msgCheck.errorText,
          attempts
        }
      }

      const verificationStart = Date.now()
      const timeout = MaterialDeletionVerifier.VERIFICATION_TIMEOUT_MS
      let rowNumberAfter = currentRowNumber
      let materialCountAfter: number | null = materialCountBefore

      while (Date.now() - verificationStart < timeout) {
        rowNumberAfter = await this.getInputValue(childForm, /^行号$/)
        materialCountAfter = await this.readMaterialCount(detailInnerFrame)

        const rowChanged = rowNumberAfter !== currentRowNumber
        const countDecreased =
          materialCountAfter !== null ? materialCountAfter < materialCountBefore : null

        if (rowChanged || countDecreased === true) {
          break
        }

        await delay(300)
      }

      if (rowNumberAfter === currentRowNumber && materialCountAfter === materialCountBefore) {
        rowNumberAfter = await this.getInputValue(childForm, /^行号$/)
        materialCountAfter = await this.readMaterialCount(detailInnerFrame)
      }

      const rowChanged = rowNumberAfter !== currentRowNumber
      const countDecreased =
        materialCountAfter !== null ? materialCountAfter < materialCountBefore : null

      const evaluation = evaluateDeletionSignals({
        rowChanged,
        countDecreased,
        hasError: false
      })

      const attempt: MaterialDeletionAttempt = {
        attempt: attemptNum,
        outcome: evaluation.outcome,
        errorCategory: evaluation.errorCategory,
        errorMessage: evaluation.errorMessage,
        rowNumberBefore: currentRowNumber,
        rowNumberAfter,
        materialCountBefore,
        materialCountAfter: materialCountAfter ?? materialCountBefore,
        timestamp: attemptStart,
        durationMs: Date.now() - attemptStart
      }
      attempts.push(attempt)

      if (
        evaluation.outcome === DeletionOutcome.Success ||
        evaluation.outcome === DeletionOutcome.Uncertain
      ) {
        return {
          outcome: evaluation.outcome,
          errorCategory: evaluation.errorCategory,
          errorMessage: evaluation.errorMessage,
          attempts
        }
      }

      if (attemptNum < maxAttempts) {
        this.log.info('[物料删除重试] 等待后重试', {
          materialCode,
          materialName,
          attempt: attemptNum,
          nextAttempt: attemptNum + 1,
          delayMs: attemptDelayMs
        })
        await delay(attemptDelayMs)
      }
    }

    return {
      outcome: DeletionOutcome.FailedNoChange,
      errorCategory: DeletionErrorCategory.VerificationTimeout,
      errorMessage: `${maxAttempts} 次尝试后仍无法确认删除`,
      attempts
    }
  }

  private async checkErpMessages(
    container: FrameLocator | Locator | Page
  ): Promise<{ hasError: boolean; errorText?: string; hasConfirmDialog: boolean }> {
    try {
      const errorLocator = container.locator(ERP_LOCATORS.common.errorMessage)
      const hasError = await errorLocator.isVisible().catch(() => false)
      let errorText: string | undefined
      if (hasError) {
        errorText = (await errorLocator.textContent().catch(() => undefined)) ?? undefined
      }

      const confirmLocator = container.locator(ERP_LOCATORS.common.confirmDialog)
      const hasConfirmDialog = await confirmLocator.isVisible().catch(() => false)

      return { hasError, errorText, hasConfirmDialog }
    } catch {
      return { hasError: false, hasConfirmDialog: false }
    }
  }

  private async handleConfirmDialog(container: FrameLocator | Locator | Page): Promise<void> {
    try {
      const confirmBtn = container.locator(ERP_LOCATORS.common.confirmButton).first()
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click()
        this.log.debug('[确认对话框] 已自动点击确定')
        await delay(500)
      }
    } catch {
      this.log.warn('[确认对话框] 处理确认对话框失败')
    }
  }

  private async getInputValue(container: FrameLocator | Locator, label: RegExp): Promise<string> {
    const input = container.getByLabel(label).first()
    return (await input.inputValue()).trim()
  }

  private async isButtonEnabled(button: Locator): Promise<boolean> {
    try {
      return await button.isEnabled()
    } catch {
      return false
    }
  }
}
