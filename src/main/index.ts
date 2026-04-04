import { app, ipcMain } from 'electron'
import { createMainWindow, registerMainWindowLifecycle } from './bootstrap/main-window'
import {
  configurePlaywrightBrowsersPath,
  ensurePlaywrightRuntime,
  initializeMainProcessServices,
  setupElectronRuntime
} from './bootstrap/runtime'
import { setupProcessGuards } from './bootstrap/process-guards'
import { createLogger } from './services/logger'

const log = createLogger('App')

app.whenReady().then(async () => {
  setupProcessGuards()
  registerMainWindowLifecycle()
  const playwrightBrowsersPath = configurePlaywrightBrowsersPath()
  const browsersExist = ensurePlaywrightRuntime(playwrightBrowsersPath)
  log.info('Playwright browsers check', { browsersExist })
  await initializeMainProcessServices()
  setupElectronRuntime()

  ipcMain.on('ping', () => log.debug('pong'))

  createMainWindow()
})
