# Multi-Repository Context

**ID**: FEAT-006
**Status**: 📋 Planned
**Priority**: Medium
**Effort**: High (20-30 hours)
**Dependencies**: None

---

## Problem Statement

### Why This Matters

Modern development often spans multiple repositories:

**Multi-Repo Scenarios**:
- Monorepo with multiple packages
- Microservices architecture
- Frontend + Backend + Shared libraries
- Organization-wide context needs

**Current Limitations**:
- Can only analyze one repository at a time
- No cross-repository dependency tracking
- Manual context combination required
- Duplicate code detection missing

**User Impact**:
- Incomplete context for cross-repo changes
- Manual copy-paste between repos
- Missed dependencies between services

**Business Impact**:
- Reduced effectiveness for enterprise users
- Lost productivity in monorepo teams
- Competitive disadvantage

---

## Proposed Solution

### What We Will Build

A **multi-repository context system** that:

1. Analyzes multiple repositories in one run
2. Tracks cross-repository dependencies
3. Generates unified context with clear boundaries
4. Supports workspace configuration

### User Experience

```
┌─────────────────────────────────────────────────────────────┐
│                    Multi-Repository Context                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  $ ctxman workspace init                                    │
│                                                             │
│  ? Workspace name: my-platform                              │
│  ? Add repository path: ./frontend                          │
│  ? Add repository path: ./backend-api                       │
│  ? Add repository path: ./shared-utils                      │
│  ? Done adding repositories (y/N) y                         │
│                                                             │
│  ✅ Created workspace: my-platform                          │
│  ✅ Saved to: .ctxman-workspace.json                        │
│                                                             │
│  $ ctxman --workspace                                       │
│                                                             │
│  📊 Multi-Repository Analysis                               │
│                                                             │
│  Repository         Files    Tokens     % of Total         │
│  ─────────────────────────────────────────────────         │
│  frontend           145      45,230     42%                │
│  backend-api        98       32,180     30%                │
│  shared-utils       52       28,450     27%                │
│  ─────────────────────────────────────────────────         │
│  Total              295      105,860    100%               │
│                                                             │
│  🔗 Cross-repository dependencies:                          │
│  ├── frontend → shared-utils (12 imports)                  │
│  ├── backend-api → shared-utils (8 imports)                │
│  └── backend-api → frontend (type definitions)             │
│                                                             │
│  📁 Generated context: llm-context.json                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Define Workspace Configuration

```javascript
// lib/workspace/WorkspaceConfig.js

const WORKSPACE_SCHEMA = {
  version: '1.0',
  name: 'string',
  repositories: [
    {
      name: 'string',
      path: 'string',
      type: 'frontend | backend | library | service',
      priority: 'number',
    },
  ],
  output: {
    combined: 'boolean',
    separate: 'boolean',
    includeCrossRefs: 'boolean',
  },
};

export class WorkspaceConfig {
  constructor(workspacePath) {
    this.configPath = workspacePath;
  }
  
  async load() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  
  async save(config) {
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }
  
  async createInteractive() {
    const inquirer = (await import('inquirer')).default;
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Workspace name:',
        default: path.basename(path.dirname(this.configPath)),
      },
      {
        type: 'confirm',
        name: 'addRepo',
        message: 'Add a repository?',
        default: true,
      },
    ]);
    
    const repositories = [];
    
    while (answers.addRepo) {
      const repoAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'path',
          message: 'Repository path (relative or absolute):',
        },
        {
          type: 'input',
          name: 'name',
          message: 'Repository name (for display):',
          default: (ans) => path.basename(ans.path),
        },
        {
          type: 'list',
          name: 'type',
          message: 'Repository type:',
          choices: ['frontend', 'backend', 'library', 'service', 'other'],
        },
      ]);
      
      repositories.push(repoAnswers);
      
      const { more } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'more',
          message: 'Add another repository?',
          default: false,
        },
      ]);
      
      answers.addRepo = more;
    }
    
    const config = {
      version: '1.0',
      name: answers.name,
      repositories,
      output: {
        combined: true,
        separate: false,
        includeCrossRefs: true,
      },
    };
    
    await this.save(config);
    return config;
  }
}
```

### Step 2: Create Multi-Repository Scanner

```javascript
// lib/workspace/MultiRepoScanner.js

export class MultiRepoScanner {
  constructor(workspaceConfig) {
    this.config = workspaceConfig;
    this.scanners = new Map();
  }
  
  async init() {
    for (const repo of this.config.repositories) {
      const scanner = new Scanner({
        root: repo.path,
        label: repo.name,
      });
      this.scanners.set(repo.name, scanner);
    }
  }
  
  async scanAll() {
    const results = new Map();
    
    // Scan all repositories in parallel
    const scanPromises = [];
    for (const [name, scanner] of this.scanners) {
      scanPromises.push(
        scanner.scan().then(result => {
          results.set(name, result);
          return { name, result };
        })
      );
    }
    
    await Promise.all(scanPromises);
    
    // Calculate cross-repository dependencies
    const crossRefs = await this.analyzeCrossRefs(results);
    
    // Combine results
    const combined = this.combineResults(results, crossRefs);
    
    return {
      repositories: Object.fromEntries(results),
      crossRefs,
      combined,
    };
  }
  
  async analyzeCrossRefs(results) {
    const crossRefs = [];
    
    for (const [sourceName, sourceResult] of results) {
      for (const [targetName, targetResult] of results) {
        if (sourceName === targetName) continue;
        
        const imports = this.findCrossRepoImports(
          sourceResult.files,
          targetResult.files,
          targetName
        );
        
        if (imports.length > 0) {
          crossRefs.push({
            source: sourceName,
            target: targetName,
            imports: imports.map(i => ({
              file: i.file,
              target: i.target,
              symbol: i.symbol,
            })),
          });
        }
      }
    }
    
    return crossRefs;
  }
  
  findCrossRepoImports(sourceFiles, targetFiles, targetName) {
    const imports = [];
    const targetPaths = new Set(targetFiles.map(f => f.path));
    
    for (const file of sourceFiles) {
      // Look for import statements referencing target repo
      const importPattern = new RegExp(
        `from ['"](\.\.\/)*${targetName}\/([^'"]+)['"]`,
        'g'
      );
      
      const content = fs.readFileSync(file.path, 'utf-8');
      let match;
      while ((match = importPattern.exec(content)) !== null) {
        imports.push({
          file: file.path,
          target: match[2],
          symbol: 'import',
        });
      }
    }
    
    return imports;
  }
  
  combineResults(results, crossRefs) {
    const combined = {
      files: [],
      totalTokens: 0,
      totalLines: 0,
      languages: {},
      repositories: [],
    };
    
    for (const [name, result] of results) {
      combined.files.push(...result.files.map(f => ({
        ...f,
        repository: name,
      })));
      
      combined.totalTokens += result.totalTokens;
      combined.totalLines += result.totalLines;
      
      combined.repositories.push({
        name,
        fileCount: result.files.length,
        tokens: result.totalTokens,
        lines: result.totalLines,
      });
      
      for (const [lang, count] of Object.entries(result.languages || {})) {
        combined.languages[lang] = (combined.languages[lang] || 0) + count;
      }
    }
    
    return combined;
  }
}
```

### Step 3: Create Workspace Output Formatter

```javascript
// lib/workspace/WorkspaceFormatter.js

export class WorkspaceFormatter {
  formatMarkdown(analysis) {
    let output = '# Multi-Repository Context\n\n';
    output += `Generated: ${new Date().toISOString()}\n\n`;
    
    // Repository summary
    output += '## Repository Summary\n\n';
    output += '| Repository | Files | Tokens | % of Total |\n';
    output += '|------------|-------|--------|------------|\n';
    
    for (const repo of analysis.combined.repositories) {
      const percent = ((repo.tokens / analysis.combined.totalTokens) * 100).toFixed(1);
      output += `| ${repo.name} | ${repo.fileCount} | ${repo.tokens.toLocaleString()} | ${percent}% |\n`;
    }
    
    output += `| **Total** | **${analysis.combined.files.length}** | **${analysis.combined.totalTokens.toLocaleString()}** | **100%** |\n\n`;
    
    // Cross-references
    if (analysis.crossRefs.length > 0) {
      output += '## Cross-Repository Dependencies\n\n';
      for (const ref of analysis.crossRefs) {
        output += `- **${ref.source}** → **${ref.target}** (${ref.imports.length} imports)\n`;
      }
      output += '\n';
    }
    
    // File contents
    output += '## Repository Contents\n\n';
    
    for (const [name, result] of Object.entries(analysis.repositories)) {
      output += `### ${name}\n\n`;
      
      for (const file of result.files) {
        output += `#### ${file.path}\n\n`;
        output += '```\n';
        output += file.content || '[Content not available]';
        output += '\n```\n\n';
      }
    }
    
    return output;
  }
  
  formatJSON(analysis) {
    return JSON.stringify({
      generated: new Date().toISOString(),
      repositories: analysis.combined.repositories,
      crossRefs: analysis.crossRefs,
      files: analysis.combined.files,
      summary: {
        totalTokens: analysis.combined.totalTokens,
        totalLines: analysis.combined.totalLines,
        fileCount: analysis.combined.files.length,
      },
    }, null, 2);
  }
}
```

### Step 4: Add CLI Commands

```javascript
// bin/cli.js

program
  .command('workspace')
  .description('Manage multi-repository workspaces')
  .command('init')
  .description('Create a new workspace configuration')
  .action(async () => {
    const config = new WorkspaceConfig('.ctxman-workspace.json');
    await config.createInteractive();
    console.log('\n✅ Workspace configuration created\n');
  });

program
  .command('workspace')
  .command('add <path>')
  .description('Add a repository to the workspace')
  .action(async (repoPath) => {
    const config = new WorkspaceConfig('.ctxman-workspace.json');
    const workspace = await config.load();
    
    if (!workspace) {
      console.log('No workspace found. Run: ctxman workspace init');
      return;
    }
    
    workspace.repositories.push({
      name: path.basename(repoPath),
      path: repoPath,
      type: 'other',
    });
    
    await config.save(workspace);
    console.log(`\n✅ Added ${repoPath} to workspace\n`);
  });

program
  .option('-w, --workspace', 'Analyze entire workspace')
  .action(async (options) => {
    if (options.workspace) {
      const config = new WorkspaceConfig('.ctxman-workspace.json');
      const workspace = await config.load();
      
      if (!workspace) {
        console.log('No workspace found. Run: ctxman workspace init');
        return;
      }
      
      const scanner = new MultiRepoScanner(workspace);
      await scanner.init();
      
      console.log('\n📊 Multi-Repository Analysis\n');
      
      const analysis = await scanner.scanAll();
      
      // Display summary
      displayWorkspaceSummary(analysis);
      
      // Save output
      const formatter = new WorkspaceFormatter();
      const output = options.json
        ? formatter.formatJSON(analysis)
        : formatter.formatMarkdown(analysis);
      
      await fs.writeFile('llm-context.md', output);
      console.log('\n📁 Generated context: llm-context.md\n');
    }
  });

function displayWorkspaceSummary(analysis) {
  console.log('Repository         Files    Tokens     % of Total');
  console.log('─'.repeat(50));
  
  for (const repo of analysis.combined.repositories) {
    const percent = ((repo.tokens / analysis.combined.totalTokens) * 100).toFixed(1);
    console.log(
      `${repo.name.padEnd(18)} ${String(repo.fileCount).padStart(6)} ${String(repo.tokens.toLocaleString()).padStart(10)} ${percent.padStart(10)}%`
    );
  }
  
  console.log('─'.repeat(50));
  console.log(
    `Total${' '.repeat(13)} ${String(analysis.combined.files.length).padStart(6)} ${String(analysis.combined.totalTokens.toLocaleString()).padStart(10)} ${'100.0%'.padStart(11)}`
  );
  
  if (analysis.crossRefs.length > 0) {
    console.log('\n🔗 Cross-repository dependencies:');
    for (const ref of analysis.crossRefs) {
      console.log(`├── ${ref.source} → ${ref.target} (${ref.imports.length} imports)`);
    }
  }
}
```

---

## Acceptance Criteria

### Must Have
- [ ] `ctxman workspace init` creates workspace config
- [ ] `ctxman --workspace` analyzes all repos
- [ ] Cross-repository dependency detection
- [ ] Combined output generation

### Should Have
- [ ] `ctxman workspace add <path>` adds repo
- [ ] `ctxman workspace remove <name>` removes repo
- [ ] Separate output files per repository

### Nice to Have
- [ ] Workspace-level configuration profiles
- [ ] Automatic workspace detection (monorepo)
- [ ] Git submodule integration

---

## Success Metrics

### Quantitative Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Multi-repo adoption | 30% of enterprise users | Analytics |
| Cross-ref accuracy | 90% correct | Manual review |
| Time saved | 15 min per multi-repo task | User testing |

### Qualitative Metrics

- [ ] Users report easier cross-repo development
- [ ] Reduced context switching overhead
- [ ] Better visibility into dependencies

---

## Timeline

| Task | Effort | Week |
|------|--------|------|
| Workspace configuration | 4 hours | Week 1 |
| Multi-repo scanner | 8 hours | Week 1-2 |
| Cross-ref analysis | 6 hours | Week 2 |
| Output formatting | 4 hours | Week 2 |
| CLI commands | 4 hours | Week 3 |
| Testing & docs | 4 hours | Week 3 |

**Total Estimated Effort**: 30 hours over 3 weeks

---

## References

- [Turborepo Monorepo Patterns](https://turbo.build/repo/docs)
- [Nx Workspace Configuration](https://nx.dev/reference/workspace-configuration)
- [Lerna Multi-Package Repositories](https://lerna.js.org/)

---

*Planned by: Ctxman Development Team*
*Target: Q2 2025*
