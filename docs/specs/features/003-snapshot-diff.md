# Context Snapshot & Diff

**ID**: FEAT-003
**Status**: 📋 Planned
**Priority**: Medium
**Effort**: Medium (12-16 hours)
**Dependencies**: FEAT-002 (Context Budget Alerts)

---

## Problem Statement

### Why This Matters

Projects grow and change over time. Without visibility into token growth:

**Codebase Bloat Goes Undetected**:
- Token count creeps up unnoticed
- Context generation slows down
- LLM costs increase silently

**No Historical Context**:
- Can't track what changed
- No baseline for comparison
- Difficult to identify problematic additions

**User Impact**:
- Unexpected context overflow
- Higher LLM API costs
- Slower context generation

**Business Impact**:
- Reduced developer productivity
- Increased operational costs
- Difficulty planning architecture changes

---

## Proposed Solution

### What We Will Build

A **snapshot system** that:

1. Saves context analysis snapshots to history
2. Compares snapshots to show token changes
3. Identifies files with largest token changes
4. Generates trend reports

### User Experience

```
┌─────────────────────────────────────────────────────────────┐
│                    Snapshot Command                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  $ ctxman snapshot                                          │
│                                                             │
│  📸 Snapshot saved: 2025-01-15-143022                       │
│  Total tokens: 45,230                                       │
│  Files: 127                                                 │
│                                                             │
│  $ ctxman snapshot --diff                                   │
│                                                             │
│  📊 Comparison: Last 7 days                                 │
│                                                             │
│  Token changes:                                             │
│  ├── Total: +3,450 tokens (+8.2%)                          │
│  ├── Added: 12 files (+2,100 tokens)                       │
│  ├── Removed: 3 files (-450 tokens)                        │
│  └── Modified: 28 files (+1,800 tokens)                    │
│                                                             │
│  📈 Top token growth:                                       │
│  1. lib/api/handlers.js (+580 tokens) - New endpoints      │
│  2. lib/core/Analyzer.js (+420 tokens) - Added methods     │
│  3. lib/utils/logger.js (+210 tokens) - Logging features   │
│                                                             │
│  ⚠️  At current growth: +20K tokens in 6 weeks             │
│     Consider: Review lib/api/ for optimization             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create Snapshot Storage

```javascript
// lib/snapshots/SnapshotStore.js
import fs from 'fs/promises';
import path from 'path';

const SNAPSHOT_DIR = '.ctxman/snapshots';

export class SnapshotStore {
  constructor(projectRoot) {
    this.snapshotDir = path.join(projectRoot, SNAPSHOT_DIR);
  }
  
  async init() {
    await fs.mkdir(this.snapshotDir, { recursive: true });
  }
  
  async save(analysis) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot-${timestamp}.json`;
    const filepath = path.join(this.snapshotDir, filename);
    
    const snapshot = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      summary: {
        totalTokens: analysis.totalTokens,
        totalLines: analysis.totalLines,
        fileCount: analysis.files.length,
        languages: analysis.languages,
      },
      files: analysis.files.map(f => ({
        path: f.path,
        tokens: f.tokens,
        lines: f.lines,
        language: f.language,
        hash: this.hashFile(f),
      })),
    };
    
    await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2));
    return { filename, snapshot };
  }
  
  async list(options = {}) {
    const files = await fs.readdir(this.snapshotDir);
    const snapshots = files
      .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
      .sort()
      .reverse();
    
    if (options.limit) {
      return snapshots.slice(0, options.limit);
    }
    return snapshots;
  }
  
  async load(filename) {
    const filepath = path.join(this.snapshotDir, filename);
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  }
  
  hashFile(file) {
    // Simple hash for change detection
    return `${file.path}:${file.tokens}:${file.lines}`;
  }
}
```

### Step 2: Create Diff Engine

```javascript
// lib/snapshots/SnapshotDiff.js

export class SnapshotDiff {
  compare(oldSnapshot, newSnapshot) {
    const oldFiles = new Map(oldSnapshot.files.map(f => [f.path, f]));
    const newFiles = new Map(newSnapshot.files.map(f => [f.path, f]));
    
    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];
    
    // Find added and modified files
    for (const [path, file] of newFiles) {
      if (!oldFiles.has(path)) {
        added.push(file);
      } else {
        const oldFile = oldFiles.get(path);
        if (oldFile.tokens !== file.tokens || oldFile.lines !== file.lines) {
          modified.push({
            path,
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
    for (const [path, file] of oldFiles) {
      if (!newFiles.has(path)) {
        removed.push(file);
      }
    }
    
    const totalTokenDiff = newSnapshot.summary.totalTokens - oldSnapshot.summary.totalTokens;
    
    return {
      oldSnapshot: oldSnapshot.summary,
      newSnapshot: newSnapshot.summary,
      added,
      removed,
      modified,
      unchanged,
      totalTokenDiff,
      percentChange: (totalTokenDiff / oldSnapshot.summary.totalTokens) * 100,
    };
  }
  
  analyzeTrend(snapshots) {
    if (snapshots.length < 2) return null;
    
    const changes = [];
    for (let i = 1; i < snapshots.length; i++) {
      const diff = this.compare(snapshots[i - 1], snapshots[i]);
      changes.push({
        date: new Date(snapshots[i].timestamp),
        tokenDiff: diff.totalTokenDiff,
        percentChange: diff.percentChange,
      });
    }
    
    // Calculate average daily growth
    const totalDays = (changes[changes.length - 1].date - changes[0].date) / (1000 * 60 * 60 * 24);
    const totalGrowth = changes.reduce((sum, c) => sum + c.tokenDiff, 0);
    const dailyGrowth = totalGrowth / totalDays;
    
    return {
      changes,
      averageDailyGrowth: dailyGrowth,
      projectedMonthlyGrowth: dailyGrowth * 30,
      projectedSixMonthGrowth: dailyGrowth * 180,
    };
  }
}
```

### Step 3: Add CLI Commands

```javascript
// bin/cli.js

program
  .command('snapshot')
  .description('Save or compare context snapshots')
  .option('-s, --save', 'Save current context as snapshot')
  .option('-d, --diff [snapshot]', 'Compare with previous snapshot')
  .option('-l, --list', 'List available snapshots')
  .option('-t, --trend', 'Show token growth trend')
  .action(async (options) => {
    const { SnapshotManager } = await import('../lib/snapshots/SnapshotManager.js');
    const manager = new SnapshotManager(process.cwd());
    
    if (options.list) {
      await manager.listSnapshots();
    } else if (options.diff) {
      await manager.showDiff(options.diff);
    } else if (options.trend) {
      await manager.showTrend();
    } else {
      // Default: save snapshot
      await manager.saveSnapshot();
    }
  });
```

### Step 4: Create Snapshot Manager

```javascript
// lib/snapshots/SnapshotManager.js

export class SnapshotManager {
  constructor(projectRoot) {
    this.store = new SnapshotStore(projectRoot);
    this.diff = new SnapshotDiff();
  }
  
  async saveSnapshot() {
    await this.store.init();
    
    // Run analysis
    const scanner = new Scanner({ root: process.cwd() });
    const analysis = await scanner.analyze();
    
    const { filename, snapshot } = await this.store.save(analysis);
    
    console.log(`\n📸 Snapshot saved: ${filename}`);
    console.log(`Total tokens: ${snapshot.summary.totalTokens.toLocaleString()}`);
    console.log(`Files: ${snapshot.summary.fileCount}\n`);
  }
  
  async showDiff(snapshotName) {
    const snapshots = await this.store.list({ limit: 2 });
    
    if (snapshots.length < 2) {
      console.log('Need at least 2 snapshots to compare');
      return;
    }
    
    const newSnapshot = await this.store.load(snapshots[0]);
    const oldSnapshot = await this.store.load(snapshots[1]);
    
    const diff = this.diff.compare(oldSnapshot, newSnapshot);
    
    console.log('\n📊 Comparison: Last 2 snapshots\n');
    console.log('Token changes:');
    console.log(`├── Total: ${diff.totalTokenDiff >= 0 ? '+' : ''}${diff.totalTokenDiff.toLocaleString()} tokens (${diff.percentChange >= 0 ? '+' : ''}${diff.percentChange.toFixed(1)}%)`);
    console.log(`├── Added: ${diff.added.length} files (+${diff.added.reduce((s, f) => s + f.tokens, 0).toLocaleString()} tokens)`);
    console.log(`├── Removed: ${diff.removed.length} files (-${diff.removed.reduce((s, f) => s + f.tokens, 0).toLocaleString()} tokens)`);
    console.log(`└── Modified: ${diff.modified.length} files (${diff.modified.reduce((s, f) => s + f.tokenDiff, 0) >= 0 ? '+' : ''}${diff.modified.reduce((s, f) => s + f.tokenDiff, 0).toLocaleString()} tokens)\n`);
    
    if (diff.modified.length > 0) {
      const topGrowth = diff.modified
        .filter(f => f.tokenDiff > 0)
        .sort((a, b) => b.tokenDiff - a.tokenDiff)
        .slice(0, 3);
      
      if (topGrowth.length > 0) {
        console.log('📈 Top token growth:');
        topGrowth.forEach((f, i) => {
          console.log(`  ${i + 1}. ${f.path} (+${f.tokenDiff} tokens)`);
        });
        console.log('');
      }
    }
  }
  
  async showTrend() {
    const snapshots = await this.store.list();
    const loaded = await Promise.all(
      snapshots.slice(0, 10).map(s => this.store.load(s))
    );
    
    const trend = this.diff.analyzeTrend(loaded.reverse());
    
    if (!trend) {
      console.log('Need at least 2 snapshots for trend analysis');
      return;
    }
    
    console.log('\n📈 Token Growth Trend\n');
    console.log(`Average daily growth: ${trend.averageDailyGrowth.toFixed(0)} tokens`);
    console.log(`Projected monthly: +${trend.projectedMonthlyGrowth.toFixed(0).toLocaleString()} tokens`);
    console.log(`Projected 6 months: +${trend.projectedSixMonthGrowth.toFixed(0).toLocaleString()} tokens\n`);
  }
}
```

---

## Acceptance Criteria

### Must Have
- [ ] `ctxman snapshot` saves current analysis
- [ ] `ctxman snapshot --diff` compares last two snapshots
- [ ] `ctxman snapshot --list` shows saved snapshots
- [ ] Snapshots stored in `.ctxman/snapshots/`

### Should Have
- [ ] `ctxman snapshot --trend` shows growth trend
- [ ] Compare specific snapshots by name
- [ ] Export snapshot as JSON

### Nice to Have
- [ ] Visual chart output (ASCII or SVG)
- [ ] Git hook integration (snapshot on commit)
- [ ] Team snapshot sharing

---

## Success Metrics

### Quantitative Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Snapshot adoption | 30% of active users | Analytics |
| Weekly snapshots per user | 2+ average | Storage stats |
| Token growth awareness | 80% know their trend | User survey |

### Qualitative Metrics

- [ ] Users proactively manage token growth
- [ ] Earlier detection of codebase bloat
- [ ] Better architecture decisions

---

## Timeline

| Task | Effort | Week |
|------|--------|------|
| Snapshot storage | 3 hours | Week 1 |
| Diff engine | 3 hours | Week 1 |
| CLI commands | 2 hours | Week 1 |
| Trend analysis | 2 hours | Week 1 |
| Testing & docs | 4 hours | Week 2 |

**Total Estimated Effort**: 14 hours over 2 weeks

---

## References

- [Git Object Model](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects) (inspiration for storage)
- [Time Series Analysis Patterns](https://en.wikipedia.org/wiki/Time_series)

---

*Planned by: Ctxman Development Team*
*Target: Q2 2025*
