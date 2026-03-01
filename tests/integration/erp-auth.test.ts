import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ErpAuthService } from '../../src/main/services/erp/erp-auth';
import type { ErpConfig } from '../../src/main/types/erp.types';

describe('ERP Authentication Service (Integration)', () => {
  let authService: ErpAuthService;
  const config: ErpConfig = {
    url: process.env.ERP_URL || '',
    username: process.env.ERP_USERNAME || '',
    password: process.env.ERP_PASSWORD || '',
  };

  beforeAll(() => {
    if (!config.url || !config.username || !config.password) {
      throw new Error('Missing ERP credentials in environment variables');
    }
    authService = new ErpAuthService(config);
  });

  it('should login successfully', async () => {
    const session = await authService.login();

    expect(session).toBeDefined();
    expect(session.browser).toBeDefined();
    expect(session.context).toBeDefined();
    expect(session.page).toBeDefined();
    expect(session.isLoggedIn).toBe(true);
  }, 30000);

  it('should navigate to main page after login', async () => {
    const session = await authService.login();

    const url = session.page.url();
    expect(url).toContain(config.url);
  }, 30000);

  afterAll(async () => {
    await authService?.close();
  });
});
