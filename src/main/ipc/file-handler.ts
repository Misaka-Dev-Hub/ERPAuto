import { app, ipcMain, shell } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { createLogger } from '../services/logger'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { ValidationError } from '../types/errors'
import { withErrorHandling, type IpcResult } from './index'

const log = createLogger('FileHandler')

function getAllowedRoots(): string[] {
  return [path.resolve(app.getAppPath()), path.resolve(app.getPath('userData'))]
}

export function isPathWithinAllowedRoots(inputPath: string, roots: string[]): boolean {
  const normalized = path.resolve(inputPath)
  return roots.some((root) => {
    const rel = path.relative(root, normalized)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  })
}

function normalizeAndValidatePath(inputPath: string): string {
  const normalized = path.resolve(inputPath)
  const isAllowed = isPathWithinAllowedRoots(normalized, getAllowedRoots())
  if (!isAllowed) {
    throw new ValidationError('Path is outside allowed roots', 'VAL_INVALID_INPUT')
  }

  return normalized
}

export function registerFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_event, filePath: string): Promise<IpcResult<string>> => {
    return withErrorHandling(async () => {
      const safePath = normalizeAndValidatePath(filePath)
      log.debug('Reading file', { filePath: safePath })
      return await fs.readFile(safePath, 'utf-8')
    }, 'file:read')
  })

  ipcMain.handle(
    IPC_CHANNELS.FILE_WRITE,
    async (_event, filePath: string, content: string): Promise<IpcResult<void>> => {
      return withErrorHandling(async () => {
        const safePath = normalizeAndValidatePath(filePath)
        log.debug('Writing file', { filePath: safePath })
        const dir = path.dirname(safePath)
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(safePath, content, 'utf-8')
      }, 'file:write')
    }
  )

  ipcMain.handle(IPC_CHANNELS.FILE_EXISTS, async (_event, filePath: string): Promise<IpcResult<boolean>> => {
    return withErrorHandling(async () => {
      const safePath = normalizeAndValidatePath(filePath)
      try {
        await fs.access(safePath)
        return true
      } catch {
        return false
      }
    }, 'file:exists')
  })

  ipcMain.handle(IPC_CHANNELS.FILE_LIST, async (_event, dirPath: string): Promise<IpcResult<string[]>> => {
    return withErrorHandling(async () => {
      const safePath = normalizeAndValidatePath(dirPath)
      log.debug('Listing directory', { dirPath: safePath })
      const entries = await fs.readdir(safePath, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()
    }, 'file:list')
  })

  ipcMain.handle(IPC_CHANNELS.FILE_OPEN_PATH, async (_event, filePath: string): Promise<IpcResult<void>> => {
    return withErrorHandling(async () => {
      const safePath = normalizeAndValidatePath(filePath)
      log.debug('Opening path in explorer', { filePath: safePath })
      await fs.access(safePath)
      await shell.openPath(safePath)
    }, 'file:openPath')
  })
}
