import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { invokeIpc } from '../lib/ipc'

export const fileApi = {
  readFile: (filePath: string) => invokeIpc(IPC_CHANNELS.FILE_READ, filePath),
  writeFile: (filePath: string, content: string) =>
    invokeIpc(IPC_CHANNELS.FILE_WRITE, filePath, content),
  fileExists: (filePath: string) => invokeIpc(IPC_CHANNELS.FILE_EXISTS, filePath),
  listFiles: (dirPath: string) => invokeIpc(IPC_CHANNELS.FILE_LIST, dirPath),
  openPath: (filePath: string) => invokeIpc(IPC_CHANNELS.FILE_OPEN_PATH, filePath)
} as const
