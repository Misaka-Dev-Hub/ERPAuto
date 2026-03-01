import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { ERP_LOCATORS } from './locators';
import type { ErpConfig, ErpSession } from '../../types/erp.types';

/**
 * ERP Authentication Service
 * Manages login session and browser lifecycle
 */
export class ErpAuthService {
  private config: ErpConfig;
  private session: ErpSession | null = null;

  constructor(config: ErpConfig) {
    this.config = config;
  }

  /**
   * Login to ERP system and establish session
   */
  async login(): Promise<ErpSession> {
    if (this.session?.isLoggedIn) {
      return this.session;
    }

    // Launch browser
    const browser = await chromium.launch({
      headless: false, // Set to true for production
      slowMo: 100, // Slow down for debugging
    });

    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    // Navigate to login page
    await page.goto(this.config.url);

    // Wait for login form
    await page.waitForSelector(ERP_LOCATORS.login.usernameInput);

    // Fill credentials
    await page.fill(ERP_LOCATORS.login.usernameInput, this.config.username);
    await page.fill(ERP_LOCATORS.login.passwordInput, this.config.password);

    // Submit login
    await page.click(ERP_LOCATORS.login.submitButton);

    // Wait for main page to load
    await page.waitForURL(`${this.config.url}/**`);
    await page.waitForSelector(ERP_LOCATORS.main.mainIframe, { timeout: 10000 });

    // Create session
    this.session = {
      browser,
      context,
      page,
      isLoggedIn: true,
    };

    return this.session;
  }

  /**
   * Close browser and cleanup session
   */
  async close(): Promise<void> {
    if (this.session) {
      await this.session.context.close();
      await this.session.browser.close();
      this.session = null;
    }
  }

  /**
   * Get current session (must be logged in first)
   */
  getSession(): ErpSession {
    if (!this.session?.isLoggedIn) {
      throw new Error('Not logged in. Call login() first.');
    }
    return this.session;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.session?.isLoggedIn ?? false;
  }
}
