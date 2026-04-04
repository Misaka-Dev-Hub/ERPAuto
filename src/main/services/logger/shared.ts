/**
 * Shared Logger Utilities
 * Common functions used across logger modules
 */

import path from 'path'
import fs from 'fs'
import { app } from 'electron'

/**
 * Get log directory path
 * Uses app.getPath('logs') in production, local logs dir in development
 * Production = app.isPackaged === true
 */
export function getLogDir(): string {
  // Check if running in production (packed app)
  // This must be checked BEFORE app.getPath('logs') because Electron
  // always returns the user data logs path regardless of environment
  if (app && app.isReady() && app.isPackaged) {
    return app.getPath('logs')
  }

  // Development environment: use logs directory in project root
  // Note: synchronous FS calls are acceptable here because this branch
  // executes in dev environments or before app is ready.
  const devLogDir = path.join(process.cwd(), 'logs')
  if (!fs.existsSync(devLogDir)) {
    fs.mkdirSync(devLogDir, { recursive: true })
  }
  return devLogDir
}

/**
 * Check if running in production environment
 * Uses app.isPackaged as the single source of truth
 */
export function isProduction(): boolean {
  return app?.isPackaged ?? false
}

/**
 * Log level priority mapping (higher number = more severe)
 */
export const LOG_LEVEL_PRIORITY: Record<string, number> = {
  verbose: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4
}

/**
 * Check if a log level should be logged given a threshold
 * @param level - The log level of the message
 * @param threshold - The minimum log level threshold
 * @returns true if the message should be logged
 */
export function isLoggable(level: string, threshold: string): boolean {
  return (LOG_LEVEL_PRIORITY[level] ?? 0) >= (LOG_LEVEL_PRIORITY[threshold] ?? 2)
}

/**
 * Delete screenshot files older than the given retention period.
 * Scans <logDir>/screenshots/ and removes .png files whose mtime exceeds
 * the retention window. Defensive: never throws.
 *
 * @param retentionDays - Number of days to keep screenshots
 */
export function cleanupOldScreenshots(retentionDays: number): void {
  try {
    const screenshotDir = path.join(getLogDir(), 'screenshots')
    if (!fs.existsSync(screenshotDir)) return

    const files = fs.readdirSync(screenshotDir)
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000

    for (const file of files) {
      if (!file.endsWith('.png')) continue
      const filePath = path.join(screenshotDir, file)
      try {
        const stat = fs.statSync(filePath)
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath)
        }
      } catch {
        // individual file deletion failure should not stop the loop
      }
    }
  } catch {
    // entire cleanup is best-effort
  }
}
