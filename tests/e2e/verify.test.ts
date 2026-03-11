import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'

test('Verify Concurrency Setting in CleanerPage', async () => {
  // Launch Electron app
  const electronApp = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu'],
    env: { ...process.env, NODE_ENV: 'development' }
  })

  // Get the main window
  const window = await electronApp.firstWindow()

  // Wait for the app to load
  await window.waitForLoadState('domcontentloaded')

  // Let the app initialize fully
  await window.waitForTimeout(3000)

  // Navigate to CleanerPage
  const cleanerTab = await window.getByText('物料清理')
  await cleanerTab.waitFor({ state: 'visible' }).catch(() => {})
  await cleanerTab.click().catch(() => {})

  // Wait a bit for the page to transition
  await window.waitForTimeout(1000)

  // Click "执行设置" (Execution Settings) button
  const settingsBtn = await window.getByRole('button', { name: /执行设置/ })
  await settingsBtn.waitFor({ state: 'visible' })
  await settingsBtn.click()

  // Wait for the settings menu to appear and the Concurrency input to be visible
  await window.waitForTimeout(500)

  // Find the input containing concurrency text, or just the number input
  const concurrencyInput = await window.locator('input[type="number"]').first()
  await concurrencyInput.waitFor({ state: 'visible' })

  // Assert default value is 1
  await expect(concurrencyInput).toHaveValue('1')

  // Set to 5 and test
  await concurrencyInput.fill('5')
  await expect(concurrencyInput).toHaveValue('5')

  // Take screenshot showing the open menu and value
  await window.screenshot({ path: '/home/jules/verification/cleaner-concurrency.png' })

  // Close app
  await electronApp.close()
})