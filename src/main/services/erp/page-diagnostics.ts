/**
 * Page Diagnostics
 *
 * Attaches browser console and error listeners to Playwright pages
 * so that ERP-side JS errors are visible in the application log.
 *
 * Only warning and error level console messages are captured —
 * ERP (YonBIP) outputs large volumes of info-level messages that
 * would drown the log.
 */

import type { Page, BrowserContext } from 'playwright'
import { createLogger } from '../logger'

const log = createLogger('BrowserDiagnostics')

/**
 * Attach console and error listeners to a single page.
 */
export function attachPageDiagnostics(page: Page): void {
  page.on('console', (msg) => {
    const type = msg.type()
    if (type !== 'warning' && type !== 'error') return

    const location = msg.location()
    log.error(`[Browser ${type}] ${msg.text()}`, {
      pageUrl: page.url(),
      consoleType: type,
      location: location ? `${location.url}:${location.lineNumber}` : undefined
    })
  })

  page.on('pageerror', (error) => {
    log.error(`[Browser pageerror] ${error.message}`, {
      pageUrl: page.url(),
      error: error.message,
      stack: error.stack
    })
  })
}

/**
 * Attach diagnostics to all current and future pages in a browser context.
 * Covers popups and pages opened by ERP automation.
 */
export function attachContextDiagnostics(context: BrowserContext): void {
  context.on('page', (page) => {
    attachPageDiagnostics(page)
  })
}
