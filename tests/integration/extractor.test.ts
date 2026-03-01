import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ExtractorService } from '../../src/main/services/erp/extractor';
import { ErpAuthService } from '../../src/main/services/erp/erp-auth';
import type { ErpConfig } from '../../src/main/types/erp.types';
import fs from 'fs/promises';
import path from 'path';

describe('Extractor Service (Integration)', () => {
  const config: ErpConfig = {
    url: process.env.ERP_URL || '',
    username: process.env.ERP_USERNAME || '',
    password: process.env.ERP_PASSWORD || '',
  };

  const testOrderNumber = 'SC70202602120085'; // From references/demo/productionID.txt

  // Check if we have ERP credentials
  const hasCredentials = !!(config.url && config.username && config.password);

  it('should extract data for single order number', async () => {
    if (!hasCredentials) {
      console.warn('Skipping test: ERP credentials not configured');
      return;
    }

    // Create fresh auth service for this test
    const authService = new ErpAuthService(config);
    await authService.login();

    const extractor = new ExtractorService(authService);

    const result = await extractor.extract({
      orderNumbers: [testOrderNumber],
    });

    expect(result.downloadedFiles).toHaveLength(1);
    expect(result.errors).toHaveLength(0);

    // Verify file exists
    const filePath = result.downloadedFiles[0];
    const stats = await fs.stat(filePath);
    expect(stats.size).toBeGreaterThan(0);

    // Clean up
    await authService.close();
  }, 60000);

  it('should extract data for multiple order numbers', async () => {
    if (!hasCredentials) {
      console.warn('Skipping test: ERP credentials not configured');
      return;
    }

    // Create fresh auth service for this test
    const authService = new ErpAuthService(config);
    await authService.login();

    const extractor = new ExtractorService(authService);

    // Read order numbers from productionID.txt file
    const fs = await import('fs/promises');
    const path = await import('path');
    // productionID.txt is at: D:\FileLib\Projects\CodeMigration\references\demo\productionID.txt
    // test runs at: D:\FileLib\Projects\CodeMigration\ERPAuto
    const productionIdFile = path.join(process.cwd(), '../references/demo/productionID.txt');
    const content = await fs.readFile(productionIdFile, 'utf-8');
    const orderNumbers = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(0, 5); // Test first 5 orders

    console.log(`Testing with ${orderNumbers.length} order numbers:`, orderNumbers);

    const result = await extractor.extract({
      orderNumbers,
      batchSize: 100, // Process all in one batch
    });

    console.log(`Downloaded ${result.downloadedFiles.length} files`);
    if (result.errors.length > 0) {
      console.log('Errors:', result.errors);
    }

    expect(result.downloadedFiles.length).toBeGreaterThanOrEqual(1);

    // Clean up
    await authService.close();
  }, 120000); // Increase timeout to 2 minutes

  it('should extract data for 300 orders with batch size 70', async () => {
    if (!hasCredentials) {
      console.warn('Skipping test: ERP credentials not configured');
      return;
    }

    // Create fresh auth service for this test
    const authService = new ErpAuthService(config);
    await authService.login();

    const extractor = new ExtractorService(authService);

    // Read all order numbers from productionID.txt file
    const fs = await import('fs/promises');
    const path = await import('path');
    const productionIdFile = path.join(process.cwd(), '../references/demo/productionID.txt');
    const content = await fs.readFile(productionIdFile, 'utf-8');
    const orderNumbers = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    console.log(`Testing with ${orderNumbers.length} order numbers`);
    console.log(`Batch size: 70, Expected batches: ${Math.ceil(orderNumbers.length / 70)}`);

    const startTime = Date.now();

    const result = await extractor.extract({
      orderNumbers,
      batchSize: 70, // Process 70 orders per batch
    });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n=== Extraction Summary ===`);
    console.log(`Total orders: ${orderNumbers.length}`);
    console.log(`Batch size: 70`);
    console.log(`Expected batches: ${Math.ceil(orderNumbers.length / 70)}`);
    console.log(`Downloaded files: ${result.downloadedFiles.length}`);
    console.log(`Total duration: ${duration}s`);
    console.log(`Average time per batch: ${(duration / result.downloadedFiles.length).toFixed(2)}s`);

    if (result.errors.length > 0) {
      console.log(`\nErrors encountered: ${result.errors.length}`);
      result.errors.forEach((err, idx) => console.log(`  ${idx + 1}. ${err}`));
    }

    // Verify results
    expect(result.downloadedFiles.length).toBeGreaterThanOrEqual(1);

    // Verify each downloaded file exists and has content
    for (const filePath of result.downloadedFiles) {
      const stats = await fs.stat(filePath);
      console.log(`  - ${path.basename(filePath)}: ${(stats.size / 1024).toFixed(2)} KB`);
      expect(stats.size).toBeGreaterThan(0);
    }

    // Clean up
    await authService.close();
  }, 600000); // 10 minutes timeout for large batch test
});
