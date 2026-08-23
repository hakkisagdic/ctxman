import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Updater from '../lib/utils/updater.js';
import https from 'https';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';

vi.mock('https');
vi.mock('fs');
vi.mock('child_process');

describe('Updater Advanced Coverage', () => {
  let updater;
  const mockConfigDir = '/mock/config';

  beforeEach(() => {
    vi.clearAllMocks();
    updater = new Updater({ configDir: mockConfigDir });

    // Default fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
  });

  describe('Network Handling', () => {
    test('fetchJSON handles network errors', async () => {
      const mockReq = new EventEmitter();
      https.get.mockImplementation((url, options, callback) => {
        return mockReq;
      });

      const promise = updater.fetchJSON('https://example.com');
      mockReq.emit('error', new Error('Network error'));

      await expect(promise).rejects.toThrow('Network error');
    });

    test('fetchJSON handles JSON parse errors', async () => {
      const mockReq = new EventEmitter();
      const mockRes = new EventEmitter();

      https.get.mockImplementation((url, options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const promise = updater.fetchJSON('https://example.com');
      mockRes.emit('data', 'invalid json');
      mockRes.emit('end');

      await expect(promise).rejects.toThrow('Failed to parse JSON response');
    });
  });

  describe('Installation Logic', () => {
    test('installUpdate handles source installation', async () => {
      // Mock detectInstallationType to return 'source'
      // We can't spy on private/internal methods easily if they call each other
      // But we can mock the conditions that detectInstallationType checks

      // Mock .git directory existence
      fs.existsSync.mockImplementation((p) => {
        if (p.includes('.git')) return true;
        return false;
      });

      // Mock execSync to fail global check
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('npm list -g')) throw new Error('Not global');
        return '';
      });

      const updateInfo = {
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        downloadUrl: 'http://example.com',
      };

      const result = await updater.installUpdate(updateInfo);

      expect(result.success).toBe(false);
      expect(result.manualUpdateRequired).toBe(true);
      expect(result.instructions).toContain('Manual update required');
    });

    test('installUpdate fails verification', async () => {
      // Mock local installation
      fs.existsSync.mockImplementation((p) => {
        if (p.includes('node_modules')) return true;
        return false;
      });

      // Mock successful update command
      execSync.mockReturnValue('updated');

      // Mock getCurrentVersion to return OLD version (verification failure)
      const originalGetCurrentVersion = updater.getCurrentVersion;
      updater.getCurrentVersion = vi.fn().mockReturnValue('1.0.0'); // Still old version

      const updateInfo = {
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
      };

      const result = await updater.installUpdate(updateInfo);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Version verification failed');
    });
  });

  describe('Update Checking Edge Cases', () => {
    test('checkForUpdates handles getLatestVersion failure', async () => {
      // Mock getLatestVersion to return null
      updater.getLatestVersion = vi.fn().mockResolvedValue(null);

      const result = await updater.checkForUpdates();

      expect(result.available).toBe(false);
      expect(result.message).toBe('Could not check for updates');
    });

    test('checkForUpdates handles exception', async () => {
      updater.getLatestVersion = vi.fn().mockRejectedValue(new Error('Check failed'));

      const result = await updater.checkForUpdates();

      expect(result.available).toBe(false);
      expect(result.error).toBe('Check failed');
    });
  });
});
