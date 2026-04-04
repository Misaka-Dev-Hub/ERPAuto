/**
 * Debug script to verify Electron environment detection
 */
import { app } from 'electron'

console.log('=== Electron Environment Debug ===\n')

console.log('1. app.isPackaged:', app.isPackaged)
console.log('2. app.getPath("userData"):', app.getPath('userData'))
console.log('3. app.getPath("logs"):', app.getPath('logs'))
console.log('4. NODE_ENV:', process.env.NODE_ENV)
console.log('5. process.cwd():', process.cwd())
console.log('6. __dirname:', __dirname)

// Predict log dir
function getLogDir(): string {
  if (app && app.isReady()) {
    return app.getPath('logs')
  }
  const devLogDir = `${process.cwd()}\\logs`
  return devLogDir
}

console.log('\n7. Predicted log dir:', getLogDir())
console.log('\n=== END DEBUG ===')

app.quit()
