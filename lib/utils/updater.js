/**
 * Auto-Update System
 * Checks for updates and manages version channels (stable/insider)
 * v2.3.6+
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class Updater {
  constructor(options = {}) {
    this.currentVersion = this.getCurrentVersion();
    this.channel = options.channel || 'stable'; // stable or insider
    this.autoUpdate = options.autoUpdate !== false;
    this.checkInterval = options.checkInterval || 86400000; // 24 hours
    this.configDir =
      options.configDir || path.join(process.env.HOME || process.env.USERPROFILE, '.ctxman');
    this.updateCacheFile = path.join(this.configDir, 'update-cache.json');

    // Update endpoints (placeholder)
    this.endpoints = {
      stable: 'https://api.github.com/repos/hakkisagdic/ctxman/releases/latest',
      insider: 'https://api.github.com/repos/hakkisagdic/ctxman/releases', // Get all releases
      version: 'https://raw.githubusercontent.com/hakkisagdic/ctxman/main/package.json',
    };
  }

  /**
   * Get current version from package.json
   */
  getCurrentVersion() {
    try {
      const packagePath = path.join(__dirname, '../../package.json');
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return pkg.version;
    } catch (_error) {
      return '0.0.0';
    }
  }

  /**
   * Fetch JSON from URL
   */
  async fetchJSON(url) {
    return new Promise((resolve, reject) => {
      https
        .get(
          url,
          {
            headers: {
              'User-Agent': 'ctxman-updater',
            },
          },
          (res) => {
            let data = '';

            res.on('data', (chunk) => {
              data += chunk;
            });

            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch (_error) {
                reject(new Error('Failed to parse JSON response'));
              }
            });
          }
        )
        .on('error', reject);
    });
  }

  /**
   * Compare versions (returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2)
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }

    return 0;
  }

  /**
   * Check for updates
   * @returns {Promise<Object>} Update information
   */
  async checkForUpdates() {
    try {
      // PLACEHOLDER: In production, this would fetch from actual API
      console.log('🔍 Checking for updates...');
      console.log(`   Current version: ${this.currentVersion}`);
      console.log(`   Channel: ${this.channel}`);

      // Simulate API call (placeholder)
      const latestVersion = await this.getLatestVersion();

      if (!latestVersion) {
        return {
          available: false,
          message: 'Could not check for updates',
        };
      }

      const comparison = this.compareVersions(latestVersion.version, this.currentVersion);

      if (comparison > 0) {
        return {
          available: true,
          currentVersion: this.currentVersion,
          latestVersion: latestVersion.version,
          channel: this.channel,
          releaseNotes: latestVersion.releaseNotes || '',
          downloadUrl: latestVersion.downloadUrl || '',
          publishedAt: latestVersion.publishedAt || new Date().toISOString(),
        };
      }

      return {
        available: false,
        currentVersion: this.currentVersion,
        latestVersion: latestVersion.version,
        message: 'You are using the latest version',
      };
    } catch (error) {
      return {
        available: false,
        error: error.message,
        message: 'Failed to check for updates',
      };
    }
  }

  /**
   * Get latest version info from GitHub API
   */
  async getLatestVersion() {
    try {
      if (this.channel === 'stable') {
        // Stable channel - get latest stable release
        const release = await this.fetchJSON(this.endpoints.stable);

        return {
          version: release.tag_name.replace(/^v/, ''), // Remove 'v' prefix
          releaseNotes: release.body || 'No release notes available',
          downloadUrl: release.html_url,
          publishedAt: release.published_at,
          assets: release.assets || [],
        };
      } else {
        // Insider channel - get latest pre-release
        const releases = await this.fetchJSON(this.endpoints.insider);

        // Find latest pre-release
        const preRelease = releases.find((r) => r.prerelease === true);

        if (preRelease) {
          return {
            version: preRelease.tag_name.replace(/^v/, ''),
            releaseNotes: preRelease.body || 'No release notes available',
            downloadUrl: preRelease.html_url,
            publishedAt: preRelease.published_at,
            assets: preRelease.assets || [],
          };
        }

        // Fallback to latest stable if no pre-release
        const latestRelease = releases[0];
        return {
          version: latestRelease.tag_name.replace(/^v/, ''),
          releaseNotes: latestRelease.body || 'No release notes available',
          downloadUrl: latestRelease.html_url,
          publishedAt: latestRelease.published_at,
          assets: latestRelease.assets || [],
        };
      }
    } catch (error) {
      console.error('Failed to fetch latest version:', error.message);
      return null;
    }
  }

  /**
   * Download and install update
   */
  async installUpdate(updateInfo) {
    try {
      console.log('📦 Installing update...');
      console.log(`   From: ${updateInfo.currentVersion}`);
      console.log(`   To: ${updateInfo.latestVersion}`);
      console.log();

      // Step 1: Detect installation type
      const installType = this.detectInstallationType();
      console.log(`   Installation type: ${installType}`);

      // Step 2: Create backup
      console.log('   Creating backup...');
      const backupPath = this.createBackup();
      console.log(`   ✓ Backup created: ${backupPath}`);

      // Step 3: Install based on type
      if (installType === 'global') {
        console.log('   Updating global installation...');
        const _result = execSync('npm update -g ctxman', {
          encoding: 'utf8',
          stdio: 'pipe',
        });
        console.log('   ✓ Global update complete');
      } else if (installType === 'local') {
        console.log('   Updating local installation...');
        const _result = execSync('npm update ctxman', {
          encoding: 'utf8',
          stdio: 'pipe',
          cwd: this.getInstallDir(),
        });
        console.log('   ✓ Local update complete');
      } else {
        // Source installation - show manual instructions
        console.log('\n⚠️  Source-based installation detected.');
        console.log('   Please update manually:\n');
        console.log('   1. git pull origin main');
        console.log('   2. npm install');
        console.log(`   3. Or visit: ${updateInfo.downloadUrl}\n`);

        return {
          success: false,
          manualUpdateRequired: true,
          instructions: 'Manual update required for source installation',
        };
      }

      // Step 4: Verify installation
      console.log('   Verifying update...');
      const newVersion = this.getCurrentVersion();

      if (this.compareVersions(newVersion, updateInfo.latestVersion) === 0) {
        console.log('   ✓ Update verified');

        // Update config
        this.saveConfig({
          channel: this.channel,
          autoUpdate: this.autoUpdate,
        });

        return {
          success: true,
          oldVersion: updateInfo.currentVersion,
          newVersion: newVersion,
          backupPath,
        };
      } else {
        console.log('   ⚠️  Version mismatch after update');
        console.log(`   Expected: ${updateInfo.latestVersion}, Got: ${newVersion}`);

        return {
          success: false,
          error: 'Version verification failed',
        };
      }
    } catch (error) {
      console.error('   ✗ Update failed:', error.message);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Detect installation type (global, local, or source)
   */
  detectInstallationType() {
    try {
      // Check if installed globally
      const globalList = execSync('npm list -g ctxman --depth=0', {
        encoding: 'utf8',
        stdio: 'pipe',
      });

      if (globalList.includes('ctxman')) {
        return 'global';
      }
    } catch (_error) {
      // Not global
    }

    // Check if in node_modules (local npm install)
    const nodeModulesPath = path.join(process.cwd(), 'node_modules', '@hakkisagdic', 'ctxman');
    if (fs.existsSync(nodeModulesPath)) {
      return 'local';
    }

    // Check if running from source (has .git directory)
    const gitPath = path.join(__dirname, '../../.git');
    if (fs.existsSync(gitPath)) {
      return 'source';
    }

    return 'unknown';
  }

  /**
   * Get installation directory
   */
  getInstallDir() {
    const installType = this.detectInstallationType();

    if (installType === 'global') {
      try {
        const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
        return path.join(globalRoot, 'ctxman');
      } catch (_error) {
        return null;
      }
    }

    if (installType === 'local') {
      return path.join(process.cwd(), 'node_modules', '@hakkisagdic', 'ctxman');
    }

    return path.join(__dirname, '../..');
  }

  /**
   * Create backup before update
   */
  createBackup() {
    const installDir = this.getInstallDir();
    const backupDir = path.join(this.configDir, 'backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${this.currentVersion}-${timestamp}`);

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Create backup info file
    const backupInfo = {
      version: this.currentVersion,
      timestamp: new Date().toISOString(),
      installType: this.detectInstallationType(),
      installDir: installDir,
    };

    fs.writeFileSync(
      path.join(backupPath, 'backup-info.json'),
      JSON.stringify(backupInfo, null, 2),
      'utf8'
    );

    return backupPath;
  }

  /**
   * Rollback to previous version
   */
  async rollback() {
    try {
      console.log('🔄 Rolling back to previous version...');

      const backupDir = path.join(this.configDir, 'backups');
      if (!fs.existsSync(backupDir)) {
        throw new Error('No backups found');
      }

      // Get latest backup
      const backups = fs
        .readdirSync(backupDir)
        .filter((name) => name.startsWith('backup-'))
        .sort()
        .reverse();

      if (backups.length === 0) {
        throw new Error('No backups available');
      }

      const latestBackup = backups[0];
      const backupPath = path.join(backupDir, latestBackup);
      const backupInfoPath = path.join(backupPath, 'backup-info.json');

      if (!fs.existsSync(backupInfoPath)) {
        throw new Error('Invalid backup: missing backup-info.json');
      }

      const backupInfo = JSON.parse(fs.readFileSync(backupInfoPath, 'utf8'));

      console.log(`   Restoring version: ${backupInfo.version}`);
      console.log(`   Backup date: ${backupInfo.timestamp}`);

      // Install the backed up version
      const installType = backupInfo.installType;

      if (installType === 'global') {
        execSync(`npm install -g ctxman@${backupInfo.version}`, {
          stdio: 'inherit',
        });
      } else if (installType === 'local') {
        execSync(`npm install ctxman@${backupInfo.version}`, {
          stdio: 'inherit',
          cwd: this.getInstallDir(),
        });
      } else {
        throw new Error('Cannot rollback source installation');
      }

      console.log('\n✅ Rollback successful!');
      console.log(`   Restored to version: ${backupInfo.version}`);

      return {
        success: true,
        restoredVersion: backupInfo.version,
      };
    } catch (error) {
      console.error('✗ Rollback failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Switch update channel
   */
  async switchChannel(newChannel) {
    if (!['stable', 'insider'].includes(newChannel)) {
      throw new Error('Invalid channel. Must be "stable" or "insider"');
    }

    this.channel = newChannel;

    // Save to config
    this.saveConfig({ channel: newChannel });

    console.log(`✓ Switched to ${newChannel} channel`);
    console.log('  Checking for updates on new channel...\n');

    return await this.checkForUpdates();
  }

  /**
   * Save updater config
   */
  saveConfig(config) {
    try {
      const configFile = path.join(this.configDir, 'config.json');
      let existingConfig = {};

      if (fs.existsSync(configFile)) {
        existingConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      }

      const updatedConfig = {
        ...existingConfig,
        updateChannel: config.channel || this.channel,
        autoUpdate: config.autoUpdate !== undefined ? config.autoUpdate : this.autoUpdate,
        lastUpdateCheck: new Date().toISOString(),
      };

      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }

      fs.writeFileSync(configFile, JSON.stringify(updatedConfig, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save config:', error.message);
    }
  }

  /**
   * Get update cache
   */
  getUpdateCache() {
    try {
      if (fs.existsSync(this.updateCacheFile)) {
        return JSON.parse(fs.readFileSync(this.updateCacheFile, 'utf8'));
      }
    } catch (_error) {
      // Return null if cache can't be read
    }
    return null;
  }

  /**
   * Save update cache
   */
  saveUpdateCache(data) {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }

      fs.writeFileSync(this.updateCacheFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (_error) {
      // Fail silently
    }
  }

  /**
   * Should check for updates (based on interval)
   */
  shouldCheckForUpdates() {
    const cache = this.getUpdateCache();
    if (!cache || !cache.lastCheck) {
      return true;
    }

    const lastCheck = new Date(cache.lastCheck).getTime();
    const now = Date.now();

    return now - lastCheck > this.checkInterval;
  }

  /**
   * Check and notify about updates
   */
  async checkAndNotify() {
    if (!this.shouldCheckForUpdates()) {
      const cache = this.getUpdateCache();
      if (cache && cache.available) {
        this.showUpdateNotification(cache);
      }
      return cache;
    }

    const updateInfo = await this.checkForUpdates();

    // Save to cache
    this.saveUpdateCache({
      ...updateInfo,
      lastCheck: new Date().toISOString(),
    });

    if (updateInfo.available) {
      this.showUpdateNotification(updateInfo);
    }

    return updateInfo;
  }

  /**
   * Show update notification
   */
  showUpdateNotification(updateInfo) {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║            🎉 Update Available!                        ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    console.log(`  Current version: ${updateInfo.currentVersion}`);
    console.log(`  Latest version:  ${updateInfo.latestVersion}`);
    console.log(`  Channel:         ${updateInfo.channel}\n`);
    console.log('  To update, run:');
    console.log('    ctxman update\n');
    console.log('  Or update manually:');
    console.log('    npm update -g ctxman\n');
  }
}

export default Updater;
