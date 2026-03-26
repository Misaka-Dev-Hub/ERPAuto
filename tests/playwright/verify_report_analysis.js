const { _electron: electron } = require('playwright')

;(async () => {
  const electronApp = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu']
  })

  // Get the first window that the app opens
  const window = await electronApp.firstWindow()

  // Try to bypass auth and navigate to cleaner page if possible, but we don't know the exact DOM
  await window.waitForTimeout(5000)

  await window.screenshot({ path: 'tests/playwright/screenshot.png' })
  console.log('Took screenshot')

  await electronApp.close()
})()
