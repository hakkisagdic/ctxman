import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Updater from '../lib/utils/updater.js';
import fs from 'fs';
import _path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { EventEmitter } from 'events';

vi.mock('fs');
vi.mock('https');
vi.mock('child_process');

describe('Updater Coverage', () => {
  let updater;
  let _consoleLogSpy;
  let _consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    _consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    _consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock package.json read
    fs.readFileSync.mockImplementation((p) => {
      if (p.includes('package.json')) {
        return JSON.stringify({ version: '1.0.0' });
      }
      return '{}';
    });

    updater = new Updater();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchJSON', () => {
    test('fetches and parses JSON successfully', async () => {
      const mockReq = new EventEmitter();
      const mockRes = new EventEmitter();

      https.get.mockImplementation((_url, _options, cb) => {
        cb(mockRes);
        return mockReq;
      });

      const promise = updater.fetchJSON('http://test.com');

      mockRes.emit('data', '{"key": "value"}');
      mockRes.emit('end');

      const result = await promise;
      expect(result).toEqual({ key: 'value' });
    });

    test('handles parse errors', async () => {
      const mockReq = new EventEmitter();
      const mockRes = new EventEmitter();

      https.get.mockImplementation((_url, _options, cb) => {
        cb(mockRes);
        return mockReq;
      });

      const promise = updater.fetchJSON('http://test.com');

      mockRes.emit('data', 'invalid json');
      mockRes.emit('end');

      await expect(promise).rejects.toThrow('Failed to parse JSON');
    });

    test('handles network errors', async () => {
      const mockReq = new EventEmitter();

      https.get.mockImplementation((_url, _options, _cb) => {
        return mockReq;
      });

      const promise = updater.fetchJSON('http://test.com');
      mockReq.emit('error', new Error('Network error'));

      await expect(promise).rejects.toThrow('Network error');
    });
  });

  describe('getLatestVersion', () => {
    test('gets latest stable version', async () => {
      updater.channel = 'stable';
      vi.spyOn(updater, 'fetchJSON').mockResolvedValue({
        tag_name: 'v2.0.0',
        html_url: 'http://url',
        published_at: 'date',
      });

      const result = await updater.getLatestVersion();
      expect(result.version).toBe('2.0.0');
    });

    test('gets latest insider version (pre-release)', async () => {
      updater.channel = 'insider';
      vi.spyOn(updater, 'fetchJSON').mockResolvedValue([
        { tag_name: 'v2.0.0-beta', prerelease: true },
        { tag_name: 'v1.0.0', prerelease: false },
      ]);

      const result = await updater.getLatestVersion();
      expect(result.version).toBe('2.0.0-beta');
    });

    test('falls back to stable if no pre-release in insider', async () => {
      updater.channel = 'insider';
      vi.spyOn(updater, 'fetchJSON').mockResolvedValue([{ tag_name: 'v1.0.0', prerelease: false }]);

      const result = await updater.getLatestVersion();
      expect(result.version).toBe('1.0.0');
    });
  });

  describe('checkForUpdates', () => {
    test('returns update available when newer version exists', async () => {
      vi.spyOn(updater, 'getLatestVersion').mockResolvedValue({
        version: '2.0.0',
        releaseNotes: 'notes',
      });

      const result = await updater.checkForUpdates();
      expect(result.available).toBe(true);
      expect(result.latestVersion).toBe('2.0.0');
    });

    test('returns no update when on latest', async () => {
      vi.spyOn(updater, 'getLatestVersion').mockResolvedValue({
        version: '1.0.0',
      });

      const result = await updater.checkForUpdates();
      expect(result.available).toBe(false);
    });
  });

  describe('installUpdate', () => {
    beforeEach(() => {
      // Mock backup creation
      vi.spyOn(updater, 'createBackup').mockReturnValue('/backup/path');
      // Mock installation type detection
      vi.spyOn(updater, 'detectInstallationType').mockReturnValue('global');
      // Mock install dir
      vi.spyOn(updater, 'getInstallDir').mockReturnValue('/install/dir');
    });

    test('installs global update successfully', async () => {
      execSync.mockReturnValue('success');

      // Mock verification: getCurrentVersion returns new version
      vi.spyOn(updater, 'getCurrentVersion').mockReturnValue('2.0.0');

      const result = await updater.installUpdate({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm update -g'),
        expect.anything()
      );
      expect(result.success).toBe(true);
    });

    test('installs local update successfully', async () => {
      vi.spyOn(updater, 'detectInstallationType').mockReturnValue('local');
      vi.spyOn(updater, 'getCurrentVersion').mockReturnValue('2.0.0');

      const result = await updater.installUpdate({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm update'),
        expect.objectContaining({ cwd: '/install/dir' })
      );
      expect(result.success).toBe(true);
    });

    test('fails if verification fails', async () => {
      vi.spyOn(updater, 'getCurrentVersion').mockReturnValue('1.0.0'); // Still old version

      const result = await updater.installUpdate({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Version verification failed');
    });

    test('handles source installation', async () => {
      vi.spyOn(updater, 'detectInstallationType').mockReturnValue('source');

      const result = await updater.installUpdate({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        downloadUrl: 'http://url',
      });

      expect(result.success).toBe(false);
      expect(result.manualUpdateRequired).toBe(true);
    });
  });

  describe('rollback', () => {
    test('rolls back successfully', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['backup-1.0.0-timestamp']);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          version: '0.9.0',
          timestamp: 'date',
          installType: 'global',
        })
      );

      const result = await updater.rollback();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm install -g'),
        expect.anything()
      );
      expect(result.success).toBe(true);
      expect(result.restoredVersion).toBe('0.9.0');
    });

    test('fails if no backups', () => {
      fs.existsSync.mockReturnValue(false); // No backup dir

      return expect(updater.rollback()).resolves.toEqual(
        expect.objectContaining({
          success: false,
          error: 'No backups found',
        })
      );
    });

    test('rolls back local installation', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['backup-1.0.0-timestamp']);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          version: '0.9.0',
          timestamp: 'date',
          installType: 'local',
        })
      );
      vi.spyOn(updater, 'getInstallDir').mockReturnValue('/install/dir');

      const result = await updater.rollback();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm install ctxman@0.9.0'),
        expect.objectContaining({ cwd: '/install/dir' })
      );
      expect(result.success).toBe(true);
    });

    test('rolls back source installation throws error', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['backup-1.0.0-timestamp']);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          version: '0.9.0',
          timestamp: 'date',
          installType: 'source',
        })
      );

      const result = await updater.rollback();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot rollback source installation');
    });
  });

  describe('switchChannel', () => {
    test('switches to insider channel', async () => {
      vi.spyOn(updater, 'saveConfig').mockImplementation(() => {});
      vi.spyOn(updater, 'checkForUpdates').mockResolvedValue({ available: false });

      const result = await updater.switchChannel('insider');

      expect(updater.channel).toBe('insider');
      expect(updater.saveConfig).toHaveBeenCalledWith({ channel: 'insider' });
      expect(result).toBeDefined();
    });

    test('switches to stable channel', async () => {
      updater.channel = 'insider';
      vi.spyOn(updater, 'saveConfig').mockImplementation(() => {});
      vi.spyOn(updater, 'checkForUpdates').mockResolvedValue({ available: false });

      await updater.switchChannel('stable');

      expect(updater.channel).toBe('stable');
      expect(updater.saveConfig).toHaveBeenCalledWith({ channel: 'stable' });
    });

    test('throws error for invalid channel', async () => {
      await expect(updater.switchChannel('invalid')).rejects.toThrow('Invalid channel');
    });
  });

  describe('saveConfig and loadConfig', () => {
    test('saveConfig creates config directory', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      updater.saveConfig({ channel: 'insider' });

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('checkAndNotify', () => {
    test('checks if interval passed', async () => {
      vi.spyOn(updater, 'getUpdateCache').mockReturnValue({
        lastCheck: new Date(Date.now() - 100000000).toISOString(), // Old
      });
      vi.spyOn(updater, 'checkForUpdates').mockResolvedValue({ available: true });
      vi.spyOn(updater, 'saveUpdateCache');

      await updater.checkAndNotify();

      expect(updater.checkForUpdates).toHaveBeenCalled();
      expect(updater.saveUpdateCache).toHaveBeenCalled();
    });

    test('skips check if recent', async () => {
      vi.spyOn(updater, 'getUpdateCache').mockReturnValue({
        lastCheck: new Date().toISOString(), // Now
        available: false,
      });
      vi.spyOn(updater, 'checkForUpdates');

      await updater.checkAndNotify();

      expect(updater.checkForUpdates).not.toHaveBeenCalled();
    });
  });
});
