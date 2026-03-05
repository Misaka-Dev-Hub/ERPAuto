/**
 * ERP Browser Manager
 *
 * Manages browser lifecycle for ERP automation.
 * Separates browser management from authentication logic.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { createLogger } from '../logger'

const log = createLogger('ErpBrowserManager')

/**
 * Browser configuration options
 */
export interface BrowserConfig {
  headless?: boolean
  slowMo?: number
  viewport?: { width: number; height: number }
  ignoreHTTPSErrors?: boolean
  acceptDownloads?: boolean
}

/**
 * Default browser configuration
 */
const DEFAULT_CONFIG: Required<BrowserConfig> = {
  headless: false,
  slowMo: 100,
  viewport: { width: 1920, height: 1080 },
  ignoreHTTPSErrors: true,
  acceptDownloads: true
}

/**
 * Browser session containing all browser-related objects
 */
export interface BrowserSession {
  browser: Browser
  context: BrowserContext
  page: Page
}

/**
 * ErpBrowserManager class
 * Manages browser lifecycle independently from ERP authentication
 */
export class ErpBrowserManager {
  private config: Required<BrowserConfig>
  private session: BrowserSession | null = null

  constructor(config?: BrowserConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Launch a new browser instance
   */
  async launch(): Promise<Browser> {
    if (this.session?.browser?.isConnected()) {
      log.debug('Browser already running, returning existing instance')
      return this.session.browser
    }

    log.info('Launching browser', { headless: this.config.headless })

    const browser = await chromium.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo,
      args: [
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors-spki-list',
        '--disable-web-security'
      ]
    })

    log.info('Browser launched successfully')
    return browser
  }

  /**
   * Create a new browser context
   */
  async createContext(browser?: Browser): Promise<BrowserContext> {
    const browserInstance = browser || (await this.launch())

    log.debug('Creating browser context')

    const context = await browserInstance.newContext({
      acceptDownloads: this.config.acceptDownloads,
      viewport: this.config.viewport,
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true
    })

    log.debug('Browser context created')
    return context
  }

  /**
   * Create a new page in the context
   */
  async createPage(context?: BrowserContext): Promise<Page> {
    let contextInstance: BrowserContext

    if (context) {
      contextInstance = context
    } else if (this.session?.context) {
      contextInstance = this.session.context
    } else {
      const browser = await this.launch()
      contextInstance = await this.createContext(browser)
    }

    log.debug('Creating new page')
    const page = await contextInstance.newPage()
    log.debug('Page created')

    return page
  }

  /**
   * Initialize a complete browser session
   * This creates browser, context, and page in one call
   */
  async initialize(): Promise<BrowserSession> {
    if (this.session) {
      log.debug('Returning existing browser session')
      return this.session
    }

    const browser = await this.launch()
    const context = await this.createContext(browser)
    const page = await this.createPage(context)

    this.session = { browser, context, page }
    log.info('Browser session initialized')

    return this.session
  }

  /**
   * Get the current session
   */
  getSession(): BrowserSession | null {
    return this.session
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.session?.browser?.isConnected() ?? false
  }

  /**
   * Close the browser and cleanup
   */
  async close(): Promise<void> {
    if (!this.session) {
      log.debug('No browser session to close')
      return
    }

    log.info('Closing browser session')

    try {
      if (this.session.context) {
        await this.session.context.close()
      }
    } catch (error) {
      log.warn('Error closing context', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    try {
      if (this.session.browser) {
        await this.session.browser.close()
      }
    } catch (error) {
      log.warn('Error closing browser', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    this.session = null
    log.info('Browser session closed')
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string, options?: { timeout?: number }): Promise<void> {
    const page = this.session?.page
    if (!page) {
      throw new Error('No page available. Call initialize() first.')
    }

    log.info('Navigating to URL', { url })
    await page.goto(url, { timeout: options?.timeout ?? 30000 })
    await page.waitForLoadState('domcontentloaded', { timeout: options?.timeout ?? 10000 })
    log.debug('Page loaded')
  }
}

export default ErpBrowserManager
