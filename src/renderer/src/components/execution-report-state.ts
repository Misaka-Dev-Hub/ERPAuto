export type ExecutionReportResultState =
  | 'preview'
  | 'success'
  | 'partial_success'
  | 'manual_review'
  | 'failure'

export interface ExecutionReportStateInput {
  dryRun?: boolean
  errors?: string[]
  materialsFailed?: number
  uncertainDeletions?: number
}

export interface ExecutionReportStateDescriptor {
  state: ExecutionReportResultState
  title: string
  summary: string
  showSuccessBanner: boolean
  showPreviewBanner: boolean
}

export function getExecutionReportState(
  input: ExecutionReportStateInput
): ExecutionReportStateDescriptor {
  const {
    dryRun = false,
    errors = [],
    materialsFailed = 0,
    uncertainDeletions = 0
  } = input

  if (dryRun) {
    return {
      state: 'preview',
      title: '预览执行报告',
      summary: '预览模式 - 未实际删除数据',
      showSuccessBanner: false,
      showPreviewBanner: true
    }
  }

  if (errors.length > 0) {
    return {
      state: 'failure',
      title: '执行完成 (失败)',
      summary: '执行过程中出现错误，请先处理错误后再继续。',
      showSuccessBanner: false,
      showPreviewBanner: false
    }
  }

  if (materialsFailed > 0) {
    return {
      state: 'partial_success',
      title: '执行完成 (部分成功)',
      summary: '部分物料删除失败，请结合下方统计和历史记录继续排查。',
      showSuccessBanner: false,
      showPreviewBanner: false
    }
  }

  if (uncertainDeletions > 0) {
    return {
      state: 'manual_review',
      title: '执行完成 (需人工确认)',
      summary: '存在不确定删除结果，请人工复核后再判断是否完成。',
      showSuccessBanner: false,
      showPreviewBanner: false
    }
  }

  return {
    state: 'success',
    title: '执行完成',
    summary: '所有操作已成功完成',
    showSuccessBanner: true,
    showPreviewBanner: false
  }
}
