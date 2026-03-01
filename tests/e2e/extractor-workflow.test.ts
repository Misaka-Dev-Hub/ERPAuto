/**
 * E2E Test for Extractor Workflow
 * Tests the full extraction flow from UI input to result display
 *
 * Run: npx playwright test tests/e2e/extractor-workflow.test.ts
 */

import { _electron as electron } from '@playwright/test'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { ElectronApplication, Page, BrowserWindow } from 'playwright'
import { join } from 'path'

describe('Extractor E2E Workflow', () => {
  let electronApp: ElectronApplication
  let window: BrowserWindow
  let page: Page

  beforeAll(async () => {
    // Build the app first (if not already built)
    // npm run build

    // Launch Electron app for testing
    electronApp = await electron.launch({
      args: [join(process.cwd(), 'out/main/index.js')]
    })

    // Get the main window
    window = await electronApp.firstWindow()
    page = await electronApp.firstWindow()

    // Wait for app to load
    await page.waitForLoadState('domcontentloaded')
  }, 60000)

  afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  }, 60000)

  it('should launch the application', async () => {
    const title = await page.title()
    expect(title).toBeDefined()
  })

  it('should navigate to Extractor page', async () => {
    // Click on the "数据提取" link
    await page.click('a:has-text("数据提取")')

    // Wait for ExtractorPage to load
    await page.waitForSelector('.extractor-page', { state: 'visible' })

    // Verify page title is visible
    const pageTitle = await page.locator('.page-title').textContent()
    expect(pageTitle).toContain('ERP 数据提取')
  })

  it('should display order number input', async () => {
    // Check if order number textarea is visible
    const textarea = page.locator('.order-textarea')
    await expect(textarea).toBeVisible()

    // Check placeholder text
    const placeholder = await textarea.getAttribute('placeholder')
    expect(placeholder).toContain('订单号')
  })

  it('should update order count when typing', async () => {
    // Fill in order numbers
    const textarea = page.locator('.order-textarea')
    await textarea.fill('SC70202602120085\nSC70202602120120')

    // Wait for count to update
    await page.waitForTimeout(100)

    // Check count badge
    const countBadge = page.locator('.count-badge')
    const countText = await countBadge.textContent()
    expect(countText).toContain('2')
  })

  it('should show error when extracting without order numbers', async () => {
    // Clear the textarea
    const textarea = page.locator('.order-textarea')
    await textarea.fill('')

    // Try to click extract button (should be disabled)
    const extractButton = page.locator('.btn-primary:has-text("开始提取")')
    const isDisabled = await extractButton.isDisabled()
    expect(isDisabled).toBe(true)
  })

  it('should have batch size input', async () => {
    const batchSizeInput = page.locator('input[type="number"]')
    await expect(batchSizeInput).toBeVisible()

    const value = await batchSizeInput.inputValue()
    expect(value).toBe('100')
  })

  it('should have reset button', async () => {
    const resetButton = page.locator('.btn-secondary:has-text("重置")')
    await expect(resetButton).toBeVisible()

    // Click reset
    await resetButton.click()

    // Verify textarea is cleared
    const textarea = page.locator('.order-textarea')
    const value = await textarea.inputValue()
    expect(value).toBe('')
  })

  it('should navigate back to home', async () => {
    // Click back button
    await page.click('.nav-btn:has-text("返回主页")')

    // Wait for home page to appear
    await page.waitForSelector('.logo', { state: 'visible' })
  })
})
