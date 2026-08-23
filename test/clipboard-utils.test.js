import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import ClipboardUtils from '../lib/utils/clipboard-utils.js';
import { execSync } from 'child_process';

vi.mock('child_process');

describe('ClipboardUtils', () => {
  let originalPlatform;

  beforeEach(() => {
    vi.clearAllMocks();
    originalPlatform = process.platform;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  test('isAvailable returns true for supported platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(ClipboardUtils.isAvailable()).toBe(true);

    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(ClipboardUtils.isAvailable()).toBe(true);

    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(ClipboardUtils.isAvailable()).toBe(true);
  });

  test('isAvailable returns false for unsupported platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'sunos' });
    expect(ClipboardUtils.isAvailable()).toBe(false);
  });

  test('copy works on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const success = ClipboardUtils.copy('test text');
    expect(success).toBe(true);
    expect(execSync).toHaveBeenCalledWith(
      'pbcopy',
      expect.objectContaining({ input: 'test text' })
    );
  });

  test('copy works on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const success = ClipboardUtils.copy('test text');
    expect(success).toBe(true);
    expect(execSync).toHaveBeenCalledWith('clip', expect.objectContaining({ input: 'test text' }));
  });

  test('copy works on Linux (xclip)', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const success = ClipboardUtils.copy('test text');
    expect(success).toBe(true);
    expect(execSync).toHaveBeenCalledWith(
      'xclip -selection clipboard',
      expect.objectContaining({ input: 'test text' })
    );
  });

  test('copy falls back to xsel on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    execSync.mockImplementationOnce(() => {
      throw new Error('xclip not found');
    });

    const success = ClipboardUtils.copy('test text');
    expect(success).toBe(true);
    expect(execSync).toHaveBeenCalledWith(
      'xsel --clipboard --input',
      expect.objectContaining({ input: 'test text' })
    );
  });

  test('copy handles errors gracefully', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    execSync.mockImplementation(() => {
      throw new Error('Clipboard error');
    });

    const success = ClipboardUtils.copy('test text');
    expect(success).toBe(false);
  });
});
