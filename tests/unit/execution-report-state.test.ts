import { describe, expect, it } from 'vitest'
import { getExecutionReportState } from '../../src/renderer/src/components/execution-report-state'

describe('execution report state helpers', () => {
  it('treats dry-run as preview regardless of counters', () => {
    const state = getExecutionReportState({
      dryRun: true,
      errors: ['should be ignored'],
      materialsFailed: 1,
      uncertainDeletions: 1
    })

    expect(state.state).toBe('preview')
    expect(state.title).toBe('预览执行报告')
  })

  it('treats runtime errors as failure', () => {
    const state = getExecutionReportState({
      errors: ['boom'],
      materialsFailed: 0,
      uncertainDeletions: 0
    })

    expect(state.state).toBe('failure')
    expect(state.title).toBe('执行完成 (失败)')
  })

  it('treats failed materials as partial success when there are no runtime errors', () => {
    const state = getExecutionReportState({
      errors: [],
      materialsFailed: 3,
      uncertainDeletions: 0
    })

    expect(state.state).toBe('partial_success')
    expect(state.showSuccessBanner).toBe(false)
  })

  it('treats uncertain deletions as manual review when everything else succeeded', () => {
    const state = getExecutionReportState({
      errors: [],
      materialsFailed: 0,
      uncertainDeletions: 2
    })

    expect(state.state).toBe('manual_review')
    expect(state.showSuccessBanner).toBe(false)
  })

  it('treats clean completion as success', () => {
    const state = getExecutionReportState({
      errors: [],
      materialsFailed: 0,
      uncertainDeletions: 0
    })

    expect(state.state).toBe('success')
    expect(state.showSuccessBanner).toBe(true)
  })
})
