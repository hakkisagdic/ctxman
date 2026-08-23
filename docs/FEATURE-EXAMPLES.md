# Ctxman v2.3.5 - Feature Examples & Usage Guide

**Last Updated:** November 3, 2025
**Version:** 2.3.5 (Phase 1 Complete)

---

## 📋 Table of Contents

1. [TOON Format Examples](#toon-format-examples)
2. [Format Conversion Examples](#format-conversion-examples)
3. [GitIngest Chunking Examples](#gitingest-chunking-examples)
4. [Interactive Wizard Guide](#interactive-wizard-guide)
5. [Live Dashboard Guide](#live-dashboard-guide)
6. [CLI Command Reference](#cli-command-reference)

---

## 🎨 TOON Format Examples

### Basic Object Encoding

```javascript
const { ToonFormatter } = require('ctxman');
const formatter = new ToonFormatter();

const project = {
  name: 'ctxman',
  version: '2.3.5',
  totalFiles: 64,
  totalTokens: 181480,
};

const toon = formatter.encode(project);
console.log(toon);
```

**Output:**

```toon
{
  name: ctxman
  version: 2.3.5
  totalFiles: 64
  totalTokens: 181480
}
```

### Tabular Format (Methods)

```javascript
const methods = [
  { name: 'handleRequest', line: 15, tokens: 234 },
  { name: 'validateInput', line: 45, tokens: 156 },
  { name: 'processData', line: 72, tokens: 189 },
];

const tabular = formatter.encodeTabular(methods);
console.log(tabular);
```

**Output:**

```toon
{line,name,tokens}:
  15,handleRequest,234
  45,validateInput,156
  72,processData,189
```

### TOON Optimization (v2.3.1)

```javascript
// Validate TOON syntax
const validation = formatter.validate(toonString);
console.log('Valid:', validation.valid);
console.log('Errors:', validation.errors);

// Estimate tokens
const tokenCount = formatter.estimateTokens(toonString);
console.log('Estimated tokens:', tokenCount);

// Optimize (remove extra whitespace)
const optimized = formatter.optimize(toonString);

// Minify (ultra-compact)
const minified = formatter.minify(toonString);
```

### Compare with JSON

```javascript
const data = {
  project: 'ctxman',
  files: 64,
  tokens: 181480,
};

const comparison = formatter.compareWithJSON(data);
console.log('TOON size:', comparison.toonSize);
console.log('JSON size:', comparison.jsonSize);
console.log('Savings:', comparison.savings, 'chars');
console.log('Reduction:', comparison.savingsPercentage + '%');
console.log('TOON tokens:', comparison.toonTokens);
console.log('JSON tokens:', comparison.jsonTokens);
```

**Example Output:**

```
TOON size: 86 chars
JSON size: 101 chars
Savings: 15 chars
Reduction: 14.9%
TOON tokens: 22
JSON tokens: 26
```

---

## 🔄 Format Conversion Examples

### JSON to TOON

```bash
# CLI
ctxman convert input.json --from json --to toon --output result.toon
```

```javascript
// Programmatic
const FormatConverter = require('./lib/utils/format-converter');
const converter = new FormatConverter();

const jsonString = JSON.stringify({ project: 'test', files: 10 }, null, 2);
const result = converter.convert(jsonString, 'json', 'toon');

console.log(result.output);
console.log('Savings:', result.metadata.savingsPercentage + '%');
```

### JSON to YAML

```bash
ctxman convert data.json --from json --to yaml --output config.yaml
```

### Batch Conversion

```javascript
const converter = new FormatConverter();
const files = ['data1.json', 'data2.json', 'data3.json'];

files.forEach((file) => {
  const input = fs.readFileSync(file, 'utf8');
  const result = converter.convert(input, 'json', 'toon');
  const outputFile = file.replace('.json', '.toon');
  fs.writeFileSync(outputFile, result.output);
  console.log(`✅ ${file} → ${outputFile} (${result.metadata.savingsPercentage}% reduction)`);
});
```

---

## 📦 GitIngest Chunking Examples

### Enable Chunking

```bash
# CLI with chunking
ctxman --gitingest --chunk --chunk-strategy smart --chunk-size 100000
```

```javascript
// Programmatic
const GitIngestFormatter = require('./lib/formatters/gitingest-formatter');

const formatter = new GitIngestFormatter(projectRoot, stats, results, {
  chunking: {
    enabled: true,
    strategy: 'smart', // smart, size, file, directory
    maxTokensPerChunk: 100000,
    overlap: 500, // v2.3.3
    preserveContext: true,
    includeMetadata: true, // v2.3.3
    crossReferences: true, // v2.3.3
  },
});

const chunks = formatter.generateChunkedDigest();
console.log(`Generated ${chunks.length} chunks`);
```

### Chunking Strategies

#### 1. Smart Chunking (Directory-Aware)

```bash
ctxman --gitingest --chunk --chunk-strategy smart
```

- Groups related files by directory structure
- Preserves logical code relationships
- Best for: Most projects

#### 2. Size-Based Chunking

```bash
ctxman --gitingest --chunk --chunk-strategy size --chunk-size 50000
```

- Fixed token size chunks
- Splits at file boundaries when possible
- Best for: Strict token limits

#### 3. File-Based Chunking

```bash
ctxman --gitingest --chunk --chunk-strategy file
```

- One file per chunk
- Includes directory context
- Best for: Large individual files

#### 4. Directory-Based Chunking

```bash
ctxman --gitingest --chunk --chunk-strategy directory
```

- One directory per chunk
- Complete module/package isolation
- Best for: Modular projects

### Chunk Overlap (v2.3.3)

```javascript
const formatter = new GitIngestFormatter(root, stats, results, {
  chunking: {
    enabled: true,
    overlap: 500, // 500 tokens overlap between chunks
    preserveContext: true,
  },
});
```

**Why overlap?**

- Maintains context across chunk boundaries
- Prevents information loss at chunk edges
- Improves LLM understanding of cross-chunk relationships

---

## 🧙 Interactive Wizard Guide

### Starting the Wizard

```bash
ctxman --wizard
```

### Wizard Flow

The wizard guides you through 5 steps:

#### Step 1: What are you working on?

```
┌──────────────────────────────────────────────────────────┐
│  Context Generation Wizard                              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  What are you working on today?                         │
│                                                          │
│  ❯ 🐛 Bug Fix                                           │
│    ✨ New Feature                                        │
│    👀 Code Review                                        │
│    ♻️  Refactoring                                       │
│    🔒 Security Audit                                     │
│    📚 Documentation                                      │
│    ⚙️  Custom                                            │
│                                                          │
│  [↑↓] Navigate  [Enter] Select  [Esc] Cancel           │
└──────────────────────────────────────────────────────────┘
```

**Navigation:**

- Use `↑↓` arrow keys to move
- Press `Enter` to select
- Press `Esc` to cancel

**Use Case Templates:**

- **🐛 Bug Fix**: Focuses on changed files + related code
- **✨ New Feature**: Includes core modules + architecture
- **👀 Code Review**: Full context with tests + docs
- **♻️ Refactoring**: Target modules + dependencies
- **🔒 Security Audit**: Security-critical files + configs
- **📚 Documentation**: Code + existing docs
- **⚙️ Custom**: Customize all options

#### Step 2: Target LLM Selection

```
┌──────────────────────────────────────────────────────────┐
│  Which AI model will you use?                           │
│                                                          │
│  ❯ Claude Opus (200k tokens)                            │
│    Claude Sonnet (200k tokens)                          │
│    GPT-4 Turbo (128k tokens)                            │
│    GPT-4 (8k tokens)                                    │
│    Gemini Pro (1M tokens)                               │
│    Custom (specify token limit)                         │
└──────────────────────────────────────────────────────────┘
```

**Auto-Optimization:**

- Wizard adjusts output to fit token limits
- Suggests chunking for large projects
- Recommends best format for your LLM

#### Step 3: What to Include?

```
┌──────────────────────────────────────────────────────────┐
│  What should be included in the context?                │
│                                                          │
│  ◉ Changed files (git diff)                             │
│  ◉ Related files (imports/dependencies)                 │
│  ◯ Tests                                                 │
│  ◯ Documentation                                         │
│  ◉ Core modules                                          │
│  ◯ Configuration files                                   │
│                                                          │
│  [Space] Toggle  [Enter] Continue                      │
└──────────────────────────────────────────────────────────┘
```

**Navigation:**

- `Space` to toggle selection
- `Enter` to continue

#### Step 4: Output Format

```
┌──────────────────────────────────────────────────────────┐
│  Choose output format:                                  │
│                                                          │
│  ❯ TOON (40-50% more efficient) ⭐ Recommended          │
│    JSON (standard, widely compatible)                   │
│    YAML (human-readable)                                │
│    GitIngest (single file digest)                       │
│    Markdown (documentation-friendly)                    │
└──────────────────────────────────────────────────────────┘
```

#### Step 5: Confirmation & Export

```
┌──────────────────────────────────────────────────────────┐
│  📊 Configuration Summary                               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Use Case: Bug Fix                                      │
│  Target: Claude Opus (200k tokens)                      │
│  Files: Changed + Related (estimated 45 files)          │
│  Format: TOON                                           │
│  Estimated tokens: 12,450                               │
│                                                          │
│  [Enter] Start Analysis  [Esc] Go Back                 │
└──────────────────────────────────────────────────────────┘
```

### Wizard Output

After analysis completes:

```
✅ Analysis complete!

Generated: context-bug-fix.toon
Size: 12,450 tokens
Files included: 45

📋 Next steps:
1. Copy to clipboard? (y/n)
2. Open in editor? (y/n)
3. Save to different format? (y/n)
```

---

## 📊 Live Dashboard Guide

### Starting the Dashboard

```bash
ctxman --dashboard
```

### Dashboard Interface

```
┌──────────────────────────────────────────────────────────┐
│  Live Analysis Dashboard                                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  📊 Project Analysis                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 67% (43/64 files) │
│                                                          │
│  Current: src/analyzers/method-analyzer.js              │
│  Tokens: 181,480 / 200,000 (90.7%)                      │
│  Time Elapsed: 2.3s                                     │
│                                                          │
│  ✓ Scanning files                                       │
│  ✓ Extracting methods                                   │
│  ⣾ Calculating tokens                                   │
│  ○ Generating output                                    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Real-Time Stats

```
┌──────────────────────────────────────────────────────────┐
│  Files: 64        Methods: 347      Tokens: 181,480     │
│  Size: 0.78 MB    Lines: 28,721     Avg: 2,836 tok/file │
│                                                          │
│  Top Languages:                                         │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ JavaScript (100%)      │
│                                                          │
│  Largest Files:                                         │
│  • server.js           12,388 tokens  ▓▓▓▓▓▓▓ (6.8%)    │
│  • workflow-handler.js 11,007 tokens  ▓▓▓▓▓▓ (6.1%)     │
│  • security.js          7,814 tokens  ▓▓▓▓ (4.3%)       │
│                                                          │
│  [R] Refresh  [S] Save  [E] Export  [Q] Quit           │
└──────────────────────────────────────────────────────────┘
```

### Dashboard Controls

- `R` - Refresh stats (in watch mode)
- `S` - Save current report
- `E` - Export to format
- `Q` - Quit dashboard

### Watch Mode

```bash
# Enable watch mode (auto-refresh on file changes)
ctxman --dashboard --watch
```

Dashboard updates automatically when files change:

```
🔄 File changed: src/utils/helper.js
⚡ Re-analyzing... (1.2s)
✅ Updated! Tokens: 181,480 → 182,105 (+625)
```

---

## 📖 CLI Command Reference

### Basic Analysis

```bash
# Default analysis (TOON format)
ctxman

# With specific format
ctxman --output json
ctxman --output yaml
ctxman --output toon

# Method-level analysis
ctxman --method-level

# Verbose output
ctxman --verbose
```

### Export Options

```bash
# Save JSON report
ctxman --save-report

# Generate LLM context
ctxman --context-export

# Copy to clipboard
ctxman --context-clipboard

# GitIngest digest
ctxman --gitingest
```

### Chunking

```bash
# Basic chunking
ctxman --gitingest --chunk

# With strategy
ctxman --chunk --chunk-strategy smart
ctxman --chunk --chunk-strategy size --chunk-size 50000
ctxman --chunk --chunk-strategy file
ctxman --chunk --chunk-strategy directory
```

### Format Conversion

```bash
# Convert files
ctxman convert input.json --from json --to toon
ctxman convert data.yaml --from yaml --to json
ctxman convert report.json --from json --to csv

# With output file
ctxman convert input.json --from json --to toon --output result.toon
```

### Interactive Modes

```bash
# Wizard (guided configuration)
ctxman --wizard

# Dashboard (live stats)
ctxman --dashboard

# Dashboard with watch mode
ctxman --dashboard --watch

# Simple mode (no UI)
ctxman --simple
```

### List Available Formats

```bash
ctxman --list-formats
```

---

## 🎯 Common Use Cases

### 1. Bug Fix Context

```bash
# Use wizard for guided setup
ctxman --wizard
# Select: Bug Fix → Claude Opus → Changed + Related → TOON

# Or use CLI directly
ctxman --changed-only --output toon --context-clipboard
```

### 2. Code Review

```bash
# Full project context
ctxman --output gitingest --chunk --chunk-strategy smart

# Or use dashboard to explore
ctxman --dashboard
```

### 3. Documentation Generation

```bash
# Markdown format for docs
ctxman --output markdown --context-export

# With method-level details
ctxman --method-level --output markdown
```

### 4. Multi-Format Export

```bash
# Export to multiple formats
ctxman --output toon > context.toon
ctxman --output json > context.json
ctxman --output yaml > context.yaml
```

### 5. Large Project Analysis

```bash
# Use chunking for repos > 100k tokens
ctxman --gitingest --chunk --chunk-size 100000 --chunk-strategy smart
```

---

## 💡 Pro Tips

1. **Use Wizard for First Time**: The wizard helps you understand all options
2. **Dashboard for Exploration**: Use dashboard mode to explore your codebase interactively
3. **TOON for Efficiency**: TOON format saves 40-50% tokens vs JSON
4. **Smart Chunking**: Let the tool decide chunk boundaries with `--chunk-strategy smart`
5. **Clipboard Integration**: Use `--context-clipboard` for quick AI assistant usage
6. **Method Filters**: Create `.methodinclude` to focus on specific functions

---

## 🐛 Troubleshooting

### Wizard Not Showing

- Make sure Ink dependencies are installed: `npm install`
- Use `--simple` flag if terminal doesn't support Ink

### Dashboard Not Rendering

- Check terminal supports ANSI colors
- Try `--simple` mode for basic text output
- Update terminal emulator

### Chunking Not Working

- Verify `--chunk` flag is present
- Check chunk size isn't too small
- Use `--verbose` to see chunk details

---

**Need Help?** Open an issue at https://github.com/hakkisagdic/ctxman/issues
