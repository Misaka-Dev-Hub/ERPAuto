/**
 * Logger Performance Monitoring Utilities
 *
 * Provides performance tracking and timing utilities that integrate with the Winston logger.
 *
 * Features:
 * - trackDuration: Wrap async functions and auto-log execution time
 * - PerformanceTracker: Track multiple metrics over time
 * - Slow operation detection with configurable thresholds
 * - Performance warnings for operations exceeding thresholds
 */

import type { Logger } from 'winston'
import logger from './index'

/**
 * Default threshold for slow operation warnings (in milliseconds)
 */
export const DEFAULT_SLOW_THRESHOLD_MS = 1000

/**
 * Result of a tracked operation
 */
export interface TrackDurationResult<T> {
  /** The result value from the operation */
  result: T
  /** Execution duration in milliseconds */
  durationMs: number
  /** Whether the operation exceeded the slow threshold */
  isSlow: boolean
}

/**
 * Configuration for trackDuration
 */
export interface TrackDurationOptions {
  /** Operation name for logging */
  operationName: string
  /** Custom log message (optional) */
  message?: string
  /** Slow threshold in ms (overrides default) */
  slowThresholdMs?: number
  /** Log level for duration info (default: 'debug') */
  logLevel?: 'debug' | 'info' | 'verbose'
  /** Additional context to include in logs */
  context?: Record<string, unknown>
}

/**
 * Metrics tracked by PerformanceTracker
 */
export interface PerformanceMetrics {
  /** Total number of operations tracked */
  count: number
  /** Total duration of all operations in milliseconds */
  totalDurationMs: number
  /** Minimum duration in milliseconds */
  minDurationMs: number
  /** Maximum duration in milliseconds */
  maxDurationMs: number
  /** Average duration in milliseconds */
  avgDurationMs: number
  /** Number of operations exceeding slow threshold */
  slowOperationCount: number
}

/**
 * Track the duration of an async operation and log the result
 *
 * @param fn - The async function to track
 * @param options - Configuration options including operation name and threshold
 * @returns Promise resolving to TrackDurationResult with result, duration, and slow flag
 *
 * @example
 * ```typescript
 * const result = await trackDuration(
 *   async () => await someAsyncOperation(),
 *   { operationName: 'Database Query', slowThresholdMs: 500 }
 * );
 * console.log(result.result, result.durationMs);
 * ```
 */
export async function trackDuration<T>(
  fn: () => Promise<T>,
  options: TrackDurationOptions
): Promise<TrackDurationResult<T>> {
  const {
    operationName,
    message = `Operation "${operationName}"`,
    slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
    logLevel = 'debug',
    context = {}
  } = options

  const startTime = performance.now()

  try {
    const result = await fn()
    const durationMs = performance.now() - startTime
    const isSlow = durationMs > slowThresholdMs

    // Log the result
    const logMessage = `${message} completed in ${durationMs.toFixed(2)}ms`
    if (isSlow) {
      logger.warn(`${logMessage} (SLOW - exceeded ${slowThresholdMs}ms threshold)`, {
        operation: operationName,
        durationMs,
        slowThresholdMs,
        ...context
      })
    } else {
      logger[logLevel](logMessage, {
        operation: operationName,
        durationMs,
        ...context
      })
    }

    return { result, durationMs, isSlow }
  } catch (error) {
    const durationMs = performance.now() - startTime
    const isSlow = durationMs > slowThresholdMs

    // Log the error with duration
    logger.error(`${message} failed after ${durationMs.toFixed(2)}ms`, {
      operation: operationName,
      durationMs,
      slowThresholdMs,
      error,
      ...context
    })

    throw error
  }
}

/**
 * PerformanceTracker class for tracking multiple metrics over time
 *
 * Tracks operation counts, durations, and identifies slow operations.
 * Useful for monitoring service-level performance and identifying bottlenecks.
 *
 * @example
 * ```typescript
 * const tracker = new PerformanceTracker('DataService', 500);
 *
 * // Track individual operations
 * await tracker.track('fetchData', async () => fetchData());
 * await tracker.track('saveData', async () => saveData());
 *
 * // Get metrics
 * const metrics = tracker.getMetrics();
 * console.log(`Avg duration: ${metrics.avgDurationMs}ms`);
 *
 * // Log summary
 * tracker.logSummary();
 * ```
 */
export class PerformanceTracker {
  private operationName: string
  private slowThresholdMs: number
  private durations: number[] = []
  private slowCount = 0
  private log: Logger

  /**
   * Create a new PerformanceTracker
   *
   * @param operationName - Name of the operation/category being tracked
   * @param slowThresholdMs - Custom slow threshold in ms (default: 1000)
   * @param customLogger - Optional custom logger instance (default: main logger)
   */
  constructor(
    operationName: string,
    slowThresholdMs: number = DEFAULT_SLOW_THRESHOLD_MS,
    customLogger?: Logger
  ) {
    this.operationName = operationName
    this.slowThresholdMs = slowThresholdMs
    this.log = customLogger ?? logger
  }

  /**
   * Track an async operation and record its duration
   *
   * @param name - Specific name of this operation instance
   * @param fn - The async function to track
   * @param context - Optional context to log with the operation
   * @returns Promise resolving to the function's result
   *
   * @example
   * ```typescript
   * const result = await tracker.track('getUserById', async () => getUserById(id), {
   *   userId: id
   * });
   * ```
   */
  async track<T>(
    name: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    const startTime = performance.now()

    try {
      const result = await fn()
      const durationMs = performance.now() - startTime

      this.recordDuration(durationMs)

      if (durationMs > this.slowThresholdMs) {
        this.log.warn(`[${this.operationName}] ${name} took ${durationMs.toFixed(2)}ms (SLOW)`, {
          operation: name,
          durationMs,
          slowThresholdMs: this.slowThresholdMs,
          ...context
        })
      } else {
        this.log.debug(`[${this.operationName}] ${name} completed in ${durationMs.toFixed(2)}ms`, {
          operation: name,
          durationMs,
          ...context
        })
      }

      return result
    } catch (error) {
      const durationMs = performance.now() - startTime
      this.recordDuration(durationMs)

      this.log.error(`[${this.operationName}] ${name} failed after ${durationMs.toFixed(2)}ms`, {
        operation: name,
        durationMs,
        error,
        ...context
      })

      throw error
    }
  }

  /**
   * Record a duration measurement (for manual tracking)
   *
   * @param durationMs - Duration in milliseconds
   */
  recordDuration(durationMs: number): void {
    this.durations.push(durationMs)
    if (durationMs > this.slowThresholdMs) {
      this.slowCount++
    }
  }

  /**
   * Get current performance metrics
   *
   * @returns PerformanceMetrics with aggregated statistics
   */
  getMetrics(): PerformanceMetrics {
    const count = this.durations.length
    if (count === 0) {
      return {
        count: 0,
        totalDurationMs: 0,
        minDurationMs: 0,
        maxDurationMs: 0,
        avgDurationMs: 0,
        slowOperationCount: 0
      }
    }

    const totalDurationMs = this.durations.reduce((sum, d) => sum + d, 0)
    const minDurationMs = Math.min(...this.durations)
    const maxDurationMs = Math.max(...this.durations)
    const avgDurationMs = totalDurationMs / count

    return {
      count,
      totalDurationMs,
      minDurationMs,
      maxDurationMs,
      avgDurationMs,
      slowOperationCount: this.slowCount
    }
  }

  /**
   * Log a summary of performance metrics
   *
   * @param level - Log level for summary (default: 'info')
   * @param message - Custom message prefix (optional)
   */
  logSummary(level: 'info' | 'warn' | 'debug' = 'info', message?: string): void {
    const metrics = this.getMetrics()
    const summaryMessage = message || `[${this.operationName}] Performance Summary`

    this.log[level](summaryMessage, {
      totalOperations: metrics.count,
      avgDurationMs: `${metrics.avgDurationMs.toFixed(2)}ms`,
      minDurationMs: `${metrics.minDurationMs.toFixed(2)}ms`,
      maxDurationMs: `${metrics.maxDurationMs.toFixed(2)}ms`,
      slowOperations: metrics.slowOperationCount,
      slowPercentage:
        metrics.count > 0
          ? ((metrics.slowOperationCount / metrics.count) * 100).toFixed(1) + '%'
          : '0%',
      totalDurationMs: `${metrics.totalDurationMs.toFixed(2)}ms`
    })
  }

  /**
   * Reset all tracked metrics
   */
  reset(): void {
    this.durations = []
    this.slowCount = 0
  }
}

/**
 * Create a performance tracker for a specific service or module
 *
 * Convenience function that returns a new PerformanceTracker instance.
 * Useful for creating trackers with consistent naming conventions.
 *
 * @param context - Context/module name (e.g., 'DatabaseService', 'ERPExtractor')
 * @param slowThresholdMs - Optional custom slow threshold
 * @returns New PerformanceTracker instance
 *
 * @example
 * ```typescript
 * const dbTracker = createPerformanceTracker('DatabaseService', 200);
 * ```
 */
export function createPerformanceTracker(
  context: string,
  slowThresholdMs?: number
): PerformanceTracker {
  return new PerformanceTracker(context, slowThresholdMs)
}
