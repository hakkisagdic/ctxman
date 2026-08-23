import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Updater from '../lib/utils/updater.js';
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';

vi.mock('fs');
vi.mock('child_process');

describe('Updater Final Coverage', () => {
  let updater;
  const mockConfigDir = '/mock/config';
  const mockBackupDir = '/mock/backups';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Default mock implementations
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync.mockReturnValue([]);
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});

    child_process.execSync.mockReturnValue('');

    updater = new Updater();
    updater.configDir = mockConfigDir;
    updater.backupDir = mockBackupDir;
  });

  describe('Installation Type Detection', () => {
    test('detectInstallationType identifies global install', () => {
      child_process.execSync.mockReturnValue('ctxman@1.0.0');
      const type = updater.detectInstallationType();
      expect(type).toBe('global');
    });

    test('detectInstallationType returns unknown when no match', () => {
      child_process.execSync.mockImplementation(() => {
        throw new Error('Command failed');
      });
      fs.existsSync.mockReturnValue(false);
      const type = updater.detectInstallationType();
      expect(type).toBe('unknown');
    });

    test('getInstallDir handles global install', () => {
      // Mock detectInstallationType to return global
      vi.spyOn(updater, 'detectInstallationType').mockReturnValue('global');
      child_process.execSync.mockReturnValue('/usr/local/lib/node_modules\n');

      const dir = updater.getInstallDir();
      expect(dir).toBe('/usr/local/lib/node_modules/ctxman');
    });

    test('getInstallDir handles global install error', () => {
      vi.spyOn(updater, 'detectInstallationType').mockReturnValue('global');
      child_process.execSync.mockImplementation(() => {
        throw new Error('Failed');
      });

      const dir = updater.getInstallDir();
      expect(dir).toBeNull();
    });
  });

  describe('Rollback Scenarios', () => {
    test('rollback throws if no backups available', async () => {
      // Mock backup dir exists, but empty
      fs.existsSync.mockImplementation((p) => p === path.join(mockConfigDir, 'backups'));
      fs.readdirSync.mockReturnValue([]);

      const result = await updater.rollback();
      expect(result.success).toBe(false);
      expect(result.error).toBe('No backups available');
    });

    test('rollback throws if backup info missing', async () => {
      const backupPath = path.join(mockConfigDir, 'backups', 'backup-1');
      fs.existsSync.mockImplementation((p) => {
        if (p === path.join(mockConfigDir, 'backups')) return true;
        if (p === backupPath) return true;
        return false;
      });

      fs.readdirSync.mockReturnValue(['backup-1']);

      const result = await updater.rollback();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid backup: missing backup-info.json');
    });
  });

  describe('Config and Cache', () => {
    test('saveConfig merges with existing config', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ existing: true }));

      updater.saveConfig({ channel: 'beta' });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        expect.stringContaining('"existing": true'),
        'utf8'
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        expect.stringContaining('"updateChannel": "beta"'),
        'utf8'
      );
    });

    test('saveConfig handles write errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      updater.saveConfig({ channel: 'beta' });
      expect(spy).toHaveBeenCalledWith('Failed to save config:', 'Write failed');
    });

    test('shouldCheckForUpdates returns true if no cache', () => {
      vi.spyOn(updater, 'getUpdateCache').mockReturnValue(null);
      expect(updater.shouldCheckForUpdates()).toBe(true);
    });

    test('checkAndNotify shows notification if available', async () => {
      vi.spyOn(updater, 'shouldCheckForUpdates').mockReturnValue(false);
      vi.spyOn(updater, 'getUpdateCache').mockReturnValue({ available: true, version: '2.0.0' });
      const spy = vi.spyOn(updater, 'showUpdateNotification').mockImplementation(() => {});

      await updater.checkAndNotify();

      expect(spy).toHaveBeenCalled();
    });

    test('getUpdateCache returns null on read error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Read failed');
      });

      const cache = updater.getUpdateCache();
      expect(cache).toBeNull();
    });
  });

  describe('Install Update Error Handling', () => {
    test('installUpdate handles verification failure', async () => {
      // Mock flow to reach verification
      vi.spyOn(updater, 'detectInstallationType').mockReturnValue('local');
      vi.spyOn(updater, 'createBackup').mockReturnValue('/backup/path');
      vi.spyOn(updater, 'getInstallDir').mockReturnValue('/install/dir');

      // Mock getCurrentVersion to return old version (mismatch)
      updater.getCurrentVersion = vi.fn().mockReturnValue('1.0.0');
      updater.compareVersions = vi.fn().mockReturnValue(-1); // New version < Latest

      const result = await updater.installUpdate({
        latestVersion: '2.0.0',
        currentVersion: '1.0.0',
        downloadUrl: 'http://example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Version verification failed');
    });

    test('installUpdate handles unexpected errors', async () => {
      // Mock createBackup to throw
      vi.spyOn(updater, 'createBackup').mockImplementation(() => {
        throw new Error('Backup failed');
      });

      const result = await updater.installUpdate({
        latestVersion: '2.0.0',
        currentVersion: '1.0.0',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Backup failed');
    });
  });
});
