/**
 * Snapshot Manager - Context Snapshot & Diff (FEAT-003)
 * Track token growth over time with snapshots
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SNAPSHOT_DIR = '.ctxman/snapshots';

/**
 * SnapshotStore - Handles snapshot storage operations
 */
export class SnapshotStore {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.snapshotDir = path.join(projectRoot, SNAPSHOT_DIR);
  }

  /**
   * Initialize snapshot directory
   */
  async init() {
    await fs.promises.mkdir(this.snapshotDir, { recursive: true });
  }

  /**
   * Generate a unique snapshot ID
   * @returns {string} Snapshot ID in format snap-YYYYMMDD-HHMMSS-RAND
   */
  generateId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const random = crypto.randomBytes(3).toString('hex');
    return `snap-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`;
  }

  /**
   * Save a snapshot
   * @param {object} analysis - Analysis results from TokenCalculator
   * @param {string} message - Optional message for the snapshot
   * @returns {object} Saved snapshot info
   */
  async save(analysis, message = '') {
    await this.init();

    const id = this.generateId();
    const timestamp = new Date().toISOString();
    const filename = `${id}.json`;
    const filepath = path.join(this.snapshotDir, filename);

    // Build snapshot object
    const snapshot = {
      id,
      timestamp,
      version: '1.0',
      message,
      summary: {
        totalFiles: analysis.totalFiles || 0,
        totalTokens: analysis.totalTokens || 0,
        totalBytes: analysis.totalBytes || 0,
        totalLines: analysis.totalLines || 0,
      },
      byExtension: analysis.byExtension || {},
      byDirectory: analysis.byDirectory || {},
      largestFiles: (analysis.largestFiles || []).map((f) => ({
        path: f.relativePath || f.path,
        tokens: f.tokens,
        lines: f.lines,
        extension: f.extension,
      })),
      files: (analysis.largestFiles || []).map((f) => ({
        path: f.relativePath || f.path,
        tokens: f.tokens,
        lines: f.lines,
        extension: f.extension,
        hash: this.hashFile(f),
      })),
    };

    await fs.promises.writeFile(filepath, JSON.stringify(snapshot, null, 2));

    return { id, filename, snapshot };
  }

  /**
   * Generate a hash for a file entry
   * @param {object} file - File info
   * @returns {string} Hash string
   */
  hashFile(file) {
    const content = `${file.path}:${file.tokens}:${file.lines}`;
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
  }

  /**
   * List all snapshots
   * @param {object} options - List options
   * @returns {string[]} Array of snapshot filenames
   */
  async list(options = {}) {
    try {
      await this.init();
      const files = await fs.promises.readdir(this.snapshotDir);
      const snapshots = files
        .filter((f) => f.startsWith('snap-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (options.limit) {
        return snapshots.slice(0, options.limit);
      }
      return snapshots;
    } catch (_error) {
      return [];
    }
  }

  /**
   * Load a snapshot by filename
   * @param {string} filename - Snapshot filename
   * @returns {object} Snapshot data
   */
  async load(filename) {
    const filepath = path.join(this.snapshotDir, filename);
    const content = await fs.promises.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Load a snapshot by ID
   * @param {string} id - Snapshot ID (e.g., snap-20250115-143000)
   * @returns {object|null} Snapshot data or null if not found
   */
  async loadById(id) {
    const filename = id.endsWith('.json') ? id : `${id}.json`;
    try {
      return await this.load(filename);
    } catch {
      return null;
    }
  }

  /**
   * Delete a snapshot
   * @param {string} id - Snapshot ID
   * @returns {boolean} True if deleted
   */
  async delete(id) {
    const filename = id.endsWith('.json') ? id : `${id}.json`;
    const filepath = path.join(this.snapshotDir, filename);
    try {
      await fs.promises.unlink(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get snapshot count
   * @returns {number} Number of snapshots
   */
  async count() {
    const snapshots = await this.list();
    return snapshots.length;
  }
}

/**
 * SnapshotDiff - Compare snapshots and analyze trends
 */
export class SnapshotDiff {
  /**
   * Compare two snapshots
   * @param {object} oldSnapshot - Earlier snapshot
   * @param {object} newSnapshot - Later snapshot
   * @returns {object} Comparison result
   */
  compare(oldSnapshot, newSnapshot) {
    const oldFiles = new Map((oldSnapshot.files || []).map((f) => [f.path, f]));
    const newFiles = new Map((newSnapshot.files || []).map((f) => [f.path, f]));

    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    // Find added and modified files
    for (const [filePath, file] of newFiles) {
      if (!oldFiles.has(filePath)) {
        added.push(file);
      } else {
        const oldFile = oldFiles.get(filePath);
        if (oldFile.tokens !== file.tokens || oldFile.lines !== file.lines) {
          modified.push({
            path: filePath,
            oldTokens: oldFile.tokens,
            newTokens: file.tokens,
            tokenDiff: file.tokens - oldFile.tokens,
            oldLines: oldFile.lines,
            newLines: file.lines,
            lineDiff: file.lines - oldFile.lines,
          });
        } else {
          unchanged.push(file);
        }
      }
    }

    // Find removed files
    for (const [filePath, file] of oldFiles) {
      if (!newFiles.has(filePath)) {
        removed.push(file);
      }
    }

    // Calculate total token diff
    const oldTotal = oldSnapshot.summary?.totalTokens || 0;
    const newTotal = newSnapshot.summary?.totalTokens || 0;
    const totalTokenDiff = newTotal - oldTotal;
    const percentChange = oldTotal > 0 ? (totalTokenDiff / oldTotal) * 100 : 0;

    // Calculate extension changes
    const extensionChanges = this.calculateExtensionChanges(
      oldSnapshot.byExtension || {},
      newSnapshot.byExtension || {}
    );

    return {
      oldSnapshot: {
        id: oldSnapshot.id,
        timestamp: oldSnapshot.timestamp,
        summary: oldSnapshot.summary,
      },
      newSnapshot: {
        id: newSnapshot.id,
        timestamp: newSnapshot.timestamp,
        summary: newSnapshot.summary,
      },
      added,
      removed,
      modified,
      unchanged,
      totalTokenDiff,
      percentChange,
      extensionChanges,
    };
  }

  /**
   * Calculate changes by extension
   * @param {object} oldExtensions - Old extension stats
   * @param {object} newExtensions - New extension stats
   * @returns {object[]} Extension changes
   */
  calculateExtensionChanges(oldExtensions, newExtensions) {
    const changes = [];
    const allExtensions = new Set([...Object.keys(oldExtensions), ...Object.keys(newExtensions)]);

    for (const ext of allExtensions) {
      const oldStats = oldExtensions[ext] || { tokens: 0, count: 0 };
      const newStats = newExtensions[ext] || { tokens: 0, count: 0 };
      const tokenDiff = newStats.tokens - oldStats.tokens;
      const percentChange = oldStats.tokens > 0 ? (tokenDiff / oldStats.tokens) * 100 : 0;

      changes.push({
        extension: ext,
        oldTokens: oldStats.tokens,
        newTokens: newStats.tokens,
        tokenDiff,
        percentChange,
        oldCount: oldStats.count,
        newCount: newStats.count,
      });
    }

    return changes.sort((a, b) => Math.abs(b.tokenDiff) - Math.abs(a.tokenDiff));
  }

  /**
   * Analyze trend across multiple snapshots
   * @param {object[]} snapshots - Array of snapshots (oldest to newest)
   * @returns {object|null} Trend analysis
   */
  analyzeTrend(snapshots) {
    if (!snapshots || snapshots.length < 2) return null;

    // Sort by timestamp (oldest first)
    const sorted = [...snapshots].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const changes = [];
    for (let i = 1; i < sorted.length; i++) {
      const diff = this.compare(sorted[i - 1], sorted[i]);
      changes.push({
        date: new Date(sorted[i].timestamp),
        snapshotId: sorted[i].id,
        tokenDiff: diff.totalTokenDiff,
        percentChange: diff.percentChange,
        totalTokens: sorted[i].summary.totalTokens,
      });
    }

    // Calculate average daily growth
    const firstDate = new Date(sorted[0].timestamp);
    const lastDate = new Date(sorted[sorted.length - 1].timestamp);
    const totalDays = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
    const totalGrowth = changes.reduce((sum, c) => sum + c.tokenDiff, 0);
    const dailyGrowth = totalGrowth / totalDays;

    return {
      snapshotCount: snapshots.length,
      timeSpan: {
        start: firstDate,
        end: lastDate,
        days: Math.round(totalDays),
      },
      changes,
      averageDailyGrowth: Math.round(dailyGrowth),
      projectedMonthlyGrowth: Math.round(dailyGrowth * 30),
      projectedSixMonthGrowth: Math.round(dailyGrowth * 180),
      totalGrowth,
      growthRate:
        sorted[0].summary.totalTokens > 0
          ? ((sorted[sorted.length - 1].summary.totalTokens - sorted[0].summary.totalTokens) /
              sorted[0].summary.totalTokens) *
            100
          : 0,
    };
  }

  /**
   * Generate ASCII trend chart
   * @param {object[]} changes - Changes array from trend analysis
   * @param {number} width - Chart width
   * @returns {string} ASCII chart
   */
  generateTrendChart(changes, width = 50) {
    if (!changes || changes.length === 0) return '';

    const tokens = changes.map((c) => c.totalTokens);
    const maxToken = Math.max(...tokens);
    const minToken = Math.min(...tokens);
    const range = maxToken - minToken || 1;

    let chart = '\n📈 Token Growth Trend\n';
    chart += '─'.repeat(width + 20) + '\n';

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const barLength = Math.round(((change.totalTokens - minToken) / range) * width);
      const bar = '█'.repeat(Math.max(1, barLength));
      const date = change.date.toISOString().split('T')[0];
      const diff = change.tokenDiff >= 0 ? `+${change.tokenDiff}` : change.tokenDiff;

      chart += `${date} │${bar} ${change.totalTokens.toLocaleString()} (${diff})\n`;
    }

    chart += '─'.repeat(width + 20) + '\n';
    return chart;
  }
}

/**
 * SnapshotManager - Main class for snapshot operations
 */
export default class SnapshotManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.store = new SnapshotStore(projectRoot);
    this.diff = new SnapshotDiff();
  }

  /**
   * Create a new snapshot
   * @param {object} analysis - Analysis results
   * @param {string} message - Optional message
   * @returns {object} Created snapshot info
   */
  async createSnapshot(analysis, message = '') {
    const { id, snapshot } = await this.store.save(analysis, message);
    return { id, snapshot };
  }

  /**
   * List all snapshots with formatted output
   * @returns {string} Formatted snapshot list
   */
  async listSnapshots() {
    const snapshots = await this.store.list();

    if (snapshots.length === 0) {
      return '\n📷 No snapshots found.\n\n   Create one with: ctxman --snapshot "message"\n\n';
    }

    let output = '\n📷 Saved Snapshots\n';
    output += '═'.repeat(60) + '\n\n';

    for (const filename of snapshots) {
      try {
        const snapshot = await this.store.load(filename);
        const date = new Date(snapshot.timestamp);
        const dateStr = date.toISOString().split('T')[0];
        const timeStr = date.toTimeString().split(' ')[0];
        const tokens = (snapshot.summary?.totalTokens || 0).toLocaleString();
        const files = snapshot.summary?.totalFiles || 0;
        const message = snapshot.message || '';

        output += `📸 ${snapshot.id}\n`;
        output += `   Date: ${dateStr} ${timeStr}\n`;
        output += `   Files: ${files.toLocaleString()} | Tokens: ${tokens}\n`;
        if (message) {
          output += `   Message: ${message}\n`;
        }
        output += '\n';
      } catch {
        // Skip invalid snapshots
      }
    }

    return output;
  }

  /**
   * Get snapshots for programmatic use
   * @returns {object[]} Array of snapshot info
   */
  async getSnapshots() {
    const filenames = await this.store.list();
    const snapshots = [];

    for (const filename of filenames) {
      try {
        const snapshot = await this.store.load(filename);
        snapshots.push({
          id: snapshot.id,
          timestamp: snapshot.timestamp,
          message: snapshot.message || '',
          totalFiles: snapshot.summary?.totalFiles || 0,
          totalTokens: snapshot.summary?.totalTokens || 0,
        });
      } catch {
        // Skip invalid snapshots
      }
    }

    return snapshots;
  }

  /**
   * Compare two snapshots
   * @param {string} id1 - First snapshot ID
   * @param {string} id2 - Second snapshot ID
   * @returns {object|null} Comparison result
   */
  async compareSnapshots(id1, id2) {
    const snap1 = await this.store.loadById(id1);
    const snap2 = await this.store.loadById(id2);

    if (!snap1 || !snap2) {
      return null;
    }

    return this.diff.compare(snap1, snap2);
  }

  /**
   * Compare with last snapshot
   * @param {object} currentAnalysis - Current analysis results
   * @returns {object|null} Comparison result
   */
  async compareWithLast(currentAnalysis) {
    const snapshots = await this.store.list({ limit: 1 });

    if (snapshots.length === 0) {
      return null;
    }

    const lastSnapshot = await this.store.load(snapshots[0]);
    const currentSnapshot = {
      id: 'current',
      timestamp: new Date().toISOString(),
      summary: {
        totalFiles: currentAnalysis.totalFiles || 0,
        totalTokens: currentAnalysis.totalTokens || 0,
        totalBytes: currentAnalysis.totalBytes || 0,
        totalLines: currentAnalysis.totalLines || 0,
      },
      byExtension: currentAnalysis.byExtension || {},
      files: (currentAnalysis.largestFiles || []).map((f) => ({
        path: f.relativePath || f.path,
        tokens: f.tokens,
        lines: f.lines,
        extension: f.extension,
      })),
    };

    return this.diff.compare(lastSnapshot, currentSnapshot);
  }

  /**
   * Get trend analysis
   * @param {number} limit - Maximum snapshots to analyze
   * @returns {object|null} Trend analysis
   */
  async getTrend(limit = 10) {
    const filenames = await this.store.list({ limit });
    const snapshots = [];

    for (const filename of filenames) {
      try {
        const snapshot = await this.store.load(filename);
        snapshots.push(snapshot);
      } catch {
        // Skip invalid snapshots
      }
    }

    if (snapshots.length < 2) {
      return null;
    }

    // Sort oldest to newest
    snapshots.reverse();

    return this.diff.analyzeTrend(snapshots);
  }

  /**
   * Format diff output for display
   * @param {object} comparison - Comparison result
   * @returns {string} Formatted output
   */
  formatDiff(comparison) {
    if (!comparison) {
      return '\n⚠️  No snapshots available for comparison.\n\n';
    }

    const formatDate = (timestamp) => {
      const date = new Date(timestamp);
      return date.toISOString().split('T')[0];
    };

    let output = '\n📊 Snapshot Comparison\n';
    output += '═'.repeat(60) + '\n';
    output += `   From: ${comparison.oldSnapshot.id || 'N/A'} (${formatDate(comparison.oldSnapshot.timestamp)})\n`;
    output += `   To:   ${comparison.newSnapshot.id || 'N/A'} (${formatDate(comparison.newSnapshot.timestamp)})\n\n`;

    // Token changes
    const oldTokens = comparison.oldSnapshot.summary?.totalTokens || 0;
    const newTokens = comparison.newSnapshot.summary?.totalTokens || 0;
    const tokenDiff = comparison.totalTokenDiff;
    const percentChange = comparison.percentChange;
    const tokenSign = tokenDiff >= 0 ? '+' : '';

    output += `   Files:    ${(comparison.oldSnapshot.summary?.totalFiles || 0).toLocaleString()} → ${(comparison.newSnapshot.summary?.totalFiles || 0).toLocaleString()}`;
    const fileDiff =
      (comparison.newSnapshot.summary?.totalFiles || 0) -
      (comparison.oldSnapshot.summary?.totalFiles || 0);
    output += ` (${tokenSign}${fileDiff}, ${tokenSign}${percentChange.toFixed(1)}%)\n`;

    output += `   Tokens:   ${this.formatTokens(oldTokens)} → ${this.formatTokens(newTokens)}`;
    output += ` (${tokenSign}${this.formatTokens(Math.abs(tokenDiff))}, ${tokenSign}${percentChange.toFixed(1)}%)\n\n`;

    // Extension changes
    if (comparison.extensionChanges && comparison.extensionChanges.length > 0) {
      const growing = comparison.extensionChanges.filter((e) => e.tokenDiff > 0).slice(0, 5);

      if (growing.length > 0) {
        output += '   📈 Growth by Extension:\n';
        output += '   ' + '─'.repeat(50) + '\n';
        for (const ext of growing) {
          const sign = ext.tokenDiff >= 0 ? '+' : '';
          const extLabel = ext.extension || '(no ext)';
          output += `   ${extLabel.padEnd(8)} ${sign}${ext.tokenDiff.toLocaleString()} tokens (${sign}${ext.percentChange.toFixed(0)}%)\n`;
        }
        output += '\n';
      }
    }

    // Top growing files
    if (comparison.modified && comparison.modified.length > 0) {
      const topGrowth = comparison.modified
        .filter((f) => f.tokenDiff > 0)
        .sort((a, b) => b.tokenDiff - a.tokenDiff)
        .slice(0, 5);

      if (topGrowth.length > 0) {
        output += '   📁 Top Growing Files:\n';
        output += '   ' + '─'.repeat(50) + '\n';
        for (const file of topGrowth) {
          output += `   +${file.tokenDiff.toLocaleString().padStart(8)}  ${file.path}\n`;
        }
        output += '\n';
      }
    }

    // Added files summary
    if (comparison.added && comparison.added.length > 0) {
      output += `   ✅ Added: ${comparison.added.length} files (+${comparison.added.reduce((s, f) => s + (f.tokens || 0), 0).toLocaleString()} tokens)\n`;
    }

    // Removed files summary
    if (comparison.removed && comparison.removed.length > 0) {
      output += `   ❌ Removed: ${comparison.removed.length} files (-${comparison.removed.reduce((s, f) => s + (f.tokens || 0), 0).toLocaleString()} tokens)\n`;
    }

    output += '\n';
    return output;
  }

  /**
   * Format trend output for display
   * @param {object} trend - Trend analysis result
   * @returns {string} Formatted output
   */
  formatTrend(trend) {
    if (!trend) {
      return '\n⚠️  Need at least 2 snapshots for trend analysis.\n\n';
    }

    let output = '\n📈 Token Growth Trend\n';
    output += '═'.repeat(60) + '\n\n';

    output += `   Snapshots analyzed: ${trend.snapshotCount}\n`;
    output += `   Time span: ${trend.timeSpan.days} days\n\n`;

    output += `   Average daily growth:   ${trend.averageDailyGrowth.toLocaleString()} tokens\n`;
    output += `   Projected monthly:      +${trend.projectedMonthlyGrowth.toLocaleString()} tokens\n`;
    output += `   Projected 6 months:     +${trend.projectedSixMonthGrowth.toLocaleString()} tokens\n\n`;

    output += `   Total growth:           ${trend.totalGrowth >= 0 ? '+' : ''}${trend.totalGrowth.toLocaleString()} tokens\n`;
    output += `   Growth rate:            ${trend.growthRate >= 0 ? '+' : ''}${trend.growthRate.toFixed(1)}%\n\n`;

    // Add chart
    output += this.diff.generateTrendChart(trend.changes);

    return output;
  }

  /**
   * Format tokens for display (K, M suffixes)
   * @param {number} tokens - Token count
   * @returns {string} Formatted string
   */
  formatTokens(tokens) {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(0)}K`;
    }
    return tokens.toLocaleString();
  }

  /**
   * Export snapshot as JSON
   * @param {string} id - Snapshot ID
   * @returns {object|null} Snapshot data or null
   */
  async exportSnapshot(id) {
    return await this.store.loadById(id);
  }

  /**
   * Delete a snapshot
   * @param {string} id - Snapshot ID
   * @returns {boolean} True if deleted
   */
  async deleteSnapshot(id) {
    return await this.store.delete(id);
  }
}
