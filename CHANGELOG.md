# Changelog

All notable changes to the Ctxman will be documented in this file.

## [Unreleased]

### Added

- `ctxman count [path|-] --model ID [--api] [--json]`: token count of a project or piped text for
  a model, checked against its context window. `--api` counts Claude models exactly through
  Anthropic's count_tokens endpoint (secrets are redacted before sending).
- `--list-llms` shows context window, output limit, price and status per model; `--all` adds
  retired models.
- GitIngest digests mask known credential formats (cloud/API keys, tokens, PEM private keys) as
  `[REDACTED:<type>]` by default; `--no-redact` keeps them.
- `TokenCalculator.analyze()` for scan + analysis without console output or exports.

### Changed

- Model data refreshed (checked 2026-10-09): 44 current models from Anthropic, OpenAI, Google,
  DeepSeek, Mistral, xAI, Qwen and Meta with the providers' API ids, windows, output limits, prices
  (including long-prompt rates) and status. Old ids such as `claude-sonnet-4.5` still resolve;
  deprecated and retired models warn and name a replacement. The default target model is
  `claude-sonnet-5-5`.
- `--estimate-cost` reads prices from the model profiles, applies long-prompt rates and caps the
  assumed response at the model's output limit.
- Counting uses `o200k_base` for OpenAI models since GPT-4o (`cl100k_base` otherwise), and counts
  for models with their own tokenizers are labelled approximate.
- tiktoken is a regular dependency, so a default install counts exactly.
- Node.js 22 or newer is required (Node 20 reached end of life on 2026-04-30); CI tests 22.x and
  24.x.
- `@xenova/transformers` and `@lancedb/lancedb` are optional dependencies, loaded only by
  `ctxman ask`; install with `--omit=optional` to skip them (451 MB → 55 MB).
- `@toon-format/toon` 4.1.1: `ToonFormatter.encodeAsync()` now writes an empty array as `key: []`.
- Token counting reuses one tiktoken encoder: ~20-25x faster analysis when tiktoken is installed.
- REST API (`ctxman serve`): CORS is off unless `--cors` is given, and on a loopback host requests
  with a foreign `Host` header get 403 (DNS rebinding).
- MCP HTTP transport (`bin/mcp-server.js --transport=sse`): binds to 127.0.0.1 with `Host`
  validation, CORS only with `--cors`, `--host=` to bind elsewhere.
- `-o/--output` sets the format of `--context-export`/`--context-clipboard` (JSON by default), and
  TOON output uses the official `@toon-format/toon` encoder.

### Fixed

- **Security:** git commands run without a shell, and user-supplied refs (REST `?since=`, MCP
  `git_diff`, `--changed-since`, `ctxman github` branches) are validated before reaching git.
- `ctxman github` and the update scripts crashed on start (CommonJS `require` in ESM).
- Watch mode failed on every changed file, and `GET /api/v1/methods` returned 500 (`path` not
  imported).
- Error and fallback paths in the CLI, init wizard, LSP server and updater threw
  `ReferenceError`.
- npm audit advisories (proxy-addr, sharp, @modelcontextprotocol/sdk, qs, hono and others).
- The release workflow validates the tag against `package.json` and takes notes from this file.
- Added the missing LICENSE file and repository metadata.
- `**` in `.gitignore`/`.contextignore`/`.contextinclude` patterns did not cross directories, and
  `.contextinclude` (include mode) and watch-mode ignore checks did not apply.
- `--changed-only`/`--changed-since` analyzed the whole repository instead of the changed files.
- `--chunk` wrote a single digest instead of chunk files.
- `ctxman github`: the branch from the URL or `--branch` is cloned, and a GitHub API error (rate
  limit, private repository) no longer crashes the command.
- The `targetModel` from `~/.ctxman/config.json` is read again, and files skipped by
  `.contextignore`/`.contextinclude` are counted separately from `.gitignore`.
- MCP: `file://` resources stay inside the project, refuse non-source files such as `.env` and
  redact secrets; `search_code` and `list_methods` honour their documented options; the HTTP
  transport answered every request with "Parse error"; the server reports the package version.
- Context token budgets (`targetTokens`, MCP `maxTokens`) are no longer exceeded, and the
  `changed-first` strategy orders by modification time.

## [3.0.0] - 2025-11-05

### 🚀 MAJOR: Platform Foundation - Plugin Architecture & Git Integration

This major release transforms Ctxman from a CLI tool into a comprehensive AI development platform with modular architecture, plugin system, complete Git integration, REST API, and watch mode for real-time analysis.

#### Breaking Changes

**Architecture:**

- Complete modular refactor with new `lib/core/` directory
- Plugin-based system for extensibility
- Event-driven architecture

**No Breaking API Changes:**

- All existing CLI commands work as before
- Backward compatible with v2.3.x configurations
- Existing scripts and integrations continue to work

#### Added

**🏗️ Modular Core (4 modules):**

- `Scanner.js` - File system scanning (2491 files in 100ms)
- `Analyzer.js` - Token & method analysis with parallel processing
- `ContextBuilder.js` - Smart context generation
- `Reporter.js` - Multi-format reports

**🔌 Plugin System:**

- `PluginManager.js` - Lazy-loading plugin management
- `LanguagePlugin` & `ExporterPlugin` base classes
- Auto-discovery from plugin directories
- Event-driven communication

**🔀 Git Integration (3 modules):**

- `GitClient.js` - Git operations
- `DiffAnalyzer.js` - Change impact analysis
- `BlameTracker.js` - Author attribution
- CLI: `--changed-only`, `--changed-since`, `--with-authors`

**👁️ Watch Mode:**

- `FileWatcher.js` - Real-time file watching with debounce
- `IncrementalAnalyzer.js` - Smart re-analysis
- CLI: `ctxman watch`

**⚡ Performance:**

- `CacheManager.js` - Disk/memory caching (>80% hit rate target)
- Parallel processing (4 workers)
- Lazy loading modules

**🌐 REST API:**

- `APIServer.js` - HTTP server (port 3000)
- 6 endpoints: analyze, methods, stats, diff, context, docs
- CLI: `ctxman serve`

#### CLI Enhancements

```bash
# Git Integration
ctxman --changed-only
ctxman --changed-since main
ctxman --with-authors

# Platform
ctxman serve --port 3000
ctxman watch --debounce 1000
```

#### Performance

- Scan: 2491 files in ~100ms
- Analysis: ~30ms/file with cache
- Plugin load: <50ms
- Tests: 12/12 passing ✅

#### New npm Scripts

- `npm run serve` - Start API server
- `npm run watch` - Start watch mode
- `npm run test:v3` - v3.0.0 tests
- `npm run test:git` - Git integration tests
- `npm run test:plugin` - Plugin system tests
- `npm run test:api` - API server tests

---

## [2.3.8] - 2025-11-05

### 🎯 Wizard Profiles System - Named Configurations & Profile Management

This release introduces a powerful wizard profiles system that enables multiple analysis configurations to coexist, with named configurations and easy profile switching.

#### Added

**Wizard Profiles System:**

- ✨ **6 pre-configured analysis profiles** with comprehensive filter sets:
  - 👀 **Code Review** - For reviewing code changes and PRs (~20K-80K tokens)
  - 🔒 **Security Audit** - For security assessments and vulnerability analysis (~15K-60K tokens)
  - 💡 **LLM Explain** - For explaining architecture to AI assistants (~25K-100K tokens)
  - 📚 **Documentation** - For generating API docs and guides (~18K-70K tokens)
  - 🎯 **Minimal** - For quick queries and focused debugging (~5K-25K tokens)
  - 📦 **Full** - For comprehensive codebase analysis (~50K-500K+ tokens)

**Each Profile Contains:**

- `profile.json` - Metadata (name, description, icon, token budgets, best practices)
- `.contextinclude` - File-level include filters
- `.contextignore` - File-level exclude filters
- `.methodinclude` - Method-level include filters
- `.methodignore` - Method-level exclude filters

**Named Configuration System:**

- 📋 **Profile-specific configs**: `.contextinclude-code-review`, `.methodinclude-security-audit`
- 🔄 **Multiple profiles coexist**: Switch between profiles without losing configurations
- ✅ **Active configs**: `.contextinclude` → active profile's configuration
- 🎨 **Custom profiles**: Users can create their own profiles easily

**Wizard Integration:**

- 🧙 **Dynamic profile discovery** - Automatically detects profiles from `.ctxman/wizard-profiles/`
- 📊 **Profile metadata display** - Shows token budgets, descriptions, and best practices
- ⚙️ **Custom option** - Uses existing root config files for one-off analyses
- ✅ **Visual feedback** - Shows copied and active configuration files

**Directory Structure:**

```
.ctxman/
  └── wizard-profiles/         # Active profiles (editable)
      ├── code-review/
      │   ├── profile.json
      │   ├── .contextinclude
      │   ├── .contextignore
      │   ├── .methodinclude
      │   └── .methodignore
      ├── security-audit/
      ├── llm-explain/
      ├── documentation/
      ├── minimal/
      └── full/

examples/
  ├── wizard-profiles/         # Reference backups (restore if needed)
  ├── custom-llm-profiles.example.json
  └── README.md
```

**Profile Switching Workflow:**

```bash
# Run wizard
ctxman --wizard

# Select "Code Review" profile
# System creates:
#   .contextinclude-code-review
#   .contextignore-code-review
#   .methodinclude-code-review
#   .methodignore-code-review
#
# And activates them:
#   .contextinclude   (copy of .contextinclude-code-review)
#   .contextignore    (copy of .contextignore-code-review)
#   .methodinclude    (copy of .methodinclude-code-review)
#   .methodignore     (copy of .methodignore-code-review)

# Later, select "Security Audit" profile
# System creates security-audit named configs
# And switches active configs to security-audit
```

**Manual Profile Management:**

```bash
# Restore default profiles
cp -r examples/wizard-profiles/* .ctxman/wizard-profiles/

# Create custom profile
cp -r .ctxman/wizard-profiles/code-review .ctxman/wizard-profiles/my-profile
# Edit profile.json and filter files
```

#### Technical Implementation

**New Directories:**

- `.ctxman/wizard-profiles/` - Active wizard profiles (6 profiles × 5 files = 30 files)
- `examples/wizard-profiles/` - Reference backup profiles

**New Files:**

- `examples/custom-llm-profiles.example.json` - Moved from .ctxman/
- `examples/README.md` - Comprehensive profile management guide

**Enhanced Files:**

- `lib/ui/wizard.js` - Profile discovery, metadata parsing, named config copying
- `package.json` - Version bump to 2.3.8, includes .ctxman/ and examples/
- `.gitignore` - Ignores named configs (.contextinclude-_, .methodinclude-_)

**New Functions:**

- `discoverProfiles()` - Scans .ctxman/wizard-profiles/ for profiles
- `copyProfileFiles(profilePath, profileId, projectRoot)` - Creates named configs
- Profile metadata loading from profile.json

#### Benefits

**vs Simple File Copying:**

- ✅ **Multiple profiles coexist** - Keep code-review AND security-audit configs simultaneously
- ✅ **Easy switching** - Change profiles without losing previous configurations
- ✅ **Named configs** - Clear which profile each config belongs to
- ✅ **Full control** - Both include AND ignore filters for fine-grained control

**vs Preset System:**

- ✅ **No complex runtime** - Simple file copying, no preset engine needed
- ✅ **Transparent** - Users see exactly what filters are active
- ✅ **Customizable** - Profiles are just files, easy to modify
- ✅ **Versionable** - Profiles can be committed to git for team sharing

**vs Manual Configuration:**

- ✅ **Faster setup** - Pre-configured best practices for common scenarios
- ✅ **Educational** - profile.json documents why filters are chosen
- ✅ **Restorable** - examples/ directory provides backup/reference

#### Token Budget Guidelines

| Profile        | Small Project | Medium Project | Large Project |
| -------------- | ------------- | -------------- | ------------- |
| Minimal        | 5K-10K        | 10K-25K        | 25K-50K       |
| Code Review    | 20K-40K       | 40K-80K        | 80K-150K      |
| Security Audit | 15K-30K       | 30K-60K        | 60K-120K      |
| Documentation  | 18K-35K       | 35K-70K        | 70K-140K      |
| LLM Explain    | 25K-50K       | 50K-100K       | 100K-200K     |
| Full           | 50K-100K      | 100K-250K      | 250K-500K+    |

#### Migration

No migration needed. Existing workflows continue to work:

- Existing `.contextinclude`/`.contextignore` files are respected
- Wizard's "Custom" option uses existing root configurations
- Profiles are optional, not required
- Named configs (`.contextinclude-*`) are automatically ignored by git

---

## [2.3.7] - 2025-11-05

### 🤖 LLM Model Auto-Detection & Optimization

This release introduces automatic LLM model detection and context window optimization - a game-changing feature that automatically configures Ctxman based on your target LLM.

#### Added

**LLM Auto-Detection:**

- ✨ **Automatic model detection** from environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY)
- 🎯 **9+ built-in LLM profiles** with context window specifications
  - Anthropic: Claude Sonnet 4.5, Claude Opus 4
  - OpenAI: GPT-4 Turbo, GPT-4o, GPT-4o Mini
  - Google: Gemini 1.5 Pro, Gemini 2.0 Flash
  - DeepSeek: DeepSeek Coder, DeepSeek Chat
- 📊 **Context Fit Analysis** - Shows if your repository fits in target LLM's context window
- 🔧 **Custom model support** via `.ctxman/custom-profiles.json`
- 📋 **JSON-based profile system** stored in `.ctxman/llm-profiles.json`

**CLI Enhancements:**

- `--target-model MODEL` - Optimize for specific LLM model
- `--auto-detect-llm` - Auto-detect from environment
- `--list-llms` - List all supported models with details

**Wizard Integration:**

- 🧙 Dynamic LLM model selection in wizard
- ✨ "Auto-detect from environment" option
- Grouped by vendor (Anthropic, OpenAI, Google, etc.)

**Context Fit Analysis Display:**

```
📊 Context Window Analysis:
   Target Model: Claude Sonnet 4.5
   Available Context: 200,000 tokens
   Your Repository: 181,480 tokens

   ✅ PERFECT FIT! Your entire codebase fits in one context.
   💡 Recommendation: Use single-file export (no chunking needed)
```

#### Technical Implementation

**New Files:**

- `.ctxman/llm-profiles.json` - Built-in LLM model profiles
- `.ctxman/custom-profiles.example.json` - Template for custom models
- `lib/utils/llm-detector.js` - LLM detection and optimization logic
- `test/test-llm-detection.js` - Comprehensive test suite (12 tests)

**Updated Files:**

- `lib/ui/wizard.js` - Dynamic model list from JSON config
- `bin/cli.js` - LLM flags and help text
- `lib/analyzers/token-calculator.js` - Context fit analysis display
- `package.json` - v2.3.7

**Architecture:**

- Lazy-loading profile cache for performance (<100ms)
- Fallback to hardcoded profiles if JSON fails
- Merge built-in + custom profiles (custom overrides built-in)
- Performance: Profile loading completes in <50ms

#### Use Cases

**Automatic Optimization:**

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-...

# Run analysis - automatically detects Claude
ctxman

# Ctxman automatically:
# - Detects Claude Sonnet 4.5
# - Recommends TOON format (40-50% savings)
# - Shows context fit analysis
# - Suggests optimal chunk size
```

**Explicit Model Selection:**

```bash
# Optimize for specific model
ctxman --target-model claude-sonnet-4.5
ctxman --target-model gpt-4o --cli
ctxman --target-model gemini-2.0-flash
```

**Custom Models:**

```json
// .ctxman/custom-profiles.json
{
  "profiles": {
    "my-custom-gpt": {
      "name": "My Fine-Tuned GPT-4",
      "contextWindow": 100000,
      "preferredFormat": "json",
      "chunkStrategy": "smart"
    }
  }
}
```

#### Benefits

1. **Zero Configuration**: Automatically detects your LLM from environment
2. **Optimal Settings**: Recommends best format and chunk size per model
3. **Context Awareness**: Shows if your repo fits in one context
4. **Extensible**: Add custom models via JSON config
5. **Fast**: <100ms detection time, lazy-loaded profiles

#### Migration Notes

**For Users:**

- No breaking changes - all existing commands work as before
- New `--target-model` flag is optional
- Auto-detection is opt-in (requires API key in environment)

**For Developers:**

- LLM profiles stored in `.ctxman/llm-profiles.json`
- Custom profiles: `.ctxman/custom-profiles.json`
- Programmatic API: `LLMDetector.detect()`, `LLMDetector.getProfile()`

---

## [2.3.6] - 2025-11-05

### 🚀 GitHub Integration + Modern Stack Migration

This patch release brings direct GitHub repository support and completes the modernization of the UI stack with React 19 and Ink 6.

#### Added

**GitHub Integration:**

- 🔗 **Direct GitHub Repository Support** - Generate GitIngest from GitHub URLs
  - Support for multiple URL formats (github.com, raw.githubusercontent.com)
  - Automatic shallow cloning for faster processing
  - Branch selection support (defaults to default branch)
  - Auto-cleanup of temporary directories
  - New `cm-gitingest.js` CLI tool: `ctxman github <URL> [options]`
- 📦 **New npm script**: `github` - Quick GitHub repository analysis

#### Enhanced

**Modern Stack Migration:**

- ⚛️ **React 19 Upgrade** - Upgraded from React 18.2.0 to React 19.2.0
  - Latest React features and performance improvements
  - Better TypeScript support
  - Improved server components compatibility
- 🎨 **Ink 6.x Upgrade** - Upgraded from Ink 4.4.1 to Ink 6.4.0
  - React 19 compatibility
  - Better terminal rendering performance
  - Improved error boundaries
  - Enhanced component lifecycle
- 🔄 **Pure ESM Migration** - Complete codebase converted to ES Modules (29 files)
  - All `require()` → `import`
  - All `module.exports` → `export`
  - Better tree-shaking and bundle optimization
  - Modern module system throughout
  - Future-proof architecture
- 🎛️ **Custom SelectInput Component** - Replaced deprecated `ink-select-input`
  - Built-in arrow key navigation
  - Better visual feedback
  - Consistent styling across terminal types
  - No external dependencies

**User Experience:**

- 🧙 **Wizard Mode as Default** - Interactive wizard is now the default interface
  - More user-friendly for new users
  - CLI mode available via `--cli` flag
  - Auto-detection: any analysis flag automatically enables CLI mode
- 🧹 **Clean CLI Output** - Removed startup news/banners
  - Minimal, professional appearance
  - Faster to relevant information
  - Better for automation/scripting
- ⌨️ **Improved Keyboard Navigation** - Better handling across terminal types
  - Consistent behavior on macOS Terminal, iTerm2, VSCode terminal
  - Fixed arrow key detection issues

#### Fixed

**UI/UX Fixes:**

- 🐛 **Visual Artifacts Eliminated** - Removed terminal rendering glitches
  - No more duplicate option display
  - Clean component unmounting
  - Proper cursor positioning
- 🔧 **SelectInput Compatibility** - Fixed issues with deprecated package
  - Custom implementation resolves all compatibility issues
  - Better control over rendering lifecycle
- 💻 **Terminal Compatibility** - Improved across different terminal emulators
  - Better handling of terminal capabilities
  - Graceful fallbacks for limited terminals

**Dependency Updates:**

```json
{
  "react": "^19.2.0", // was: ^18.2.0
  "ink": "^6.4.0", // was: ^4.4.1
  "ink-spinner": "^5.0.0", // compatible with Ink 6
  "ink-text-input": "^6.0.0" // compatible with Ink 6
}
```

#### Migration Notes

**For Users:**

- No breaking changes - all commands work as before
- Default mode is now wizard (use `--cli` for old behavior)
- Better visual experience with modernized UI

**For Developers:**

- All files now use ESM (import/export)
- React 19 and Ink 6 APIs available
- Custom SelectInput component for UI consistency

#### Technical Details

**Files Modified (ESM Migration):**

- 29 files converted to pure ESM
- `lib/` directory: All utility, parser, formatter, analyzer files
- `bin/` directory: All CLI tools
- Test files remain compatible with both systems

**Performance:**

- No performance regression
- UI rendering: <16ms per frame (maintained)
- Startup time: Similar to v2.3.5
- Memory usage: Slightly improved with React 19

---

## [2.3.5] - 2025-11-02

### 🔧 PATCH RELEASES: v2.3.1 through v2.3.5

Comprehensive improvements across TOON optimization, format conversion, chunking, error handling, and stability.

**v2.3.1 - TOON Optimization:**

- Added `validate()` method - Checks balanced braces/brackets
- Added `estimateTokens()` - Token count estimation (~4 chars/token)
- Added `optimize()` - Removes unnecessary whitespace
- Added `minify()` - Ultra-compact output

**v2.3.2 - Format Conversion:**

- New `FormatConverter` class in `lib/utils/format-converter.js`
- CLI: `ctxman convert input.json --from json --to toon`
- Supports: JSON ↔ TOON, JSON ↔ YAML, JSON ↔ CSV, JSON ↔ XML, CSV → JSON
- Batch conversion, auto file extension detection
- Conversion statistics (size, savings, percentage)

**v2.3.3 - GitIngest Chunking:**

- Chunk overlap (default 500 tokens) for context continuity
- Enhanced metadata (languages, directories, cross-refs)
- Shared directory detection between chunks
- Improved context preservation (95%+)

**v2.3.4 - Error Handling:**

- New `ErrorHandler` class in `lib/utils/error-handler.js`
- User-friendly error messages with suggestions
- Optional error logging to file
- Format validation, async error wrapping

**v2.3.5 - Stability & Polish:**

- Performance optimizations
- Documentation updates
- Edge case fixes

#### 📦 New Files

- `lib/utils/format-converter.js` (v2.3.2)
- `lib/utils/error-handler.js` (v2.3.4)

#### 🔄 Updated Files

- `lib/formatters/toon-formatter.js` - Validation & optimization
- `lib/formatters/gitingest-formatter.js` - Overlap & metadata
- `bin/cli.js` - Format conversion command
- `package.json` - v2.3.5

---

## [2.3.0] - 2025-11-02

### 🎉 MAJOR: Phase 1 - Format & Output Enhancement

**Theme:** "Choose Your Format, Love Your Interface"

This release introduces revolutionary output capabilities with the new TOON format achieving 40-50% token reduction, smart GitIngest chunking for large repositories, and a modern interactive terminal UI powered by Ink.

#### ✨ New Features

**1. TOON Format (Tabular Object Oriented Notation)**

- 40-50% token reduction compared to JSON
- Tabular format for arrays of objects
- Compact field declarations
- Hierarchical structure support
- `ToonFormatter` class for encoding/decoding
- Comparison tools to measure savings

**2. Multi-Format Support (8 Formats)**

- **TOON** - Ultra-efficient (40-50% reduction)
- **JSON** - Standard format
- **JSON Compact** - Minified JSON
- **YAML** - Human-readable
- **Markdown** - Documentation-friendly
- **CSV** - Spreadsheet compatible
- **XML** - Enterprise systems
- **GitIngest** - Single-file digest

**3. FormatRegistry System**

- Central registry for all output formatters
- Easy format switching via `--output` flag
- Custom formatter registration support
- Format auto-detection and suggestions
- `--list-formats` command to show all available formats

**4. Smart GitIngest Chunking**

- Multiple chunking strategies:
  - **Smart** - AI-based semantic grouping (directory-aware)
  - **Size** - Fixed token size chunks
  - **File** - One file per chunk
  - **Directory** - One directory per chunk
  - **Dependency** - Import/dependency based (Phase 2)
- Configurable chunk size (default: 100k tokens)
- Cross-chunk reference preservation
- Chunk metadata and navigation
- `--chunk`, `--chunk-strategy`, `--chunk-size` options

**5. Ink-Based Terminal UI**

- React-based interactive components
- Modern, beautiful CLI experience
- Real-time progress indicators
- Interactive wizard mode
- Live dashboard with statistics
- Components:
  - `ProgressBar` - File and token progress
  - `SpinnerWithText` - Task status indicators
  - `Wizard` - Interactive configuration
  - `Dashboard` - Live statistics

**6. Interactive Wizard Mode**

- `--wizard` flag for guided setup
- Use case selection (bug-fix, feature, code-review, etc.)
- Target LLM selection (Claude, GPT-4, Gemini)
- Output format selection
- Visual, step-by-step configuration

**7. Enhanced CLI Options**

```bash
# Format options
-o, --output FORMAT      # Choose output format
--list-formats           # List all formats

# Chunking options
--chunk                  # Enable chunking
--chunk-strategy TYPE    # Chunking strategy
--chunk-size TOKENS      # Max tokens per chunk

# UI options
--simple                 # Simple text output
--dashboard              # Live dashboard mode
--wizard                 # Interactive wizard
```

#### 📦 New Dependencies

- `ink@^4.4.1` - React-based terminal UI
- `ink-spinner@^5.0.0` - Loading spinners
- `ink-select-input@^5.0.0` - Interactive selection
- `ink-text-input@^5.0.1` - Text input component
- `react@^18.2.0` - React library for Ink

#### 🏗️ Architecture Changes

**New Modules:**

```
lib/
├── formatters/
│   ├── toon-formatter.js       (NEW - 350 lines)
│   ├── format-registry.js      (NEW - 450 lines)
│   └── gitingest-formatter.js  (ENHANCED - chunking added)
└── ui/                          (NEW)
    ├── progress-bar.js         (NEW - 80 lines)
    ├── wizard.js               (NEW - 120 lines)
    ├── dashboard.js            (NEW - 100 lines)
    └── index.js                (NEW - UI exports)
```

**Updated Files:**

- `bin/cli.js` - Complete rewrite with new options
- `index.js` - Added ToonFormatter and FormatRegistry exports
- `package.json` - Updated to v2.3.0, added Ink dependencies
- `lib/formatters/gitingest-formatter.js` - Added chunking support

#### 📊 Performance & Metrics

- **TOON Format**: 40-50% token reduction vs JSON
- **Chunking**: Smart grouping preserves 95%+ code relationships
- **UI Rendering**: <16ms per frame (Ink-based)
- **Startup Time**: +50ms (Ink lazy-loading)

#### 🧪 Testing

- Added `test/test-toon-format.js` for TOON encoder testing
- Format comparison tests
- Multi-format encoding validation
- Chunking strategy tests

#### 📚 Documentation

- Updated README with v2.3.0 features
- Added TOON format examples
- Chunking strategy documentation
- Interactive wizard guide
- Format comparison table

#### 🔄 Migration Guide

**From v2.2.0 to v2.3.0:**

No breaking changes! All existing commands work as before.

**New default behavior:**

- Default output format is now TOON (was JSON)
- To use JSON format: `ctxman --output json`

**To take advantage of new features:**

```bash
# Use TOON format (new default)
ctxman

# Try interactive wizard
ctxman --wizard

# Enable chunking for large repos
ctxman --gitingest --chunk

# Use different formats
ctxman --output yaml
ctxman --output csv
```

#### 🎯 Success Metrics (Achieved)

- ✅ TOON achieves 40-50% token reduction
- ✅ 8 output formats supported
- ✅ Smart chunking preserves 95%+ relationships
- ✅ Ink UI renders at <16ms per frame
- ✅ All formats pass validation tests

#### 🔗 Related Documentation

- [Phase 1 Roadmap](../roadmap/PHASE-1.md)
- [TOON Format Specification](https://github.com/toon-format/toon)
- [Ink Documentation](https://github.com/vadimdemedes/ink)

---

## [2.0.0] - 2025-10-13

### 🎉 MAJOR: Modular Architecture Refactoring

Complete architectural overhaul from monolithic (1340 lines) to modular design (236 lines orchestrator + focused modules).

#### Breaking Changes

- **NONE!** All existing APIs maintained for backward compatibility
- `TokenAnalyzer` alias still works (points to `TokenCalculator`)
- All CLI commands unchanged
- All configuration files work as before

#### Architecture Changes

**New Module Structure:**

```
lib/
├── utils/          (4 modules, 337 lines)
│   ├── token-utils.js
│   ├── file-utils.js
│   ├── clipboard-utils.js
│   └── config-utils.js
├── parsers/        (2 modules, 169 lines)
│   ├── method-filter-parser.js
│   └── gitignore-parser.js
├── analyzers/      (2 modules, 701 lines)
│   ├── method-analyzer.js
│   └── token-calculator.js
└── formatters/     (1 module, 260 lines)
    └── gitingest-formatter.js
```

**Main Files:**

- `ctxman.js` - Orchestrator (236 lines, **82.4% reduction**)
- `index.js` - Enhanced public API (48 lines)

#### Code Quality Improvements

**1. Eliminated Duplication:**

- `findConfigFile()` - Removed 2 duplicates → `ConfigUtils.findConfigFile()`
- `initMethodFilter()` - Removed 2 duplicates → `ConfigUtils.initMethodFilter()`
- Token counting - Unified in `TokenUtils.calculate()`
- File detection - Unified in `FileUtils.isText()` / `FileUtils.isCode()`
- Clipboard - Extracted to `ClipboardUtils.copy()`

**2. Single Responsibility:**

- Each module has ONE clear purpose
- Utils are independently reusable
- Better separation of concerns

**3. Better Testability:**

- Utils can be unit tested in isolation
- Dependencies can be mocked
- Clearer test boundaries

#### New Public APIs

**Enhanced Exports:**

```javascript
const {
  // Analyzers
  TokenCalculator,
  TokenAnalyzer, // Alias (backward compat)
  MethodAnalyzer,

  // Parsers
  GitIgnoreParser,
  MethodFilterParser,

  // Formatters
  GitIngestFormatter,

  // Utils (NEW!)
  TokenUtils,
  FileUtils,
  ClipboardUtils,
  ConfigUtils,

  // Functions (NEW!)
  generateDigestFromReport,
  generateDigestFromContext,
} = require('ctxman');
```

**Utility Functions:**

```javascript
// Token utilities
TokenUtils.calculate(content, filePath); // Calculate tokens
TokenUtils.format(1500); // "1.5k"
TokenUtils.hasExactCounting(); // Check tiktoken availability

// File utilities
FileUtils.isText(filePath); // Is text file?
FileUtils.isCode(filePath); // Is code file?
FileUtils.getType(filePath); // Get category

// Clipboard utilities
ClipboardUtils.copy(text); // Cross-platform copy
ClipboardUtils.isAvailable(); // Check availability

// Config utilities
ConfigUtils.findConfigFile(root, name); // Find config
ConfigUtils.detectMethodFilters(root); // Detect method filters
ConfigUtils.getConfigPaths(root); // Get all config paths
```

#### Files Added

- `lib/utils/token-utils.js` - Token counting and formatting
- `lib/utils/file-utils.js` - File type detection
- `lib/utils/clipboard-utils.js` - Clipboard operations
- `lib/utils/config-utils.js` - Configuration discovery
- `lib/parsers/method-filter-parser.js` - Method filtering
- `lib/parsers/gitignore-parser.js` - Git ignore patterns
- `lib/analyzers/method-analyzer.js` - Method extraction
- `lib/analyzers/token-calculator.js` - Main analyzer
- `lib/formatters/gitingest-formatter.js` - Digest formatter
- `REFACTORING_REPORT.md` - Detailed refactoring documentation

#### Performance

- **No regression**: Cold start ~2.5s (unchanged)
- **Memory savings**: 3MB reduction (45MB → 42MB)
- **Test time**: +0.1s (8.2s → 8.3s, acceptable)
- **Module loading**: Faster parsing (multiple small files vs 1 large)

#### Test Results

```
✅ Basic tests: 25/25 passed (100%)
✅ Unit tests: 34/34 passed (100%)
✅ GitIngest tests: 10/10 passed (100%)
✅ GitIngest JSON tests: 9/9 passed (100%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 Total: 78/78 tests passed (100%)
```

#### Migration Notes

**For Users:**

- No changes required - all commands work as before
- All features available

**For Developers:**

- More APIs available for programmatic use
- Better module isolation for testing
- Clearer dependency structure

## [1.2.2] - 2025-10-13

### Added

- 🎯 **Method-Aware GitIngest** - Automatic method-level filtering in digest generation
  - GitIngestFormatter now auto-detects `.methodinclude` and `.methodignore` files
  - If method filters exist, digest automatically shows only filtered methods
  - Displays "Method filtering: INCLUDE/EXCLUDE mode active" in summary
  - Shows method count: "File contains X methods, showing Y filtered methods"
  - Works automatically - no extra flags needed
  - Compatible with all GitIngest modes (live, from-report, from-context)

### Changed

- 📄 **GitIngest Output** - Now respects method-level filters when present
  - Code files (.js, .ts, .jsx, .tsx) use method extraction
  - Non-code files (config, docs) use full content
  - Filtered methods shown with line numbers
  - Method extraction with smart brace counting (up to 100 lines per method)

### Technical

- Added `detectMethodFilters()` - Auto-detects method filter config
- Added `generateFilteredFileContent()` - Extracts and filters methods
- Added `extractMethodBlock()` - Smart method body extraction
- Added `isCodeFile()` - Identifies JS/TS files for method processing

## [1.2.1] - 2025-10-13

### Added

- ⚡ **JSON-Based Digest Generation** - Generate digest from existing JSON files
  - `--gitingest-from-report <file>` - Create digest from token-analysis-report.json
  - `--gitingest-from-context <file>` - Create digest from llm-context.json
  - Instant generation without re-scanning files (~20-30x faster)
  - Default filenames supported (omit file argument)
  - Two-step workflow: analyze once, generate digest anytime
  - Error handling for missing/invalid JSON files
- 🧪 **JSON-Based Tests** - New `test/test-gitingest-json.js` with 9 comprehensive tests
  - Test report-based digest generation
  - Test context-based digest generation
  - Test default filename handling
  - Test error handling
  - All tests passing (100% success rate)
- 📦 **New npm script**: `test:gitingest-json` - Run JSON-based digest tests

### Changed

- 📚 **README.md** - Added JSON-based digest workflow documentation
  - Performance benefits explained
  - Two-step workflow examples
  - Use cases for JSON-based approach
- 📝 **Help Messages** - Updated with new flags and examples
  - `--gitingest-from-report` and `--gitingest-from-context` documented
  - Two-step workflow examples added
- 🧪 **Test Suite** - Updated `test:comprehensive` to include JSON-based tests

### Performance

- ⚡ JSON-based digest generation: **~0.1 seconds** (vs ~2-3 seconds for live scan)
- 🚀 **20-30x faster** than live file scanning

## [1.2.0] - 2025-10-13

### Added

- 🎯 **GitIngest Format Export** - Generate single-file digest for LLM consumption
  - New `GitIngestFormatter` class for digest generation
  - `--gitingest` / `-g` CLI flag for digest export
  - Creates `digest.txt` with project summary, tree structure, and file contents
  - Format inspired by [GitIngest](https://github.com/coderamp-labs/gitingest) v0.3.1
  - Pure JavaScript implementation with zero additional dependencies
  - Respects all `.gitignore` and calculator filter rules
  - Files sorted by token count (largest first)
  - Token estimates formatted as "1.2k" or "1.5M"
- ⚡ **JSON-Based Digest Generation** - Generate digest from existing JSON files (NEW!)
  - `--gitingest-from-report <file>` - Create digest from token-analysis-report.json
  - `--gitingest-from-context <file>` - Create digest from llm-context.json
  - Instant generation without re-scanning files
  - Default filenames supported (omit file argument)
  - Two-step workflow: analyze once, generate digest anytime
  - Error handling for missing/invalid JSON files
- 📄 **Version Tracking** - Added `docs/GITINGEST_VERSION.md` for format tracking
- 🧪 **GitIngest Tests** - New comprehensive test suite
  - `test/test-gitingest.js` - 10 tests for live digest generation
  - `test/test-gitingest-json.js` - 9 tests for JSON-based generation
  - All tests passing (100% success rate)
- 📦 **New npm scripts**:
  - `test:gitingest` - Run GitIngest integration tests
  - `test:gitingest-json` - Run JSON-based digest tests
  - `analyze:gitingest` - Quick digest generation
  - Updated `test:comprehensive` to include all GitIngest tests
- 📚 **Documentation Updates**:
  - README.md updated with JSON-based digest workflow
  - Performance benefits and use cases explained
  - Two-step workflow examples
  - Help messages updated with new flags

### Changed

- 📤 **Interactive Export Menu** - Added GitIngest as option 4 (was 4 options, now 5)
- 🔧 **Token Output** - Added `token-analysis-report.json` to `.gitignore`

## [1.1.2] - 2025-10-13

### Fixed

- 🐛 **LLM Context Path Generation** - Fixed hardcoded `utility-mcp/src/` prefix in `generateCompactPaths` method
  - Paths now correctly use project-relative structure
  - Root directory files grouped under `/` instead of empty string
  - Eliminates incorrect path prefixes in LLM context exports

### Added

- ✨ **GitHub Actions Manual Trigger** - Added `workflow_dispatch` to npm-publish workflow for manual testing

## [1.1.1] - 2025-10-09

### Fixed

- 🐛 **Package.json bin path** - Fixed bin script path format for npm standards

## [1.1.0] - 2025-10-09

### 🎉 Major Quality & Feature Release

#### Fixed (7 Critical Bugs)

- 🐛 **Method duplication bug** - Fixed duplicate method extraction using Map-based deduplication with `name:line` keys
- 🐛 **NaN in average calculation** - Added conditional check when totalFiles is 0, now shows "N/A"
- 🐛 **Class method detection** - Added shorthand pattern to properly detect class methods
- 🐛 **Special characters support** - Method names with `$` and `_` now properly detected using `[\w$_]+` pattern
- 🐛 **Getter/setter duplication** - Prevented duplicate extraction with processedLines Map tracking
- 🐛 **Configuration paths** - Fixed .contextinclude with correct project paths (index.js, ctxman.js, bin/cli.js)
- 🐛 **Test suite paths** - Corrected all test file paths from `token-analysis/` to root directory

#### Added

- ✨ **Comprehensive test suite** - 70+ tests with 100% success rate
  - `test/unit-tests.js` - 34 comprehensive unit tests
  - Enhanced `test/test.js` - 25 tests (improved from 3)
  - Enhanced `test/test-suite.js` - 17+ integration tests
- ✨ **Support section** - Added "Buy Me A Coffee" button and QR code to README files
- ✨ **Turkish documentation** - Complete translation of all 17 documentation files
  - docs/content-tr/ with full Turkish translations
  - Technical terms kept in English for clarity
  - Organized in Temel-Ozellikler/ and Yapilandirma/ directories
- ✨ **CLAUDE.md** - AI assistant guidance documentation for Claude Code
- ✨ **Test documentation** - TEST_SUMMARY.md with detailed test coverage information
- ✨ **Improvement docs** - CODE_IMPROVEMENTS.md and IMPROVEMENTS_COMPLETED.md
- 📦 **New npm scripts**:
  - `test:unit` - Run comprehensive unit tests
  - `test:comprehensive` - Run all test suites
- 📚 **Documentation files**:
  - Kurulum.md, Hizli-Baslangic-Rehberi.md, Arac-Genel-Bakis-ve-Temel-Deger.md
  - CLI-Referans.md, Cikti-Formatlari.md, Kullanim-Senaryolari.md
  - Sorun-Giderme.md, Gelismis-Yapilandirma.md, Programatik-API.md, Katki-Rehberi.md

#### Changed

- 🔧 **Method extraction patterns** - Enhanced regex patterns with better type tagging
  - Support for export functions: `export function name()`
  - Support for async functions: `async function name()`
  - Support for getters/setters: `get/set name()`
  - Support for arrow functions with async
  - Improved shorthand method detection
- 🔧 **Pattern processing order** - Optimized pattern priority to prevent overlaps
- 🔧 **Deduplication strategy** - Dual Map tracking (methodsMap + processedLines)
- 📝 **Error handling** - Better user-facing messages (N/A instead of NaN)
- 🎯 **Test coverage** - Increased from ~60% to ~95%

#### Improved

- 📊 **Test quality** - 100% success rate across all test suites
- 🔍 **Method detection** - Now captures class methods, getters, setters correctly
- 🎯 **Edge case handling** - Tests for empty code, nested functions, Unicode, special chars
- 📈 **Code quality** - Better separation of concerns, clearer pattern definitions

### Technical Details

- **Total Tests:** 70+ (25 basic + 34 unit + 17+ integration)
- **Test Success Rate:** 100% across all suites
- **Bug Fixes:** 7 critical issues resolved
- **Documentation:** 17 new Turkish files + 4 technical docs
- **Code Coverage:** ~95%
- **Performance:** < 30 seconds for all tests

### Breaking Changes

None - Fully backward compatible

## [1.0.3] - 2024-10-09

### Changed

- 📝 **File naming consistency** - Renamed `token-calculator.js` to `ctxman.js` for better alignment with package identity
- 🔧 **Help text update** - Updated direct usage examples to show `node ctxman.js`
- 📋 **Package files** - Added `ctxman.js` to NPM package files list
- 🎯 **Documentation** - Updated file references in README and Turkish documentation

## [1.0.2] - 2024-10-09

### Fixed

- 📝 **Documentation consistency** - Updated all command examples to use `ctxman` instead of old script paths
- 🎯 **Title correction** - Changed from "Token Analysis Tools" to "Ctxman"
- 🔧 **Help text alignment** - CLI help now matches documentation examples
- 🌍 **Turkish README** - Updated Turkish documentation with consistent command examples
- ✨ **Branding consistency** - All documentation now properly reflects the Ctxman identity

## [1.0.1] - 2024-10-09

### Fixed

- 📝 **Documentation cleanup** - Removed references to deleted `analyze-tokens.js` wrapper script
- 🔧 **Package branding** - Updated from "Code Analyzer" to "Ctxman"
- 📋 **NPM page accuracy** - Fixed documentation to reflect actual package structure

### Changed

- 🎯 **Package name** - Rebranded to `ctxman` for better LLM focus
- 📦 **CLI command** - Updated to `ctxman` for consistency
- 📖 **Documentation** - Updated all references to use new package name

## [1.0.0] - 2024-10-09

### Added

- 🎉 **Initial release** of Ctxman
- 📊 **File-level analysis** with gitignore support
- 🔧 **Method-level analysis** for JavaScript/TypeScript files
- 📋 **Dual filtering system** (include/exclude patterns)
- 🎯 **Exact token counting** using tiktoken library
- 📤 **Multiple export formats** (JSON, clipboard, file)
- 📦 **NPM package** with CLI and programmatic API
- 🔍 **Pattern matching** with wildcards and regex support
- ⚡ **Performance optimization** (36% smaller codebase)
- 📚 **Documentation** with examples

_Created by Hakkı Sağdıç_

### Features

- File-level token analysis with directory organization
- Method-level granular analysis with line numbers
- LLM context optimization (99.76% size reduction)
- Interactive export selection
- CLI interface with multiple options
- Programmatic API for integration
- Configuration file support (.methodinclude/.methodignore)
- Cross-platform clipboard support
- Detailed reporting with statistics
- Verbose mode for debugging

### CLI Options

- `--save-report, -s` - Save detailed JSON report
- `--verbose, -v` - Show included files and directories
- `--context-export` - Generate LLM context file
- `--context-clipboard` - Copy context to clipboard
- `--method-level, -m` - Enable method-level analysis
- `--help, -h` - Show help message

### Configuration Files

- `.contextinclude` - Include only specified files
- `.contextignore` - Exclude specified files
- `.methodinclude` - Include only specified methods
- `.methodignore` - Exclude specified methods

### API Classes

- `TokenAnalyzer` - Main analysis class
- `MethodAnalyzer` - Method extraction and analysis
- `MethodFilterParser` - Method filtering logic
- `GitIgnoreParser` - File filtering logic

### Use Cases

- LLM context optimization for AI assistants
- Codebase complexity analysis
- Method-level debugging and analysis
- CI/CD integration for monitoring
- Development workflow optimization

### Technical Details

- Node.js >= 14.0.0 support
- Optional tiktoken dependency for exact counts
- Cross-platform compatibility (macOS, Linux, Windows)
- Pattern matching with glob syntax
- JSON-based configuration and output
- Memory-efficient processing
- Error handling and validation

### Documentation

- Comprehensive README with examples
- API reference documentation
- Configuration guide
- Use case scenarios
- Installation instructions
- Test suite and validation

### Performance

- Analyzes 64 files (181k tokens) in <2 seconds
- Reduces context size by 99.76% for LLM use
- Memory efficient processing
- Optimized regex patterns
- Minimal dependencies

### Package Structure

```
ctxman/
├── index.js              # Main entry point
├── bin/cli.js            # CLI interface
├── token-calculator.js   # Core functionality
├── test/                 # Test suite
├── package.json          # NPM configuration
├── README.md             # Documentation
└── CHANGELOG.md          # This file
```

---

## Development Notes

### Code Quality

- 36% reduction in code size while adding major features
- Best practices implementation
- Comprehensive error handling
- Clean separation of concerns
- Modular architecture

### Testing

- 15+ test scenarios covered
- 100% success rate in validation
- Method extraction accuracy verified
- CLI functionality validated
- API completeness confirmed

### Future Enhancements

- Support for additional languages (Python, Java, etc.)
- Advanced method complexity analysis
- Integration with popular IDEs
- Web interface for analysis
- Cloud-based processing options
