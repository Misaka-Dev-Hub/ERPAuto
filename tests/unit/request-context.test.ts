/**
 * RequestContext Unit Tests
 *
 * Tests for AsyncLocalStorage-based request context management:
 * - Context propagation across async/await
 * - Concurrent request isolation
 * - Nested contexts
 * - Non-request scenarios
 * - userId and operation fields
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  run,
  getRequestId,
  getContext,
  withContext,
  LoggerContext
} from '../../src/main/services/logger/request-context'

describe('RequestContext', () => {
  beforeEach(() => {
    // Clear any existing context before each test
  })

  afterEach(() => {
    // Context is automatically cleaned up when async scope exits
  })

  describe('run()', () => {
    it('should create context with auto-generated requestId', async () => {
      let capturedRequestId: string | undefined

      await run(async () => {
        capturedRequestId = getRequestId()
      })

      expect(capturedRequestId).toBeDefined()
      expect(typeof capturedRequestId).toBe('string')
      // UUID v4 format check (basic)
      expect(capturedRequestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })

    it('should include userId when provided', async () => {
      let context: LoggerContext | undefined

      await run(
        async () => {
          context = getContext()
        },
        { userId: 'user-123' }
      )

      expect(context).toBeDefined()
      expect(context?.userId).toBe('user-123')
      expect(context?.requestId).toBeDefined()
    })

    it('should include operation when provided', async () => {
      let context: LoggerContext | undefined

      await run(
        async () => {
          context = getContext()
        },
        { operation: 'extract' }
      )

      expect(context).toBeDefined()
      expect(context?.operation).toBe('extract')
      expect(context?.requestId).toBeDefined()
    })

    it('should include both userId and operation when provided', async () => {
      let context: LoggerContext | undefined

      await run(
        async () => {
          context = getContext()
        },
        { userId: 'user-456', operation: 'clean' }
      )

      expect(context).toBeDefined()
      expect(context?.userId).toBe('user-456')
      expect(context?.operation).toBe('clean')
      expect(context?.requestId).toBeDefined()
    })

    it('should work without optional context', async () => {
      let context: LoggerContext | undefined

      await run(async () => {
        context = getContext()
      })

      expect(context).toBeDefined()
      expect(context?.requestId).toBeDefined()
      expect(context?.userId).toBeUndefined()
      expect(context?.operation).toBeUndefined()
    })
  })

  describe('Context Propagation', () => {
    it('should propagate context across async/await', async () => {
      const requestIds: (string | undefined)[] = []

      async function nestedOperation() {
        requestIds.push(getRequestId())
        await Promise.resolve() // Simulate async operation
        requestIds.push(getRequestId())
      }

      await run(async () => {
        requestIds.push(getRequestId())
        await nestedOperation()
        requestIds.push(getRequestId())
      })

      // All should have the same requestId
      expect(requestIds).toHaveLength(4)
      expect(new Set(requestIds).size).toBe(1)
      expect(requestIds[0]).toBeDefined()
    })

    it('should propagate context through Promise.all', async () => {
      const requestIds: (string | undefined)[] = []

      await run(async () => {
        const outerId = getRequestId()
        requestIds.push(outerId)

        await Promise.all([
          (async () => {
            requestIds.push(getRequestId())
            await Promise.resolve()
            requestIds.push(getRequestId())
          })(),
          (async () => {
            requestIds.push(getRequestId())
            await Promise.resolve()
            requestIds.push(getRequestId())
          })()
        ])

        requestIds.push(getRequestId())
      })

      // All should have the same requestId (6 total: 1 outer + 2 from each parallel + 1 final)
      expect(requestIds).toHaveLength(6)
      expect(new Set(requestIds).size).toBe(1)
    })
  })

  describe('Concurrent Request Isolation', () => {
    it('should maintain separate contexts for concurrent requests', async () => {
      const request1Ids: (string | undefined)[] = []
      const request2Ids: (string | undefined)[] = []

      const promise1 = run(
        async () => {
          request1Ids.push(getRequestId())
          await new Promise((resolve) => setTimeout(resolve, 10))
          request1Ids.push(getRequestId())
        },
        { userId: 'user-1', operation: 'extract' }
      )

      const promise2 = run(
        async () => {
          request2Ids.push(getRequestId())
          await new Promise((resolve) => setTimeout(resolve, 5))
          request2Ids.push(getRequestId())
        },
        { userId: 'user-2', operation: 'clean' }
      )

      await Promise.all([promise1, promise2])

      // Each request should have consistent internal context
      expect(request1Ids).toHaveLength(2)
      expect(request2Ids).toHaveLength(2)

      // promise1 should be consistent
      expect(request1Ids[0]).toBe(request1Ids[1])
      // promise2 should be consistent
      expect(request2Ids[0]).toBe(request2Ids[1])
      // Different requests should have different requestIds
      expect(request1Ids[0]).not.toBe(request2Ids[0])
    })

    it('should not leak context between sequential requests', async () => {
      let firstRequestId: string | undefined
      let secondRequestId: string | undefined

      // First request
      await run(
        async () => {
          firstRequestId = getRequestId()
        },
        { userId: 'first-user' }
      )

      // Second request (should have new context)
      await run(
        async () => {
          secondRequestId = getRequestId()
        },
        { userId: 'second-user' }
      )

      expect(firstRequestId).toBeDefined()
      expect(secondRequestId).toBeDefined()
      expect(firstRequestId).not.toBe(secondRequestId)

      // Outside any context, should be undefined
      expect(getRequestId()).toBeUndefined()
    })
  })

  describe('Nested Contexts', () => {
    it('should support nesting without affecting outer context', async () => {
      const requestIds: { outer: string | undefined; inner: string | undefined } = {
        outer: undefined,
        inner: undefined
      }

      await run(
        async () => {
          requestIds.outer = getRequestId()

          await run(async () => {
            requestIds.inner = getRequestId()
          })

          // Outer context should be unchanged after nesting
          expect(getRequestId()).toBe(requestIds.outer)
        },
        { operation: 'outer' }
      )

      // Both should be defined but different
      expect(requestIds.outer).toBeDefined()
      expect(requestIds.inner).toBeDefined()
      expect(requestIds.outer).not.toBe(requestIds.inner)
    })

    it('should restore outer context after nested context exits', async () => {
      const capturedIds: (string | undefined)[] = []

      await run(async () => {
        capturedIds.push(getRequestId())

        await run(async () => {
          capturedIds.push(getRequestId())
        })

        capturedIds.push(getRequestId())
      })

      expect(capturedIds).toHaveLength(3)
      expect(capturedIds[0]).toBe(capturedIds[2]) // Before and after should match
      expect(capturedIds[0]).not.toBe(capturedIds[1]) // Inner should be different
    })
  })

  describe('Non-Request Scenarios', () => {
    it('should return undefined requestId outside context', async () => {
      const requestId = getRequestId()
      expect(requestId).toBeUndefined()
    })

    it('should return undefined context outside context', async () => {
      const context = getContext()
      expect(context).toBeUndefined()
    })

    it('should work normally without RequestContext wrapper', async () => {
      // This simulates existing code that doesn't use request context
      expect(getRequestId()).toBeUndefined()

      const result = await Promise.resolve('test')
      expect(result).toBe('test')

      // Still undefined after regular async operation
      expect(getRequestId()).toBeUndefined()
    })
  })

  describe('withContext()', () => {
    it('should override operation in nested context', async () => {
      const operations: (string | undefined)[] = []

      await run(
        async () => {
          operations.push(getContext()?.operation)

          await withContext(
            async () => {
              operations.push(getContext()?.operation)
            },
            { operation: 'inner-operation' }
          )

          operations.push(getContext()?.operation)
        },
        { operation: 'outer-operation' }
      )

      expect(operations).toHaveLength(3)
      expect(operations[0]).toBe('outer-operation')
      expect(operations[1]).toBe('inner-operation')
      expect(operations[2]).toBe('outer-operation')
    })

    it('should override userId in nested context', async () => {
      const userIds: (string | undefined)[] = []

      await run(
        async () => {
          userIds.push(getContext()?.userId)

          await withContext(
            async () => {
              userIds.push(getContext()?.userId)
            },
            { userId: 'inner-user' }
          )

          userIds.push(getContext()?.userId)
        },
        { userId: 'outer-user' }
      )

      expect(userIds).toHaveLength(3)
      expect(userIds[0]).toBe('outer-user')
      expect(userIds[1]).toBe('inner-user')
      expect(userIds[2]).toBe('outer-user')
    })

    it('should create new requestId if no outer context exists', async () => {
      let requestIdInWith: string | undefined

      await withContext(
        async () => {
          requestIdInWith = getRequestId()
        },
        { operation: 'standalone' }
      )

      expect(requestIdInWith).toBeDefined()
      expect(getContext()).toBeUndefined() // Back to undefined after exiting
    })

    it('should preserve requestId when overriding other fields', async () => {
      const requestIds: (string | undefined)[] = []

      await run(
        async () => {
          requestIds.push(getRequestId())

          await withContext(
            async () => {
              requestIds.push(getRequestId())
            },
            { operation: 'new-operation' }
          )

          requestIds.push(getRequestId())
        },
        { userId: 'test-user' }
      )

      // requestId should remain the same across all scopes
      expect(requestIds).toHaveLength(3)
      expect(new Set(requestIds).size).toBe(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle errors within context gracefully', async () => {
      let caughtRequestId: string | undefined

      try {
        await run(async () => {
          throw new Error('Test error')
        })
      } catch (error) {
        // Error caught, context should be cleaned up
        caughtRequestId = getRequestId()
      }

      expect(caughtRequestId).toBeUndefined()
    })

    it('should handle context in try-catch-finally', async () => {
      const tryId: string | undefined = undefined
      const finallyId: string | undefined = undefined

      await run(async () => {
        try {
          const id = getRequestId()
          expect(id).toBeDefined()
          throw new Error('Test')
        } catch {
          const id = getRequestId()
          expect(id).toBeDefined()
        } finally {
          const id = getRequestId()
          expect(id).toBeDefined()
        }
      })
    })

    it('should handle empty string userId and operation', async () => {
      let context: LoggerContext | undefined

      await run(
        async () => {
          context = getContext()
        },
        { userId: '', operation: '' }
      )

      expect(context?.userId).toBe('')
      expect(context?.operation).toBe('')
      expect(context?.requestId).toBeDefined()
    })
  })
})
