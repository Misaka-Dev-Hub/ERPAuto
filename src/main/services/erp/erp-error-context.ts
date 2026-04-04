/**
 * ERP Error Context Capture
 *
 * Lightweight helper to capture Playwright page state when ERP operations fail.
 * All capture calls are defensive — failures do not propagate to the caller.
 */

import type { Page } from 'playwright'

export interface ErpErrorContext {
  pageUrl?: string
  frameHierarchy?: Array<{ name: string; url: string }>
  targetSelector?: string
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
  targetSelector?: string
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

  return ctx
}
