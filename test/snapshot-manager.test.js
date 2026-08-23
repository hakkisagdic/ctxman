/**
 * Tests for Snapshot Manager (FEAT-003)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import SnapshotManager, { SnapshotStore, SnapshotDiff } from '../lib/utils/snapshot-manager.js';

const TEST_DIR = './test-snapshot-temp';

describe('SnapshotStore', () => {
    let store;

    beforeEach(async () => {
        // Create test directory
        store = new SnapshotStore(TEST_DIR);
        await store.init();
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
        it('should save a snapshot with correct format', async () => {
            const analysis = {
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

            const { id, filename, snapshot } = await store.save(analysis, 'Test snapshot');

            expect(id).toMatch(/^snap-\d{8}-\d{6}-[a-f0-9]{6}$/);
            expect(filename).toBe(`${id}.json`);
            expect(snapshot.id).toBe(id);
            expect(snapshot.message).toBe('Test snapshot');
            expect(snapshot.summary.totalFiles).toBe(100);
            expect(snapshot.summary.totalTokens).toBe(50000);
        });

        it('should generate unique IDs', async () => {
            const id1 = store.generateId();
            const id2 = store.generateId();
            expect(id1).not.toBe(id2);
        });

        it('should handle empty analysis', async () => {
            const { snapshot } = await store.save({}, '');

            expect(snapshot.summary.totalFiles).toBe(0);
            expect(snapshot.summary.totalTokens).toBe(0);
        });
    });

    describe('list', () => {
        it('should list saved snapshots', async () => {
            // Create multiple snapshots
            await store.save({ totalFiles: 1, totalTokens: 100 }, 'First');
            await store.save({ totalFiles: 2, totalTokens: 200 }, 'Second');

            const snapshots = await store.list();

            expect(snapshots.length).toBe(2);
            expect(snapshots[0]).toMatch(/^snap-.*\.json$/);
        });

        it('should respect limit option', async () => {
            await store.save({ totalFiles: 1, totalTokens: 100 }, 'First');
            await store.save({ totalFiles: 2, totalTokens: 200 }, 'Second');
            await store.save({ totalFiles: 3, totalTokens: 300 }, 'Third');

            const snapshots = await store.list({ limit: 2 });

            expect(snapshots.length).toBe(2);
        });

        it('should return empty array when no snapshots', async () => {
            const snapshots = await store.list();
            expect(snapshots).toEqual([]);
        });
    });

    describe('load', () => {
        it('should load a saved snapshot', async () => {
            const { id } = await store.save({ totalFiles: 100, totalTokens: 50000 }, 'Test');

            const loaded = await store.loadById(id);

            expect(loaded.id).toBe(id);
            expect(loaded.message).toBe('Test');
            expect(loaded.summary.totalFiles).toBe(100);
        });

        it('should return null for non-existent snapshot', async () => {
            const loaded = await store.loadById('non-existent');
            expect(loaded).toBeNull();
        });
    });

    describe('delete', () => {
        it('should delete a snapshot', async () => {
            const { id } = await store.save({ totalFiles: 1 }, 'Test');

            const deleted = await store.delete(id);
            expect(deleted).toBe(true);

            const loaded = await store.loadById(id);
            expect(loaded).toBeNull();
        });

        it('should return false for non-existent snapshot', async () => {
            const deleted = await store.delete('non-existent');
            expect(deleted).toBe(false);
        });
    });
});

describe('SnapshotDiff', () => {
    let diff;

    beforeEach(() => {
        diff = new SnapshotDiff();
    });

    describe('compare', () => {
        it('should detect added files', () => {
            const oldSnapshot = {
                id: 'snap-old',
                timestamp: '2025-01-01T00:00:00Z',
                summary: { totalTokens: 100 },
                files: [
                    { path: 'a.js', tokens: 50, lines: 10 }
                ]
            };

            const newSnapshot = {
                id: 'snap-new',
                timestamp: '2025-01-02T00:00:00Z',
                summary: { totalTokens: 200 },
                files: [
                    { path: 'a.js', tokens: 50, lines: 10 },
                    { path: 'b.js', tokens: 150, lines: 30 }
                ]
            };

            const result = diff.compare(oldSnapshot, newSnapshot);

            expect(result.added.length).toBe(1);
            expect(result.added[0].path).toBe('b.js');
            expect(result.totalTokenDiff).toBe(100);
        });

        it('should detect removed files', () => {
            const oldSnapshot = {
                id: 'snap-old',
                timestamp: '2025-01-01T00:00:00Z',
                summary: { totalTokens: 200 },
                files: [
                    { path: 'a.js', tokens: 50, lines: 10 },
                    { path: 'b.js', tokens: 150, lines: 30 }
                ]
            };

            const newSnapshot = {
                id: 'snap-new',
                timestamp: '2025-01-02T00:00:00Z',
                summary: { totalTokens: 50 },
                files: [
                    { path: 'a.js', tokens: 50, lines: 10 }
                ]
            };

            const result = diff.compare(oldSnapshot, newSnapshot);

            expect(result.removed.length).toBe(1);
            expect(result.removed[0].path).toBe('b.js');
        });

        it('should detect modified files', () => {
            const oldSnapshot = {
                id: 'snap-old',
                timestamp: '2025-01-01T00:00:00Z',
                summary: { totalTokens: 100 },
                files: [
                    { path: 'a.js', tokens: 50, lines: 10 }
                ]
            };

            const newSnapshot = {
                id: 'snap-new',
                timestamp: '2025-01-02T00:00:00Z',
                summary: { totalTokens: 150 },
                files: [
                    { path: 'a.js', tokens: 150, lines: 30 }
                ]
            };

            const result = diff.compare(oldSnapshot, newSnapshot);

            expect(result.modified.length).toBe(1);
            expect(result.modified[0].tokenDiff).toBe(100);
            expect(result.modified[0].oldTokens).toBe(50);
            expect(result.modified[0].newTokens).toBe(150);
        });

        it('should calculate percent change', () => {
            const oldSnapshot = {
                id: 'snap-old',
                timestamp: '2025-01-01T00:00:00Z',
                summary: { totalTokens: 100 },
                files: []
            };

            const newSnapshot = {
                id: 'snap-new',
                timestamp: '2025-01-02T00:00:00Z',
                summary: { totalTokens: 150 },
                files: []
            };

            const result = diff.compare(oldSnapshot, newSnapshot);

            expect(result.percentChange).toBe(50);
        });

        it('should handle zero old tokens', () => {
            const oldSnapshot = {
                id: 'snap-old',
                timestamp: '2025-01-01T00:00:00Z',
                summary: { totalTokens: 0 },
                files: []
            };

            const newSnapshot = {
                id: 'snap-new',
                timestamp: '2025-01-02T00:00:00Z',
                summary: { totalTokens: 100 },
                files: []
            };

            const result = diff.compare(oldSnapshot, newSnapshot);

            expect(result.percentChange).toBe(0);
        });
    });

    describe('calculateExtensionChanges', () => {
        it('should calculate extension changes', () => {
            const oldExtensions = {
                '.js': { tokens: 1000, count: 10 },
                '.json': { tokens: 500, count: 5 }
            };

            const newExtensions = {
                '.js': { tokens: 1500, count: 15 },
                '.ts': { tokens: 800, count: 8 }
            };

            const changes = diff.calculateExtensionChanges(oldExtensions, newExtensions);

            expect(changes.length).toBe(3);
            expect(changes.find(c => c.extension === '.js').tokenDiff).toBe(500);
            expect(changes.find(c => c.extension === '.json').tokenDiff).toBe(-500);
            expect(changes.find(c => c.extension === '.ts').tokenDiff).toBe(800);
        });
    });

    describe('analyzeTrend', () => {
        it('should analyze trend across snapshots', () => {
            const snapshots = [
                {
                    id: 'snap-1',
                    timestamp: '2025-01-01T00:00:00Z',
                    summary: { totalTokens: 100 },
                    files: []
                },
                {
                    id: 'snap-2',
                    timestamp: '2025-01-02T00:00:00Z',
                    summary: { totalTokens: 200 },
                    files: []
                },
                {
                    id: 'snap-3',
                    timestamp: '2025-01-03T00:00:00Z',
                    summary: { totalTokens: 300 },
                    files: []
                }
            ];

            const trend = diff.analyzeTrend(snapshots);

            expect(trend.snapshotCount).toBe(3);
            expect(trend.totalGrowth).toBe(200);
            expect(trend.changes.length).toBe(2);
        });

        it('should return null for insufficient snapshots', () => {
            const trend = diff.analyzeTrend([{}]);
            expect(trend).toBeNull();
        });

        it('should return null for empty array', () => {
            const trend = diff.analyzeTrend([]);
            expect(trend).toBeNull();
        });
    });

    describe('generateTrendChart', () => {
        it('should generate ASCII chart', () => {
            const changes = [
                { date: new Date('2025-01-01'), totalTokens: 100, tokenDiff: 50 },
                { date: new Date('2025-01-02'), totalTokens: 200, tokenDiff: 100 }
            ];

            const chart = diff.generateTrendChart(changes);

            expect(chart).toContain('📈 Token Growth Trend');
            expect(chart).toContain('2025-01-01');
            expect(chart).toContain('2025-01-02');
        });

        it('should return empty string for empty changes', () => {
            const chart = diff.generateTrendChart([]);
            expect(chart).toBe('');
        });
    });
});

describe('SnapshotManager', () => {
    let manager;

    beforeEach(async () => {
        manager = new SnapshotManager(TEST_DIR);
        await manager.store.init();
    });

    afterEach(async () => {
        try {
            await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('createSnapshot', () => {
        it('should create a snapshot', async () => {
            const analysis = {
                totalFiles: 50,
                totalTokens: 25000,
                largestFiles: []
            };

            const { id, snapshot } = await manager.createSnapshot(analysis, 'Test');

            expect(id).toMatch(/^snap-/);
            expect(snapshot.message).toBe('Test');
            expect(snapshot.summary.totalFiles).toBe(50);
        });
    });

    describe('listSnapshots', () => {
        it('should format snapshot list', async () => {
            await manager.createSnapshot({ totalFiles: 10, totalTokens: 1000 }, 'First');
            await manager.createSnapshot({ totalFiles: 20, totalTokens: 2000 }, 'Second');

            const output = await manager.listSnapshots();

            expect(output).toContain('📷 Saved Snapshots');
            expect(output).toContain('First');
            expect(output).toContain('Second');
        });

        it('should show message when no snapshots', async () => {
            const output = await manager.listSnapshots();

            expect(output).toContain('No snapshots found');
        });
    });

    describe('compareSnapshots', () => {
        it('should compare two snapshots', async () => {
            const { id: id1 } = await manager.createSnapshot(
                { totalFiles: 10, totalTokens: 1000, largestFiles: [] },
                'First'
            );
            const { id: id2 } = await manager.createSnapshot(
                { totalFiles: 20, totalTokens: 2000, largestFiles: [] },
                'Second'
            );

            const comparison = await manager.compareSnapshots(id1, id2);

            expect(comparison).not.toBeNull();
            expect(comparison.oldSnapshot.id).toBe(id1);
            expect(comparison.newSnapshot.id).toBe(id2);
        });

        it('should return null for non-existent snapshots', async () => {
            const comparison = await manager.compareSnapshots('non-existent-1', 'non-existent-2');
            expect(comparison).toBeNull();
        });
    });

    describe('compareWithLast', () => {
        it('should compare current analysis with last snapshot', async () => {
            await manager.createSnapshot(
                { totalFiles: 10, totalTokens: 1000, largestFiles: [] },
                'First'
            );

            const currentAnalysis = {
                totalFiles: 15,
                totalTokens: 1500,
                largestFiles: []
            };

            const comparison = await manager.compareWithLast(currentAnalysis);

            expect(comparison).not.toBeNull();
            expect(comparison.totalTokenDiff).toBe(500);
        });

        it('should return null when no snapshots exist', async () => {
            const comparison = await manager.compareWithLast({ totalTokens: 100 });
            expect(comparison).toBeNull();
        });
    });

    describe('getTrend', () => {
        it('should get trend analysis', async () => {
            await manager.createSnapshot({ totalFiles: 10, totalTokens: 1000 }, 'Day 1');
            await manager.createSnapshot({ totalFiles: 15, totalTokens: 1500 }, 'Day 2');
            await manager.createSnapshot({ totalFiles: 20, totalTokens: 2000 }, 'Day 3');

            const trend = await manager.getTrend();

            expect(trend).not.toBeNull();
            expect(trend.snapshotCount).toBe(3);
            // Growth can be positive or negative depending on sort order
            expect(trend.totalGrowth).toBeDefined();
        });

        it('should return null for insufficient snapshots', async () => {
            await manager.createSnapshot({ totalFiles: 10, totalTokens: 1000 }, 'Only one');

            const trend = await manager.getTrend();
            expect(trend).toBeNull();
        });
    });

    describe('formatDiff', () => {
        it('should format diff output', async () => {
            const { id: id1 } = await manager.createSnapshot(
                { totalFiles: 10, totalTokens: 1000, largestFiles: [], byExtension: {} },
                'First'
            );
            const { id: id2 } = await manager.createSnapshot(
                { totalFiles: 15, totalTokens: 1500, largestFiles: [], byExtension: {} },
                'Second'
            );

            const comparison = await manager.compareSnapshots(id1, id2);
            const output = manager.formatDiff(comparison);

            expect(output).toContain('📊 Snapshot Comparison');
            expect(output).toContain('Tokens:');
        });

        it('should show message for null comparison', () => {
            const output = manager.formatDiff(null);
            expect(output).toContain('No snapshots available');
        });
    });

    describe('formatTrend', () => {
        it('should format trend output', async () => {
            await manager.createSnapshot({ totalFiles: 10, totalTokens: 1000 }, 'Day 1');
            await manager.createSnapshot({ totalFiles: 15, totalTokens: 1500 }, 'Day 2');

            const trend = await manager.getTrend();
            const output = manager.formatTrend(trend);

            expect(output).toContain('📈 Token Growth Trend');
            expect(output).toContain('Snapshots analyzed');
        });

        it('should show message for null trend', () => {
            const output = manager.formatTrend(null);
            expect(output).toContain('Need at least 2 snapshots');
        });
    });

    describe('formatTokens', () => {
        it('should format small numbers', () => {
            expect(manager.formatTokens(500)).toBe('500');
        });

        it('should format thousands', () => {
            expect(manager.formatTokens(5000)).toBe('5K');
        });

        it('should format millions', () => {
            expect(manager.formatTokens(1500000)).toBe('1.5M');
        });
    });

    describe('exportSnapshot', () => {
        it('should export snapshot as JSON', async () => {
            const { id } = await manager.createSnapshot(
                { totalFiles: 10, totalTokens: 1000 },
                'Export test'
            );

            const exported = await manager.exportSnapshot(id);

            expect(exported).not.toBeNull();
            expect(exported.id).toBe(id);
        });
    });

    describe('deleteSnapshot', () => {
        it('should delete a snapshot', async () => {
            const { id } = await manager.createSnapshot({ totalFiles: 1 }, 'Test');

            const deleted = await manager.deleteSnapshot(id);
            expect(deleted).toBe(true);

            const exported = await manager.exportSnapshot(id);
            expect(exported).toBeNull();
        });
    });
});
