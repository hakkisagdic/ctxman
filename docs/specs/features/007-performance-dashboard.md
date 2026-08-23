# Performance Dashboard

**ID**: FEAT-007
**Status**: Planned
**Priority**: Low
**Effort**: High (24-32 hours)
**Dependencies**: None

---

## Problem Statement

### Why This Matters

Users lack visibility into ctxman's performance and behavior over time:

**Performance Blind Spots**:

- No insight into analysis speed trends
- Cache effectiveness unknown
- Memory usage patterns invisible
- Bottleneck identification requires manual profiling

**Operational Challenges**:

- Large project performance unpredictable
- No baseline for performance regression
- Difficult to optimize configuration
- Team-wide performance metrics unavailable

**User Impact**:

- Unexpected slow analysis
- Inefficient configuration choices
- Unable to plan for scale
- No feedback loop for improvements

**Business Impact**:

- Reduced user satisfaction
- Support requests for "slow" performance
- Missed optimization opportunities
- Competitive disadvantage vs native tools

---

## Proposed Solution

### What We Will Build

A **web-based performance dashboard** that:

1. Displays real-time and historical performance metrics
2. Shows cache hit rates and effectiveness
3. Tracks token analysis trends over time
4. Identifies performance bottlenecks
5. Provides optimization recommendations

### User Experience

```
+-------------------------------------------------------------+
|                Ctxman Performance Dashboard                 |
+-------------------------------------------------------------+
|                                                             |
|  [Overview] [Analysis] [Cache] [Memory] [Trends]           |
|                                                             |
|  +------------------+  +------------------+                 |
|  | Avg Analysis     |  | Cache Hit Rate   |                 |
|  |    1.2s          |  |    87%           |                 |
|  |  +15% vs last wk |  |  +3% vs last wk  |                 |
|  +------------------+  +------------------+                 |
|                                                             |
|  Performance Trend (Last 30 Days)                          |
|  |     ___                                                   |
|  |    /   \        ___                                       |
|  |___/     \______/   \___                                   |
|  +---------------------------------------------------       |
|    Jan 1   Jan 8   Jan 15  Jan 22  Jan 29                  |
|                                                             |
|  Top Bottlenecks                                            |
|  +---------------------------------------------------+      |
|  | 1. lib/analyzers/token-calculator.js (340ms avg)  |      |
|  | 2. lib/parsers/javascript-parser.js (180ms avg)   |      |
|  | 3. lib/core/Scanner.js (120ms avg)                |      |
|  +---------------------------------------------------+      |
|                                                             |
|  Recommendations                                            |
|  - Consider enabling cache for 15% faster analysis         |
|  - Large file detected: src/bundle.js (2.3MB)              |
|  - Method-level analysis recommended for files >50KB       |
|                                                             |
+-------------------------------------------------------------+
```

---

## Implementation Steps

### Step 1: Create Metrics Collector

```javascript
// lib/telemetry/MetricsCollector.js

export class MetricsCollector {
  constructor(options = {}) {
    this.storagePath = options.storagePath || '.ctxman/metrics';
    this.metrics = [];
    this.startTime = null;
  }

  startAnalysis() {
    this.startTime = Date.now();
    this.currentMetrics = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      phases: {},
    };
  }

  recordPhase(name, duration, metadata = {}) {
    this.currentMetrics.phases[name] = {
      duration,
      ...metadata,
    };
  }

  endAnalysis(result) {
    const endTime = Date.now();
    this.currentMetrics.completedAt = new Date().toISOString();
    this.currentMetrics.totalDuration = endTime - this.startTime;
    this.currentMetrics.result = {
      totalFiles: result.files?.length || 0,
      totalTokens: result.totalTokens || 0,
      cacheHits: result.cacheHits || 0,
      cacheMisses: result.cacheMisses || 0,
    };

    this.metrics.push(this.currentMetrics);
    this.persist();
  }

  getAggregatedMetrics(period = '7d') {
    const cutoff = this.getCutoffDate(period);
    const filtered = this.metrics.filter((m) => new Date(m.startedAt) >= cutoff);

    return {
      totalAnalyses: filtered.length,
      avgDuration: this.average(filtered.map((m) => m.totalDuration)),
      avgFiles: this.average(filtered.map((m) => m.result.totalFiles)),
      avgTokens: this.average(filtered.map((m) => m.result.totalTokens)),
      cacheHitRate: this.calculateCacheHitRate(filtered),
      phaseBreakdown: this.aggregatePhases(filtered),
    };
  }

  persist() {
    // Save to local storage
    const data = JSON.stringify(this.metrics, null, 2);
    fs.writeFileSync(
      path.join(this.storagePath, 'metrics.jsonl'),
      this.metrics.map((m) => JSON.stringify(m)).join('\n'),
      { flag: 'a' }
    );
  }
}
```

### Step 2: Create Dashboard Server

```javascript
// lib/dashboard/DashboardServer.js

import express from 'express';
import { MetricsCollector } from '../telemetry/MetricsCollector.js';

export class DashboardServer {
  constructor(options = {}) {
    this.port = options.port || 3456;
    this.app = express();
    this.collector = new MetricsCollector();
    this.setupRoutes();
  }

  setupRoutes() {
    // Serve dashboard UI
    this.app.get('/', (req, res) => {
      res.send(this.renderDashboard());
    });

    // API endpoints
    this.app.get('/api/metrics', (req, res) => {
      const period = req.query.period || '7d';
      res.json(this.collector.getAggregatedMetrics(period));
    });

    this.app.get('/api/metrics/raw', (req, res) => {
      res.json(this.collector.metrics);
    });

    this.app.get('/api/bottlenecks', (req, res) => {
      res.json(this.identifyBottlenecks());
    });

    this.app.get('/api/recommendations', (req, res) => {
      res.json(this.generateRecommendations());
    });
  }

  renderDashboard() {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Ctxman Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <div id="app">
    <h1>Ctxman Performance Dashboard</h1>
    <div id="metrics"></div>
    <canvas id="performanceChart"></canvas>
    <div id="bottlenecks"></div>
    <div id="recommendations"></div>
  </div>
  <script>
    // Load metrics and render charts
    fetch('/api/metrics')
      .then(r => r.json())
      .then(data => renderDashboard(data));
  </script>
</body>
</html>
    `;
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log(`Dashboard running at http://localhost:${this.port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}
```

### Step 3: Add CLI Command

```javascript
// bin/cli.js

program
  .command('dashboard')
  .description('Start the performance dashboard')
  .option('-p, --port <number>', 'Dashboard port', '3456')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (options) => {
    const { DashboardServer } = await import('../lib/dashboard/DashboardServer.js');

    const server = new DashboardServer({ port: parseInt(options.port) });
    server.start();

    if (options.open) {
      const open = (await import('open')).default;
      await open(`http://localhost:${options.port}`);
    }

    console.log(`\n📊 Dashboard running at http://localhost:${options.port}`);
    console.log('Press Ctrl+C to stop\n');
  });
```

### Step 4: Integrate Metrics Collection

```javascript
// lib/core/Scanner.js

async scan(options = {}) {
  const metrics = new MetricsCollector();
  metrics.startAnalysis();

  // File discovery phase
  const discoveryStart = Date.now();
  const files = await this.discoverFiles(options);
  metrics.recordPhase('discovery', Date.now() - discoveryStart, {
    fileCount: files.length,
  });

  // Analysis phase
  const analysisStart = Date.now();
  const result = await this.analyzeFiles(files, options);
  metrics.recordPhase('analysis', Date.now() - analysisStart, {
    totalTokens: result.totalTokens,
  });

  // Cache stats
  if (this.cache) {
    result.cacheHits = this.cache.hits;
    result.cacheMisses = this.cache.misses;
  }

  metrics.endAnalysis(result);

  return result;
}
```

---

## Acceptance Criteria

### Must Have

- [ ] `ctxman dashboard` starts web dashboard
- [ ] Shows total analyses count
- [ ] Shows average analysis duration
- [ ] Shows cache hit rate
- [ ] Displays performance trend chart

### Should Have

- [ ] Phase breakdown (discovery, analysis, output)
- [ ] Bottleneck identification
- [ ] Optimization recommendations
- [ ] Export metrics as JSON/CSV

### Nice to Have

- [ ] Real-time updates during analysis
- [ ] Multi-project comparison
- [ ] Team-wide metrics aggregation
- [ ] Custom dashboard layouts

---

## Success Metrics

### Quantitative Metrics

| Metric                   | Target                           | Measurement           |
| ------------------------ | -------------------------------- | --------------------- |
| Dashboard adoption       | 20% of active users              | Usage tracking        |
| Performance improvements | 15% faster after using dashboard | Before/after analysis |
| Cache optimization       | 10% improvement in hit rate      | Metrics data          |

### Qualitative Metrics

- [ ] Users report better understanding of performance
- [ ] Users make data-driven optimization decisions
- [ ] Reduced performance-related support requests

---

## Timeline

| Task              | Effort  | Week   |
| ----------------- | ------- | ------ |
| Metrics collector | 6 hours | Week 1 |
| Dashboard server  | 6 hours | Week 1 |
| UI implementation | 8 hours | Week 2 |
| CLI integration   | 2 hours | Week 2 |
| Testing & polish  | 6 hours | Week 2 |

**Total Estimated Effort**: 28 hours over 2 weeks

---

## References

- [Prometheus Metrics](https://prometheus.io/docs/concepts/data_model/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/)
- [Node.js Performance Monitoring](https://nodejs.org/en/docs/guides/simple-profiling/)

---

_Planned by: Ctxman Development Team_
_Target: Q3 2025_
