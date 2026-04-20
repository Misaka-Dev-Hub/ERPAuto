/**
 * Debug script to verify Electron environment detection
 */
import { app } from 'electron'
import { createCliLogger } from '../utils/cli-log'

const cli = createCliLogger('DebugEnv')

cli.line('=== Electron Environment Debug ===')
cli.line()

cli.line(`1. app.isPackaged: ${app.isPackaged}`)
cli.line(`2. app.getPath("userData"): ${app.getPath('userData')}`)
cli.line(`3. app.getPath("logs"): ${app.getPath('logs')}`)
cli.line(`4. NODE_ENV: ${process.env.NODE_ENV}`)
cli.line(`5. process.cwd(): ${process.cwd()}`)
cli.line(`6. __dirname: ${__dirname}`)

// Predict log dir
function getLogDir(): string {
  if (app && app.isReady()) {
    return app.getPath('logs')
  }
  const devLogDir = `${process.cwd()}\\logs`
  return devLogDir
}

cli.line()
cli.line(`7. Predicted log dir: ${getLogDir()}`)
cli.line()
cli.line('=== END DEBUG ===')

app.quit()
