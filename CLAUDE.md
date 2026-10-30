# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ctxman** is an AI Development Platform with plugin architecture, Git integration, REST API, and real-time analysis capabilities. It provides method-level filtering and per-model token counting for 14+ programming languages, generating optimized context for AI assistants.

**Core Capabilities (v3.x):**

- **Plugin Architecture**: Modular system for languages and exporters
- **Git Integration**: Analyze changed files, diff analysis, author tracking, GitHub/GitLab history discussions
- **Watch Mode**: Real-time file monitoring and auto-analysis
- **REST API & MCP Server**: HTTP server with 6 endpoints and MCP server with 15 tools
- **Performance**: Fast scanning, reused tiktoken encoders, and disk/memory `CacheManager` caching across `Analyzer`, `TokenCalculator`, and `MCPServer`; watch mode re-analyzes only changed files (analysis runs single-threaded)
- **LLM Optimization**: Auto-detect target LLM and optimize context
- **Multi-language**: 14+ languages with method-level analysis
- **Multiple Formats**: TOON (40-50% reduction), JSON, YAML, CSV, XML, GitIngest, Markdown

## Architecture

### v3.0.0+ Modular Architecture

**Core Modules** (`lib/core/`):

- `Scanner.js` - File system scanning with ignore rules (~1,900 text files of a 2,600-file tree in ~75 ms; discovery only)
- `Analyzer.js` - Token & method analysis with optional `CacheManager` disk/memory caching (sequential; the `parallel` option is not implemented)
- `ContextBuilder.js` - Smart context generation with LLM optimization
- `Reporter.js` - Multi-format report generation

**Plugin System** (`lib/plugins/`):

- `PluginManager.js` - Plugin lifecycle management with lazy loading
- `LanguagePlugin.js` - Base class for language analyzers
- `ExporterPlugin.js` - Base class for format exporters

**Git Integration** (`lib/integrations/git/`):

- `GitClient.js` - Git operations wrapper (diff, blame, history)
- `DiffAnalyzer.js` - Change impact analysis and related files detection
- `BlameTracker.js` - Author attribution and hot spot detection

**Watch Mode** (`lib/watch/`):

- `FileWatcher.js` - Real-time file watching with debounce
- `IncrementalAnalyzer.js` - Incremental analysis with caching

**API Server** (`lib/api/rest/`):

- `server.js` - HTTP/REST API with 6 endpoints

**Context Commands** (each a `bin/cm-<name>.js` subcommand with a library module):

- `lib/pack/` - `ctxman pack`: selection, budget (map ranking), signatures-only compression, split, renderers (xml/markdown/plain/json), and multi-repo `--repo` packing
- `lib/focus/` - `ctxman focus`: directional BFS neighborhood slice (`--depth N`, default 2) around a target file/symbol (`imports` + `importers` without shared-hub explosion), packed target-first within `--budget`
- `lib/count/` - `ctxman count`: token count for one model; `lib/utils/claude-token-counter.js` counts Claude models exactly through Anthropic's count_tokens API (`--api`)
- `lib/map/` - `ctxman map`: import graph (`imports.js`, `resolver.js`), PageRank + git history + symbol references (`rank.js`), budgeted rendering (`render.js`), and multi-repo `--repo` maps
- `lib/pr/` - `ctxman pr`: branch review context (diff parsing, changed methods, related tests, budgeted rendering)
- `lib/why/` - `ctxman why`: history of a file, symbol or line range (`git log -L`), references, blame ownership, co-change coupling, related docs and tests, plus optional GitHub/GitLab PR/MR/issue discussions (`--discussions`, `discussions.js`)
- `lib/search/` - `ctxman search` and the MCP `search_code` / `get_symbol` tools: BM25 over methods and code chunks, hybrid BM25 + semantic vector RRF fusion (`--hybrid`, `hybrid.js`), and multi-repo `--repo` search
- `lib/workspace/` - multi-repository workspace orchestration (`resolveWorkspaceRepos`, `mapWorkspace`, `searchWorkspace`, `packWorkspace`) under `<alias>/<path>` namespaces and a single shared token budget
- `lib/policy/` - export policy (`.ctxman/policy.json`, `CTXMAN_POLICY`), enforcement, audit log, AI-tool ignore files; `ctxman policy` / `ctxman audit`
- `lib/api/mcp/` - `ctxman mcp` (`start.js`), client setup (`install.js`), `--root` sandbox (`sandbox.js`)
- `action.yml`, `scripts/action/` - GitHub Action; `Dockerfile` - container image
- `lib/utils/cli-output.js` - quiet exit when stdout's reader closes (EPIPE)

**Performance** (`lib/cache/`):

- `CacheManager.js` - Disk/memory caching system (`resolveCacheManager`, SHA-256 discriminated keys, `mtimeMs` + `size` invalidation), wired into `Analyzer`, `TokenCalculator` (`--cache` / `--no-cache`), and `MCPServer`

**Legacy Components** (backward compatible):

- `ctxman.js` - Legacy TokenCalculator (still supported)
- `lib/analyzers/` - Token calculator, method analyzer
- `lib/formatters/` - TOON, GitIngest formatters
- `lib/parsers/` - GitIgnore, method filter parsers
- `lib/utils/` - Token, file, clipboard, config, git, logger utils

**Entry Points**:

- `index.js` - Module exports for programmatic API (`index.d.ts` TypeScript declarations kept 1:1 in sync)
- `bin/cli.js` - CLI interface with wizard, serve, watch, and context subcommands

### Filtering System

**Priority Order:**

1. `.gitignore` (always respected)
2. `.contextinclude` (INCLUDE mode - when exists, ignores .contextignore)
3. `.contextignore` (EXCLUDE mode - fallback)
4. `.methodinclude` (method-level INCLUDE mode)
5. `.methodignore` (method-level EXCLUDE mode)

**Pattern Syntax:**

- `**/*.js` - Recursive glob
- `!pattern` - Negation
- `*Handler` - Wildcard matching
- `Class.*` - Class method matching

### Token Counting

Uses the tiktoken library (a regular dependency, so a plain `npm install ctxman` counts with it) with the encoding of `--target-model`: `o200k_base` for OpenAI models since GPT-4o, `cl100k_base` otherwise and when no model is given (`TokenUtils.encodingFor`, `encodingForModel` in `lib/utils/tokenizer-adapter.js`). Counts are exact for OpenAI models up to GPT-5.x; for GPT-6 (encoding unpublished), Claude, Gemini and other vendors they are approximate and labelled so. `ctxman count [path|-] --model ID [--api] [--json]` (`bin/cm-count.js`, `lib/count/`) counts for one model; with `--api` it counts Claude models exactly through Anthropic's count_tokens API (`lib/utils/claude-token-counter.js`; needs the optional `@anthropic-ai/sdk` and `ANTHROPIC_API_KEY`, sends secret-redacted text). Falls back to smart estimation (~95% accuracy) based on file extension if tiktoken cannot be loaded. Each encoder is built once and reused (building one costs ~150 ms).

Model data (ids, context/output windows, prices with long-prompt tiers, status, aliases) lives in `.ctxman/llm-profiles.json` (checked 2026-10-30) and is read by `lib/utils/llm-detector.js`, `--list-llms` and `--estimate-cost`. `DEFAULT_TARGET_MODEL` is `claude-sonnet-5-5`; old ids such as `claude-sonnet-4.5` resolve through aliases.

## Development Commands

### Testing

```bash
npm test                  # Run full Vitest suite
npm run test:all          # Run all test suites
npm run test:v3           # v3.0.0 core tests (12 tests)
npm run test:llm          # LLM detection tests
npm run test:git          # Git integration tests
npm run test:plugin       # Plugin system tests
npm run test:api          # API server tests
npm run test:watch        # Watch mode tests
npm run test:comprehensive # Complete test suite
```

### Analysis

```bash
npm run analyze                   # Interactive wizard (default)
npm run analyze:cli               # CLI mode
npm run analyze:methods           # Method-level analysis
ctxman --save-report     # Detailed JSON report
ctxman -m --context-clipboard  # Method-level to clipboard
```

### Platform & Context Commands

```bash
npm run serve                     # Start API server (port 3000)
npm run watch                     # Start watch mode
ctxman --changed-only    # Analyze only changed files
ctxman --changed-since main  # Analyze changes since branch
ctxman --list-llms       # List supported LLM models (--all adds retired ones)
ctxman count --model claude-sonnet-5-5 --api  # Token count for one model (exact for Claude with --api)
ctxman map --tokens 4096 # Ranked repository map within a token budget (--repo for multi-repo)
ctxman focus src/server.js --depth 2 --budget 20k  # Import-neighborhood slice around a file
ctxman pr --base main    # Review context for the current branch
ctxman why src/server.js --discussions  # Git history + GitHub/GitLab PR/issue discussions
ctxman search "query" --hybrid  # Hybrid BM25 + semantic vector RRF code search
ctxman pack --repo ../api --repo ../web --budget 80k  # Multi-repo pack under shared budget
ctxman mcp install --client claude-code  # MCP server setup
ctxman policy check      # Validate the export policy; ctxman audit lists exports
```

### Build & Publish

```bash
npm run build          # No-op (no build required)
npm run prepublishOnly # Runs tests before publish
```

### Manual Testing

```bash
cd test-repos/express             # Navigate to Express test repo
ctxman --cli -m          # Test with Express.js
./scripts/quick-test-v3.sh        # Run quick test suite (9 tests)
```

## Key Workflows

### File-Level Analysis

1. Scan directory tree recursively
2. Apply .gitignore rules
3. Apply context include/exclude rules
4. Calculate tokens for each file
5. Generate statistics and reports

### Method-Level Analysis

1. Extract methods from 14+ programming languages using language-specific regex patterns
2. Filter methods using .methodinclude/.methodignore
3. Calculate tokens per method
4. Generate method-centric context

### LLM Context Export

Generates compact JSON format:

```json
{
  "project": { "root": "...", "totalFiles": 64, "totalTokens": 181480 },
  "paths": { "src/core/": ["server.js", "handler.js"] }
}
```

Method-level format includes method names, line numbers, and token counts per file.

## Important Implementation Details

### Method Extraction Patterns

**JavaScript/TypeScript:** Uses 5 regex patterns to detect function declarations:

- Named functions: `function name()`
- Object methods: `name: function()`
- Arrow functions: `const name = () =>`
- Async functions: `async name()`
- Getters/Setters: `get/set name()`
- Class methods: `name() {}`

**Rust:** Uses regex patterns to detect:

- Free functions: `pub fn function_name()` or `fn function_name()`
- Impl methods: `fn method_name()` (inside impl blocks)
- Supports modifiers: `async`, `const`, `unsafe`, `pub`

**C#:** Uses 3 regex patterns to detect methods:

- Standard methods: `public/private/protected/internal static/async returnType MethodName(params)`
- Properties: `Type PropertyName { get; set; }`
- Expression-bodied members: `Type MethodName() => expression`
- Supports generic types, constraints, and all access modifiers

**Go:** Uses 3 regex patterns to detect functions and methods:

- Regular functions: `func FunctionName(params) returnType`
- Methods with receivers: `func (r *Receiver) MethodName(params) returnType`
- Interface methods: `MethodName(params) returnType` (within interface declarations)

**Java:** Uses 2 regex patterns to detect method declarations:

- Methods with modifiers: `public/private/protected static returnType methodName()`
- Constructors: `ClassName()`
- Supports generic types, throws clauses, and access modifiers

**Python:** Uses 2 regex patterns to detect:

- Functions: `def function_name()` or `async def function_name()`
- Decorated methods: `@staticmethod/@classmethod def method_name()`

**PHP:** Uses 2 regex patterns to detect:

- Functions: `function function_name()`
- Methods: `public/private/protected static function method_name()`

**Ruby:** Detects method definitions:

- Methods: `def method_name` or `def self.method_name`
- Supports question/exclamation marks: `method?` and `method!`

**Kotlin:** Detects function definitions:

- Functions: `fun functionName()` with support for `suspend`, `inline` modifiers
- Extension functions: `Type.functionName()`

**Swift:** Uses 2 regex patterns:

- Functions: `func functionName()` with access modifiers
- Initializers: `init()`

**C/C++:** Uses 2 regex patterns:

- Functions: Return type + function name with optional `virtual`, `static`, `inline` modifiers
- Constructors: `ClassName::ClassName()`

**Scala:** Detects methods and functions:

- Methods: `def methodName` with optional `override`
- Lambda assignments: `val name = () => ...`

### Configuration File Discovery

Searches in order:

1. Script directory (`__dirname`)
2. Project root (`process.cwd()`)

### Cross-Platform Clipboard

Supports macOS (pbcopy), Linux (xclip/xsel), Windows (clip) via child_process.execSync

### Interactive Export Mode

When no export flags provided, prompts user to choose:

1. Save detailed JSON report
2. Generate LLM context file
3. Copy to clipboard
4. Skip export

## Code Style

- ES6 class syntax for core components
- Regex-based parsing (no AST dependencies)
- Graceful fallbacks (estimation if tiktoken cannot be loaded, clipboard fallback to file, BM25 fallback when optional vector packages are absent)
- Minimal dependencies (heavy or networked extras such as `@anthropic-ai/sdk` or the `ask`/semantic search stack stay optional)
- No TypeScript, pure JavaScript for maximum portability (`index.d.ts` declarations maintained alongside `index.js`)
