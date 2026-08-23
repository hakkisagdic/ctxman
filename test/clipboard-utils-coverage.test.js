import { describe, test, expect, vi, beforeEach } from 'vitest';
import ClipboardUtils from '../lib/utils/clipboard-utils.js';
import { execSync } from 'child_process';

vi.mock('child_process');

describe('ClipboardUtils Coverage', () => {
  let originalPlatform;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    originalPlatform = process.platform;
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Platform Support', () => {
    test('isAvailable returns true for macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(ClipboardUtils.isAvailable()).toBe(true);
    });

    test('isAvailable returns true for Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(ClipboardUtils.isAvailable()).toBe(true);
    });

    test('isAvailable returns true for Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(ClipboardUtils.isAvailable()).toBe(true);
    });

    test('isAvailable returns false for unsupported platform', () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });
      expect(ClipboardUtils.isAvailable()).toBe(false);
    });
  });

  describe('Get Command', () => {
    test('getCommand returns pbcopy for macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(ClipboardUtils.getCommand()).toBe('pbcopy');
    });

    test('getCommand returns xclip for Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(ClipboardUtils.getCommand()).toBe('xclip');
    });

    test('getCommand returns clip for Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(ClipboardUtils.getCommand()).toBe('clip');
    });

    test('getCommand returns unknown for unsupported platform', () => {
      Object.defineProperty(process, 'platform', { value: 'aix' });
      expect(ClipboardUtils.getCommand()).toBe('unknown');
    });
  });

  describe('Copy to Clipboard', () => {
    test('copy works on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      execSync.mockReturnValue(Buffer.from(''));

      const result = ClipboardUtils.copy('test content');

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith('pbcopy', expect.any(Object));
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Context copied to clipboard!');
    });

    test('copy works on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      execSync.mockReturnValue(Buffer.from(''));

      const result = ClipboardUtils.copy('test content');

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith('clip', expect.any(Object));
    });

    test('copy tries xclip first on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      execSync.mockReturnValue(Buffer.from(''));

      const result = ClipboardUtils.copy('test content');

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith('xclip -selection clipboard', expect.any(Object));
    });

    test('copy falls back to xsel on Linux if xclip fails', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      execSync
        .mockImplementationOnce(() => {
          throw new Error('xclip not found');
        })
        .mockReturnValueOnce(Buffer.from(''));

      const result = ClipboardUtils.copy('test content');

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith('xsel --clipboard --input', expect.any(Object));
    });

    test('copy throws error on unsupported platform', () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });

      const result = ClipboardUtils.copy('test');

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test('copy handles execution errors', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      execSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = ClipboardUtils.copy('test');

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test('copy logs character count', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      execSync.mockReturnValue(Buffer.from(''));

      ClipboardUtils.copy('hello world');

      expect(consoleLogSpy).toHaveBeenCalledWith('📋 11 characters copied');
    });
  });
});
