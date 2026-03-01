import { ipcMain } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'

/**
 * Register IPC handlers for file operations
 */
export function registerFileHandlers(): void {
  // Read file content
  ipcMain.handle('file:read', async (_event, filePath: string): Promise<string> => {
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file'
      throw new Error(message)
    }
  })

  // Write content to file
  ipcMain.handle('file:write', async (_event, filePath: string, content: string): Promise<void> => {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, content, 'utf-8')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to write file'
      throw new Error(message)
    }
  })

  // Check if file exists
  ipcMain.handle('file:exists', async (_event, filePath: string): Promise<boolean> => {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  })

  // List files in directory
  ipcMain.handle('file:list', async (_event, dirPath: string): Promise<string[]> => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list directory'
      throw new Error(message)
    }
  })
}
