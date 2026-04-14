import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  getCleanerHistoryStatusDisplay,
  getCleanerMaterialResultDisplay
} from '../../src/renderer/src/components/cleaner-history-status'

describe('cleaner history status helpers', () => {
  it('returns shared label, badge class and icon for known statuses', () => {
    const display = getCleanerHistoryStatusDisplay('erp_not_found')

    expect(display.label).toBe('ERP不存在')
    expect(display.badgeClassName).toBe('bg-orange-100 text-orange-700')
    expect(renderToStaticMarkup(React.createElement(React.Fragment, null, display.icon))).toContain(
      'text-orange-600'
    )
  })

  it('falls back to pending style for unknown statuses while preserving text', () => {
    const display = getCleanerHistoryStatusDisplay('custom_status')

    expect(display.label).toBe('custom_status')
    expect(display.badgeClassName).toBe('bg-gray-100 text-gray-700')
  })

  it('maps failed material outcomes through the shared helper', () => {
    const display = getCleanerMaterialResultDisplay('failed_timeout')

    expect(display.title).toBe('Failed')
    expect(renderToStaticMarkup(React.createElement(React.Fragment, null, display.icon))).toContain(
      'text-red-600'
    )
  })

  it('returns plain text for unknown material outcomes', () => {
    const display = getCleanerMaterialResultDisplay('needs_manual_check')

    expect(display.title).toBe('needs_manual_check')
    expect(display.icon).toBeNull()
  })
})
