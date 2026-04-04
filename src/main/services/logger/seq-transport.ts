/**
 * Seq logging transport using @datalust/winston-seq
 *
 * Provides asynchronous batched logging to Seq server
 * with configurable parameters for production use.
 *
 * Features:
 * - Non-blocking async batch sending (via dynamic import)
 * - Configurable batch size, period, queue limits
 * - Automatic retry on failure
 * - Graceful shutdown with flush
 * - Error suppression (Seq failures don't crash app)
 *
 * Note: Uses dynamic import because @datalust/winston-seq is an ESM module
 */

import type { SeqConfig } from '../../types/config.schema'
import logger from './index'

/**
 * Seq transport constructor type (from dynamic import)
 */
type SeqTransportClass = new (options: {
  serverUrl: string
  apiKey?: string
  batchSizeLimit?: number
  maxBatchingTime?: number
  maxRetries?: number
  onError?: (error: Error) => void
}) => any

/**
 * Create and configure Seq transport dynamically
 *
 * This function handles the ESM module loading and returns
 * a configured transport instance compatible with Winston.
 *
 * @param config - Seq configuration from config.schema
 * @returns Promise resolving to transport instance or null if disabled/failed
 */
export async function createSeqTransport(config: SeqConfig): Promise<any> {
  // Don't create transport if disabled
  if (!config.enabled || !config.serverUrl) {
    logger.info('Seq logging is disabled or server URL not provided', {
      enabled: config.enabled,
      hasServerUrl: !!config.serverUrl,
      context: 'seq-transport'
    })
    return null
  }

  try {
    // Dynamically import the ESM module
    const { SeqTransport } = await import('@datalust/winston-seq')
    const SeqTransportClass = SeqTransport as SeqTransportClass

    // Create transport instance with mapped config
    const transport = new SeqTransportClass({
      serverUrl: config.serverUrl,
      apiKey: config.apiKey || undefined,
      batchSizeLimit: config.batchPostingLimit,
      maxBatchingTime: config.period,
      maxRetries: config.maxRetries,
      onError: (error: Error) => {
        // Log errors but don't throw - Seq failures should not crash app
        logger.error('Seq transport error', {
          error: error.message,
          stack: error.stack,
          context: 'seq-transport'
        })
      }
    })

    logger.info('Seq transport created successfully', {
      serverUrl: config.serverUrl,
      batchPostingLimit: config.batchPostingLimit,
      period: config.period,
      maxRetries: config.maxRetries,
      context: 'seq-transport'
    })

    return transport
  } catch (error) {
    logger.error('Failed to create Seq transport', {
      error: error instanceof Error ? error.message : String(error),
      context: 'seq-transport'
    })
    // Return null to allow app to continue without Seq
    return null
  }
}

/**
 * Sync factory wrapper for backward compatibility
 *
 * Note: This creates the transport asynchronously internally.
 * The transport is cached and reused.
 */
let cachedTransport: any = null
let isInitializing = false

export function createSeqTransportSync(config: SeqConfig): any {
  if (!config.enabled || !config.serverUrl) {
    return null
  }

  if (cachedTransport) {
    return cachedTransport
  }

  if (!isInitializing) {
    isInitializing = true
    createSeqTransport(config)
      .then((transport) => {
        cachedTransport = transport
      })
      .catch((error) => {
        logger.error('Seq transport initialization failed', {
          error: error instanceof Error ? error.message : String(error)
        })
      })
      .finally(() => {
        isInitializing = false
      })
  }

  // Return null on first call, transport will be available on next call
  return null
}

export default createSeqTransportSync
