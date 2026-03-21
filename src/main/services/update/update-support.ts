import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { UpdateConfig } from '../../types/config.schema'
import type { ReleaseChannel, UpdateStatus } from '../../types/update.types'

export function appendPortableLaunchLog(
  logPath: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    const timestamp = new Date().toISOString()
    const suffix = meta ? ` ${JSON.stringify(meta)}` : ''
    fs.appendFileSync(logPath, `${timestamp} ${message}${suffix}\n`, 'utf-8')
  } catch {
    // Best-effort debug log only.
  }
}

export function getCurrentAppVersion(): string {
  return typeof app?.getVersion === 'function' ? app.getVersion() : '0.0.0'
}

export function getCurrentChannel(): ReleaseChannel {
  return typeof __APP_CHANNEL__ !== 'undefined' ? __APP_CHANNEL__ : 'stable'
}

export function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as {
    name?: string
    Code?: string
    code?: string
    message?: string
  }

  return (
    candidate.name === 'NoSuchKey' ||
    candidate.Code === 'NoSuchKey' ||
    candidate.code === 'NoSuchKey' ||
    candidate.message?.includes('The specified key does not exist') === true
  )
}

export function getSupportState(config: UpdateConfig | null): {
  supported: boolean
  reason?: string
} {
  if (process.platform !== 'win32') {
    return { supported: false, reason: '当前仅支持 Windows 自动更新' }
  }

  if (app?.isPackaged) {
    return { supported: true }
  }

  if (config?.allowDevMode) {
    return { supported: true, reason: '开发模式调试已启用更新检查' }
  }

  return { supported: false, reason: '开发模式默认禁用自动更新检查' }
}

export const DEFAULT_STATUS: UpdateStatus = {
  enabled: false,
  supported: false,
  phase: 'idle',
  currentVersion: getCurrentAppVersion(),
  currentChannel: getCurrentChannel(),
  currentUserType: null
}
