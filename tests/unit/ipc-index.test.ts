import { describe, it, expect } from 'vitest'
import { withErrorHandling } from '../../src/main/ipc'
import { ValidationError } from '../../src/main/types/errors'

describe('IPC Result Wrapper', () => {
  it('wraps successful values into IpcResult.data', async () => {
    const result = await withErrorHandling(async () => ({ value: 42 }), 'test:success')
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ value: 42 })
  })

  it('wraps exceptions into IpcResult.error/code', async () => {
    const result = await withErrorHandling(async () => {
      throw new ValidationError('Invalid input', 'VAL_INVALID_INPUT')
    }, 'test:failure')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid input')
    expect(result.code).toBe('VAL_INVALID_INPUT')
  })
})
