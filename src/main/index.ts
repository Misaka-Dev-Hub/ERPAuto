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
  const browsersExist = ensurePlaywrightRuntime(playwrightBrowsersPath)
  console.log('Playwright browsers exist:', browsersExist)
  await initializeMainProcessServices()
  setupElectronRuntime()

  ipcMain.on('ping', () => console.log('pong'))

  createMainWindow()
})
