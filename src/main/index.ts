import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc'
import { ConfigManager } from './services/config/config-manager'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import fs from 'fs'

// Set Playwright browsers path BEFORE any playwright import
process.env.PLAYWRIGHT_BROWSERS_PATH = join(app.getPath('userData'), 'ms-playwright')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Validate Playwright browser path
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH!

  // Create directory if it doesn't exist
  try {
    fs.mkdirSync(browsersPath, { recursive: true })
  } catch (error) {
    console.error('Failed to create browsers directory:', error)
  }

  // Check if chromium browser exists (supports both old and new Playwright directory structures)
  // New format (v1.48+): chromium-1208/chrome-win64/chrome.exe
  // Old format: chromium-win32/chrome.exe
  const newChromiumPath = join(browsersPath, 'chromium-1208', 'chrome-win64', 'chrome.exe')
  const oldChromiumPath = join(browsersPath, 'chromium-win32', 'chrome.exe')
  const chromiumPath = fs.existsSync(newChromiumPath) ? newChromiumPath : oldChromiumPath

  if (!fs.existsSync(chromiumPath)) {
    // Try to find any chromium revision
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
    } catch (e) {
      // Ignore
    }

    if (!foundRevision) {
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
  }

  // Initialize ConfigManager BEFORE registering IPC handlers
  // This ensures config is loaded before any service tries to use it
  try {
    const configManager = ConfigManager.getInstance()
    await configManager.initialize()
  } catch (error) {
    console.error('Failed to initialize ConfigManager:', error)
    // Continue anyway - default config will be created
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register IPC handlers (after ConfigManager is initialized)
  registerIpcHandlers()

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
