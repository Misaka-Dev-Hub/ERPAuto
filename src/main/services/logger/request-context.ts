/**
 * Request Context Management using AsyncLocalStorage
 *
 * Provides async-context propagation for request-scoped logging metadata.
 * Uses Node.js AsyncLocalStorage to maintain isolated context across async/await boundaries.
 *
 * Features:
 * - Automatic requestId generation with crypto.randomUUID()
 * - Support for userId and operation tracking
 * - Complete context isolation between concurrent requests
 * - Backward compatible with non-request logging scenarios
 *
 * @example
 * ```typescript
 * import { run, getRequestId, getContext } from './request-context'
 *
 * await run(async () => {
 *   const requestId = getRequestId() // Available throughout async chain
 *   await someAsyncOperation()
 * }, { userId: 'user123', operation: 'extract' })
 * ```
 */

import { AsyncLocalStorage } from 'async_hooks'
import { randomUUID } from 'crypto'

/**
 * Logger context structure containing request-scoped metadata
 */
export interface LoggerContext {
  /** Unique identifier for this request (auto-generated UUID v4) */
  requestId: string
  /** User ID performing the operation (optional, set by caller) */
  userId?: string
  /** Operation being performed (optional, e.g., 'extract', 'clean', 'validate') */
  operation?: string
}

/**
 * AsyncLocalStorage instance for request context
 * Each async execution scope has its own isolated context
 */
const storage = new AsyncLocalStorage<LoggerContext>()

/**
 * Execute a function within a request context scope
 *
 * Creates a new context with auto-generated requestId and optional business metadata.
 * All async operations within the callback can access this context via getRequestId() or getContext().
 *
 * @param fn - The async function to execute within the context
 * @param context - Optional business context (userId, operation)
 * @returns Promise resolving to the function's return value
 *
 * @example
 * ```typescript
 * await run(async () => {
 *   // requestId is available here and in all nested async calls
 *   const id = getRequestId()
 *   await processOrder()
 * }, { userId: 'user123', operation: 'extract' })
 * ```
 */
export function run<T>(
  fn: () => Promise<T>,
  context?: Omit<LoggerContext, 'requestId'>
): Promise<T> {
  const fullContext: LoggerContext = {
    requestId: randomUUID(),
    userId: context?.userId,
    operation: context?.operation
  }

  return storage.run(fullContext, fn)
}

/**
 * Get the current request ID from the async context
 *
 * @returns The current requestId, or undefined if not in a request context
 *
 * @example
 * ```typescript
 * function logSomething() {
 *   const requestId = getRequestId()
 *   logger.info(`Processing...`, { requestId })
 * }
 * ```
 */
export function getRequestId(): string | undefined {
  const context = storage.getStore()
  return context?.requestId
}

/**
 * Get the full logger context from the current async scope
 *
 * @returns The complete LoggerContext, or undefined if not in a request context
 *
 * @example
 * ```typescript
 * const context = getContext()
 * if (context) {
 *   logger.info('Operation', {
 *     requestId: context.requestId,
 *     userId: context.userId,
 *     operation: context.operation
 *   })
 * }
 * ```
 */
export function getContext(): LoggerContext | undefined {
  return storage.getStore()
}

/**
 * Execute a function with a modified context
 *
 * Creates a new context scope based on the current context with selective overrides.
 * Useful for nested operations that need to change specific context fields.
 *
 * @param fn - The async function to execute
 * @param overrides - Context fields to override
 * @returns Promise resolving to the function's return value
 *
 * @example
 * ```typescript
 * await run(async () => {
 *   // Outer context: operation='extract'
 *   await withContext(async () => {
 *     // Inner context: operation='validate-subtask'
 *   }, { operation: 'validate-subtask' })
 * }, { operation: 'extract' })
 * ```
 */
export function withContext<T>(
  fn: () => Promise<T>,
  overrides: Partial<Omit<LoggerContext, 'requestId'>>
): Promise<T> {
  const currentContext = storage.getStore()
  const newContext: LoggerContext = currentContext
    ? {
        ...currentContext,
        ...overrides
      }
    : {
        requestId: randomUUID(),
        ...overrides
      }

  return storage.run(newContext, fn)
}
