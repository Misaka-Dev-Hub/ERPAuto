/**
 * ERP Error Context Capture
 *
 * Lightweight helper to capture Playwright page state when ERP operations fail.
 * All capture calls are defensive — failures do not propagate to the caller.
 */

import type { Page } from 'playwright'
import fs from 'fs'
import path from 'path'
import { getLogDir } from '../logger/shared'

export interface ErpErrorContext {
  pageUrl?: string
  frameHierarchy?: Array<{ name: string; url: string }>
  targetSelector?: string
  step?: string
  screenshotPath?: string
}

/**
 * Sanitize a step name for use as a filename component.
 * Replaces non-alphanumeric characters with underscores and truncates.
 */
function sanitizeForFilename(step: string | undefined): string {
  if (!step) return 'unknown'
  return step.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
}

/**
 * Capture a screenshot of the page for error diagnostics.
 * Stored as PNG under <logDir>/screenshots/.
 * Defensive: never throws.
 */
async function captureScreenshot(page: Page, step?: string): Promise<string | undefined> {
  try {
    if (page.isClosed()) return undefined

    const screenshotDir = path.join(getLogDir(), 'screenshots')
    fs.mkdirSync(screenshotDir, { recursive: true })

    const now = new Date()
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '_',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join('')

    const filename = `err_${timestamp}_${sanitizeForFilename(step)}.png`
    const filePath = path.join(screenshotDir, filename)

    const buffer = await page.screenshot({ type: 'png', timeout: 5000 })
    fs.writeFileSync(filePath, buffer)

    return filePath
  } catch {
    // screenshot failure must not propagate
    return undefined
  }
}

/**
 * Capture the current state of a Playwright page for error logging.
 * Returns a plain object safe for structured logging.
 *
 * @param page - The Playwright page to inspect
 * @param targetSelector - Optional selector that was being targeted
 */
export async function capturePageContext(
  page: Page,
  targetSelector?: string,
  step?: string
): Promise<ErpErrorContext> {
  const ctx: ErpErrorContext = {}

  try {
    ctx.pageUrl = page.url()
  } catch {
    // page may be closed or inaccessible
  }

  try {
    const frames = page.frames()
    ctx.frameHierarchy = frames.map((f) => ({ name: f.name(), url: f.url() }))
  } catch {
    // frame enumeration may fail on detached pages
  }

  if (targetSelector) {
    ctx.targetSelector = targetSelector
  }

  if (step) {
    ctx.step = step
  }

  ctx.screenshotPath = await captureScreenshot(page, step)

  return ctx
}
