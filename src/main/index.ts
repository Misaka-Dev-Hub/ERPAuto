import { app, ipcMain } from 'electron'
import { createMainWindow, registerMainWindowLifecycle } from './bootstrap/main-window'
import {
  configurePlaywrightBrowsersPath,
  ensurePlaywrightRuntime,
  initializeMainProcessServices,
  setupElectronRuntime
} from './bootstrap/runtime'
import { setupProcessGuards } from './bootstrap/process-guards'

app.whenReady().then(async () => {
  setupProcessGuards()
  registerMainWindowLifecycle()
  const playwrightBrowsersPath = configurePlaywrightBrowsersPath()
  ensurePlaywrightRuntime(playwrightBrowsersPath)
  await initializeMainProcessServices()
  setupElectronRuntime()

  ipcMain.on('ping', () => console.log('pong'))

  createMainWindow()
})
