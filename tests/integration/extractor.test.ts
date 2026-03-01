import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ExtractorService } from '../../src/main/services/erp/extractor';
import { ErpAuthService } from '../../src/main/services/erp/erp-auth';
import type { ErpConfig } from '../../src/main/types/erp.types';
import fs from 'fs/promises';
import path from 'path';

describe('Extractor Service (Integration)', () => {
  let authService: ErpAuthService;
  let extractor: ExtractorService;
  const config: ErpConfig = {
    url: process.env.ERP_URL || '',
    username: process.env.ERP_USERNAME || '',
    password: process.env.ERP_PASSWORD || '',
  };

  const testOrderNumber = 'SC70202602120085'; // From references/demo/productionID.txt

  // Check if we have ERP credentials
  const hasCredentials = !!(config.url && config.username && config.password);

  beforeAll(async () => {
    if (!hasCredentials) {
      return;
    }

    authService = new ErpAuthService(config);
    await authService.login();

    extractor = new ExtractorService(authService);
  });

  it('should extract data for single order number', async () => {
    if (!hasCredentials) {
      console.warn('Skipping test: ERP credentials not configured');
      return;
    }

    const result = await extractor.extract({
      orderNumbers: [testOrderNumber],
    });

    expect(result.downloadedFiles).toHaveLength(1);
    expect(result.errors).toHaveLength(0);

    // Verify file exists
    const filePath = result.downloadedFiles[0];
    const stats = await fs.stat(filePath);
    expect(stats.size).toBeGreaterThan(0);
  }, 60000);

  it('should extract data for multiple order numbers', async () => {
    if (!hasCredentials) {
      console.warn('Skipping test: ERP credentials not configured');
      return;
    }

    const result = await extractor.extract({
      orderNumbers: ['SC70202602120085', 'SC70202602120120'],
    });

    expect(result.downloadedFiles.length).toBeGreaterThanOrEqual(1);
  }, 90000);

  afterAll(async () => {
    if (hasCredentials && authService) {
      await authService.close();
    }
  });
});
