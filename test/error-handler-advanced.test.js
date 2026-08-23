import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorHandler from '../lib/utils/error-handler.js';
import fs from 'fs';

vi.mock('fs');

describe('ErrorHandler Advanced Coverage', () => {
  let errorHandler;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('File Error Handling', () => {
    test('handleFileError suggests checking permissions for EACCES', () => {
      errorHandler = new ErrorHandler();
      const error = new Error('Permission denied');
      error.code = 'EACCES';

      errorHandler.handleFileError(error, '/test/file');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Check file permissions')
      );
    });
  });

  describe('Async Wrapping', () => {
    test('wrapAsync logs stack trace in verbose mode', async () => {
      errorHandler = new ErrorHandler({ verbose: true });
      const error = new Error('Async error');
      error.stack = 'Error stack trace';

      const asyncFn = errorHandler.wrapAsync(async () => {
        throw error;
      }, 'testContext');

      await expect(asyncFn()).rejects.toThrow('Async error');

      expect(consoleErrorSpy).toHaveBeenCalledWith('   Stack:', 'Error stack trace');
    });
  });

  describe('Logging Robustness', () => {
    test('logError handles file write errors silently', () => {
      errorHandler = new ErrorHandler({ logFile: '/path/to/log.txt' });

      fs.appendFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Should not throw
      errorHandler.logError('Test message', new Error('Original error'));

      expect(fs.appendFileSync).toHaveBeenCalled();
    });
  });
});
