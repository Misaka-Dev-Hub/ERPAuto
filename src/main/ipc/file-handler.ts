import { ipcMain, shell } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { createLogger } from '../services/logger'

const log = createLogger('FileHandler')

export function registerFileHandlers(): void {
  ipcMain.handle('file:read', async (_event, filePath: string): Promise<string> => {
    try {
      log.debug('Reading file', { filePath })
      return await fs.readFile(filePath, 'utf-8')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file'
      log.error('Failed to read file', { filePath, error: message })
      throw new Error(message)
    }
  })

  ipcMain.handle('file:write', async (_event, filePath: string, content: string): Promise<void> => {
    try {
      log.debug('Writing file', { filePath })
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, content, 'utf-8')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to write file'
      log.error('Failed to write file', { filePath, error: message })
      throw new Error(message)
    }
  })

  ipcMain.handle('file:exists', async (_event, filePath: string): Promise<boolean> => {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('file:list', async (_event, dirPath: string): Promise<string[]> => {
    try {
      log.debug('Listing directory', { dirPath })
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list directory'
      log.error('Failed to list directory', { dirPath, error: message })
      throw new Error(message)
    }
  })

  ipcMain.handle('file:openPath', async (_event, filePath: string): Promise<void> => {
    try {
      log.debug('Opening path in explorer', { filePath })
      await shell.openPath(filePath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open path'
      log.error('Failed to open path', { filePath, error: message })
      throw new Error(message)
    }
  })
}
