/**
 * Tests for Performance Dashboard (FEAT-001)
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PerformanceDashboard } from '../lib/analyzers/performance-dashboard.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('PerformanceDashboard', () => {
  let tempDir;
  let dashboard;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-dashboard-test-'));
    dashboard = new PerformanceDashboard({
      projectRoot: tempDir,
      storagePath: path.join(tempDir, '.ctxman', 'metrics'),
    });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    test('creates instance with default options', () => {
      const dash = new PerformanceDashboard();
      expect(dash.projectRoot).toBe(process.cwd());
      expect(dash.metrics).toEqual([]);
    });

    test('creates instance with custom options', () => {
      const dash = new PerformanceDashboard({
        projectRoot: '/custom/path',
        storagePath: '/custom/metrics',
      });
      expect(dash.projectRoot).toBe('/custom/path');
      expect(dash.storagePath).toBe('/custom/metrics');
    });
  });

  describe('Metrics Collection', () => {
    test('startAnalysis creates current metrics object', () => {
      dashboard.startAnalysis();
      expect(dashboard.currentMetrics).toBeDefined();
      expect(dashboard.currentMetrics.id).toMatch(/^perf-/);
      expect(dashboard.currentMetrics.startedAt).toBeDefined();
      expect(dashboard.currentMetrics.phases).toEqual({});
    });

    test('recordPhase adds phase data', () => {
      dashboard.startAnalysis();
      dashboard.recordPhase('discovery', 150, { fileCount: 100 });

      expect(dashboard.currentMetrics.phases.discovery).toBeDefined();
      expect(dashboard.currentMetrics.phases.discovery.duration).toBe(150);
      expect(dashboard.currentMetrics.phases.discovery.fileCount).toBe(100);
    });

    test('endAnalysis completes metrics', () => {
      dashboard.startAnalysis();
      dashboard.recordPhase('analysis', 200);

      const startTime = dashboard.startTime;
      expect(startTime).toBeDefined();

      dashboard.endAnalysis({
        totalFiles: 50,
        totalTokens: 10000,
        cacheHits: 10,
        cacheMisses: 5,
      });

      expect(dashboard.currentMetrics.completedAt).toBeDefined();
      expect(dashboard.currentMetrics.totalDuration).toBeDefined();
      expect(dashboard.currentMetrics.result.totalFiles).toBe(50);
      expect(dashboard.currentMetrics.result.totalTokens).toBe(10000);
      // Note: metrics are persisted and cleared after endAnalysis
      // Verify via loadMetrics instead
      const saved = dashboard.loadMetrics();
      expect(saved.length).toBeGreaterThanOrEqual(1);
    });

    test('generateId creates unique IDs', () => {
      const id1 = dashboard.generateId();
      const id2 = dashboard.generateId();
      expect(id1).toMatch(/^perf-/);
      expect(id2).toMatch(/^perf-/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('Metrics Persistence', () => {
    test('persist saves metrics to file', () => {
      dashboard.startAnalysis();
      dashboard.recordPhase('test', 100);
      dashboard.endAnalysis({ totalFiles: 10, totalTokens: 1000 });

      const metricsFile = path.join(dashboard.storagePath, 'metrics.json');
      expect(fs.existsSync(metricsFile)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
      expect(saved.length).toBe(1);
      expect(saved[0].result.totalFiles).toBe(10);
    });

    test('loadMetrics retrieves saved metrics', () => {
      // Create and save metrics
      dashboard.startAnalysis();
      dashboard.endAnalysis({ totalFiles: 5, totalTokens: 500 });

      // Create new dashboard instance
      const dash2 = new PerformanceDashboard({
        projectRoot: tempDir,
        storagePath: dashboard.storagePath,
      });

      const loaded = dash2.loadMetrics();
      expect(loaded.length).toBe(1);
      expect(loaded[0].result.totalFiles).toBe(5);
    });

    test('loadMetrics returns empty array for missing file', () => {
      const dash = new PerformanceDashboard({
        storagePath: '/nonexistent/path',
      });
      expect(dash.loadMetrics()).toEqual([]);
    });
  });

  describe('Aggregated Metrics', () => {
    test('getAggregatedMetrics returns empty structure for no data', () => {
      const metrics = dashboard.getAggregatedMetrics('7d');
      expect(metrics.totalAnalyses).toBe(0);
      expect(metrics.avgDuration).toBe(0);
      expect(metrics.cacheHitRate).toBe(0);
    });

    test('getAggregatedMetrics calculates averages correctly', () => {
      // Add multiple metric entries
      for (let i = 0; i < 3; i++) {
        dashboard.startAnalysis();
        dashboard.recordPhase('analysis', 100 * (i + 1));
        dashboard.endAnalysis({
          totalFiles: 10 * (i + 1),
          totalTokens: 1000 * (i + 1),
          cacheHits: i + 1,
          cacheMisses: 2,
        });
      }

      const metrics = dashboard.getAggregatedMetrics('all');

      expect(metrics.totalAnalyses).toBe(3);
      expect(metrics.avgFiles).toBe(20); // (10 + 20 + 30) / 3
      expect(metrics.avgTokens).toBe(2000); // (1000 + 2000 + 3000) / 3
    });

    test('getAggregatedMetrics calculates cache hit rate', () => {
      dashboard.startAnalysis();
      dashboard.endAnalysis({
        totalFiles: 10,
        totalTokens: 1000,
        cacheHits: 8,
        cacheMisses: 2,
      });

      const metrics = dashboard.getAggregatedMetrics('all');
      expect(metrics.cacheHitRate).toBe(80); // 8 / 10 * 100
    });

    test('getAggregatedMetrics respects period filter', () => {
      // Add old metric (manually create with old date)
      const oldMetrics = [
        {
          id: 'perf-old',
          startedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
          completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          totalDuration: 100,
          result: { totalFiles: 5, totalTokens: 500 },
        },
      ];

      const metricsFile = path.join(dashboard.storagePath, 'metrics.json');
      fs.mkdirSync(dashboard.storagePath, { recursive: true });
      fs.writeFileSync(metricsFile, JSON.stringify(oldMetrics));

      // Add new metric
      dashboard.startAnalysis();
      dashboard.endAnalysis({ totalFiles: 10, totalTokens: 1000 });

      const metrics7d = dashboard.getAggregatedMetrics('7d');
      expect(metrics7d.totalAnalyses).toBe(1); // Only the new one

      const metricsAll = dashboard.getAggregatedMetrics('all');
      expect(metricsAll.totalAnalyses).toBe(2); // Both
    });

    test('getCutoffDate returns correct dates', () => {
      const now = Date.now();

      const cutoff7d = dashboard.getCutoffDate('7d');
      expect(now - cutoff7d.getTime()).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);

      const cutoff30d = dashboard.getCutoffDate('30d');
      expect(now - cutoff30d.getTime()).toBeLessThan(30.1 * 24 * 60 * 60 * 1000);

      const cutoffAll = dashboard.getCutoffDate('all');
      expect(cutoffAll.getTime()).toBe(0);
    });
  });

  describe('Phase Breakdown', () => {
    test('aggregatePhases combines phase data', () => {
      const metrics = [
        { phases: { discovery: { duration: 100 }, analysis: { duration: 200 } } },
        { phases: { discovery: { duration: 150 }, analysis: { duration: 250 } } },
      ];

      const phases = dashboard.aggregatePhases(metrics);

      expect(phases.discovery.totalDuration).toBe(250);
      expect(phases.discovery.count).toBe(2);
      expect(phases.discovery.avgDuration).toBe(125);
      expect(phases.analysis.avgDuration).toBe(225);
    });
  });

  describe('Trend Calculation', () => {
    test('calculateTrend groups by day', () => {
      const metrics = [
        {
          startedAt: '2024-01-01T10:00:00.000Z',
          totalDuration: 100,
          result: { totalTokens: 1000 },
        },
        {
          startedAt: '2024-01-01T14:00:00.000Z',
          totalDuration: 150,
          result: { totalTokens: 1500 },
        },
        {
          startedAt: '2024-01-02T10:00:00.000Z',
          totalDuration: 200,
          result: { totalTokens: 2000 },
        },
      ];

      const trend = dashboard.calculateTrend(metrics);

      expect(trend.length).toBe(2);
      expect(trend[0].date).toBe('2024-01-01');
      expect(trend[0].count).toBe(2);
      expect(trend[0].avgDuration).toBe(125); // (100 + 150) / 2
      expect(trend[1].count).toBe(1);
    });
  });

  describe('Bottleneck Identification', () => {
    test('identifyBottlenecks detects slow phases', () => {
      const metrics = {
        totalAnalyses: 5,
        avgDuration: 500,
        avgFiles: 100,
        cacheHitRate: 80,
        phaseBreakdown: {
          discovery: { avgDuration: 50, count: 5 },
          analysis: { avgDuration: 400, count: 5 }, // 80% of time
        },
      };

      const bottlenecks = dashboard.identifyBottlenecks(metrics);

      expect(bottlenecks.length).toBeGreaterThan(0);
      expect(bottlenecks[0].type).toBe('phase');
      expect(bottlenecks[0].name).toBe('analysis');
      expect(bottlenecks[0].percentage).toBe(80);
    });

    test('identifyBottlenecks detects low cache hit rate', () => {
      const metrics = {
        totalAnalyses: 5,
        avgDuration: 100,
        avgFiles: 50,
        cacheHitRate: 30, // Below 50%
        phaseBreakdown: {},
      };

      const bottlenecks = dashboard.identifyBottlenecks(metrics);

      expect(bottlenecks.some((b) => b.type === 'cache')).toBe(true);
    });

    test('identifyBottlenecks detects large projects', () => {
      const metrics = {
        totalAnalyses: 5,
        avgDuration: 100,
        avgFiles: 2000, // Over 1000
        cacheHitRate: 80,
        phaseBreakdown: {},
      };

      const bottlenecks = dashboard.identifyBottlenecks(metrics);

      expect(bottlenecks.some((b) => b.type === 'file_count')).toBe(true);
    });
  });

  describe('Recommendations', () => {
    test('generateRecommendations creates actionable items', () => {
      const metrics = {
        totalAnalyses: 5,
        avgDuration: 100,
        avgFiles: 100,
        avgTokens: 100000, // Over 50K
        cacheHitRate: 20, // Low
        phaseBreakdown: {},
      };

      const bottlenecks = dashboard.identifyBottlenecks(metrics);
      const recommendations = dashboard.generateRecommendations(metrics, bottlenecks);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some((r) => r.type === 'context')).toBe(true);
      expect(recommendations.some((r) => r.type === 'cache')).toBe(true);
    });

    test('generateRecommendations deduplicates messages', () => {
      const metrics = {
        totalAnalyses: 5,
        avgDuration: 100,
        avgFiles: 100,
        avgTokens: 100000,
        cacheHitRate: 20,
        phaseBreakdown: {},
      };

      const bottlenecks = [
        { type: 'test', severity: 'high', suggestion: 'Enable caching' },
        { type: 'other', severity: 'medium', suggestion: 'Enable caching' },
      ];

      const recommendations = dashboard.generateRecommendations(metrics, bottlenecks);

      const cachingRecs = recommendations.filter((r) => r.message === 'Enable caching');
      expect(cachingRecs.length).toBeLessThanOrEqual(1);
    });
  });

  describe('ASCII Charts', () => {
    test('generateBarChart creates filled bars', () => {
      const bar = dashboard.generateBarChart(50, 100, 10);
      expect(bar).toBe('▓▓▓▓▓░░░░░');
    });

    test('generateBarChart handles zero values', () => {
      const bar = dashboard.generateBarChart(0, 100, 10);
      expect(bar).toBe('░░░░░░░░░░');
    });

    test('generateBarChart handles max zero', () => {
      const bar = dashboard.generateBarChart(50, 0, 10);
      expect(bar).toBe('░░░░░░░░░░');
    });

    test('generateSparkline creates trend visualization', () => {
      const sparkline = dashboard.generateSparkline([10, 20, 30, 40, 50], 5);
      expect(sparkline.length).toBe(5);
      expect(sparkline).toMatch(/^[▁▂▃▄▅▆▇█]+$/);
    });

    test('generateSparkline handles empty values', () => {
      const sparkline = dashboard.generateSparkline([], 10);
      expect(sparkline).toBe('░'.repeat(10));
    });

    test('generateTrendChart creates multi-line chart', () => {
      const trend = [
        { date: '2024-01-01', avgDuration: 100 },
        { date: '2024-01-02', avgDuration: 200 },
        { date: '2024-01-03', avgDuration: 150 },
      ];

      const chart = dashboard.generateTrendChart(trend, 'avgDuration', 20, 4);
      const lines = chart.split('\n');

      expect(lines.length).toBe(5); // 4 data lines + 1 axis line
      expect(lines[0]).toMatch(/^│/);
      expect(lines[4]).toMatch(/^└/);
    });
  });

  describe('Rendering', () => {
    test('render generates dashboard output', () => {
      // Add some test data
      dashboard.startAnalysis();
      dashboard.recordPhase('discovery', 100, { fileCount: 50 });
      dashboard.recordPhase('analysis', 200, { totalTokens: 5000 });
      dashboard.endAnalysis({
        totalFiles: 50,
        totalTokens: 5000,
        cacheHits: 8,
        cacheMisses: 2,
      });

      const output = dashboard.render({ period: 'all' });

      expect(output).toContain('PERFORMANCE DASHBOARD');
      expect(output).toContain('Total Analyses');
      expect(output).toContain('Cache Hit Rate');
      expect(output).toContain('Phase Breakdown');
    });

    test('render includes bottlenecks when present', () => {
      // Create multiple metrics with low cache hit rate to trigger cache bottleneck
      // (requires totalAnalyses > 2 for cache bottleneck detection)
      for (let i = 0; i < 3; i++) {
        dashboard.startAnalysis();
        dashboard.recordPhase('analysis', 100);
        dashboard.endAnalysis({
          totalFiles: 50,
          totalTokens: 5000,
          cacheHits: 2,
          cacheMisses: 8, // 20% hit rate - will trigger cache bottleneck
        });
      }

      const output = dashboard.render({ period: 'all' });

      // Should show bottlenecks section (cache bottleneck in this case)
      expect(output).toContain('Bottlenecks');
    });

    test('render includes recommendations when present', () => {
      dashboard.startAnalysis();
      dashboard.endAnalysis({
        totalFiles: 50,
        totalTokens: 100000, // High token count
      });

      const output = dashboard.render({ period: 'all' });

      expect(output).toContain('Optimization Recommendations');
    });

    test('display outputs to console', () => {
      const consoleSpy = [];
      const originalLog = console.log;
      console.log = (...args) => consoleSpy.push(args.join(' '));

      dashboard.startAnalysis();
      dashboard.endAnalysis({ totalFiles: 10, totalTokens: 1000 });
      dashboard.display({ period: 'all' });

      console.log = originalLog;

      expect(consoleSpy.length).toBeGreaterThan(0);
      expect(consoleSpy[0]).toContain('PERFORMANCE DASHBOARD');
    });
  });

  describe('Average Calculation', () => {
    test('average calculates correctly', () => {
      expect(dashboard.average([10, 20, 30])).toBe(20);
      expect(dashboard.average([5, 5, 5, 5])).toBe(5);
      expect(dashboard.average([])).toBe(0);
    });
  });

  describe('Empty Metrics Handling', () => {
    test('getEmptyMetrics returns proper structure', () => {
      const empty = dashboard.getEmptyMetrics();

      expect(empty.totalAnalyses).toBe(0);
      expect(empty.avgDuration).toBe(0);
      expect(empty.avgFiles).toBe(0);
      expect(empty.avgTokens).toBe(0);
      expect(empty.cacheHitRate).toBe(0);
      expect(empty.phaseBreakdown).toEqual({});
      expect(empty.trend).toEqual([]);
    });
  });
});
