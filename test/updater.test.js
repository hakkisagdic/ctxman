import { describe, test, expect, vi, beforeEach, _afterEach } from 'vitest';
import Updater from '../lib/utils/updater.js';
import fs from 'fs';
import https from 'https';
import { execSync } from 'child_process';
import _path from 'path';

vi.mock('fs');
vi.mock('https');
vi.mock('child_process');

describe('Updater', () => {
  let updater;
  const mockConfigDir = '/mock/config';

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fs.readFileSync for package.json version check
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.endsWith('package.json')) {
        return JSON.stringify({ version: '1.0.0' });
      }
      return '{}';
    });

    updater = new Updater({ configDir: mockConfigDir });
  });

  describe('Constructor', () => {
    test('initializes with default values', () => {
      expect(updater.channel).toBe('stable');
      expect(updater.currentVersion).toBe('1.0.0');
    });

    test('initializes with custom options', () => {
      const customUpdater = new Updater({ channel: 'insider', autoUpdate: false });
      expect(customUpdater.channel).toBe('insider');
      expect(customUpdater.autoUpdate).toBe(false);
    });
  });

  describe('checkForUpdates()', () => {
    test('handles API errors gracefully', async () => {
      // Mock https.get to error
      https.get.mockImplementation((_url, _options, _callback) => {
        const req = { on: vi.fn() };
        return req; // In real life this returns req, but we need to trigger error
      });
      // Since mocking the event emitter is complex, let's mock fetchJSON directly
      updater.fetchJSON = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await updater.checkForUpdates();
      expect(result.available).toBe(false);
      // The actual implementation catches the error and returns a generic message
      expect(result.message).toBe('Could not check for updates');
    });

    test('detects new version available', async () => {
      updater.fetchJSON = vi.fn().mockResolvedValue({
        tag_name: 'v2.0.0',
        html_url: 'http://example.com',
        published_at: '2023-01-01',
      });

      const result = await updater.checkForUpdates();
      expect(result.available).toBe(true);
      expect(result.latestVersion).toBe('2.0.0');
    });

    test('detects no update needed', async () => {
      updater.fetchJSON = vi.fn().mockResolvedValue({
        tag_name: 'v1.0.0',
      });

      const result = await updater.checkForUpdates();
      expect(result.available).toBe(false);
    });
  });

  describe('installUpdate()', () => {
    test('handles global installation', async () => {
      updater.detectInstallationType = vi.fn().mockReturnValue('global');
      updater.createBackup = vi.fn().mockReturnValue('/backup/path');
      execSync.mockReturnValue('updated');

      // Mock verification - should return the NEW version
      updater.getCurrentVersion = vi.fn().mockReturnValue('2.0.0');

      const result = await updater.installUpdate({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
      });

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm update -g'),
        expect.any(Object)
      );
    });

    test('handles source installation (manual update)', async () => {
      updater.detectInstallationType = vi.fn().mockReturnValue('source');
      updater.createBackup = vi.fn().mockReturnValue('/backup/path');

      const result = await updater.installUpdate({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        downloadUrl: 'http://example.com',
      });

      expect(result.success).toBe(false);
      expect(result.manualUpdateRequired).toBe(true);
    });
  });

  describe('rollback()', () => {
    test('fails if no backups', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await updater.rollback();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No backups found');
    });

    test('restores from backup', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['backup-1.0.0-date']);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          version: '0.9.0',
          installType: 'global',
        })
      );

      const result = await updater.rollback();

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm install -g'),
        expect.any(Object)
      );
    });
  });
});
