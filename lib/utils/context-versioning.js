/**
 * Context Versioning (FEAT-012)
 * Track and restore context versions over time
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const VERSION_DIR = '.ctxman/versions';
const VERSION_INDEX = 'index.json';

/**
 * VersionStorage - Handles version storage operations
 */
export class VersionStorage {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.versionDir = path.join(projectRoot, VERSION_DIR);
        this.indexFile = path.join(this.versionDir, VERSION_INDEX);
    }

    /**
     * Initialize version directory and index
     */
    async init() {
        await fs.promises.mkdir(this.versionDir, { recursive: true });
        
        if (!fs.existsSync(this.indexFile)) {
            await this.saveIndex({ versions: [] });
        }
    }

    /**
     * Generate a unique version ID
     * @returns {string} Version ID in format ctx-v001
     */
    generateVersionId(index) {
        const count = index.versions.length + 1;
        return `ctx-v${String(count).padStart(3, '0')}`;
    }

    /**
     * Get current git commit hash
     * @returns {string|null} Git commit hash or null
     */
    getGitCommit() {
        try {
            return execSync('git rev-parse --short HEAD', { 
                cwd: this.projectRoot,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            }).trim();
        } catch {
            return null;
        }
    }

    /**
     * Save a context version
     * @param {object} context - Context data from analyzer
     * @param {object} config - Configuration used for this context
     * @param {string} message - Optional message for the version
     * @returns {object} Saved version info
     */
    async save(context, config = {}, message = '') {
        await this.init();
        
        const index = await this.loadIndex();
        const id = this.generateVersionId(index);
        const timestamp = new Date().toISOString();
        const gitCommit = this.getGitCommit();
        
        // Build version object
        const version = {
            id,
            timestamp,
            gitCommit,
            message,
            config: {
                exclude: config.exclude || [],
                include: config.include || [],
                targetModel: config.targetModel || null
            },
            summary: {
                totalFiles: context.totalFiles || 0,
                totalTokens: context.totalTokens || 0,
                totalBytes: context.totalBytes || 0,
                totalLines: context.totalLines || 0
            },
            files: (context.largestFiles || []).map(f => ({
                path: f.relativePath || f.path,
                tokens: f.tokens || 0,
                lines: f.lines || 0,
                extension: f.extension || '',
                included: f.included !== false,
                hash: this.hashFile(f)
            })),
            byExtension: context.byExtension || {},
            byDirectory: context.byDirectory || {}
        };
        
        // Save version file
        const versionFile = path.join(this.versionDir, `${id}.json`);
        await fs.promises.writeFile(versionFile, JSON.stringify(version, null, 2));
        
        // Update index
        index.versions.push({
            id,
            timestamp,
            gitCommit,
            message,
            totalFiles: version.summary.totalFiles,
            totalTokens: version.summary.totalTokens,
            targetModel: version.config.targetModel
        });
        
        await this.saveIndex(index);
        
        return { id, version };
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
     * Load the version index
     * @returns {object} Index object
     */
    async loadIndex() {
        try {
            const content = await fs.promises.readFile(this.indexFile, 'utf-8');
            return JSON.parse(content);
        } catch {
            return { versions: [] };
        }
    }

    /**
     * Save the version index
     * @param {object} index - Index object
     */
    async saveIndex(index) {
        await fs.promises.writeFile(this.indexFile, JSON.stringify(index, null, 2));
    }

    /**
     * List all version IDs
     * @param {object} options - List options
     * @returns {object[]} Array of version info
     */
    async list(options = {}) {
        const index = await this.loadIndex();
        let versions = [...index.versions].reverse(); // Most recent first
        
        if (options.limit) {
            versions = versions.slice(0, options.limit);
        }
        
        return versions;
    }

    /**
     * Load a version by ID
     * @param {string} id - Version ID
     * @returns {object|null} Version data or null
     */
    async load(id) {
        const versionFile = path.join(this.versionDir, `${id}.json`);
        try {
            const content = await fs.promises.readFile(versionFile, 'utf-8');
            return JSON.parse(content);
        } catch {
            return null;
        }
    }

    /**
     * Delete a version
     * @param {string} id - Version ID
     * @returns {boolean} True if deleted
     */
    async delete(id) {
        const versionFile = path.join(this.versionDir, `${id}.json`);
        try {
            await fs.promises.unlink(versionFile);
            
            // Update index
            const index = await this.loadIndex();
            index.versions = index.versions.filter(v => v.id !== id);
            await this.saveIndex(index);
            
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get version count
     * @returns {number} Number of versions
     */
    async count() {
        const index = await this.loadIndex();
        return index.versions.length;
    }
}

/**
 * VersionDiffEngine - Compare versions
 */
export class VersionDiffEngine {
    /**
     * Compare two versions
     * @param {object} version1 - Earlier version
     * @param {object} version2 - Later version
     * @returns {object} Comparison result
     */
    compare(version1, version2) {
        const files1 = new Map((version1.files || []).map(f => [f.path, f]));
        const files2 = new Map((version2.files || []).map(f => [f.path, f]));
        
        const added = [];
        const removed = [];
        const changed = [];
        const unchanged = [];
        
        // Find added and changed files
        for (const [filePath, file2] of files2) {
            if (!files1.has(filePath)) {
                added.push({
                    path: filePath,
                    tokens: file2.tokens
                });
            } else {
                const file1 = files1.get(filePath);
                if (file1.hash !== file2.hash || file1.tokens !== file2.tokens) {
                    changed.push({
                        path: filePath,
                        oldTokens: file1.tokens,
                        newTokens: file2.tokens,
                        tokenDiff: file2.tokens - file1.tokens
                    });
                } else {
                    unchanged.push(filePath);
                }
            }
        }
        
        // Find removed files
        for (const [filePath, file1] of files1) {
            if (!files2.has(filePath)) {
                removed.push({
                    path: filePath,
                    tokens: file1.tokens
                });
            }
        }
        
        // Calculate token diff
        const tokenDiff = (version2.summary?.totalTokens || 0) - (version1.summary?.totalTokens || 0);
        const percentChange = (version1.summary?.totalTokens || 0) > 0
            ? (tokenDiff / version1.summary.totalTokens) * 100
            : 0;
        
        return {
            version1: {
                id: version1.id,
                timestamp: version1.timestamp,
                gitCommit: version1.gitCommit,
                summary: version1.summary
            },
            version2: {
                id: version2.id,
                timestamp: version2.timestamp,
                gitCommit: version2.gitCommit,
                summary: version2.summary
            },
            tokenDiff,
            percentChange,
            added,
            removed,
            changed,
            unchanged,
            summary: {
                filesAdded: added.length,
                filesRemoved: removed.length,
                filesChanged: changed.length,
                filesUnchanged: unchanged.length
            }
        };
    }
}

/**
 * ContextVersioning - Main class for version management
 */
export default class ContextVersioning {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.storage = new VersionStorage(projectRoot);
        this.diffEngine = new VersionDiffEngine();
    }

    /**
     * Create a new version (automatically called with --cli)
     * @param {object} context - Context data from analyzer
     * @param {object} config - Configuration used
     * @param {string} message - Optional message
     * @returns {object} Created version info
     */
    async createVersion(context, config = {}, message = '') {
        return await this.storage.save(context, config, message);
    }

    /**
     * List all versions with formatted output
     * @returns {string} Formatted version list
     */
    async listVersions() {
        const versions = await this.storage.list();
        
        if (versions.length === 0) {
            return '\n📜 No context versions found.\n\n   Create one with: ctxman --cli\n\n';
        }
        
        let output = '\n📜 Context Versions:\n';
        output += '═'.repeat(60) + '\n\n';
        
        for (const v of versions) {
            const date = new Date(v.timestamp);
            const dateStr = date.toISOString().split('T')[0];
            const timeStr = date.toTimeString().split(' ')[0].substring(0, 5);
            const tokens = (v.totalTokens || 0).toLocaleString();
            const files = v.totalFiles || 0;
            const model = v.targetModel || 'N/A';
            
            output += `   Version: ${v.id}\n`;
            output += `   Created: ${dateStr} ${timeStr}\n`;
            output += `   Files: ${files.toLocaleString()} | Tokens: ${tokens}\n`;
            output += `   Model: ${model}\n`;
            if (v.gitCommit) {
                output += `   Git: ${v.gitCommit}\n`;
            }
            if (v.message) {
                output += `   Message: ${v.message}\n`;
            }
            output += '\n';
        }
        
        return output;
    }

    /**
     * Get versions for programmatic use
     * @returns {object[]} Array of version info
     */
    async getVersions() {
        return await this.storage.list();
    }

    /**
     * Restore a version (return the context data)
     * @param {string} id - Version ID
     * @returns {object|null} Version data or null
     */
    async restoreVersion(id) {
        const version = await this.storage.load(id);
        
        if (!version) {
            return null;
        }
        
        return {
            ...version,
            restoredFrom: id,
            restoredAt: new Date().toISOString()
        };
    }

    /**
     * Compare two versions
     * @param {string} id1 - First version ID
     * @param {string} id2 - Second version ID
     * @returns {object|null} Comparison result
     */
    async compareVersions(id1, id2) {
        const v1 = await this.storage.load(id1);
        const v2 = await this.storage.load(id2);
        
        if (!v1 || !v2) {
            return null;
        }
        
        return this.diffEngine.compare(v1, v2);
    }

    /**
     * Format version comparison for display
     * @param {object} comparison - Comparison result
     * @returns {string} Formatted output
     */
    formatComparison(comparison) {
        if (!comparison) {
            return '\n⚠️  Versions not found for comparison.\n\n';
        }
        
        let output = '\n📊 Version Comparison\n';
        output += '═'.repeat(60) + '\n\n';
        
        output += `   From: ${comparison.version1.id}`;
        if (comparison.version1.gitCommit) {
            output += ` (${comparison.version1.gitCommit})`;
        }
        output += '\n';
        
        output += `   To:   ${comparison.version2.id}`;
        if (comparison.version2.gitCommit) {
            output += ` (${comparison.version2.gitCommit})`;
        }
        output += '\n\n';
        
        // Token changes
        const tokenDiff = comparison.tokenDiff;
        const percentChange = comparison.percentChange;
        const sign = tokenDiff >= 0 ? '+' : '';
        
        output += `   Token change: ${sign}${tokenDiff.toLocaleString()} (${sign}${percentChange.toFixed(1)}%)\n\n`;
        
        // File changes
        output += `   Files added:    ${comparison.summary.filesAdded}\n`;
        output += `   Files removed:  ${comparison.summary.filesRemoved}\n`;
        output += `   Files changed:  ${comparison.summary.filesChanged}\n\n`;
        
        // Added files
        if (comparison.added.length > 0) {
            output += '   📁 Files Added:\n';
            for (const f of comparison.added.slice(0, 10)) {
                output += `      + ${f.path} (+${f.tokens.toLocaleString()} tokens)\n`;
            }
            if (comparison.added.length > 10) {
                output += `      ... and ${comparison.added.length - 10} more\n`;
            }
            output += '\n';
        }
        
        // Removed files
        if (comparison.removed.length > 0) {
            output += '   🗑️  Files Removed:\n';
            for (const f of comparison.removed.slice(0, 10)) {
                output += `      - ${f.path} (-${f.tokens.toLocaleString()} tokens)\n`;
            }
            if (comparison.removed.length > 10) {
                output += `      ... and ${comparison.removed.length - 10} more\n`;
            }
            output += '\n';
        }
        
        // Changed files
        if (comparison.changed.length > 0) {
            output += '   ✏️  Files Changed:\n';
            const sorted = [...comparison.changed].sort((a, b) => Math.abs(b.tokenDiff) - Math.abs(a.tokenDiff));
            for (const f of sorted.slice(0, 10)) {
                const changeSign = f.tokenDiff >= 0 ? '+' : '';
                output += `      ~ ${f.path} (${changeSign}${f.tokenDiff.toLocaleString()} tokens)\n`;
            }
            if (comparison.changed.length > 10) {
                output += `      ... and ${comparison.changed.length - 10} more\n`;
            }
            output += '\n';
        }
        
        return output;
    }

    /**
     * Delete a version
     * @param {string} id - Version ID
     * @returns {boolean} True if deleted
     */
    async deleteVersion(id) {
        return await this.storage.delete(id);
    }

    /**
     * Get the latest version
     * @returns {object|null} Latest version info or null
     */
    async getLatestVersion() {
        const versions = await this.storage.list({ limit: 1 });
        if (versions.length === 0) {
            return null;
        }
        return await this.storage.load(versions[0].id);
    }

    /**
     * Prune old versions, keeping only the most recent N
     * @param {number} keepCount - Number of versions to keep
     * @returns {string[]} Array of deleted version IDs
     */
    async pruneVersions(keepCount = 10) {
        const versions = await this.storage.list();
        
        if (versions.length <= keepCount) {
            return [];
        }
        
        // Get versions to delete (oldest ones)
        const toDelete = versions.slice(keepCount);
        const deleted = [];
        
        for (const v of toDelete) {
            if (await this.storage.delete(v.id)) {
                deleted.push(v.id);
            }
        }
        
        return deleted;
    }
}
