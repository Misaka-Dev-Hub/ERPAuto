import { chromium } from 'playwright'
import type { ErpConfig, ErpSession } from '../../types/erp.types'
import { createLogger } from '../logger'
import { capturePageContext } from './erp-error-context'

const log = createLogger('ErpAuthService')

// Timeout constants
const PAGE_LOAD_TIMEOUT = 10000
const LOGIN_RESULT_TIMEOUT = 15000
const FORCE_LOGIN_TIMEOUT = 5000

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

    log.info('开始ERP登录', { url: this.config.url })

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

    log.debug('浏览器已启动', { headless: this.config.headless ?? false })

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

    log.debug('已导航到登录页面')

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded', { timeout: PAGE_LOAD_TIMEOUT })

    // Wait for iframe to be present
    await page.waitForSelector('#forwardFrame', {
      state: 'attached',
      timeout: LOGIN_RESULT_TIMEOUT
    })

    // Extract forwardFrame (Python: main_frame = page.locator("#forwardFrame").content_frame)
    // This is the main working frame for all subsequent operations
    const frameLocator = page.locator('#forwardFrame')
    const contentFrame = await frameLocator.contentFrame()
    log.debug('已获取 forwardFrame')

    if (!contentFrame) {
      log.error('Failed to access forwardFrame content frame', {
        ...(await capturePageContext(page))
      })
      throw new Error('Failed to access forwardFrame content frame')
    }

    // Store reference to main frame for later use (Python returns this as main_frame)
    const mainFrame = contentFrame

    // Fill username using role-based locator (Python: get_by_role("textbox", name="用户名"))
    try {
      await contentFrame.getByRole('textbox', { name: '用户名' }).fill(this.config.username)
    } catch (e) {
      log.error('Failed to find username input', {
        error: e instanceof Error ? e.message : String(e),
        ...(await capturePageContext(page, undefined, 'login.username'))
      })
      throw new Error(`Failed to find username input: ${e}`)
    }

    // Fill password using role-based locator (Python: get_by_role("textbox", name="密码"))
    try {
      await contentFrame.getByRole('textbox', { name: '密码' }).fill(this.config.password)
    } catch (e) {
      log.error('Failed to find password input', {
        error: e instanceof Error ? e.message : String(e),
        ...(await capturePageContext(page, undefined, 'login.password'))
      })
      throw new Error(`Failed to find password input: ${e}`)
    }

    // Click login button using role-based locator (Python: get_by_role("button", name="登录"))
    try {
      await contentFrame.getByRole('button', { name: '登录' }).click()
    } catch (e) {
      log.error('Failed to click login button', {
        error: e instanceof Error ? e.message : String(e),
        ...(await capturePageContext(page, undefined, 'login.button'))
      })
      throw new Error(`Failed to click login button: ${e}`)
    }

    await page.waitForLoadState('domcontentloaded', { timeout: PAGE_LOAD_TIMEOUT }).catch(() => {
      log.warn('Page load state check timed out, continuing')
    })

    await this.waitForLoginResult(mainFrame as unknown as import('playwright').Frame)

    // Create session with mainFrame (Python returns main_frame as part of login result)
    this.session = {
      browser,
      context,
      page,
      mainFrame: mainFrame as any, // Store forwardFrame content frame for subsequent operations
      isLoggedIn: true
    }

    log.info('ERP会话已建立')

    return this.session
  }

  /**
   * Wait for login result: success, failure, or force login confirmation
   */
  private async waitForLoginResult(mainFrame: import('playwright').Frame): Promise<void> {
    const successLocator = mainFrame.locator('.nc-workbench-icon')
    const errorLocator = mainFrame.getByText('名称或密码错误')
    const forceLoginButton = mainFrame.getByRole('button', { name: '确定' })

    try {
      await Promise.race([
        successLocator.waitFor({ state: 'visible', timeout: LOGIN_RESULT_TIMEOUT }),
        errorLocator.waitFor({ state: 'visible', timeout: LOGIN_RESULT_TIMEOUT }),
        forceLoginButton
          .waitFor({ state: 'visible', timeout: FORCE_LOGIN_TIMEOUT })
          .then(async () => {
            log.info('Force login dialog detected, clicking confirm')
            await forceLoginButton.click()
            await this.waitForLoginResult(mainFrame)
          })
      ])

      const hasError = await errorLocator.isVisible()
      if (hasError) {
        log.error('ERP login failed: incorrect username or password')
        throw new Error('ERP 登录失败：名称或密码错误')
      }

      log.info('Login successful')
    } catch (error) {
      if (error instanceof Error && error.message.includes('名称或密码错误')) {
        throw error
      }

      const hasError = await errorLocator.isVisible().catch(() => false)
      if (hasError) {
        log.error('ERP login failed: incorrect username or password (retry check)')
        throw new Error('ERP 登录失败：名称或密码错误')
      }

      log.info('Login successful')
    }
  }

  /**
   * Close browser and cleanup session
   */
  async close(): Promise<void> {
    if (this.session) {
      log.info('正在关闭ERP会话')
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
      log.error('getSession called without active session')
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
