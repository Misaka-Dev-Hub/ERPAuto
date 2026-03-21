import { useCallback } from 'react'
import type { LogLevel } from '../../../shared/ipc-channels'

/**
 * Logger interface for renderer process
 * Provides type-safe logging with component context
 */
export interface RendererLogger {
  /**
   * Log a message at specified level
   */
  log: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void
  /**
   * Log an info level message (business operations)
   */
  info: (message: string, meta?: Record<string, unknown>) => void
  /**
   * Log a warning level message (recoverable issues)
   */
  warn: (message: string, meta?: Record<string, unknown>) => void
  /**
   * Log an error level message (failures)
   */
  error: (message: string, meta?: Record<string, unknown>) => void
  /**
   * Log a debug level message (technical details)
   */
  debug: (message: string, meta?: Record<string, unknown>) => void
}

/**
 * React Hook for logging from renderer process to main process Winston logger
 *
 * @param context - Component or feature context for log messages
 * @returns Logger instance with component context
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const logger = useLogger('MyComponent')
 *
 *   const handleClick = () => {
 *     logger.info('User clicked button', { buttonId: 'submit' })
 *   }
 *
 *   const handleError = (err: Error) => {
 *     logger.error('Operation failed', { error: err.message })
 *   }
 * }
 * ```
 */
export function useLogger(context: string): RendererLogger {
  const logger = useCallback(
    (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
      // Check if window.electron is available (safety check)
      if (typeof window !== 'undefined' && window.electron?.logger?.log) {
        window.electron.logger.log(level, message, {
          ...meta,
          context
        })
      } else {
        // Fallback to console in development if IPC not available
        if (process.env.NODE_ENV === 'development') {
          const consoleMethod = console[level] || console.log
          consoleMethod(`[${context}] ${message}`, meta || '')
        }
      }
    },
    [context]
  )

  // Return memoized logger methods
  return {
    log: logger,
    info: useCallback(
      (message: string, meta?: Record<string, unknown>) => {
        logger('info', message, meta)
      },
      [logger]
    ),
    warn: useCallback(
      (message: string, meta?: Record<string, unknown>) => {
        logger('warn', message, meta)
      },
      [logger]
    ),
    error: useCallback(
      (message: string, meta?: Record<string, unknown>) => {
        logger('error', message, meta)
      },
      [logger]
    ),
    debug: useCallback(
      (message: string, meta?: Record<string, unknown>) => {
        logger('debug', message, meta)
      },
      [logger]
    )
  }
}

/**
 * FPS monitoring utility for detecting UI lag from excessive logging
 *
 * @param threshold - FPS threshold below which to warn (default: 30)
 * @param logger - Logger instance to use for warnings
 *
 * @example
 * ```typescript
 * useEffect(() => {
 *   const stopMonitoring = monitorFps(30, logger)
 *   return () => stopMonitoring()
 * }, [logger])
 * ```
 */
export function monitorFps(threshold: number = 30, logger: RendererLogger): () => void {
  let frames = 0
  let lastFpsCheck = 0
  let warningCooldown = 0
  let animationFrameId: number

  const measureFps = (currentTime: number) => {
    frames++

    // Check FPS every second
    const elapsed = currentTime - lastFpsCheck
    if (elapsed >= 1000) {
      const fps = Math.round((frames * 1000) / elapsed)

      if (fps < threshold && warningCooldown <= 0) {
        logger.warn('Low FPS detected - logging may be causing UI lag', {
          fps,
          threshold,
          context: 'FPSMonitor'
        })
        warningCooldown = 5 // Don't warn again for 5 seconds
      }

      warningCooldown = Math.max(0, warningCooldown - 1)
      frames = 0
      lastFpsCheck = currentTime
    }

    animationFrameId = requestAnimationFrame(measureFps)
  }

  // Start monitoring
  animationFrameId = requestAnimationFrame(measureFps)

  // Return cleanup function
  return () => {
    cancelAnimationFrame(animationFrameId)
  }
}
