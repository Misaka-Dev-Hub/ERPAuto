/**
 * Performance Monitor Unit Tests
 *
 * Tests for trackDuration helper and PerformanceTracker class
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import {
  trackDuration,
  PerformanceTracker,
  createPerformanceTracker,
  DEFAULT_SLOW_THRESHOLD_MS,
  type TrackDurationOptions
} from '../../src/main/services/logger/performance-monitor'
import logger from '../../src/main/services/logger/index'

// Mock the logger to avoid noisy output during tests
vi.mock('../../src/main/services/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  }
}))

describe('Performance Monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('trackDuration', () => {
    it('should track duration of successful async operation', async () => {
      const mockFn = vi.fn().mockResolvedValue('test result')

      const result = await trackDuration(mockFn, {
        operationName: 'TestOperation'
      })

      expect(result.result).toBe('test result')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
      expect(result.isSlow).toBe(false)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should mark operation as slow when exceeding threshold', async () => {
      const slowFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('slow'), 50)))

      const result = await trackDuration(slowFn, {
        operationName: 'SlowOperation',
        slowThresholdMs: 10
      })

      expect(result.result).toBe('slow')
      expect(result.durationMs).toBeGreaterThan(10)
      expect(result.isSlow).toBe(true)
    })

    it('should log with custom log level', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')

      await trackDuration(mockFn, {
        operationName: 'CustomLevelOp',
        logLevel: 'info'
      })

      expect(logger.info).toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('should log warning for slow operations', async () => {
      const slowFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('slow'), 100)))

      await trackDuration(slowFn, {
        operationName: 'SlowOp',
        slowThresholdMs: 50
      })

      expect(logger.warn).toHaveBeenCalled()
      const warnCall = (logger.warn as Mock).mock.calls[0][0]
      expect(warnCall).toContain('SLOW')
      expect(warnCall).toContain('50ms threshold')
    })

    it('should include context in logs', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')

      await trackDuration(mockFn, {
        operationName: 'ContextOp',
        context: { userId: 123, customField: 'test' }
      })

      expect(logger.debug).toHaveBeenCalled()
      const contextCall = (logger.debug as Mock).mock.calls[0][1]
      expect(contextCall).toMatchObject({
        operation: 'ContextOp',
        userId: 123
      })
      // Also check the custom field is included
      expect(contextCall.customField).toBe('test')
    })

    it('should log error and duration when operation fails', async () => {
      const errorFn = vi.fn().mockRejectedValue(new Error('Test error'))

      await expect(
        trackDuration(errorFn, {
          operationName: 'ErrorOp'
        })
      ).rejects.toThrow('Test error')

      expect(logger.error).toHaveBeenCalled()
      const errorCall = (logger.error as Mock).mock.calls[0][0]
      expect(errorCall).toContain('failed after')
      expect(errorCall).toContain('ErrorOp')
    })

    it('should use custom message in logs', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')

      await trackDuration(mockFn, {
        operationName: 'TestOp',
        message: 'Custom message for this operation'
      })

      expect(logger.debug).toHaveBeenCalled()
      const messageCall = (logger.debug as Mock).mock.calls[0][0]
      expect(messageCall).toContain('Custom message for this operation')
    })

    it('should have default threshold of 1000ms', async () => {
      const slowFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('slow'), 100)))

      const result = await trackDuration(slowFn, {
        operationName: 'DefaultThresholdOp'
      })

      // 100ms should NOT be slow with default 1000ms threshold
      expect(result.isSlow).toBe(false)
      expect(result.durationMs).toBeLessThan(1000)
    })
  })

  describe('PerformanceTracker', () => {
    it('should track multiple operations', async () => {
      const tracker = new PerformanceTracker('TestService', 1000)

      const mockFn1 = vi.fn().mockResolvedValue('result1')
      const mockFn2 = vi.fn().mockResolvedValue('result2')

      const result1 = await tracker.track('Operation1', mockFn1)
      const result2 = await tracker.track('Operation2', mockFn2)

      expect(result1).toBe('result1')
      expect(result2).toBe('result2')

      const metrics = tracker.getMetrics()
      expect(metrics.count).toBe(2)
      expect(metrics.minDurationMs).toBeGreaterThanOrEqual(0)
      expect(metrics.maxDurationMs).toBeGreaterThanOrEqual(0)
    })

    it('should calculate correct metrics', async () => {
      const tracker = new PerformanceTracker('TestService', 1000)

      // Track operations with known durations
      tracker.recordDuration(100)
      tracker.recordDuration(200)
      tracker.recordDuration(300)

      const metrics = tracker.getMetrics()

      expect(metrics.count).toBe(3)
      expect(metrics.totalDurationMs).toBe(600)
      expect(metrics.minDurationMs).toBe(100)
      expect(metrics.maxDurationMs).toBe(300)
      expect(metrics.avgDurationMs).toBe(200)
    })

    it('should track slow operations count', async () => {
      const tracker = new PerformanceTracker('TestService', 50)

      tracker.recordDuration(30) // Normal
      tracker.recordDuration(100) // Slow
      tracker.recordDuration(40) // Normal
      tracker.recordDuration(150) // Slow

      const metrics = tracker.getMetrics()
      expect(metrics.slowOperationCount).toBe(2)
    })

    it('should log warnings for slow operations', async () => {
      const tracker = new PerformanceTracker('TestService', 10)

      const slowFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('slow'), 50)))

      await tracker.track('SlowOp', slowFn)

      expect(logger.warn).toHaveBeenCalled()
      const warnCall = (logger.warn as Mock).mock.calls[0][0]
      expect(warnCall).toContain('[TestService]')
      expect(warnCall).toContain('SLOW')
    })

    it('should include context in operation logs', async () => {
      const tracker = new PerformanceTracker('DatabaseService', 1000)

      const mockFn = vi.fn().mockResolvedValue('data')

      await tracker.track('getUser', mockFn, { userId: 456, table: 'users' })

      expect(logger.debug).toHaveBeenCalled()
      const contextCall = (logger.debug as Mock).mock.calls[0][1]
      expect(contextCall).toMatchObject({
        operation: 'getUser',
        userId: 456
      })
    })

    it('should log summary with aggregated metrics', () => {
      const tracker = new PerformanceTracker('TestService', 1000)

      tracker.recordDuration(100)
      tracker.recordDuration(200)
      tracker.recordDuration(300)

      tracker.logSummary('info', 'Test Summary')

      expect(logger.info).toHaveBeenCalled()
      const summaryCall = (logger.info as Mock).mock.calls[0]
      expect(summaryCall[0]).toContain('Test Summary')
      expect(summaryCall[1]).toMatchObject({
        totalOperations: 3,
        slowOperations: 0
      })
    })

    it('should include slow percentage in summary', () => {
      const tracker = new PerformanceTracker('TestService', 50)

      tracker.recordDuration(30) // Normal
      tracker.recordDuration(100) // Slow

      tracker.logSummary()

      expect(logger.info).toHaveBeenCalled()
      const summaryCall = (logger.info as Mock).mock.calls[0][1]
      expect(summaryCall.slowPercentage).toContain('%')
    })

    it('should reset metrics when reset() is called', () => {
      const tracker = new PerformanceTracker('TestService', 1000)

      tracker.recordDuration(100)
      tracker.recordDuration(200)

      tracker.reset()

      const metrics = tracker.getMetrics()
      expect(metrics.count).toBe(0)
      expect(metrics.totalDurationMs).toBe(0)
      expect(metrics.slowOperationCount).toBe(0)
    })

    it('should return zero metrics when no operations tracked', () => {
      const tracker = new PerformanceTracker('EmptyService')

      const metrics = tracker.getMetrics()

      expect(metrics.count).toBe(0)
      expect(metrics.totalDurationMs).toBe(0)
      expect(metrics.minDurationMs).toBe(0)
      expect(metrics.maxDurationMs).toBe(0)
      expect(metrics.avgDurationMs).toBe(0)
      expect(metrics.slowOperationCount).toBe(0)
    })

    it('should use custom logger if provided', () => {
      const customLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } as unknown as typeof logger

      const tracker = new PerformanceTracker('TestService', 1000, customLogger)
      tracker.recordDuration(100)

      // Should use custom logger
      expect(customLogger.debug).not.toHaveBeenCalled() // We called recordDuration directly
      tracker.logSummary()
      expect(customLogger.info).toHaveBeenCalled()
    })
  })

  describe('createPerformanceTracker', () => {
    it('should create a tracker with default threshold', () => {
      const tracker = createPerformanceTracker('MyService')

      expect(tracker).toBeInstanceOf(PerformanceTracker)
      const metrics = tracker.getMetrics()
      expect(metrics.count).toBe(0)
    })

    it('should create a tracker with custom threshold', () => {
      const tracker = createPerformanceTracker('FastService', 100)

      tracker.recordDuration(150)

      const metrics = tracker.getMetrics()
      expect(metrics.slowOperationCount).toBe(1) // 150 > 100
    })

    it('should use operation name in logs', async () => {
      const tracker = createPerformanceTracker('MyCustomService', 1000)

      const mockFn = vi.fn().mockResolvedValue('result')
      await tracker.track('TestOperation', mockFn)

      expect(logger.debug).toHaveBeenCalled()
      const call = (logger.debug as Mock).mock.calls[0][0]
      expect(call).toContain('[MyCustomService]')
      expect(call).toContain('TestOperation')
    })
  })

  describe('Integration scenarios', () => {
    it('should track a sequence of operations with varying speeds', async () => {
      const tracker = new PerformanceTracker('DataPipeline', 100)

      const fastOp = vi.fn().mockResolvedValue('fast')
      const mediumOp = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('medium'), 50)))
      const slowOp = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('slow'), 200)))

      await tracker.track('FastExtract', fastOp)
      await tracker.track('MediumTransform', mediumOp)
      await tracker.track('SlowLoad', slowOp)

      const metrics = tracker.getMetrics()
      expect(metrics.count).toBe(3)
      expect(metrics.slowOperationCount).toBe(1) // Only SlowLoad > 100ms
      expect(metrics.maxDurationMs).toBeGreaterThan(150)
    })

    it('should handle errors gracefully in tracker', async () => {
      const tracker = new PerformanceTracker('ErrorProneService', 1000)

      const errorFn = vi.fn().mockRejectedValue(new Error('Expected error'))

      await expect(tracker.track('FailingOp', errorFn)).rejects.toThrow('Expected error')

      expect(logger.error).toHaveBeenCalled()
      const errorCall = (logger.error as Mock).mock.calls[0][0]
      expect(errorCall).toContain('[ErrorProneService]')
      expect(errorCall).toContain('failed after')
    })
  })

  describe('Constants', () => {
    it('should export DEFAULT_SLOW_THRESHOLD_MS as 1000', () => {
      expect(DEFAULT_SLOW_THRESHOLD_MS).toBe(1000)
    })
  })
})
