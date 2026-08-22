# Context Versioning

**ID**: FEAT-012
**Status**: Planned
**Priority**: Medium
**Effort**: Medium (8-12 hours)
**Dependencies**: FEAT-003 (Snapshot & Diff)

---

## Problem Statement

### Why This Matters

Generated context changes over time, but there's no way to track or revert:

**Context Drift Issues**:
- No history of what context was sent to LLM
- Cannot reproduce previous LLM sessions
- Lost context configurations from past work
- No audit trail for team collaboration

**Reproducibility Challenges**:
- Cannot debug why LLM gave certain response
- Team members can't share exact context state
- No rollback for problematic configurations
- Difficult to compare context over time

**User Impact**:
- Cannot reproduce debugging sessions
- Lost work when configurations change
- Difficult to collaborate on context
- No accountability for context changes

**Business Impact**:
- Reduced debugging efficiency
- Team collaboration friction
- Compliance/audit concerns
- Lost institutional knowledge

---

## Proposed Solution

### What We Will Build

A **context versioning system** that:

1. Automatically versions generated context
2. Tracks context changes with git-style history
3. Allows restoring previous context states
4. Provides context diff and comparison
5. Integrates with git for automatic commits

### User Experience

```
+-------------------------------------------------------------+
|                   Context Versioning                         |
+-------------------------------------------------------------+
|                                                             |
|  $ ctxman --cli --save-version                              |
|                                                             |
|  Generated context (v1.4.0)                                 |
|  Total tokens: 45,230                                       |
|  Files: 127                                                 |
|                                                             |
|  Saved version: v1.4.0                                      |
|  Message: "Pre-refactor baseline"                           |
|                                                             |
|  $ ctxman version list                                      |
|                                                             |
|  Context Versions:                                          |
|  +---------------------------------------------------+      |
|  | Version | Date       | Tokens  | Message         |      |
|  +---------------------------------------------------+      |
|  | v1.4.0  | 2025-01-15 | 45,230  | Pre-refactor    |      |
|  | v1.3.0  | 2025-01-10 | 42,180  | Feature auth    |      |
|  | v1.2.0  | 2025-01-05 | 38,450  | Bug fix login   |      |
|  | v1.1.0  | 2025-01-01 | 35,620  | Initial setup   |      |
|  +---------------------------------------------------+      |
|                                                             |
|  $ ctxman version restore v1.3.0                            |
|                                                             |
|  Restored context v1.3.0                                    |
|  - 42,180 tokens (vs current 45,230)                        |
|  - 3,050 tokens removed since v1.3.0                        |
|  - Files removed: 8                                         |
|  - Files changed: 12                                        |
|                                                             |
|  $ ctxman version diff v1.2.0 v1.4.0                        |
|                                                             |
|  Comparing v1.2.0 vs v1.4.0:                                |
|                                                             |
|  Token change: +6,780 (+17.6%)                              |
|                                                             |
|  Files added:                                               |
|  + lib/api/oauth.js (+450 tokens)                           |
|  + lib/middleware/rate-limit.js (+380 tokens)               |
|                                                             |
|  Files removed:                                             |
|  - lib/deprecated/legacy-auth.js (-520 tokens)              |
|                                                             |
|  Files changed:                                             |
|  ~ lib/core/auth.js (+280 tokens)                           |
|  ~ lib/utils/jwt.js (+150 tokens)                           |
|                                                             |
+-------------------------------------------------------------+
```

---

## Implementation Steps

### Step 1: Create Version Storage

```javascript
// lib/versioning/ContextVersionStore.js

export class ContextVersionStore {
  constructor(projectRoot) {
    this.versionDir = path.join(projectRoot, '.ctxman', 'versions');
    this.indexFile = path.join(this.versionDir, 'index.json');
  }

  async init() {
    await fs.mkdir(this.versionDir, { recursive: true });
    
    if (!fs.existsSync(this.indexFile)) {
      await this.saveIndex({ versions: [] });
    }
  }

  async save(context, message = '') {
    const index = await this.loadIndex();
    
    // Generate version number
    const version = this.generateVersion(index);
    
    // Save context snapshot
    const snapshotPath = path.join(this.versionDir, `${version}.json`);
    const snapshot = {
      version,
      timestamp: new Date().toISOString(),
      message,
      context: {
        totalTokens: context.totalTokens,
        files: context.files.map(f => ({
          path: f.path,
          tokens: f.tokens,
          hash: this.hashFile(f),
        })),
        config: context.config,
      },
      full: context, // Optional: store full context
    };
    
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
    
    // Update index
    index.versions.push({
      version,
      timestamp: snapshot.timestamp,
      message,
      totalTokens: context.totalTokens,
      fileCount: context.files.length,
    });
    
    await this.saveIndex(index);
    
    return version;
  }

  async load(version) {
    const snapshotPath = path.join(this.versionDir, `${version}.json`);
    
    try {
      const content = await fs.readFile(snapshotPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      throw new Error(`Version '${version}' not found`);
    }
  }

  async list() {
    const index = await this.loadIndex();
    return index.versions;
  }

  generateVersion(index) {
    if (index.versions.length === 0) {
      return 'v1.0.0';
    }

    const lastVersion = index.versions[index.versions.length - 1].version;
    const match = lastVersion.match(/v(\d+)\.(\d+)\.(\d+)/);
    
    if (!match) {
      return `v${index.versions.length + 1}.0.0`;
    }

    const [, major, minor, patch] = match.map(Number);
    return `v${major}.${minor}.${patch + 1}`;
  }

  async loadIndex() {
    try {
      const content = await fs.readFile(this.indexFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { versions: [] };
    }
  }

  async saveIndex(index) {
    await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2));
  }

  hashFile(file) {
    return crypto
      .createHash('sha256')
      .update(`${file.path}:${file.tokens}:${file.content?.slice(0, 100) || ''}`)
      .digest('hex')
      .slice(0, 8);
  }
}
```

### Step 2: Create Version Manager

```javascript
// lib/versioning/VersionManager.js

export class VersionManager {
  constructor(projectRoot) {
    this.store = new ContextVersionStore(projectRoot);
    this.diffEngine = new VersionDiffEngine();
  }

  async saveVersion(context, message) {
    await this.store.init();
    return this.store.save(context, message);
  }

  async restoreVersion(version) {
    const snapshot = await this.store.load(version);
    
    // Generate restored context
    const restored = {
      ...snapshot.full,
      restoredFrom: version,
      restoredAt: new Date().toISOString(),
    };

    return restored;
  }

  async diffVersions(version1, version2) {
    const snapshot1 = await this.store.load(version1);
    const snapshot2 = await this.store.load(version2);

    return this.diffEngine.compare(snapshot1, snapshot2);
  }

  async pruneVersions(keepCount = 10) {
    const versions = await this.store.list();
    
    if (versions.length <= keepCount) {
      return [];
    }

    const toRemove = versions.slice(0, versions.length - keepCount);
    
    for (const v of toRemove) {
      const snapshotPath = path.join(this.store.versionDir, `${v.version}.json`);
      await fs.unlink(snapshotPath);
    }

    // Update index
    const index = await this.store.loadIndex();
    index.versions = index.versions.slice(-keepCount);
    await this.store.saveIndex(index);

    return toRemove;
  }
}
```

### Step 3: Create Diff Engine

```javascript
// lib/versioning/VersionDiffEngine.js

export class VersionDiffEngine {
  compare(snapshot1, snapshot2) {
    const files1 = new Map(
      snapshot1.context.files.map(f => [f.path, f])
    );
    const files2 = new Map(
      snapshot2.context.files.map(f => [f.path, f])
    );

    const added = [];
    const removed = [];
    const changed = [];
    const unchanged = [];

    // Find added and changed
    for (const [path, file2] of files2) {
      if (!files1.has(path)) {
        added.push({
          path,
          tokens: file2.tokens,
        });
      } else {
        const file1 = files1.get(path);
        if (file1.hash !== file2.hash || file1.tokens !== file2.tokens) {
          changed.push({
            path,
            oldTokens: file1.tokens,
            newTokens: file2.tokens,
            diff: file2.tokens - file1.tokens,
          });
        } else {
          unchanged.push(path);
        }
      }
    }

    // Find removed
    for (const [path, file1] of files1) {
      if (!files2.has(path)) {
        removed.push({
          path,
          tokens: file1.tokens,
        });
      }
    }

    const tokenDiff = snapshot2.context.totalTokens - snapshot1.context.totalTokens;

    return {
      version1: snapshot1.version,
      version2: snapshot2.version,
      tokenDiff,
      percentChange: (tokenDiff / snapshot1.context.totalTokens) * 100,
      added,
      removed,
      changed,
      unchanged,
      summary: {
        filesAdded: added.length,
        filesRemoved: removed.length,
        filesChanged: changed.length,
      },
    };
  }
}
```

### Step 4: Add CLI Commands

```javascript
// bin/cli.js

program
  .option('--save-version [message]', 'Save context version after analysis')
  .hook('postAction', async (thisCommand) => {
    const options = thisCommand.opts();
    
    if (options.saveVersion !== undefined) {
      const manager = new VersionManager(process.cwd());
      const version = await manager.saveVersion(
        result,
        typeof options.saveVersion === 'string' ? options.saveVersion : ''
      );
      console.log(`\nSaved context version: ${version}\n`);
    }
  });

program
  .command('version')
  .description('Manage context versions')
  .command('list')
  .description('List saved context versions')
  .action(async () => {
    const store = new ContextVersionStore(process.cwd());
    const versions = await store.list();

    if (versions.length === 0) {
      console.log('\nNo saved versions\n');
      return;
    }

    console.log('\nContext Versions:\n');
    console.log('Version       Date        Tokens    Message');
    console.log('-'.repeat(60));

    for (const v of versions) {
      const date = new Date(v.timestamp).toISOString().split('T')[0];
      console.log(
        `${v.version.padEnd(13)} ${date}  ${String(v.totalTokens).padStart(7)}  ${v.message || ''}`
      );
    }

    console.log('');
  });

program
  .command('version')
  .command('restore <version>')
  .description('Restore a saved context version')
  .action(async (version) => {
    const manager = new VersionManager(process.cwd());
    const restored = await manager.restoreVersion(version);

    console.log(`\nRestored context ${version}`);
    console.log(`Total tokens: ${restored.totalTokens.toLocaleString()}`);
    console.log(`Files: ${restored.files.length}\n`);

    // Optionally write to output file
    await fs.writeFile('restored-context.json', 
      JSON.stringify(restored, null, 2));
    console.log('Saved to: restored-context.json\n');
  });

program
  .command('version')
  .command('diff <version1> <version2>')
  .description('Compare two context versions')
  .action(async (version1, version2) => {
    const manager = new VersionManager(process.cwd());
    const diff = await manager.diffVersions(version1, version2);

    console.log(`\nComparing ${version1} vs ${version2}:\n`);
    console.log(`Token change: ${diff.tokenDiff >= 0 ? '+' : ''}${diff.tokenDiff.toLocaleString()} (${diff.percentChange >= 0 ? '+' : ''}${diff.percentChange.toFixed(1)}%)\n`);

    if (diff.added.length > 0) {
      console.log('Files added:');
      for (const f of diff.added) {
        console.log(`  + ${f.path} (+${f.tokens} tokens)`);
      }
      console.log('');
    }

    if (diff.removed.length > 0) {
      console.log('Files removed:');
      for (const f of diff.removed) {
        console.log(`  - ${f.path} (-${f.tokens} tokens)`);
      }
      console.log('');
    }

    if (diff.changed.length > 0) {
      console.log('Files changed:');
      for (const f of diff.changed.slice(0, 10)) { // Limit output
        console.log(`  ~ ${f.path} (${f.diff >= 0 ? '+' : ''}${f.diff} tokens)`);
      }
      console.log('');
    }
  });
```

### Step 5: Git Integration

```javascript
// lib/versioning/GitIntegration.js

export class GitContextIntegration {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.versionManager = new VersionManager(projectRoot);
  }

  async autoVersion(commitMessage) {
    // Check if context changed since last version
    const lastVersion = await this.getLastVersion();
    const currentContext = await this.getCurrentContext();

    if (lastVersion && !this.hasSignificantChange(lastVersion, currentContext)) {
      return null;
    }

    // Auto-create version
    const version = await this.versionManager.saveVersion(
      currentContext,
      `Auto: ${commitMessage}`
    );

    return version;
  }

  async getLastVersion() {
    const versions = await this.versionManager.store.list();
    return versions.length > 0 ? versions[versions.length - 1] : null;
  }

  async getCurrentContext() {
    const scanner = new Scanner({ root: this.projectRoot });
    return scanner.scan();
  }

  hasSignificantChange(lastVersion, currentContext) {
    const tokenThreshold = lastVersion.totalTokens * 0.05; // 5% change
    return Math.abs(currentContext.totalTokens - lastVersion.totalTokens) > tokenThreshold;
  }
}
```

---

## Acceptance Criteria

### Must Have
- [ ] `--save-version [message]` saves context version
- [ ] `ctxman version list` shows all versions
- [ ] `ctxman version restore <version>` restores context
- [ ] `ctxman version diff <v1> <v2>` compares versions
- [ ] Versions stored in .ctxman/versions/

### Should Have
- [ ] Automatic versioning on git commits
- [ ] Version pruning (keep last N)
- [ ] Version tagging (stable, release, etc.)
- [ ] Team version sharing

### Nice to Have
- [ ] Version branching (for experiments)
- [ ] Merge versions (combine contexts)
- [ ] Version export/import
- [ ] Cloud backup integration

---

## Success Metrics

### Quantitative Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Version adoption | 30% of users | Usage tracking |
| Version restores | 2+ per user per month | Action tracking |
| Reproducibility improvement | 50% fewer "can't reproduce" issues | User feedback |

### Qualitative Metrics

- [ ] Users can reproduce previous LLM sessions
- [ ] Better team collaboration on context
- [ ] Easier debugging with context history

---

## Timeline

| Task | Effort | Week |
|------|--------|------|
| Version storage | 3 hours | Week 1 |
| Version manager | 2 hours | Week 1 |
| Diff engine | 2 hours | Week 1 |
| CLI commands | 2 hours | Week 1 |
| Git integration | 2 hours | Week 1 |
| Testing | 2 hours | Week 2 |

**Total Estimated Effort**: 13 hours over 2 weeks

---

## References

- [Git Object Model](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- [Semantic Versioning](https://semver.org/)
- [Time Machine for Code](https://github.com/nickmomrik/backup)

---

*Planned by: Ctxman Development Team*
*Target: Q2 2025*
