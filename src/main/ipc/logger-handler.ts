/**
 * IPC Logger Handler with Batching
 * Receives logs from renderer process and forwards to Winston
 *
 * Features:
 * - 100ms debounce for batch processing
 * - Maximum 50 messages per batch
 * - Circuit breaker: discards new logs when buffer > 500
 * - Error-level logs bypass circuit breaker
 */

import { ipcMain } from 'electron'
import { createLogger } from '../services/logger'
import { IPC_CHANNELS, type LogLevel } from '../../shared/ipc-channels'

const log = createLogger('LoggerHandler')

/**
 * Log entry from renderer process
 */
interface LogEntry {
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  timestamp: number
}

/**
 * Batch processing configuration
 */
const BATCH_CONFIG = {
  DEBOUNCE_MS: 100,
  MAX_BATCH_SIZE: 50,
  CIRCUIT_BREAKER_THRESHOLD: 500
} as const

/**
 * Logger handler state
 */
class LoggerHandlerState {
  private buffer: LogEntry[] = []
  private debounceTimer: NodeJS.Timeout | null = null
  private discardedCount = 0

  /**
   * Add log entry to buffer
   * @param entry - Log entry to buffer
   * @returns true if entry was buffered, false if discarded
   */
  addEntry(entry: LogEntry): boolean {
    // Error-level logs always bypass circuit breaker
    if (entry.level === 'error') {
      this.buffer.push(entry)
      this.flushIfNeeded()
      return true
    }

    // Circuit breaker: discard non-error logs when buffer is too large
    if (this.buffer.length >= BATCH_CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
      this.discardedCount++

      // Log warning about discarded logs periodically (every 100 discarded)
      if (this.discardedCount % 100 === 0) {
        log.warn('Circuit breaker active: discarded logs', {
          discardedCount: this.discardedCount,
          bufferSize: this.buffer.length
        })
      }

      return false
    }

    this.buffer.push(entry)
    this.flushIfNeeded()
    return true
  }

  /**
   * Flush buffer if it reaches max batch size
   */
  private flushIfNeeded(): void {
    if (this.buffer.length >= BATCH_CONFIG.MAX_BATCH_SIZE) {
      this.flush()
    } else if (!this.debounceTimer) {
      // Start debounce timer if not already running
      this.debounceTimer = setTimeout(() => {
        this.flush()
      }, BATCH_CONFIG.DEBOUNCE_MS)
    }
  }

  /**
   * Flush all buffered logs to Winston
   */
  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (this.buffer.length === 0) {
      return
    }

    // Create a copy of the buffer and clear it
    const batch = [...this.buffer]
    this.buffer = []

    // Process batch asynchronously (non-blocking)
    setImmediate(() => {
      this.processBatch(batch)
    })
  }

  /**
   * Process a batch of log entries
   * @param batch - Array of log entries to process
   */
  private processBatch(batch: LogEntry[]): void {
    try {
      for (const entry of batch) {
        this.forwardToWinston(entry)
      }
    } catch (error) {
      // If batch processing fails, log the error but don't rethrow
      // This ensures logging failures don't crash the app
      log.error('Failed to process log batch', {
        error: error instanceof Error ? error.message : String(error),
        batchSize: batch.length
      })
    }
  }

  /**
   * Forward a single log entry to Winston logger
   * @param entry - Log entry to forward
   */
  private forwardToWinston(entry: LogEntry): void {
    const context = (entry.context?.component as string) || 'renderer'
    const childLogger = log.child({
      source: 'renderer',
      component: context
    })

    const message = entry.context?.message
      ? `[${entry.context.message}] ${entry.message}`
      : entry.message

    switch (entry.level) {
      case 'debug':
        childLogger.debug(message, entry.context)
        break
      case 'warn':
        childLogger.warn(message, entry.context)
        break
      case 'error':
        childLogger.error(message, entry.context)
        break
      case 'info':
      default:
        childLogger.info(message, entry.context)
        break
    }
  }

  /**
   * Get current buffer size (for testing/debugging)
   */
  getBufferSize(): number {
    return this.buffer.length
  }

  /**
   * Get discarded log count (for testing/debugging)
   */
  getDiscardedCount(): number {
    return this.discardedCount
  }

  /**
   * Reset state (for testing)
   */
  reset(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.buffer = []
    this.discardedCount = 0
  }
}

// Singleton state instance
const state = new LoggerHandlerState()

/**
 * Register IPC handlers for logger
 */
export function registerLoggerHandlers(): void {
  // Use ipcMain.on with send() - fire-and-forget, non-blocking
  ipcMain.on(IPC_CHANNELS.LOGGER_FORWARD, (_event, entry: LogEntry) => {
    // Validate entry
    if (!entry || typeof entry.level !== 'string' || typeof entry.message !== 'string') {
      log.warn('Received invalid log entry', { entry })
      return
    }

    // Add to buffer for batch processing
    const buffered = state.addEntry(entry)

    if (!buffered && process.env.NODE_ENV !== 'production') {
      // In development, log when entries are discarded
      log.debug('Log entry discarded due to circuit breaker', {
        level: entry.level,
        message: entry.message
      })
    }
  })

  log.info('Logger IPC handler registered', {
    channel: IPC_CHANNELS.LOGGER_FORWARD,
    debounceMs: BATCH_CONFIG.DEBOUNCE_MS,
    maxBatchSize: BATCH_CONFIG.MAX_BATCH_SIZE,
    circuitBreakerThreshold: BATCH_CONFIG.CIRCUIT_BREAKER_THRESHOLD
  })
}

// Export for testing
export { state }
