import { app } from 'electron'
import fs from 'fs'
import { join } from 'path'
import { ConfigManager } from '../services/config/config-manager'
import { UpdateService } from '../services/update/update-service'
import { createLogger } from '../services/logger'

const log = createLogger('Bootstrap')

export function configurePlaywrightBrowsersPath(): string {
  const browsersPath = join(app.getPath('userData'), 'ms-playwright')
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
  return browsersPath
}

export function setupElectronRuntime(): void {
  app.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      const isReloadShortcut = (input.control || input.meta) && input.key.toLowerCase() === 'r'
      const isToggleDevTools = input.key === 'F12'

      if (!app.isPackaged && isToggleDevTools && input.type === 'keyDown') {
        window.webContents.toggleDevTools()
        event.preventDefault()
        return
      }

      if (app.isPackaged && isReloadShortcut) {
        event.preventDefault()
      }
    })
  })
}

/**
 * Check if Playwright browsers are installed
 * @returns true if browsers exist, false otherwise
 */
export function ensurePlaywrightRuntime(browsersPath: string): boolean {
  try {
    fs.mkdirSync(browsersPath, { recursive: true })
  } catch (error) {
    log.error('Failed to create browsers directory', { error })
  }

  const newChromiumPath = join(browsersPath, 'chromium-1208', 'chrome-win64', 'chrome.exe')
  const oldChromiumPath = join(browsersPath, 'chromium-win32', 'chrome.exe')
  const chromiumPath = fs.existsSync(newChromiumPath) ? newChromiumPath : oldChromiumPath

  if (fs.existsSync(chromiumPath)) {
    return true
  }

  let foundRevision = false
  try {
    const entries = fs.readdirSync(browsersPath)
    for (const entry of entries) {
      if (entry.startsWith('chromium-') && !entry.includes('headless')) {
        const revisionPath = join(browsersPath, entry, 'chrome-win64', 'chrome.exe')
        if (fs.existsSync(revisionPath)) {
          log.info('Found Chromium revision', { revision: entry })
          foundRevision = true
          break
        }
      }
    }
  } catch {
    // Ignore browser directory probing failures and fall through to the warning dialog.
  }

  if (foundRevision) {
    return true
  }

  log.warn('Playwright browser not found', {
    available: fs.existsSync(browsersPath) ? fs.readdirSync(browsersPath) : 'none',
    browsersPath
  })
  return false
}

export async function initializeMainProcessServices(): Promise<void> {
  try {
    const configManager = ConfigManager.getInstance()
    await configManager.initialize()
    UpdateService.getInstance().initialize()
  } catch (error) {
    log.error('Failed to initialize ConfigManager', { error })
  }

  const { registerIpcHandlers } = await import('../ipc')
  registerIpcHandlers()
}
