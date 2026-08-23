# Architecture Documentation

This document describes the architecture of Ctxman v3.0.0 - the AI Development Platform.

## Table of Contents

- [Overview](#overview)
- [Core Modules](#core-modules)
- [Plugin System](#plugin-system)
- [Data Flow](#data-flow)
- [Directory Structure](#directory-structure)
- [Key Components](#key-components)
- [Extension Points](#extension-points)

## Overview

Ctxman is built with a modular architecture designed for extensibility and performance. The platform consists of:

1. **Core Modules** - Scanner, Analyzer, ContextBuilder, Reporter
2. **Plugin System** - Extensible language and exporter plugins
3. **Integrations** - Git, MCP Server, REST API
4. **UI Layer** - Terminal UI with Ink (React-based)

### Design Principles

- **Modularity**: Each component has a single responsibility
- **Extensibility**: Plugin system for languages and exporters
- **Performance**: Caching, parallel processing, lazy loading
- **Testability**: Dependency injection, pure functions, isolated modules

## Core Modules

### Scanner (`lib/core/Scanner.js`)

Responsible for file system traversal and discovery.

**Responsibilities:**

- Recursively scan directories
- Respect `.gitignore` and `.contextignore` rules
- Filter binary files
- Collect file metadata

**API:**

```javascript
const scanner = new Scanner(projectPath, options);
const files = scanner.scan();
// Returns: Array<{path, relativePath, name, extension, size, modified}>
```

**Options:**

- `respectGitignore` - Honor `.gitignore` rules (default: true)
- `followSymlinks` - Follow symbolic links (default: false)
- `maxDepth` - Maximum directory depth (default: Infinity)

### Analyzer (`lib/core/Analyzer.js`)

Token and method analysis engine.

**Responsibilities:**

- Calculate token counts using tiktoken
- Extract methods/functions from code
- Detect programming languages
- Generate statistics

**API:**

```javascript
const analyzer = new Analyzer({ methodLevel: true });
const result = await analyzer.analyze(files);
// Returns: { files: AnalysisResult[], stats: Statistics }
```

**Analysis Result:**

```javascript
{
  path: string,
  relativePath: string,
  tokens: number,
  lines: number,
  language: string,
  methods?: Method[],      // If methodLevel: true
  methodCount?: number
}
```

### ContextBuilder (`lib/core/ContextBuilder.js`)

Smart context generation for LLM consumption.

**Responsibilities:**

- Build optimized file lists
- Apply LLM-specific optimizations
- Generate multiple output formats
- Handle context window constraints

**API:**

```javascript
const builder = new ContextBuilder({
  targetModel: 'claude-sonnet-4.5',
  targetTokens: 50000,
});
const context = builder.build(analysisResult);
```

### Reporter (`lib/core/Reporter.js`)

Multi-format report generation.

**Responsibilities:**

- Generate reports in multiple formats
- JSON, YAML, CSV, XML, Markdown
- GitIngest digest format
- TOON format (40-50% token reduction)

**API:**

```javascript
const reporter = new Reporter({ format: 'json' });
const report = reporter.generate(analysisResult);
await reporter.save(report, 'output.json');
```

## Plugin System

The plugin system enables extensibility without modifying core code.

### Plugin Types

1. **Language Plugins** - Add support for new programming languages
2. **Exporter Plugins** - Add new output formats

### Plugin Manager (`lib/plugins/PluginManager.js`)

**API:**

```javascript
import PluginManager from './plugins/PluginManager.js';

const manager = new PluginManager();

// Register a plugin
manager.register('language', 'rust', RustLanguagePlugin);

// Get a plugin
const rustPlugin = manager.get('language', 'rust');

// Auto-discover plugins from directories
await manager.discover();
```

### Creating a Language Plugin

```javascript
// lib/plugins/languages/RustPlugin.js
import { LanguagePlugin } from '../base/LanguagePlugin.js';

export class RustPlugin extends LanguagePlugin {
  constructor() {
    super('rust', ['.rs']);
  }

  extractMethods(content, filePath) {
    // Rust-specific method extraction
    const methodRegex = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g;
    const methods = [];
    let match;

    while ((match = methodRegex.exec(content)) !== null) {
      methods.push({
        name: match[1],
        line: this.getLineNumber(content, match.index),
        type: 'function',
      });
    }

    return methods;
  }

  getLanguage() {
    return 'Rust';
  }
}
```

### Creating an Exporter Plugin

```javascript
// lib/plugins/exporters/CustomPlugin.js
import { ExporterPlugin } from '../base/ExporterPlugin.js';

export class CustomPlugin extends ExporterPlugin {
  constructor() {
    super('custom', 'custom');
  }

  export(analysis) {
    // Custom export format
    return {
      version: '1.0',
      generated: new Date().toISOString(),
      files: analysis.files.map((f) => ({
        name: f.name,
        tokens: f.tokens,
      })),
    };
  }

  getFileExtension() {
    return '.custom';
  }
}
```

### Plugin Discovery

Plugins are auto-discovered from:

1. `lib/plugins/languages/` - Built-in language plugins
2. `lib/plugins/exporters/` - Built-in exporter plugins
3. `~/.ctxman/plugins/` - User-installed plugins
4. `./plugins/` - Project-specific plugins

## Data Flow

### Analysis Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Scanner   │────▶│   Analyzer  │────▶│  Context    │────▶│  Reporter   │
│             │     │             │     │  Builder    │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
   File List         Analysis Data      Context Data         Output Files
   (paths,           (tokens,           (optimized           (JSON, YAML,
    metadata)         methods)           file list)           TOON, etc.)
```

### Git Integration Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  GitClient  │────▶│DiffAnalyzer │────▶│   Impact    │
│             │     │             │     │   Report    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
   Git Status         Changed Files       Impact Score
   (branches,         (diff stats,        (affected
    commits)           authors)            modules)
```

### Watch Mode Flow

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│FileWatcher  │────▶│Incremental      │────▶│   Output    │
│             │     │Analyzer         │     │   Update    │
└─────────────┘     └─────────────────┘     └─────────────┘
       │                   │                     │
       ▼                   ▼                     ▼
   File Change        Re-analyze            Console/
    Events            Only Changed          Dashboard
                      Files                  Update
```

## Directory Structure

```
ctxman/
├── bin/                    # CLI entry points
│   ├── cli.js             # Main CLI
│   ├── mcp-server.js      # MCP server entry
│   └── cm-gitingest.js    # GitHub integration
│
├── lib/                    # Core library
│   ├── analyzers/         # Analysis modules
│   │   ├── method-analyzer.js
│   │   └── token-calculator.js
│   │
│   ├── api/               # API modules
│   │   ├── rest/          # REST API server
│   │   └── mcp/           # MCP server
│   │
│   ├── cache/             # Caching system
│   │   └── CacheManager.js
│   │
│   ├── core/              # Core modules
│   │   ├── Scanner.js
│   │   ├── Analyzer.js
│   │   ├── ContextBuilder.js
│   │   └── Reporter.js
│   │
│   ├── formatters/        # Output formatters
│   │   ├── toon-formatter.js
│   │   ├── gitingest-formatter.js
│   │   └── format-registry.js
│   │
│   ├── integrations/      # External integrations
│   │   └── git/
│   │       ├── GitClient.js
│   │       ├── DiffAnalyzer.js
│   │       └── BlameTracker.js
│   │
│   ├── parsers/           # File parsers
│   │   ├── gitignore-parser.js
│   │   └── method-filter-parser.js
│   │
│   ├── plugins/           # Plugin system
│   │   ├── PluginManager.js
│   │   ├── base/          # Base classes
│   │   ├── languages/     # Language plugins
│   │   └── exporters/     # Exporter plugins
│   │
│   ├── ui/                # Terminal UI (Ink)
│   │   ├── wizard.js
│   │   ├── dashboard.js
│   │   └── progress-bar.js
│   │
│   ├── utils/             # Utility functions
│   │   ├── token-utils.js
│   │   ├── file-utils.js
│   │   ├── logger.js
│   │   └── error-handler.js
│   │
│   ├── watch/             # Watch mode
│   │   ├── FileWatcher.js
│   │   └── IncrementalAnalyzer.js
│   │
│   └── wizards/           # Interactive wizards
│       └── profile-wizard.js
│
├── test/                   # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/                   # Documentation
│   ├── API.md
│   ├── ARCHITECTURE.md
│   └── content-en/
│
└── .ctxman/               # Configuration
    ├── llm-profiles.json
    └── wizard-profiles/
```

## Key Components

### Token Calculator (`lib/analyzers/token-calculator.js`)

Main orchestrator for token analysis.

**Features:**

- Exact token counting with tiktoken
- Smart estimation fallback (~95% accuracy)
- Multi-language support (14+ languages)
- Method-level analysis

### Method Analyzer (`lib/analyzers/method-analyzer.js`)

Extracts methods/functions from code files.

**Supported Languages:**

- JavaScript/TypeScript
- Python
- PHP
- Ruby
- Java
- Kotlin
- C#
- Go
- Rust
- Swift
- C/C++
- Scala

### Cache Manager (`lib/cache/CacheManager.js`)

Performance optimization through caching.

**Cache Types:**

- **Memory Cache**: Fast, in-process cache
- **Disk Cache**: Persistent cache across sessions

**Cache Keys:**

- File path + modification time
- Analysis results
- Token counts

### Git Integration (`lib/integrations/git/`)

**GitClient**: Git operations wrapper

- Status, log, diff operations
- Branch and commit information

**DiffAnalyzer**: Change impact analysis

- Changed file detection
- Impact scoring
- Module identification

**BlameTracker**: Author attribution

- Last modifier information
- Commit history analysis

## Extension Points

### 1. Language Support

Add a new language plugin to support additional programming languages:

```javascript
// 1. Create the plugin
// lib/plugins/languages/NewLangPlugin.js

// 2. Register in PluginManager
// lib/plugins/PluginManager.js

// 3. Add tests
// test/plugins/languages/new-lang.test.js
```

### 2. Output Formats

Add a new exporter plugin for custom output formats:

```javascript
// 1. Create the plugin
// lib/plugins/exporters/NewFormatPlugin.js

// 2. Register in FormatRegistry
// lib/formatters/format-registry.js

// 3. Add CLI option
// bin/cli.js
```

### 3. Analysis Hooks

Hook into the analysis pipeline:

```javascript
// Before analysis
scanner.on('beforeScan', (path) => {
  console.log(`Scanning: ${path}`);
});

// After analysis
analyzer.on('afterAnalyze', (result) => {
  console.log(`Found ${result.stats.totalFiles} files`);
});
```

### 4. Custom Wizards

Create specialized wizards for different use cases:

```javascript
// lib/wizards/custom-wizard.js
import { Wizard } from '../ui/wizard.js';

export class CustomWizard extends Wizard {
  async run() {
    // Custom wizard flow
  }
}
```

## Performance Characteristics

| Operation          | Time       | Notes              |
| ------------------ | ---------- | ------------------ |
| Scan 1000 files    | ~100ms     | Parallel traversal |
| Token analysis     | ~30ms/file | With cache: ~5ms   |
| Method extraction  | ~10ms/file | Language dependent |
| Context generation | ~50ms      | For 100 files      |
| Report generation  | ~20ms      | JSON format        |

## Memory Usage

- **Base**: ~45MB (Node.js runtime)
- **Per 1000 files**: +5MB
- **With tiktoken**: +20MB (model data)
- **Peak during analysis**: ~100MB

## Testing Architecture

```
test/
├── unit/           # Fast, isolated tests
├── integration/    # Module interaction tests
├── e2e/           # End-to-end CLI tests
└── fixtures/      # Test data files
```

**Test Commands:**

- `npm run test` - All tests
- `npm run test:coverage` - With coverage
- `npm run test:v3` - Platform features
- `npm run test:git` - Git integration
- `npm run test:plugin` - Plugin system
- `npm run test:api` - REST API

---

_Architecture Version: 3.0.0 | Last Updated: 2025-08-23_
