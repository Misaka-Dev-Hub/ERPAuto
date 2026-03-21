import { app, dialog } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import fs from 'fs'
import { join } from 'path'
import { ConfigManager } from '../services/config/config-manager'
import { UpdateService } from '../services/update/update-service'

export function configurePlaywrightBrowsersPath(): string {
  const browsersPath = join(app.getPath('userData'), 'ms-playwright')
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
  return browsersPath
}

export function setupElectronRuntime(): void {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
}

export function ensurePlaywrightRuntime(browsersPath: string): void {
  try {
    fs.mkdirSync(browsersPath, { recursive: true })
  } catch (error) {
    console.error('Failed to create browsers directory:', error)
  }

  const newChromiumPath = join(browsersPath, 'chromium-1208', 'chrome-win64', 'chrome.exe')
  const oldChromiumPath = join(browsersPath, 'chromium-win32', 'chrome.exe')
  const chromiumPath = fs.existsSync(newChromiumPath) ? newChromiumPath : oldChromiumPath

  if (fs.existsSync(chromiumPath)) {
    return
  }

  let foundRevision = false
  try {
    const entries = fs.readdirSync(browsersPath)
    for (const entry of entries) {
      if (entry.startsWith('chromium-') && !entry.includes('headless')) {
        const revisionPath = join(browsersPath, entry, 'chrome-win64', 'chrome.exe')
        if (fs.existsSync(revisionPath)) {
          console.log('Found Chromium revision:', entry)
          foundRevision = true
          break
        }
      }
    }
  } catch {
    // Ignore browser directory probing failures and fall through to the warning dialog.
  }

  if (foundRevision) {
    return
  }

  dialog.showErrorBox(
    '浏览器文件未找到',
    `Playwright 浏览器文件不存在。\n\n` +
      `期望路径：${newChromiumPath}\n` +
      `或：${oldChromiumPath}\n\n` +
      `当前目录内容：${fs.existsSync(browsersPath) ? fs.readdirSync(browsersPath).join(', ') : '目录不存在'}\n\n` +
      `请运行以下命令安装浏览器：\n` +
      `npx playwright install chromium`
  )
  console.warn(
    'Playwright browser not found. Available:',
    fs.existsSync(browsersPath) ? fs.readdirSync(browsersPath) : 'none'
  )
}

export async function initializeMainProcessServices(): Promise<void> {
  try {
    const configManager = ConfigManager.getInstance()
    await configManager.initialize()
    UpdateService.getInstance().initialize()
  } catch (error) {
    console.error('Failed to initialize ConfigManager:', error)
  }

  const { registerIpcHandlers } = await import('../ipc')
  registerIpcHandlers()
}
