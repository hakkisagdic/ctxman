/**
 * Performance Dashboard - Text-based ASCII charts for terminal output (FEAT-001)
 *
 * A lightweight, text-based performance dashboard that displays metrics
 * with ASCII visualization without requiring Ink/React dependencies.
 */

import fs from 'fs';
import path from 'path';
import { TokenAnalyzer } from '../../index.js';

/**
 * PerformanceDashboard class
 * Generates text-based performance metrics with ASCII charts
 */
export class PerformanceDashboard {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || process.cwd();
        this.storagePath = options.storagePath || path.join(this.projectRoot, '.ctxman', 'metrics');
        this.metrics = [];
        this.currentMetrics = null;
        this.startTime = null;
    }

    /**
     * Start tracking a new analysis session
     */
    startAnalysis() {
        this.startTime = Date.now();
        this.currentMetrics = {
            id: this.generateId(),
            startedAt: new Date().toISOString(),
            phases: {},
            result: null
        };
    }

    /**
     * Record a phase during analysis
     * @param {string} name - Phase name (e.g., 'discovery', 'analysis', 'output')
     * @param {number} duration - Duration in milliseconds
     * @param {object} metadata - Additional metadata
     */
    recordPhase(name, duration, metadata = {}) {
        if (!this.currentMetrics) {
            this.currentMetrics = {
                id: this.generateId(),
                startedAt: new Date().toISOString(),
                phases: {}
            };
        }
        this.currentMetrics.phases[name] = {
            duration,
            ...metadata
        };
    }

    /**
     * End the current analysis session
     * @param {object} result - Analysis result with totalFiles, totalTokens, cacheHits, cacheMisses
     */
    endAnalysis(result) {
        if (!this.currentMetrics) return;

        const endTime = Date.now();
        this.currentMetrics.completedAt = new Date().toISOString();
        this.currentMetrics.totalDuration = endTime - this.startTime;
        this.currentMetrics.result = {
            totalFiles: result.totalFiles || 0,
            totalTokens: result.totalTokens || 0,
            cacheHits: result.cacheHits || 0,
            cacheMisses: result.cacheMisses || 0,
            totalBytes: result.totalBytes || 0,
            totalLines: result.totalLines || 0
        };

        this.metrics.push(this.currentMetrics);
        this.persist();
    }

    /**
     * Generate unique ID for metrics entry
     */
    generateId() {
        return `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Persist metrics to storage
     */
    persist() {
        try {
            // Ensure directory exists
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath, { recursive: true });
            }

            const metricsFile = path.join(this.storagePath, 'metrics.json');
            const data = fs.existsSync(metricsFile)
                ? JSON.parse(fs.readFileSync(metricsFile, 'utf8'))
                : [];

            data.push(...this.metrics);
            fs.writeFileSync(metricsFile, JSON.stringify(data, null, 2));

            // Clear in-memory metrics after persisting
            this.metrics = [];
        } catch (error) {
            // Silently fail - metrics are best-effort
        }
    }

    /**
     * Load historical metrics from storage
     */
    loadMetrics() {
        try {
            const metricsFile = path.join(this.storagePath, 'metrics.json');
            if (fs.existsSync(metricsFile)) {
                return JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
            }
        } catch (error) {
            // Return empty array if loading fails
        }
        return [];
    }

    /**
     * Get aggregated metrics for a time period
     * @param {string} period - Period string ('7d', '30d', 'all')
     */
    getAggregatedMetrics(period = '7d') {
        const historicalMetrics = this.loadMetrics();
        const allMetrics = [...historicalMetrics, ...this.metrics];

        if (allMetrics.length === 0) {
            return this.getEmptyMetrics();
        }

        const cutoff = this.getCutoffDate(period);
        const filtered = allMetrics.filter(m =>
            new Date(m.startedAt) >= cutoff
        );

        if (filtered.length === 0) {
            return this.getEmptyMetrics();
        }

        return {
            totalAnalyses: filtered.length,
            avgDuration: this.average(filtered.map(m => m.totalDuration || 0)),
            avgFiles: this.average(filtered.map(m => m.result?.totalFiles || 0)),
            avgTokens: this.average(filtered.map(m => m.result?.totalTokens || 0)),
            cacheHitRate: this.calculateCacheHitRate(filtered),
            totalFiles: filtered.reduce((sum, m) => sum + (m.result?.totalFiles || 0), 0),
            totalTokens: filtered.reduce((sum, m) => sum + (m.result?.totalTokens || 0), 0),
            phaseBreakdown: this.aggregatePhases(filtered),
            trend: this.calculateTrend(filtered),
            period
        };
    }

    /**
     * Get empty metrics structure
     */
    getEmptyMetrics() {
        return {
            totalAnalyses: 0,
            avgDuration: 0,
            avgFiles: 0,
            avgTokens: 0,
            cacheHitRate: 0,
            totalFiles: 0,
            totalTokens: 0,
            phaseBreakdown: {},
            trend: [],
            period: '7d'
        };
    }

    /**
     * Get cutoff date for period
     * @param {string} period - Period string
     */
    getCutoffDate(period) {
        const now = new Date();
        switch (period) {
            case '7d':
                return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            case '30d':
                return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            case 'all':
            default:
                return new Date(0); // Beginning of time
        }
    }

    /**
     * Calculate average of numbers
     * @param {number[]} values
     */
    average(values) {
        if (values.length === 0) return 0;
        const sum = values.reduce((a, b) => a + b, 0);
        return Math.round(sum / values.length);
    }

    /**
     * Calculate cache hit rate
     * @param {object[]} metrics
     */
    calculateCacheHitRate(metrics) {
        let totalHits = 0;
        let totalRequests = 0;

        for (const m of metrics) {
            if (m.result) {
                totalHits += m.result.cacheHits || 0;
                totalRequests += (m.result.cacheHits || 0) + (m.result.cacheMisses || 0);
            }
        }

        if (totalRequests === 0) return 0;
        return Math.round((totalHits / totalRequests) * 100);
    }

    /**
     * Aggregate phase durations across metrics
     * @param {object[]} metrics
     */
    aggregatePhases(metrics) {
        const phases = {};

        for (const m of metrics) {
            if (m.phases) {
                for (const [name, data] of Object.entries(m.phases)) {
                    if (!phases[name]) {
                        phases[name] = { totalDuration: 0, count: 0 };
                    }
                    phases[name].totalDuration += data.duration || 0;
                    phases[name].count++;
                }
            }
        }

        // Calculate averages
        for (const name of Object.keys(phases)) {
            phases[name].avgDuration = Math.round(
                phases[name].totalDuration / phases[name].count
            );
        }

        return phases;
    }

    /**
     * Calculate trend data for charts
     * @param {object[]} metrics
     */
    calculateTrend(metrics) {
        // Sort by date
        const sorted = [...metrics].sort((a, b) =>
            new Date(a.startedAt) - new Date(b.startedAt)
        );

        // Group by day
        const byDay = {};
        for (const m of sorted) {
            const day = m.startedAt.split('T')[0];
            if (!byDay[day]) {
                byDay[day] = { count: 0, totalDuration: 0, totalTokens: 0 };
            }
            byDay[day].count++;
            byDay[day].totalDuration += m.totalDuration || 0;
            byDay[day].totalTokens += m.result?.totalTokens || 0;
        }

        // Convert to array
        return Object.entries(byDay)
            .map(([date, data]) => ({
                date,
                count: data.count,
                avgDuration: Math.round(data.totalDuration / data.count),
                totalTokens: data.totalTokens
            }))
            .slice(-30); // Last 30 days
    }

    /**
     * Identify performance bottlenecks
     * @param {object} metrics - Aggregated metrics
     */
    identifyBottlenecks(metrics) {
        const bottlenecks = [];
        const { phaseBreakdown, avgDuration, avgFiles } = metrics;

        // Check phase durations
        if (phaseBreakdown) {
            for (const [name, data] of Object.entries(phaseBreakdown)) {
                const percentage = avgDuration > 0
                    ? Math.round((data.avgDuration / avgDuration) * 100)
                    : 0;

                if (percentage > 40 && data.avgDuration > 100) {
                    bottlenecks.push({
                        type: 'phase',
                        name,
                        avgDuration: data.avgDuration,
                        percentage,
                        severity: percentage > 70 ? 'high' : 'medium'
                    });
                }
            }
        }

        // Check for large file counts
        if (avgFiles > 1000) {
            bottlenecks.push({
                type: 'file_count',
                name: 'Large project size',
                avgFiles,
                severity: 'medium',
                suggestion: 'Consider using .contextignore to exclude unnecessary files'
            });
        }

        // Check cache effectiveness
        if (metrics.cacheHitRate < 50 && metrics.totalAnalyses > 2) {
            bottlenecks.push({
                type: 'cache',
                name: 'Low cache hit rate',
                rate: metrics.cacheHitRate,
                severity: 'medium',
                suggestion: 'Cache warming may improve performance'
            });
        }

        // Sort by severity
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return bottlenecks.sort((a, b) =>
            severityOrder[a.severity] - severityOrder[b.severity]
        );
    }

    /**
     * Generate optimization recommendations
     * @param {object} metrics - Aggregated metrics
     * @param {object[]} bottlenecks - Identified bottlenecks
     */
    generateRecommendations(metrics, bottlenecks) {
        const recommendations = [];

        // Based on bottlenecks
        for (const b of bottlenecks) {
            if (b.suggestion) {
                recommendations.push({
                    type: 'performance',
                    priority: b.severity === 'high' ? 'high' : 'medium',
                    message: b.suggestion,
                    details: b
                });
            }
        }

        // Based on token counts
        if (metrics.avgTokens > 50000) {
            recommendations.push({
                type: 'context',
                priority: 'medium',
                message: 'Consider chunking for large context outputs',
                details: { avgTokens: metrics.avgTokens }
            });
        }

        // Based on file distribution
        if (metrics.avgFiles > 500) {
            recommendations.push({
                type: 'filtering',
                priority: 'low',
                message: 'Review .contextignore for unnecessary file types',
                details: { avgFiles: metrics.avgFiles }
            });
        }

        // Cache recommendation
        if (metrics.cacheHitRate < 30 && metrics.totalAnalyses > 1) {
            recommendations.push({
                type: 'cache',
                priority: 'medium',
                message: 'Enable caching for frequently analyzed files',
                details: { currentRate: metrics.cacheHitRate }
            });
        }

        // Remove duplicates by message
        const seen = new Set();
        return recommendations.filter(r => {
            if (seen.has(r.message)) return false;
            seen.add(r.message);
            return true;
        });
    }

    /**
     * Run analysis and collect current metrics
     * @param {object} options - Analysis options
     */
    async runAnalysis(options = {}) {
        this.startAnalysis();

        // Run discovery phase
        const discoveryStart = Date.now();
        const analyzer = new TokenAnalyzer(this.projectRoot, {
            ...options,
            simple: true,
            verbose: false,
            dashboard: true
        });

        const stats = analyzer.run();
        this.recordPhase('discovery', Date.now() - discoveryStart, {
            fileCount: stats.totalFiles
        });

        // Record analysis phase (approximate)
        const analysisDuration = stats.largestFiles?.length > 0
            ? Math.round((stats.totalTokens / 10000) * 100) // Estimate based on token count
            : 100;
        this.recordPhase('analysis', analysisDuration, {
            totalTokens: stats.totalTokens
        });

        // End analysis
        this.endAnalysis({
            totalFiles: stats.totalFiles,
            totalTokens: stats.totalTokens,
            totalBytes: stats.totalBytes,
            totalLines: stats.totalLines,
            cacheHits: 0,
            cacheMisses: 0
        });

        return stats;
    }

    /**
     * Generate ASCII bar chart
     * @param {number} value - Current value
     * @param {number} max - Maximum value
     * @param {number} width - Chart width in characters
     */
    generateBarChart(value, max, width = 20) {
        if (max === 0) return '░'.repeat(width);

        const ratio = Math.min(value / max, 1); // Clamp to max 1
        const filled = Math.round(ratio * width);
        const empty = width - filled;

        return '▓'.repeat(filled) + '░'.repeat(empty);
    }

    /**
     * Generate ASCII sparkline
     * @param {number[]} values - Array of values
     * @param {number} width - Sparkline width
     */
    generateSparkline(values, width = 40) {
        if (!values || values.length === 0) {
            return '░'.repeat(width);
        }

        const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = max - min || 1;

        // Normalize and map to characters
        const normalized = values.map(v => {
            const normalized = (v - min) / range;
            const index = Math.min(Math.floor(normalized * chars.length), chars.length - 1);
            return chars[index];
        });

        // Pad or trim to width
        if (normalized.length < width) {
            return normalized.join('') + '░'.repeat(width - normalized.length);
        } else if (normalized.length > width) {
            return normalized.slice(-width).join('');
        }
        return normalized.join('');
    }

    /**
     * Generate ASCII trend chart
     * @param {object[]} trend - Trend data points
     * @param {string} field - Field to chart ('avgDuration', 'totalTokens', 'count')
     * @param {number} width - Chart width
     * @param {number} height - Chart height
     */
    generateTrendChart(trend, field = 'avgDuration', width = 60, height = 6) {
        if (!trend || trend.length === 0) {
            return '│' + '\n'.repeat(height - 1);
        }

        const values = trend.map(t => t[field] || 0);
        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = max - min || 1;

        // Create grid
        const grid = [];
        for (let y = 0; y < height; y++) {
            grid[y] = [];
            for (let x = 0; x < width; x++) {
                grid[y][x] = ' ';
            }
        }

        // Plot values
        const step = Math.max(1, Math.floor(values.length / width));
        for (let i = 0; i < values.length && i * step < width; i++) {
            const x = Math.floor((i / (values.length - 1 || 1)) * (width - 1));
            const normalized = (values[i] - min) / range;
            const y = height - 1 - Math.floor(normalized * (height - 1));

            grid[y][x] = '█';

            // Fill below
            for (let fillY = y + 1; fillY < height; fillY++) {
                grid[fillY][x] = '░';
            }
        }

        // Add axes
        const lines = [];
        for (let y = 0; y < height; y++) {
            lines.push('│' + grid[y].join(''));
        }
        lines.push('└' + '─'.repeat(width));

        return lines.join('\n');
    }

    /**
     * Render the full dashboard
     * @param {object} options - Render options
     */
    render(options = {}) {
        const period = options.period || '7d';
        const metrics = this.getAggregatedMetrics(period);
        const bottlenecks = this.identifyBottlenecks(metrics);
        const recommendations = this.generateRecommendations(metrics, bottlenecks);

        const lines = [];

        // Header
        lines.push('');
        lines.push('═'.repeat(70));
        lines.push('            CTXMAN PERFORMANCE DASHBOARD');
        lines.push('═'.repeat(70));
        lines.push('');

        // Overview metrics
        lines.push('┌' + '─'.repeat(30) + '┬' + '─'.repeat(30) + '┐');
        lines.push('│ Overview                      │ Analysis Stats                │');
        lines.push('├' + '─'.repeat(30) + '┼' + '─'.repeat(30) + '┤');

        // Total analyses
        const totalAnalysesStr = metrics.totalAnalyses.toLocaleString().padStart(10);
        lines.push(`│ Total Analyses:${totalAnalysesStr}     │ Avg Duration:     ${(metrics.avgDuration || 0).toLocaleString()} ms     │`);

        // Average files
        const avgFilesStr = metrics.avgFiles.toLocaleString().padStart(10);
        lines.push(`│ Avg Files:     ${avgFilesStr}     │ Avg Tokens:    ${(metrics.avgTokens || 0).toLocaleString().padStart(10)} │`);

        // Cache hit rate
        const cacheBar = this.generateBarChart(metrics.cacheHitRate, 100, 10);
        lines.push(`│ Cache Hit Rate: ${cacheBar} ${String(metrics.cacheHitRate).padStart(3)}%   │                              │`);

        lines.push('└' + '─'.repeat(30) + '┴' + '─'.repeat(30) + '┘');
        lines.push('');

        // Performance trend
        if (metrics.trend && metrics.trend.length > 0) {
            lines.push('┌' + '─'.repeat(66) + '┐');
            lines.push('│ Performance Trend (Last ' + String(metrics.trend.length).padStart(2) + ' days)' + ' '.repeat(38) + '│');
            lines.push('├' + '─'.repeat(66) + '┤');

            // Duration sparkline
            const durationValues = metrics.trend.map(t => t.avgDuration);
            const durationSparkline = this.generateSparkline(durationValues, 40);
            lines.push(`│ Duration (ms)  ${durationSparkline}  │`);

            // Token sparkline
            const tokenValues = metrics.trend.map(t => Math.round(t.totalTokens / 1000));
            const tokenSparkline = this.generateSparkline(tokenValues, 40);
            lines.push(`│ Tokens (K)     ${tokenSparkline}  │`);

            // Analysis count sparkline
            const countValues = metrics.trend.map(t => t.count);
            const countSparkline = this.generateSparkline(countValues, 40);
            lines.push(`│ Analyses       ${countSparkline}  │`);

            lines.push('└' + '─'.repeat(66) + '┘');
            lines.push('');
        }

        // Phase breakdown
        if (Object.keys(metrics.phaseBreakdown).length > 0) {
            lines.push('┌' + '─'.repeat(66) + '┐');
            lines.push('│ Phase Breakdown                                                      │');
            lines.push('├' + '─'.repeat(66) + '┤');

            const phases = Object.entries(metrics.phaseBreakdown)
                .sort((a, b) => b[1].avgDuration - a[1].avgDuration);

            for (const [name, data] of phases) {
                const bar = this.generateBarChart(data.avgDuration, metrics.avgDuration || 1, 20);
                const pct = metrics.avgDuration > 0
                    ? Math.round((data.avgDuration / metrics.avgDuration) * 100)
                    : 0;
                lines.push(`│ ${(name + ':').padEnd(15)} ${bar} ${String(data.avgDuration).padStart(6)} ms (${String(pct).padStart(3)}%)         │`);
            }

            lines.push('└' + '─'.repeat(66) + '┘');
            lines.push('');
        }

        // Bottlenecks
        if (bottlenecks.length > 0) {
            lines.push('┌' + '─'.repeat(66) + '┐');
            lines.push('│ Top Bottlenecks                                                       │');
            lines.push('├' + '─'.repeat(66) + '┤');

            for (let i = 0; i < Math.min(bottlenecks.length, 5); i++) {
                const b = bottlenecks[i];
                const severity = b.severity === 'high' ? '⚠️ ' : '  ';
                const name = b.name.padEnd(40);
                const info = b.avgDuration
                    ? `${b.avgDuration} ms avg`
                    : b.rate
                        ? `${b.rate}%`
                        : '';
                lines.push(`│ ${severity}${i + 1}. ${name} ${info.padStart(15)}       │`);
            }

            lines.push('└' + '─'.repeat(66) + '┘');
            lines.push('');
        }

        // Recommendations
        if (recommendations.length > 0) {
            lines.push('┌' + '─'.repeat(66) + '┐');
            lines.push('│ Optimization Recommendations                                          │');
            lines.push('├' + '─'.repeat(66) + '┤');

            for (const r of recommendations.slice(0, 5)) {
                const priority = r.priority === 'high' ? '🔴' : r.priority === 'medium' ? '🟡' : '🟢';
                lines.push(`│ ${priority} ${r.message.slice(0, 60).padEnd(60)} │`);
            }

            lines.push('└' + '─'.repeat(66) + '┘');
            lines.push('');
        }

        // Legend
        lines.push('Legend: ▓ active  ░ inactive  █ high  ▇ medium  ▆ low');
        lines.push('');

        return lines.join('\n');
    }

    /**
     * Display dashboard to console
     * @param {object} options - Display options
     */
    display(options = {}) {
        console.log(this.render(options));
    }
}

export default PerformanceDashboard;
