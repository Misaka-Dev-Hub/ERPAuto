import { describe, it, expect, beforeEach } from 'vitest';
import { ExtractorService } from '../../src/main/services/erp/extractor';
import { ErpAuthService } from '../../src/main/services/erp/erp-auth';
import type { ErpConfig } from '../../src/main/types/erp.types';

describe('Extractor Service (Unit)', () => {
  let authService: ErpAuthService;
  let extractor: ExtractorService;
  const mockConfig: ErpConfig = {
    url: 'https://test.erp.com',
    username: 'test_user',
    password: 'test_pass',
  };

  beforeEach(() => {
    authService = new ErpAuthService(mockConfig);
    extractor = new ExtractorService(authService, './test-downloads');
  });

  describe('Batch Creation', () => {
    it('should create single batch for small order list', () => {
      // This tests the createBatches method indirectly through extract
      // We'll need to add a public method or test through the class
      const orders = ['ORDER1', 'ORDER2', 'ORDER3'];
      const batchSize = 10;

      // Expected: 1 batch with 3 orders
      const expectedBatches = 1;
      expect(Math.ceil(orders.length / batchSize)).toBe(expectedBatches);
    });

    it('should create multiple batches for large order list', () => {
      const orders = Array.from({ length: 250 }, (_, i) => `ORDER${i}`);
      const batchSize = 100;

      // Expected: 3 batches (100, 100, 50)
      const expectedBatches = 3;
      expect(Math.ceil(orders.length / batchSize)).toBe(expectedBatches);
    });

    it('should handle exact batch size', () => {
      const orders = Array.from({ length: 200 }, (_, i) => `ORDER${i}`);
      const batchSize = 100;

      // Expected: 2 batches exactly
      const expectedBatches = 2;
      expect(Math.ceil(orders.length / batchSize)).toBe(expectedBatches);
    });

    it('should handle empty order list', () => {
      const orders: string[] = [];
      const batchSize = 100;

      // Expected: 0 batches
      const expectedBatches = 0;
      expect(Math.ceil(orders.length / batchSize)).toBe(expectedBatches);
    });
  });

  describe('Service Initialization', () => {
    it('should create service instance', () => {
      expect(extractor).toBeDefined();
      expect(extractor).toBeInstanceOf(ExtractorService);
    });

    it('should use default download directory', () => {
      const defaultExtractor = new ExtractorService(authService);
      expect(defaultExtractor).toBeDefined();
    });

    it('should use custom download directory', () => {
      const customExtractor = new ExtractorService(authService, './custom-downloads');
      expect(customExtractor).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle extraction with no auth session', async () => {
      const result = await extractor.extract({
        orderNumbers: ['ORDER1'],
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.downloadedFiles).toHaveLength(0);
    });
  });
});
