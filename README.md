# ctxman

[![CI](https://github.com/hakkisagdic/ctxman/actions/workflows/ci.yml/badge.svg)](https://github.com/hakkisagdic/ctxman/actions/workflows/ci.yml)
[![CodeQL](https://github.com/hakkisagdic/ctxman/actions/workflows/codeql.yml/badge.svg)](https://github.com/hakkisagdic/ctxman/actions/workflows/codeql.yml)
[![npm version](https://badge.fury.io/js/ctxman.svg)](https://www.npmjs.com/package/ctxman)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/ctxman.svg)](https://nodejs.org)
[![codecov](https://codecov.io/gh/hakkisagdic/ctxman/branch/main/graph/badge.svg)](https://codecov.io/gh/hakkisagdic/ctxman)
[![Documentation](https://img.shields.io/badge/docs-complete-brightgreen)](docs/)

**AI Development Platform** with plugin architecture, Git integration, REST API, and watch mode. Supporting 14+ programming languages with method-level filtering, automatic LLM optimization, and real-time analysis. Perfect for AI-assisted development workflows.

**v3.0.0** - Platform Foundation Release 🚀

**Languages**: [English](README.md) | [Türkçe](README-tr.md)

## Table of Contents

- [Support This Project](#-support-this-project)
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [API Server](#api-server)
- [Git Integration](#-git-integration-v300)
- [Watch Mode](#-watch-mode-v300)
- [LLM Optimization](#-llm-optimization-v237)
- [Export Options](#-export-options)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## ☕ Support This Project

If you find this tool helpful, consider buying me a coffee! Your support helps maintain and improve this project.

<p align="center">
  <a href="https://www.buymeacoffee.com/hakkisagdic" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
</p>

<p align="center">
  <img src="docs/qr-code.png" alt="Support QR Code" width="300">
</p>

---

## Documentation

| Document                                           | Description                                             |
| -------------------------------------------------- | ------------------------------------------------------- |
| [API Documentation](docs/API.md)                   | REST API endpoints and usage                            |
| [Architecture](docs/ARCHITECTURE.md)               | Plugin system, core modules, data flow                  |
| [Performance Benchmarks](docs/PERFORMANCE.md)      | Performance metrics and optimization tips               |
| [Changelog](CHANGELOG.md)                          | Version history and release notes                       |
| [Contributing](CONTRIBUTING.md)                    | Development setup and guidelines                        |
| [Security Policy](SECURITY.md)                     | Security policy and vulnerability reporting             |
| [Code of Conduct](CODE_OF_CONDUCT.md)              | Community guidelines                                    |
| [API Dokümantasyonu](docs/API-tr.md)               | REST API dokümantasyonu (Türkçe)                        |
| [Mimari](docs/ARCHITECTURE-tr.md)                  | Plugin sistemi, çekirdek modüller (Türkçe)              |
| [Performans Kıyaslamaları](docs/PERFORMANCE-tr.md) | Performans metrikleri ve optimizasyon ipuçları (Türkçe) |
| [Katkı Rehberi](CONTRIBUTING-tr.md)                | Geliştirme kurulumu ve yönergeler (Türkçe)              |

## Files

- **`ctxman.js`** - Main LLM context analysis script with exact token counting
- **`.contextignore`** - Files to exclude from token calculation (EXCLUDE mode)
- **`.contextinclude`** - Files to include in token calculation (INCLUDE mode)
- **`README.md`** - This documentation file
- **`README-tr.md`** - Turkish documentation (Türkçe dokümantasyon)

## Features

### 🚀 Platform Features (v3.0.0)

- 🔌 **Plugin Architecture** - Modular, extensible system for languages and exporters
- 🔀 **Git Integration** - Analyze only changed files, diff analysis, author tracking
- 👁️ **Watch Mode** - Real-time file monitoring and auto-analysis
- 🌐 **REST API** - HTTP server for programmatic access (6 endpoints)
- ⚡ **Performance** - Caching system, parallel processing (5-10x faster)
- 🏗️ **Modular Core** - Scanner, Analyzer, ContextBuilder, Reporter

### 🎨 User Interface

- 🧙 **Interactive Wizard Mode** - User-friendly guided setup (default)
- 💻 **CLI Mode** - Traditional command-line interface (--cli flag)
- 📤 **Interactive export** - Prompts for export choice when no options specified

### 🔢 Token Analysis

- ✅ **Exact token counting** using tiktoken (GPT-4 compatible)
- 🌍 **Multi-language support** - 14+ languages: JavaScript, TypeScript, Python, PHP, Ruby, Java, Kotlin, C#, Go, Rust, Swift, C/C++, Scala
- 🎯 **Method-level analysis** - Analyze tokens per function/method
- 📊 **Detailed reporting** - by file type, largest files, statistics

### 🎯 Filtering & Configuration

- 🚫 **Dual ignore system** - respects both `.gitignore` and context ignore rules
- 📋 **Include/Exclude modes** - `.contextinclude` takes priority over `.contextignore`
- 🔍 **Method filtering** - `.methodinclude` and `.methodignore` for granular control
- 🎯 **Core application focus** - configured to analyze only essential code files

### 📤 Export Options

- 🤖 **LLM context export** - generate optimized file lists for LLM consumption
- 📋 **Clipboard integration** - copy context directly to clipboard
- 💾 **JSON/YAML/CSV/XML exports** - multiple format options
- 📄 **GitIngest format** - Single-file digest for LLM consumption (inspired by [GitIngest](https://github.com/coderamp-labs/gitingest))
- 🎯 **TOON format** - Ultra-compact format (40-50% token reduction)
- 🔀 **Dual context modes** - compact (default) or detailed format

## Quick Start

### 🧙 Interactive Wizard Mode (Default)

```bash
# Launch interactive wizard (guides you through options)
ctxman
```

The wizard provides a user-friendly interface to:

- Select your use case (Bug Fix, Feature, Code Review, etc.)
- Choose target LLM (Claude, GPT-4, Gemini, etc.)
- Pick output format (TOON, JSON, YAML, etc.)

**Note:** Wizard mode uses Ink terminal UI. If you experience visual artifacts, use CLI mode with `--cli` flag.

### 💻 CLI Mode

```bash
# Use CLI mode instead of wizard
ctxman --cli

# CLI mode with options
ctxman --cli --save-report
ctxman --cli --context-clipboard
ctxman --cli --gitingest
ctxman --cli --method-level

# Any analysis flag automatically enables CLI mode
ctxman -s              # Auto CLI (save report)
ctxman -m              # Auto CLI (method-level)
ctxman --context-export  # Auto CLI (export)

# Combine multiple exports
ctxman --cli -g -s  # GitIngest digest + detailed report
```

### 🤖 LLM Optimization (v2.3.7)

```bash
# Auto-detect LLM from environment
export ANTHROPIC_API_KEY=sk-...
ctxman  # Automatically optimizes for Claude

# Explicit model selection
ctxman --target-model claude-sonnet-4.5
ctxman --target-model gpt-4o
ctxman --target-model gemini-2.0-flash

# List all supported models
ctxman --list-llms

# Context fit analysis
ctxman --cli --target-model claude-sonnet-4.5
# Output:
# 📊 Context Window Analysis:
#    Target Model: Claude Sonnet 4.5
#    Available Context: 200,000 tokens
#    Your Repository: 181,480 tokens
#    ✅ PERFECT FIT! Your entire codebase fits in one context.
```

Supported LLM models (9+ models):

- **Anthropic**: Claude Sonnet 4.5, Claude Opus 4
- **OpenAI**: GPT-4 Turbo, GPT-4o, GPT-4o Mini
- **Google**: Gemini 1.5 Pro, Gemini 2.0 Flash
- **DeepSeek**: DeepSeek Coder, DeepSeek Chat

Custom models supported via `.ctxman/custom-profiles.json`

### 🔀 Git Integration (v3.0.0)

```bash
# Analyze only uncommitted changes
ctxman --changed-only

# Analyze changes since a commit/branch
ctxman --changed-since main
ctxman --changed-since HEAD~5
ctxman --changed-since v2.3.0

# With author information
ctxman --changed-only --with-authors

# Output:
# 🔀 Git Integration - Analyzing Changed Files
# ══════════════════════════════════════════════════════════
#
# 📝 Found 3 changed files
#    Impact: MEDIUM (score: 25)
```

### 👁️ Watch Mode (v3.0.0)

```bash
# Start watch mode
ctxman watch

# With method-level analysis
ctxman watch -m

# Custom debounce (default: 1000ms)
ctxman watch --debounce 2000

# Output:
# 👁️ Watch mode active
# 📝 File change: src/server.js
#    ✅ Analysis complete: 12,450 tokens (45ms)
#    📊 Total: 64 files, 181,530 tokens
```

### 🌐 API Server (v3.0.0)

```bash
# Start API server
ctxman serve

# Custom port and authentication
ctxman serve --port 8080 --auth-token my-secret-token

# API Endpoints:
# GET  /api/v1/analyze       - Full project analysis
# GET  /api/v1/methods       - Extract methods from file
# GET  /api/v1/stats         - Project statistics
# GET  /api/v1/diff          - Git diff analysis
# POST /api/v1/context       - Smart context generation
# GET  /api/v1/docs          - API documentation

# Example API calls:
curl http://localhost:3000/api/v1/analyze
curl http://localhost:3000/api/v1/methods?file=src/server.js
curl http://localhost:3000/api/v1/diff?since=main
```

### Wrapper Script Usage

```bash
# Using the NPM package globally
ctxman
ctxman --save-report
ctxman --context-clipboard
```

## 🧪 Testing & Validation

### Test Repositories

Ctxman includes real-world test repositories for validation:

```bash
# Express.js test repo (git submodule)
cd test-repos/express

# Run full test suite
ctxman --cli -m --target-model claude-sonnet-4.5

# Git integration test
ctxman --changed-since v5.0.0

# Watch mode test
ctxman watch
```

See [test-repos/README.md](test-repos/README.md) for complete testing guide.

### Manual Testing

Complete manual testing guide available at [docs/MANUAL-TESTING-v3.0.md](docs/MANUAL-TESTING-v3.0.md)

Includes:

- ✅ 50+ test scenarios for all v3.0.0 features
- ✅ API endpoint validation
- ✅ Git integration testing
- ✅ Watch mode validation
- ✅ Performance benchmarks

### Automated Tests

```bash
# Run all tests
npm run test:comprehensive

# Run v3.0.0 specific tests
npm run test:v3
npm run test:git
npm run test:plugin
npm run test:api
npm run test:watch
```

## Current Configuration

The tool is configured to focus on **core application logic only**:

### ✅ Included (64 JS files, ~181k tokens)

- Core MCP server implementation (`utility-mcp/src/`)
- Authentication and security layers
- Request handlers and routing
- Transport protocols and communication
- Utilities and validation logic
- Configuration management
- Error handling and monitoring

### 🚫 Excluded via context ignore rules

- Documentation files (`.md`, `.txt`)
- Configuration files (`.json`, `.yml`)
- Infrastructure and deployment files
- Testing and script directories
- Build artifacts and dependencies
- Workflow orchestration files (`utility-mcp/src/workflows/**`)
- Testing utilities (`utility-mcp/src/testing/**`)
- All non-essential supporting files

## Usage

### Basic Analysis

```bash
# Interactive analysis with export selection
ctxman

# Quiet mode (no file listing)
ctxman --no-verbose

# With detailed JSON report
ctxman --save-report

# Generate LLM context file list
ctxman --context-export

# Copy context directly to clipboard
ctxman --context-clipboard
```

### Interactive Export Selection

When you run the tool without specifying export options (`--save-report`, `--context-export`, or `--context-clipboard`), it will automatically prompt you to choose an export option after the analysis:

```bash
# Run analysis and get prompted for export options
ctxman

# The tool will show:
# 📤 Export Options:
# 1) Save detailed JSON report (token-analysis-report.json)
# 2) Generate LLM context file (llm-context.json)
# 3) Copy LLM context to clipboard
# 4) No export (skip)
#
# 🤔 Which export option would you like? (1-4):
```

This interactive mode ensures you never miss the opportunity to export your analysis results in the format you need.

## Include vs Exclude Modes

The token calculator supports two complementary filtering modes:

### EXCLUDE Mode (.contextignore)

- **Default mode** when only `.contextignore` exists
- Includes all files **except** those matching ignore patterns
- Traditional gitignore-style exclusion logic

### INCLUDE Mode (.contextinclude)

- **Priority mode** - when `.contextinclude` exists, `.contextignore` is ignored
- Includes **only** files matching include patterns
- More precise control for specific file selection
- Perfect for creating focused analysis sets

### Mode Priority

1. If `.contextinclude` exists → **INCLUDE mode** (ignore `.contextignore`)
2. If only `.contextignore` exists → **EXCLUDE mode**
3. If neither exists → Include all files (respect `.gitignore` only)

### Example Usage

```bash
# EXCLUDE mode: Include everything except patterns in .contextignore
rm .contextinclude  # Remove include file
ctxman

# INCLUDE mode: Include only patterns in .contextinclude
# (automatically ignores .contextignore)
ctxman
```

### Help and Options

```bash
ctxman --help
```

### Available Options

- `--save-report`, `-s` - Save detailed JSON report
- `--no-verbose` - Disable file listing (verbose is default)
- `--context-export` - Generate LLM context file list (saves as llm-context.json)
- `--context-clipboard` - Copy LLM context directly to clipboard
- `--detailed-context` - Use detailed context format (8.6k chars, default is compact 1.2k)
- `--help`, `-h` - Show help message

## LLM Context Export

The token calculator can generate optimized file lists for LLM consumption, with two format options:

### Ultra-Compact Format (Default)

- **Size**: ~2.3k characters (structured JSON)
- **Content**: Project metadata and organized file paths without token counts
- **Format**: Identical to llm-context.json file - complete JSON structure
- **Perfect for**: LLM consumption, programmatic processing, structured data needs
- **Usage**: `--context-clipboard` or `--context-export`

### Detailed Format (Legacy)

- **Size**: ~8.6k characters (comprehensive)
- **Content**: Full paths, categories, importance scores, directory stats
- **Perfect for**: Initial project analysis, comprehensive documentation
- **Usage**: `--detailed-context --context-clipboard`

### Features

- **Smart file selection** - Top files by token count and importance
- **Directory grouping** - Common prefix compression saves space
- **Token abbreviation** - "12k" instead of "12,388 tokens"
- **Extension removal** - ".js" removed to save characters
- **Cross-platform clipboard** - Works on macOS, Linux, and Windows
- **Multiple output formats** - JSON file or clipboard ready text

### Usage

```bash
# Generate minimal LLM context and save to llm-context.json (2.3k chars JSON)
ctxman --context-export

# Copy minimal context directly to clipboard (2.3k chars JSON - identical to file)
ctxman --context-clipboard

# Copy detailed context to clipboard (8.6k chars)
ctxman --detailed-context --context-clipboard

# Combine with regular analysis
ctxman --save-report --context-clipboard
```

### Output Format Examples

**Compact Format (JSON - 2.3k chars):**

```json
{
  "project": {
    "root": "cloudstack-go-mcp-proxy",
    "totalFiles": 64,
    "totalTokens": 181480
  },
  "paths": {
    "utility-mcp/src/server/": ["CloudStackUtilityMCP.js"],
    "utility-mcp/src/handlers/": [
      "workflow-handlers.js",
      "tool-handlers.js",
      "analytics-handler.js"
    ],
    "utility-mcp/src/utils/": ["security.js", "usage-tracker.js", "cache-warming.js"]
  }
}
```

**Detailed Format (8.6k chars):**

````
# cloudstack-go-mcp-proxy Codebase Context

**Project:** 64 files, 181,480 tokens

**Core Files (Top 20):**
1. `utility-mcp/src/server/CloudStackUtilityMCP.js` (12,388 tokens, server)
2. `utility-mcp/src/handlers/workflow-handlers.js` (11,007 tokens, handler)
...

**All Files:**
```json
[{"path": "file.js", "t": 1234, "c": "core", "i": 85}]
````

**Use Cases**

**Compact Format (2.3k chars JSON):**

1. **LLM Integration** - Structured data for AI assistants with complete project context
2. **Programmatic Processing** - JSON format for automated tools and scripts
3. **Context Sharing** - Identical format in clipboard and file exports
4. **Development Workflows** - Consistent structure for CI/CD and automation

**Detailed Format (8.6k chars):**

1. **Architecture Planning** - Comprehensive project overview for major decisions
2. **New Team Member Onboarding** - Complete codebase understanding
3. **Documentation Generation** - Full project structure analysis
4. **Code Review Preparation** - Detailed file relationships and importance

**General Use Cases:**

- Development workflow integration
- CI/CD pipeline context generation
- Automated documentation updates
- Project health monitoring

## GitIngest Format Export

Context-manager now supports generating GitIngest-style digest files - a single, prompt-friendly text file perfect for LLM consumption.

### What is GitIngest Format?

GitIngest format consolidates your entire codebase into a single text file with:

- Project summary and statistics
- Visual directory tree structure
- Complete file contents with clear separators
- Token count estimates

This format is inspired by [GitIngest](https://github.com/coderamp-labs/gitingest), implemented purely in JavaScript with zero additional dependencies.

### Usage

```bash
# Standard workflow - analyze and generate digest in one step
ctxman --gitingest
ctxman -g

# Combine with other exports
ctxman -g -s  # digest.txt + token-analysis-report.json

# Two-step workflow - generate digest from existing JSON (fast, no re-scan)
ctxman -s                                    # Step 1: Create report
ctxman --gitingest-from-report               # Step 2: Generate digest

# Or from LLM context
ctxman --context-export                      # Step 1: Create context
ctxman --gitingest-from-context              # Step 2: Generate digest

# With custom filenames
ctxman --gitingest-from-report my-report.json
ctxman --gitingest-from-context my-context.json
```

**Why use JSON-based digest?**

- ⚡ **Performance**: Instant digest generation without re-scanning
- 🔄 **Reusability**: Generate multiple digests from one analysis
- 📦 **Workflow**: Separate analysis from export steps
- 🎯 **Flexibility**: Use different JSON sources for different purposes

### Output Example

The generated `digest.txt` file looks like:

```
Directory: my-project
Files analyzed: 42

Estimated tokens: 15.2k
Directory structure:
└── my-project/
    ├── src/
    │   ├── index.js
    │   └── utils.js
    └── README.md


================================================
FILE: src/index.js
================================================
[complete file contents here]

================================================
FILE: src/utils.js
================================================
[complete file contents here]
```

### Key Features

- **Single File**: Everything in one file for easy LLM ingestion
- **Tree Visualization**: Clear directory structure
- **Token Estimates**: Formatted as "1.2k" or "1.5M"
- **Sorted Output**: Files sorted by token count (largest first)
- **Filter Compatible**: Respects all `.gitignore` and context ignore rules

### Use Cases

1. **LLM Context Windows**: Paste entire codebase as single context
2. **Code Reviews**: Share complete project snapshot
3. **Documentation**: Single-file project reference
4. **AI Analysis**: Perfect for ChatGPT, Claude, or other LLMs
5. **Archival**: Simple project snapshot format

### Version Tracking

Context-manager implements GitIngest format v0.3.1. See [docs/GITINGEST_VERSION.md](docs/GITINGEST_VERSION.md) for implementation details and version history.

## Configuration

### .contextignore File (EXCLUDE Mode)

The `.contextignore` file is pre-configured for core application analysis:

```bash
# Current focus: Only core JS files in utility-mcp/src/
# Excludes:
**/*.md              # All documentation
**/*.json            # All configuration files
**/*.yml             # All YAML files
infrastructure/**    # Infrastructure code
workflows/**         # Workflow definitions
docs/**              # Documentation directory
token-analysis/**    # Analysis tools themselves
utility-mcp/scripts/** # Utility scripts
utility-mcp/src/workflows/** # Workflow JS files
utility-mcp/src/testing/**   # Testing utilities
```

### .contextinclude File (INCLUDE Mode)

The `.contextinclude` file provides precise file selection:

```bash
# Include only core JavaScript files
# This should produce exactly 64 files

# Include main entry point
utility-mcp/index.js

# Include all src JavaScript files EXCEPT workflows and testing
utility-mcp/src/**/*.js

# Exclude specific subdirectories (using negation)
!utility-mcp/src/workflows/**
!utility-mcp/src/testing/**
```

### Creating Custom Configurations

**For EXCLUDE mode** (edit `.contextignore`):

```bash
# Remove lines to include more file types
# Add patterns to exclude specific files

# Example: Include documentation
# **/*.md    <- comment out or remove this line

# Example: Exclude specific large files
your-large-file.js
specific-directory/**
```

**For INCLUDE mode** (create `.contextinclude`):

```bash
# Include specific files or patterns
src/**/*.js          # All JS files in src
config/*.json        # Config files only
docs/api/**/*.md     # API documentation only

# Use negation to exclude from broad patterns
src/**/*.js
!src/legacy/**       # Exclude legacy code
!src/**/*.test.js    # Exclude test files
```

## Configuration File Priority

1. **`.gitignore`** (project root) - Standard git exclusions (always respected)
2. **`.contextinclude`** (token-analysis/) - INCLUDE mode (highest priority)
3. **`.contextignore`** (token-analysis/) - EXCLUDE mode (used when no include file)
4. **`.contextignore`** (project root) - Fallback EXCLUDE mode location

## Installation

For exact token counting, install tiktoken:

```bash
npm install tiktoken
```

Without tiktoken, the tool uses smart estimation (~95% accuracy).

## Output Example

```
🎯 PROJECT TOKEN ANALYSIS REPORT
================================================================================
📊 Total files analyzed: 64
🔢 Total tokens: 181,480
💾 Total size: 0.78 MB
📄 Total lines: 28,721
📈 Average tokens per file: 2,836
🚫 Files ignored by .gitignore: 11,912
📋 Files ignored by calculator rules: 198

📋 BY FILE TYPE:
--------------------------------------------------------------------------------
Extension         Files      Tokens   Size (KB)     Lines
--------------------------------------------------------------------------------
.js                  64     181,480       799.8    28,721

🏆 TOP 5 LARGEST FILES BY TOKEN COUNT:
--------------------------------------------------------------------------------
 1.   12,388 tokens (6.8%) - utility-mcp/src/server/CloudStackUtilityMCP.js
 2.   11,007 tokens (6.1%) - utility-mcp/src/handlers/workflow-handlers.js
 3.    7,814 tokens (4.3%) - utility-mcp/src/utils/security.js
 4.    6,669 tokens (3.7%) - utility-mcp/src/handlers/tool-handlers.js
 5.    5,640 tokens (3.1%) - utility-mcp/src/ci-cd/pipeline-integration.js
```

## Context Management

Perfect for LLM context window optimization:

- **181k tokens** = Core application logic only
- **Clean analysis** = No noise from docs, configs, or build files
- **Focused development** = Essential code for AI-assisted development
- **Context efficiency** = Maximum useful code per token
- **Dual mode flexibility** = Precise include/exclude control
- **Ultra-minimal export** = 1k chars (89% reduction) for frequent AI interactions
- **Detailed export** = 8.6k chars for comprehensive analysis when needed

## Integration

You can integrate this tool into:

- CI/CD pipelines for code size monitoring
- Pre-commit hooks for token budget checks
- Documentation generation workflows
- Code quality gates
- LLM context preparation workflows
- Development environment setup

## Troubleshooting

### Include vs Exclude Mode Issues

- **INCLUDE mode active**: Remove `.contextinclude` to use EXCLUDE mode
- **Wrong files included**: Check if `.contextinclude` exists (takes priority)
- **Mode confusion**: Use verbose mode to see which mode is active

### Patterns Not Working

- Ensure no inline comments in ignore/include pattern files
- Use file patterns (`docs/**`) instead of directory patterns (`docs/`)
- Test specific patterns with verbose mode
- Check pattern syntax: `**` for recursive, `*` for single level

### Token Count Issues

- **Too high**: Review included files with verbose mode, add exclusion patterns
- **Too low**: Check if important files are excluded, review patterns
- **Inconsistent**: Verify which mode is active (include vs exclude)

### Missing Expected Files

- Check if files are excluded by `.gitignore` (always respected)
- Verify calculator ignore/include patterns
- Ensure files are recognized as text files
- Use verbose mode to see exclusion reasons

# Ctxman

LLM context manager with method-level filtering and token optimization. The ultimate tool for AI-assisted development.

_Created by Hakkı Sağdıç_

## 🚀 Features

✅ **File-level token analysis** - Analyze entire files and directories
🔧 **Method-level analysis** - Extract and analyze specific methods from JavaScript/TypeScript/Rust/C#/Go/Java
📋 **Dual filtering system** - Include/exclude files and methods with pattern matching  
📊 **LLM context optimization** - Generate ultra-compact context for AI assistants  
🎯 **Exact token counting** - Uses tiktoken for GPT-4 compatible counts  
📤 **Multiple export formats** - JSON reports, clipboard, file exports  
📦 **NPM package** - Use programmatically or as global CLI tool  
🔍 **Pattern matching** - Wildcards and regex support for flexible filtering  
⚡ **Performance optimized** - 36% smaller codebase with enhanced functionality

## 📦 Installation

### Option 1: NPM Package (Recommended)

```bash
# Local installation
npm install ctxman

# Global installation
npm install -g ctxman

# Run globally
ctxman --help
```

### Option 2: Direct Usage

```bash
# Clone and use directly
git clone <repository>
cd token-analysis
node token-calculator.js --help
```

## 🎯 Quick Start

### Basic Analysis

```bash
# Interactive analysis with export selection
ctxman

# File-level analysis with clipboard export
ctxman --context-clipboard

# Method-level analysis
ctxman --method-level --context-export

# Analysis with reports
ctxman --method-level --save-report --verbose
```

### Advanced Usage

```bash
# Focus on specific methods only
echo "calculateTokens\nhandleRequest\n*Validator" > .methodinclude
ctxman --method-level

# Exclude test methods
echo "*test*\n*debug*\nconsole" > .methodignore
ctxman --method-level --context-clipboard
```

## Usage

### Command Line Interface

```bash
# Basic analysis
ctxman

# Method-level analysis
ctxman --method-level

# Save detailed report
ctxman --save-report

# Copy context to clipboard
ctxman --context-clipboard

# Combine options
ctxman --method-level --save-report --verbose
```

### Programmatic Usage

```javascript
const { TokenAnalyzer } = require('ctxman');

// Basic file-level analysis
const analyzer = new TokenAnalyzer('./src', {
  methodLevel: false,
  verbose: true,
});

// Method-level analysis
const methodAnalyzer = new TokenAnalyzer('./src', {
  methodLevel: true,
  saveReport: true,
});

analyzer.run();
```

## 🔧 Configuration

### File-Level Filtering

**Priority Order:**

1. `.gitignore` (project root) - Standard git exclusions (always respected)
2. `.contextinclude` - INCLUDE mode (highest priority for files)
3. `.contextignore` - EXCLUDE mode (fallback for files)

**`.contextinclude`** - Include only these files:

```bash
# Include only core JavaScript files
utility-mcp/src/**/*.js
!utility-mcp/src/testing/**
!utility-mcp/src/workflows/**
```

**`.contextignore`** - Exclude these files:

```bash
# Exclude documentation and config
**/*.md
**/*.json
node_modules/**
test/
**/*.test.js
**/*.spec.js
```

### Method-Level Filtering

**`.methodinclude`** - Include only these methods:

```bash
# Core business logic methods
calculateTokens
generateLLMContext
analyzeFile
handleRequest
validateInput
processData

# Pattern matching
*Handler          # All methods ending with 'Handler'
*Validator        # All methods ending with 'Validator'
*Manager          # All methods ending with 'Manager'
TokenCalculator.* # All methods in TokenCalculator class
```

**`.methodignore`** - Exclude these methods:

```bash
# Utility and debug methods
console
*test*
*debug*
*helper*
print*
main

# File-specific exclusions
server.printStatus
utils.debugLog
```

### Pattern Syntax

| Pattern       | Description          | Example                             |
| ------------- | -------------------- | ----------------------------------- |
| `methodName`  | Exact match          | `calculateTokens`                   |
| `*pattern*`   | Contains pattern     | `*Handler` matches `requestHandler` |
| `Class.*`     | All methods in class | `TokenCalculator.*`                 |
| `file.method` | Specific file method | `server.handleRequest`              |
| `!pattern`    | Negation (exclude)   | `!*test*`                           |

## 📤 Output Formats

### 1. File-Level Context (Default)

**Use case:** General codebase analysis, file organization

```json
{
  "project": {
    "root": "my-project",
    "totalFiles": 64,
    "totalTokens": 181480
  },
  "paths": {
    "src/core/": ["server.js", "handler.js"],
    "src/utils/": ["helper.js", "validator.js"]
  }
}
```

### 2. Method-Level Context (`--method-level`)

**Use case:** Focused analysis, debugging specific methods, LLM context optimization

```json
{
  "project": {
    "root": "my-project",
    "totalFiles": 64,
    "totalTokens": 181480
  },
  "methods": {
    "src/server.js": [
      { "name": "handleRequest", "line": 15, "tokens": 234 },
      { "name": "validateInput", "line": 45, "tokens": 156 }
    ],
    "src/utils.js": [{ "name": "processData", "line": 12, "tokens": 89 }]
  },
  "methodStats": {
    "totalMethods": 150,
    "includedMethods": 23,
    "totalMethodTokens": 5670
  }
}
```

### 3. Detailed Report (JSON)

**Use case:** Comprehensive analysis, CI/CD integration, historical tracking

```json
{
  "metadata": {
    "generatedAt": "2024-01-15T10:30:00.000Z",
    "projectRoot": "/path/to/project",
    "gitignoreRules": ["node_modules/**", "*.log"],
    "calculatorRules": ["src/**/*.js", "!src/test/**"]
  },
  "summary": {
    "totalFiles": 64,
    "totalTokens": 181480,
    "byExtension": {".js": {"count": 64, "tokens": 181480}},
    "largestFiles": [...]
  },
  "files": [...]
}
```

## CLI Options

| Option                | Short | Description                         |
| --------------------- | ----- | ----------------------------------- |
| `--save-report`       | `-s`  | Save detailed JSON report           |
| `--verbose`           | `-v`  | Show included files and directories |
| `--context-export`    |       | Generate LLM context file           |
| `--context-clipboard` |       | Copy context to clipboard           |
| `--method-level`      | `-m`  | Enable method-level analysis        |
| `--help`              | `-h`  | Show help message                   |

## 📊 Use Cases & Examples

### 1. 🤖 LLM Context Optimization

**Goal:** Generate minimal context for AI assistants

```bash
# Ultra-compact method-level context
ctxman --method-level --context-clipboard

# Focus on core business logic only
echo "handleRequest\nprocessData\nvalidateInput" > .methodinclude
ctxman --method-level --context-export
```

**Result:** 89% smaller context compared to full codebase

### 2. 📊 Codebase Analysis

**Goal:** Understand project complexity and structure

```bash
# Analysis with detailed reports
ctxman --save-report --verbose

# Track largest files and methods
ctxman --method-level --save-report
```

### 3. 🔍 Method-Level Debugging

**Goal:** Focus on specific problematic methods

```bash
# Debug authentication methods only
echo "*auth*\n*login*\n*validate*" > .methodinclude
ctxman --method-level --context-clipboard

# Exclude test and debug methods
echo "*test*\n*debug*\nconsole\nlogger" > .methodignore
ctxman --method-level
```

### 4. 🚀 CI/CD Integration

**Goal:** Monitor codebase growth and complexity

```bash
# Daily token analysis for monitoring
ctxman --save-report > reports/analysis-$(date +%Y%m%d).json

# Check method complexity trends
ctxman --method-level --save-report
```

### 5. 📈 Code Quality Gates

**Goal:** Ensure code stays within token budgets

```bash
# Check if codebase exceeds LLM context limits
TOKENS=$(ctxman --context-export | jq '.project.totalTokens')
if [ $TOKENS -gt 100000 ]; then
  echo "Codebase too large for LLM context!"
  exit 1
fi
```

## 🛠️ CLI Reference

### Core Options

| Option                | Short | Description                  | Example                      |
| --------------------- | ----- | ---------------------------- | ---------------------------- |
| `--save-report`       | `-s`  | Save detailed JSON report    | `ctxman -s`                  |
| `--verbose`           | `-v`  | Show included files/methods  | `ctxman -v`                  |
| `--context-export`    |       | Generate LLM context file    | `ctxman --context-export`    |
| `--context-clipboard` |       | Copy context to clipboard    | `ctxman --context-clipboard` |
| `--method-level`      | `-m`  | Enable method-level analysis | `ctxman -m`                  |
| `--help`              | `-h`  | Show help message            | `ctxman -h`                  |

### Usage Patterns

```bash
# Quick analysis with interactive export
ctxman

# Method-level analysis with all outputs
ctxman --method-level --save-report --context-export --verbose

# LLM-optimized context generation
ctxman --method-level --context-clipboard

# CI/CD monitoring
ctxman --save-report --context-export

# Development debugging
ctxman --method-level --verbose
```

## 💻 Programmatic API

### Basic Usage

```javascript
const { TokenAnalyzer } = require('ctxman');

// File-level analysis
const analyzer = new TokenAnalyzer('./src', {
  verbose: true,
  saveReport: true,
});

analyzer.run();
```

### Method-Level Analysis

```javascript
const { TokenAnalyzer, MethodAnalyzer } = require('ctxman');

// Method-level analysis with custom filtering
const analyzer = new TokenAnalyzer('./src', {
  methodLevel: true,
  contextExport: true,
  verbose: false,
});

analyzer.run();

// Extract methods from specific file
const methodAnalyzer = new MethodAnalyzer();
const methods = methodAnalyzer.extractMethods(fileContent, 'server.js');
```

### Advanced Configuration

```javascript
const analyzer = new TokenAnalyzer('./src', {
  // Enable method-level analysis
  methodLevel: true,

  // Output options
  saveReport: true,
  contextExport: true,
  contextToClipboard: true,

  // Verbosity
  verbose: true,

  // Compact context (for LLM optimization)
  compactContext: true,
});

// Access results
analyzer.run();
console.log('Analysis complete!');
```

### Custom Method Analysis

```javascript
const { MethodAnalyzer, MethodFilterParser } = require('ctxman');

// Create custom method filter
const filter = new MethodFilterParser('./custom-methods.include', './custom-methods.ignore');

// Analyze specific file
const methodAnalyzer = new MethodAnalyzer();
const methods = methodAnalyzer.extractMethods(content, filePath);

// Filter methods
const filteredMethods = methods.filter((method) =>
  filter.shouldIncludeMethod(method.name, fileName)
);
```

## Requirements

- **Node.js**: >= 14.0.0
- **tiktoken**: ^1.0.0 (optional, for exact token counts)

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create your feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📞 Support

- 🐛 [Report Issues](https://github.com/hakkisagdic/ctxman/issues)
- 📖 [Documentation](https://github.com/hakkisagdic/ctxman#readme)
- 💬 [Discussions](https://github.com/hakkisagdic/ctxman/discussions)

---

_Created with ❤️ by Hakkı Sağdıç_
