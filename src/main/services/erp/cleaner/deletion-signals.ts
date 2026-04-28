import { DeletionErrorCategory, DeletionOutcome } from '../../../types/cleaner.types'

export interface DeletionSignalEvaluation {
  outcome: DeletionOutcome
  errorCategory?: DeletionErrorCategory
  errorMessage?: string
}

export function evaluateDeletionSignals(params: {
  rowChanged: boolean
  countDecreased: boolean | null
  hasError: boolean
  errorText?: string
}): DeletionSignalEvaluation {
  const { rowChanged, countDecreased, hasError, errorText } = params

  if (hasError) {
    return {
      outcome: DeletionOutcome.FailedErpError,
      errorCategory: DeletionErrorCategory.ErpRejection,
      errorMessage: errorText || 'ERP returned an error'
    }
  }

  if (rowChanged && countDecreased !== false) {
    return { outcome: DeletionOutcome.Success }
  }

  if (rowChanged && countDecreased === false) {
    return { outcome: DeletionOutcome.Uncertain }
  }

  if (!rowChanged && countDecreased === true) {
    return { outcome: DeletionOutcome.Success }
  }

  return {
    outcome: DeletionOutcome.FailedNoChange,
    errorCategory: DeletionErrorCategory.Unknown
  }
}
