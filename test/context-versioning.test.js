/**
 * Tests for Context Versioning (FEAT-012)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import ContextVersioning, { VersionStorage, VersionDiffEngine } from '../lib/utils/context-versioning.js';

const TEST_DIR = './test-versioning-temp';

describe('VersionStorage', () => {
    let storage;

    beforeEach(async () => {
        // Create test directory
        storage = new VersionStorage(TEST_DIR);
        await storage.init();
    });

    afterEach(async () => {
        // Clean up test directory
        try {
            await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('save', () => {
        it('should save a version with correct format', async () => {
            const context = {
                totalFiles: 100,
                totalTokens: 50000,
                totalBytes: 100000,
                totalLines: 2000,
                byExtension: {
                    '.js': { count: 50, tokens: 30000, bytes: 60000, lines: 1200 }
                },
                largestFiles: [
                    { relativePath: 'src/index.js', tokens: 1000, lines: 100, extension: '.js' }
                ]
            };

            const config = {
                exclude: ['node_modules'],
                include: ['src/**'],
                targetModel: 'claude-sonnet-4.5'
            };

            const { id, version } = await storage.save(context, config, 'Test version');

            expect(id).toMatch(/^ctx-v\d{3}$/);
            expect(version.id).toBe(id);
            expect(version.message).toBe('Test version');
            expect(version.summary.totalFiles).toBe(100);
            expect(version.summary.totalTokens).toBe(50000);
            expect(version.config.targetModel).toBe('claude-sonnet-4.5');
            expect(version.files).toHaveLength(1);
        });

        it('should generate sequential version IDs', async () => {
            const index = await storage.loadIndex();
            const id1 = storage.generateVersionId(index);
            expect(id1).toBe('ctx-v001');

            // Simulate adding a version
            index.versions.push({ id: id1 });
            const id2 = storage.generateVersionId(index);
            expect(id2).toBe('ctx-v002');
        });

        it('should handle empty context', async () => {
            const { version } = await storage.save({}, {}, '');

            expect(version.summary.totalFiles).toBe(0);
            expect(version.summary.totalTokens).toBe(0);
        });

        it('should store git commit hash when available', async () => {
            // This test verifies git commit is captured (actual hash depends on repo state)
            const { version } = await storage.save({ totalFiles: 1, totalTokens: 100 }, {}, '');

            // Git commit is either a hash string or null
            expect(version.gitCommit === null || typeof version.gitCommit === 'string').toBe(true);
        });
    });

    describe('list', () => {
        it('should list saved versions', async () => {
            // Create multiple versions
            await storage.save({ totalFiles: 1, totalTokens: 100 }, {}, 'First');
            await storage.save({ totalFiles: 2, totalTokens: 200 }, {}, 'Second');

            const versions = await storage.list();

            expect(versions.length).toBe(2);
            expect(versions[0].id).toMatch(/^ctx-v\d{3}$/);
        });

        it('should respect limit option', async () => {
            await storage.save({ totalFiles: 1, totalTokens: 100 }, {}, 'First');
            await storage.save({ totalFiles: 2, totalTokens: 200 }, {}, 'Second');
            await storage.save({ totalFiles: 3, totalTokens: 300 }, {}, 'Third');

            const versions = await storage.list({ limit: 2 });

            expect(versions.length).toBe(2);
        });

        it('should return versions in reverse order (newest first)', async () => {
            await storage.save({ totalFiles: 1, totalTokens: 100 }, {}, 'First');
            await storage.save({ totalFiles: 2, totalTokens: 200 }, {}, 'Second');

            const versions = await storage.list();

            expect(versions[0].totalTokens).toBe(200);
            expect(versions[1].totalTokens).toBe(100);
        });

        it('should return empty array when no versions', async () => {
            const versions = await storage.list();
            expect(versions).toEqual([]);
        });
    });

    describe('load', () => {
        it('should load a saved version', async () => {
            const { id } = await storage.save({ totalFiles: 100, totalTokens: 50000 }, {}, 'Test');

            const version = await storage.load(id);

            expect(version).not.toBeNull();
            expect(version.id).toBe(id);
            expect(version.summary.totalTokens).toBe(50000);
        });

        it('should return null for non-existent version', async () => {
            const version = await storage.load('ctx-v999');
            expect(version).toBeNull();
        });
    });

    describe('delete', () => {
        it('should delete a version', async () => {
            const { id } = await storage.save({ totalFiles: 1, totalTokens: 100 }, {}, 'Test');

            const deleted = await storage.delete(id);

            expect(deleted).toBe(true);
            const version = await storage.load(id);
            expect(version).toBeNull();
        });

        it('should return false for non-existent version', async () => {
            const deleted = await storage.delete('ctx-v999');
            expect(deleted).toBe(false);
        });

        it('should update index after deletion', async () => {
            const { id } = await storage.save({ totalFiles: 1, totalTokens: 100 }, {}, 'Test');
            
            await storage.delete(id);
            
            const index = await storage.loadIndex();
            expect(index.versions.find(v => v.id === id)).toBeUndefined();
        });
    });
});

describe('VersionDiffEngine', () => {
    let diffEngine;

    beforeEach(() => {
        diffEngine = new VersionDiffEngine();
    });

    describe('compare', () => {
        it('should compare two versions correctly', () => {
            const version1 = {
                id: 'ctx-v001',
                timestamp: '2025-01-10T00:00:00Z',
                summary: { totalTokens: 100000, totalFiles: 50 },
                files: [
                    { path: 'src/index.js', tokens: 1000, hash: 'abc12345' },
                    { path: 'src/old.js', tokens: 500, hash: 'def12345' }
                ]
            };

            const version2 = {
                id: 'ctx-v002',
                timestamp: '2025-01-15T00:00:00Z',
                summary: { totalTokens: 105000, totalFiles: 52 },
                files: [
                    { path: 'src/index.js', tokens: 1200, hash: 'xyz12345' },
                    { path: 'src/new.js', tokens: 600, hash: 'new12345' }
                ]
            };

            const result = diffEngine.compare(version1, version2);

            expect(result.tokenDiff).toBe(5000);
            expect(result.percentChange).toBe(5);
            expect(result.added).toHaveLength(1);
            expect(result.added[0].path).toBe('src/new.js');
            expect(result.removed).toHaveLength(1);
            expect(result.removed[0].path).toBe('src/old.js');
            expect(result.changed).toHaveLength(1);
            expect(result.changed[0].path).toBe('src/index.js');
            expect(result.changed[0].tokenDiff).toBe(200);
        });

        it('should handle identical versions', () => {
            const version = {
                id: 'ctx-v001',
                timestamp: '2025-01-10T00:00:00Z',
                summary: { totalTokens: 100000, totalFiles: 50 },
                files: [
                    { path: 'src/index.js', tokens: 1000, hash: 'abc12345' }
                ]
            };

            const result = diffEngine.compare(version, version);

            expect(result.tokenDiff).toBe(0);
            expect(result.percentChange).toBe(0);
            expect(result.added).toHaveLength(0);
            expect(result.removed).toHaveLength(0);
            expect(result.changed).toHaveLength(0);
            expect(result.unchanged).toHaveLength(1);
        });

        it('should calculate summary correctly', () => {
            const version1 = {
                id: 'ctx-v001',
                timestamp: '2025-01-10T00:00:00Z',
                summary: { totalTokens: 100 },
                files: [
                    { path: 'a.js', tokens: 50, hash: 'a1' },
                    { path: 'b.js', tokens: 50, hash: 'b1' }
                ]
            };

            const version2 = {
                id: 'ctx-v002',
                timestamp: '2025-01-15T00:00:00Z',
                summary: { totalTokens: 200 },
                files: [
                    { path: 'a.js', tokens: 100, hash: 'a2' },
                    { path: 'c.js', tokens: 100, hash: 'c1' }
                ]
            };

            const result = diffEngine.compare(version1, version2);

            expect(result.summary.filesAdded).toBe(1);
            expect(result.summary.filesRemoved).toBe(1);
            expect(result.summary.filesChanged).toBe(1);
        });
    });
});

describe('ContextVersioning', () => {
    let manager;

    beforeEach(async () => {
        manager = new ContextVersioning(TEST_DIR);
        await manager.storage.init();
    });

    afterEach(async () => {
        try {
            await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('createVersion', () => {
        it('should create a version', async () => {
            const context = {
                totalFiles: 100,
                totalTokens: 50000
            };

            const { id, version } = await manager.createVersion(context, {}, 'Test');

            expect(id).toMatch(/^ctx-v\d{3}$/);
            expect(version.message).toBe('Test');
        });
    });

    describe('listVersions', () => {
        it('should format version list correctly', async () => {
            await manager.createVersion({ totalFiles: 100, totalTokens: 50000 }, { targetModel: 'claude-sonnet-4.5' }, 'First');
            await manager.createVersion({ totalFiles: 200, totalTokens: 100000 }, { targetModel: 'gpt-4o' }, 'Second');

            const output = await manager.listVersions();

            expect(output).toContain('Context Versions');
            expect(output).toContain('ctx-v001');
            expect(output).toContain('ctx-v002');
            expect(output).toContain('claude-sonnet-4.5');
            expect(output).toContain('gpt-4o');
        });

        it('should show message when no versions exist', async () => {
            const output = await manager.listVersions();

            expect(output).toContain('No context versions found');
        });
    });

    describe('restoreVersion', () => {
        it('should restore a version', async () => {
            const { id } = await manager.createVersion(
                { totalFiles: 100, totalTokens: 50000 },
                { targetModel: 'claude-sonnet-4.5' },
                'Test'
            );

            const restored = await manager.restoreVersion(id);

            expect(restored).not.toBeNull();
            expect(restored.id).toBe(id);
            expect(restored.restoredFrom).toBe(id);
            expect(restored.restoredAt).toBeDefined();
        });

        it('should return null for non-existent version', async () => {
            const restored = await manager.restoreVersion('ctx-v999');
            expect(restored).toBeNull();
        });
    });

    describe('compareVersions', () => {
        it('should compare two versions', async () => {
            await manager.createVersion(
                { totalFiles: 50, totalTokens: 100000, largestFiles: [
                    { relativePath: 'src/a.js', tokens: 1000, lines: 100, extension: '.js' }
                ]},
                {},
                'First'
            );

            await manager.createVersion(
                { totalFiles: 60, totalTokens: 120000, largestFiles: [
                    { relativePath: 'src/a.js', tokens: 1200, lines: 120, extension: '.js' },
                    { relativePath: 'src/b.js', tokens: 500, lines: 50, extension: '.js' }
                ]},
                {},
                'Second'
            );

            const versions = await manager.getVersions();
            const comparison = await manager.compareVersions(versions[1].id, versions[0].id);

            expect(comparison).not.toBeNull();
            expect(comparison.tokenDiff).toBe(20000);
        });

        it('should return null for non-existent versions', async () => {
            const comparison = await manager.compareVersions('ctx-v001', 'ctx-v999');
            expect(comparison).toBeNull();
        });
    });

    describe('formatComparison', () => {
        it('should format comparison output', async () => {
            const comparison = {
                version1: { id: 'ctx-v001', timestamp: '2025-01-10T00:00:00Z', gitCommit: 'abc123', summary: { totalTokens: 100000 } },
                version2: { id: 'ctx-v002', timestamp: '2025-01-15T00:00:00Z', gitCommit: 'def456', summary: { totalTokens: 105000 } },
                tokenDiff: 5000,
                percentChange: 5,
                added: [{ path: 'src/new.js', tokens: 600 }],
                removed: [{ path: 'src/old.js', tokens: 400 }],
                changed: [{ path: 'src/index.js', oldTokens: 1000, newTokens: 1200, tokenDiff: 200 }],
                summary: { filesAdded: 1, filesRemoved: 1, filesChanged: 1 }
            };

            const output = manager.formatComparison(comparison);

            expect(output).toContain('Version Comparison');
            expect(output).toContain('ctx-v001');
            expect(output).toContain('ctx-v002');
            expect(output).toContain('+5,000');
            expect(output).toContain('Files Added');
            expect(output).toContain('src/new.js');
        });
    });

    describe('pruneVersions', () => {
        it('should prune old versions', async () => {
            // Create 5 versions
            for (let i = 0; i < 5; i++) {
                await manager.createVersion({ totalFiles: i, totalTokens: i * 100 }, {}, `Version ${i}`);
            }

            const deleted = await manager.pruneVersions(3);

            expect(deleted.length).toBe(2);
            expect(deleted).toContain('ctx-v001');
            expect(deleted).toContain('ctx-v002');

            const remaining = await manager.getVersions();
            expect(remaining.length).toBe(3);
        });

        it('should not prune if already under limit', async () => {
            await manager.createVersion({ totalFiles: 1, totalTokens: 100 }, {}, 'Test');

            const deleted = await manager.pruneVersions(5);

            expect(deleted.length).toBe(0);
        });
    });

    describe('getLatestVersion', () => {
        it('should return the latest version', async () => {
            await manager.createVersion({ totalFiles: 1, totalTokens: 100 }, {}, 'First');
            await manager.createVersion({ totalFiles: 2, totalTokens: 200 }, {}, 'Second');

            const latest = await manager.getLatestVersion();

            expect(latest).not.toBeNull();
            expect(latest.summary.totalTokens).toBe(200);
        });

        it('should return null when no versions exist', async () => {
            const latest = await manager.getLatestVersion();
            expect(latest).toBeNull();
        });
    });
});
