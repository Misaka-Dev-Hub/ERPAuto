import type { BrowserContext, Page } from 'playwright'

export type ErpPageKind = 'login' | 'home' | 'query' | 'detail' | 'cas_login' | 'unknown'

export interface CapturePageStateOptions {
  includeFrameHierarchy?: boolean
  includeBodyTextPreview?: boolean
  bodyTextPreviewLength?: number
}

export interface ErpPageState {
  pageUrl?: string
  pageTitle?: string
  pageKind: ErpPageKind
  hasForwardFrame: boolean
  hasMainIframe: boolean
  hasLoginForm: boolean
  hasWorkbenchMarker: boolean
  hasQueryMarker: boolean
  hasDetailHeader: boolean
  isCasLoginRedirect: boolean
  frameCount?: number
  popupCount?: number
  visibleMarkers?: string[]
  frameHierarchy?: Array<{ name: string; url: string }>
  bodyTextPreview?: string
}

async function safePageUrl(page: Page): Promise<string | undefined> {
  try {
    return page.url()
  } catch {
    return undefined
  }
}

async function safePageTitle(page: Page): Promise<string | undefined> {
  try {
    const title = await page.title()
    return title.slice(0, 200)
  } catch {
    return undefined
  }
}

async function safeFrameCount(page: Page): Promise<number | undefined> {
  try {
    return page.frames().length
  } catch {
    return undefined
  }
}

async function safePopupCount(context?: BrowserContext): Promise<number | undefined> {
  try {
    return context?.pages().length
  } catch {
    return undefined
  }
}

async function safeLocatorExists(locator: ReturnType<Page['locator']>): Promise<boolean> {
  try {
    return (await locator.count()) > 0
  } catch {
    return false
  }
}

async function safeBodyPreview(page: Page, maxLength: number): Promise<string | undefined> {
  try {
    const text = await page.locator('body').innerText({ timeout: 1000 })
    return text.replace(/\s+/g, ' ').trim().slice(0, maxLength)
  } catch {
    return undefined
  }
}

export async function capturePageState(
  page: Page,
  context?: BrowserContext,
  options: CapturePageStateOptions = {}
): Promise<ErpPageState> {
  const pageUrl = await safePageUrl(page)
  const pageTitle = await safePageTitle(page)
  const isCasLoginRedirect = !!pageUrl?.includes('euc.yonyoucloud.com/cas/login')

  let hasForwardFrame = false
  let hasMainIframe = false
  let hasLoginForm = false
  let hasWorkbenchMarker = false
  let hasQueryMarker = false
  let hasDetailHeader = false

  try {
    hasForwardFrame = await safeLocatorExists(page.locator('#forwardFrame'))
  } catch {
    hasForwardFrame = false
  }

  let forwardFrame: Awaited<ReturnType<ReturnType<Page['locator']>['contentFrame']>> | null = null
  if (hasForwardFrame) {
    try {
      forwardFrame = await page.locator('#forwardFrame').contentFrame()
    } catch {
      forwardFrame = null
    }
  }

  if (forwardFrame) {
    try {
      hasMainIframe = (await forwardFrame.locator('#mainiframe').count()) > 0
    } catch {
      hasMainIframe = false
    }

    try {
      hasWorkbenchMarker = (await forwardFrame.locator('.nc-workbench-icon').count()) > 0
    } catch {
      hasWorkbenchMarker = false
    }

    try {
      hasLoginForm =
        (await forwardFrame.getByRole('textbox', { name: '用户名' }).count()) > 0 ||
        (await forwardFrame.getByRole('textbox', { name: '密码' }).count()) > 0
    } catch {
      hasLoginForm = false
    }
  }

  let innerFrame: Awaited<
    ReturnType<ReturnType<NonNullable<typeof forwardFrame>['locator']>['contentFrame']>
  > | null = null
  if (forwardFrame && hasMainIframe) {
    try {
      innerFrame = await forwardFrame.locator('#mainiframe').contentFrame()
    } catch {
      innerFrame = null
    }
  }

  if (innerFrame) {
    try {
      hasQueryMarker =
        (await innerFrame.getByText('订单号查询').count()) > 0 ||
        (await innerFrame.locator('#rc_select_0').count()) > 0
    } catch {
      hasQueryMarker = false
    }

    try {
      hasDetailHeader = (await innerFrame.getByText(/^离散备料计划维护：/).count()) > 0
    } catch {
      hasDetailHeader = false
    }
  }

  if (!hasLoginForm) {
    try {
      hasLoginForm =
        (await page.getByRole('textbox', { name: '用户名' }).count()) > 0 ||
        (await page.getByRole('textbox', { name: '密码' }).count()) > 0
    } catch {
      hasLoginForm = false
    }
  }

  const visibleMarkers: string[] = []
  if (isCasLoginRedirect) visibleMarkers.push('cas_login_url')
  if (hasLoginForm) visibleMarkers.push('login_form')
  if (hasWorkbenchMarker) visibleMarkers.push('workbench_icon')
  if (hasQueryMarker) visibleMarkers.push('query_marker')
  if (hasDetailHeader) visibleMarkers.push('detail_header')
  if (hasForwardFrame) visibleMarkers.push('forwardFrame')
  if (hasMainIframe) visibleMarkers.push('mainiframe')

  let pageKind: ErpPageKind = 'unknown'
  if (isCasLoginRedirect) pageKind = 'cas_login'
  else if (hasLoginForm) pageKind = 'login'
  else if (hasDetailHeader) pageKind = 'detail'
  else if (hasQueryMarker) pageKind = 'query'
  else if (hasWorkbenchMarker) pageKind = 'home'

  const state: ErpPageState = {
    pageUrl,
    pageTitle,
    pageKind,
    hasForwardFrame,
    hasMainIframe,
    hasLoginForm,
    hasWorkbenchMarker,
    hasQueryMarker,
    hasDetailHeader,
    isCasLoginRedirect,
    frameCount: await safeFrameCount(page),
    popupCount: await safePopupCount(context),
    visibleMarkers
  }

  if (options.includeFrameHierarchy) {
    try {
      state.frameHierarchy = page.frames().map((frame) => ({ name: frame.name(), url: frame.url() }))
    } catch {
      state.frameHierarchy = undefined
    }
  }

  if (options.includeBodyTextPreview) {
    state.bodyTextPreview = await safeBodyPreview(page, options.bodyTextPreviewLength ?? 500)
  }

  return state
}
