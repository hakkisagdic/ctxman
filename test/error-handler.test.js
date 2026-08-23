import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorHandler from '../lib/utils/error-handler.js';
import fs from 'fs';

vi.mock('fs');

describe('ErrorHandler', () => {
  let errorHandler;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler = new ErrorHandler({ verbose: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleFormatError', () => {
    test('logs error message', () => {
      const error = new Error('Test error');
      errorHandler.handleFormatError(error, 'json');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Format error (json)'));
    });

    test('logs stack trace in verbose mode', () => {
      errorHandler = new ErrorHandler({ verbose: true });
      const error = new Error('Test error');
      errorHandler.handleFormatError(error, 'json');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stack:'),
        expect.anything()
      );
    });
  });

  describe('handleFileError', () => {
    test('logs file error', () => {
      const error = new Error('Read failed');
      errorHandler.handleFileError(error, 'test.txt');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('File error (test.txt)')
      );
    });

    test('provides suggestions for ENOENT', () => {
      const error = new Error('Not found');
      error.code = 'ENOENT';
      errorHandler.handleFileError(error, 'test.txt');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Suggestion: Check if the file path is correct')
      );
    });
  });

  describe('handleParseError', () => {
    test('logs parse error', () => {
      const error = new Error('Invalid JSON');
      errorHandler.handleParseError(error, 'json');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Parse error (json)'));
    });

    test('logs content preview in verbose mode', () => {
      errorHandler = new ErrorHandler({ verbose: true });
      const error = new Error('Invalid JSON');
      errorHandler.handleParseError(error, 'json', '{"invalid":');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Content preview:'),
        expect.anything()
      );
    });
  });

  describe('handleValidationError', () => {
    test('logs validation errors', () => {
      errorHandler.handleValidationError(['Field required', 'Invalid type'], 'config');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Validation failed (config):')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Field required'));
    });
  });

  describe('logError', () => {
    test('writes to log file if configured', () => {
      errorHandler = new ErrorHandler({ logFile: 'error.log' });
      const error = new Error('Test error');
      errorHandler.logError('Test message', error);
      expect(fs.appendFileSync).toHaveBeenCalledWith('error.log', expect.any(String), 'utf8');
    });

    test('does nothing if log file not configured', () => {
      const error = new Error('Test error');
      errorHandler.logError('Test message', error);
      expect(fs.appendFileSync).not.toHaveBeenCalled();
    });

    test('handles logging errors silently', () => {
      errorHandler = new ErrorHandler({ logFile: 'error.log' });
      fs.appendFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });
      const error = new Error('Test error');
      expect(() => errorHandler.logError('Test message', error)).not.toThrow();
    });
  });

  describe('wrapAsync', () => {
    test('executes async function successfully', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const wrapped = errorHandler.wrapAsync(fn, 'test');
      const result = await wrapped('arg');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledWith('arg');
    });

    test('catches and rethrows errors', async () => {
      const error = new Error('Async error');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = errorHandler.wrapAsync(fn, 'test');

      await expect(wrapped()).rejects.toThrow('Async error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in test'),
        expect.anything()
      );
    });
  });

  describe('validateFormat', () => {
    test('passes for supported format', () => {
      expect(() => errorHandler.validateFormat('json', ['json', 'text'])).not.toThrow();
    });

    test('throws for unsupported format', () => {
      expect(() => errorHandler.validateFormat('xml', ['json', 'text'])).toThrow(
        'Unsupported format: xml'
      );
    });
  });

  describe('createUserMessage', () => {
    test('maps ENOENT code', () => {
      const error = { code: 'ENOENT', message: 'Original message' };
      const msg = errorHandler.createUserMessage(error);
      expect(msg).toBe('File not found');
    });

    test('uses original message for unknown codes', () => {
      const error = { code: 'UNKNOWN', message: 'Original message' };
      const msg = errorHandler.createUserMessage(error);
      expect(msg).toBe('Original message');
    });

    test('adds context prefix', () => {
      const error = { code: 'ENOENT' };
      const msg = errorHandler.createUserMessage(error, 'Config');
      expect(msg).toBe('Config: File not found');
    });
  });
});
