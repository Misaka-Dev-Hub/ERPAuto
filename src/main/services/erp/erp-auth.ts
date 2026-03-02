import { chromium, type BrowserContext, type Page } from 'playwright'
import type { ErpConfig, ErpSession } from '../../types/erp.types'
import { createLogger } from '../logger'

const log = createLogger('ErpAuthService')

/**
 * ERP Authentication Service
 * Manages login session and browser lifecycle
 */
export class ErpAuthService {
  private config: ErpConfig
  private session: ErpSession | null = null

  constructor(config: ErpConfig) {
    this.config = config
  }

  /**
   * Login to ERP system and establish session
   */
  async login(): Promise<ErpSession> {
    if (this.session?.isLoggedIn) {
      return this.session
    }

    // Launch browser with SSL certificate errors ignored
    const browser = await chromium.launch({
      headless: this.config.headless ?? false, // Use config or default to false
      slowMo: 100, // Slow down for debugging
      args: [
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors-spki-list',
        '--disable-web-security' // Disable web security for internal VPN
      ]
    })

    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true, // Ignore SSL certificate errors
      // Disable web security for internal VPN
      javaScriptEnabled: true
    })

    const page = await context.newPage()

    // Navigate to login page (use actual login URL from Python code)
    const loginUrl = `${this.config.url}/yonbip/resources/uap/rbac/login/main/index.html`
    await page.goto(loginUrl)

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })

    // Wait for iframe to be present
    await page.waitForSelector('#forwardFrame', { state: 'attached', timeout: 15000 })

    // Extract forwardFrame (Python: main_frame = page.locator("#forwardFrame").content_frame)
    // This is the main working frame for all subsequent operations
    const frameLocator = page.locator('#forwardFrame')
    const contentFrame = await frameLocator.contentFrame()

    if (!contentFrame) {
      throw new Error('Failed to access forwardFrame content frame')
    }

    // Store reference to main frame for later use (Python returns this as main_frame)
    const mainFrame = contentFrame

    // Fill username using role-based locator (Python: get_by_role("textbox", name="用户名"))
    try {
      await contentFrame.getByRole('textbox', { name: '用户名' }).fill(this.config.username)
    } catch (e) {
      throw new Error(`Failed to find username input: ${e}`)
    }

    // Fill password using role-based locator (Python: get_by_role("textbox", name="密码"))
    try {
      await contentFrame.getByRole('textbox', { name: '密码' }).fill(this.config.password)
    } catch (e) {
      throw new Error(`Failed to find password input: ${e}`)
    }

    // Click login button using role-based locator (Python: get_by_role("button", name="登录"))
    try {
      await contentFrame.getByRole('button', { name: '登录' }).click()
    } catch (e) {
      throw new Error(`Failed to click login button: ${e}`)
    }

    // Wait for navigation after login
    // The login will redirect to the main page which has a different structure
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    } catch (e) {
      log.warn('Page load state check timed out, continuing')
    }

    // Handle force login confirmation dialog if present (Python: get_by_role("button", name="确定"))
    try {
      const confirmBtn = mainFrame.getByRole('button', { name: '确定' })
      const count = await confirmBtn.count()
      if (count > 0) {
        log.info('Force login detected, clicking confirm button')
        await confirmBtn.first().click()
        await page.waitForTimeout(2000)
      } else {
        log.debug('Normal login, no confirmation dialog')
      }
    } catch {
      // No force login dialog, continue
      log.debug('Normal login, no confirmation dialog')
    }

    // Create session with mainFrame (Python returns main_frame as part of login result)
    this.session = {
      browser,
      context,
      page,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mainFrame: mainFrame as any, // Store forwardFrame content frame for subsequent operations
      isLoggedIn: true
    }

    return this.session
  }

  /**
   * Close browser and cleanup session
   */
  async close(): Promise<void> {
    if (this.session) {
      await this.session.context.close()
      await this.session.browser.close()
      this.session = null
    }
  }

  /**
   * Get current session (must be logged in first)
   */
  getSession(): ErpSession {
    if (!this.session?.isLoggedIn) {
      throw new Error('Not logged in. Call login() first.')
    }
    return this.session
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.session?.isLoggedIn ?? false
  }
}
