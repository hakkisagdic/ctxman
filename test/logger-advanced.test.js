import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../lib/utils/logger.js';
import fs from 'fs';
import path from 'path';

vi.mock('fs');

describe('Logger Advanced Coverage', () => {
  let logger;
  let consoleLogSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Mock console.error as well since Logger uses it for errors
    vi.spyOn(console, 'error').mockImplementation(() => {});

    logger = new Logger({ verbose: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Logging Methods', () => {
    test('trace logs with trace level', () => {
      const spy = vi.spyOn(logger, 'log');
      logger.trace('trace message');
      expect(spy).toHaveBeenCalledWith('trace', 'trace message', expect.any(Object));
    });

    test('custom logs with temporary icon', () => {
      const originalIcon = logger.icons.info;
      const customIcon = '🦄';

      logger.custom(customIcon, 'info', 'custom message');

      // Check if it logged
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(customIcon));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('custom message'));

      // Verify icon was restored
      expect(logger.icons.info).toBe(originalIcon);
    });
  });

  describe('Log Retrieval', () => {
    test('getRecentLogs handles read errors gracefully', () => {
      logger = new Logger({ logFile: '/mock/log.txt' });
      const errorSpy = vi.spyOn(logger, 'error');

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Read failed');
      });

      const logs = logger.getRecentLogs(10);

      expect(logs).toEqual([]);
      // Should log the error internally
      expect(errorSpy).toHaveBeenCalledWith('Failed to read logs', expect.any(Object));
    });
  });
});
