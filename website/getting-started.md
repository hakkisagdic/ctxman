# Getting Started

Get up and running with Ctxman in just a few minutes.

## Installation

### npm (Recommended)

Install globally for easy access:

```bash
npm install -g ctxman
```

### Using npx

Run without installing:

```bash
npx ctxman
```

### From Source

Clone and install locally:

```bash
git clone https://github.com/hakkisagdic/ctxman.git
cd ctxman
npm install
npm link
```

## Requirements

- **Node.js**: Version 20.0.0 or higher
- **npm**: Version 8.0.0 or higher

Check your Node.js version:

```bash
node --version
```

## Quick Start

### 1. Navigate to Your Project

```bash
cd /path/to/your/project
```

### 2. Run Ctxman

```bash
ctxman
```

This starts the interactive wizard mode, which guides you through the analysis options.

### 3. Follow the Wizard

The wizard will ask you to:

1. Select the analysis type
2. Choose output format
3. Configure filtering options
4. Review and confirm

### 4. View Results

After analysis completes, you'll see:

- Token count summary
- File breakdown
- Method-level analysis (if enabled)
- Export options

## CLI Mode

For power users and automation, use CLI mode:

```bash
ctxman --cli
```

### Common Commands

```bash
# Basic analysis
ctxman --cli

# With method-level analysis
ctxman --cli --method-level

# Export to TOON format
ctxman --cli --toon

# Export to GitIngest format
ctxman --cli --gitingest

# Analyze specific directory
ctxman --cli --path ./src

# Set output file
ctxman --cli --output result.md
```

## Configuration

### .contextignore

Exclude files from analysis:

```gitignore
# Dependencies
node_modules/
vendor/

# Build outputs
dist/
build/

# Test files
*.test.js
*.spec.ts

# Configuration
.env
.env.*
```

### .contextinclude

Include only specific files (takes priority over .contextignore):

```gitignore
src/
lib/
index.js
```

### .methodinclude

Include specific methods:

```text
calculate*
parse*
render*
```

### .methodignore

Exclude specific methods:

```text
test*
mock*
deprecated*
```

## Watch Mode

Enable real-time monitoring:

```bash
ctxman watch
```

### Watch Options

```bash
# Custom interval (ms)
ctxman watch --interval 500

# Specific directory
ctxman watch --path ./src

# With output
ctxman watch --output live.json
```

## API Server

Start the REST API server:

```bash
ctxman serve
```

Default port is 3000. Configure with:

```bash
ctxman serve --port 8080
```

### API Endpoints

| Endpoint           | Method | Description          |
| ------------------ | ------ | -------------------- |
| `/api/analyze`     | POST   | Analyze code         |
| `/api/status`      | GET    | Server status        |
| `/api/config`      | GET    | Get configuration    |
| `/api/config`      | POST   | Update configuration |
| `/api/cache/clear` | POST   | Clear cache          |
| `/health`          | GET    | Health check         |

### Example API Usage

```bash
# Analyze current directory
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"path": "."}'
```

## Git Integration

### Analyze Changed Files

```bash
# Last commit changes
ctxman --git-diff HEAD~1

# Staged changes
ctxman --git-diff --cached

# Between branches
ctxman --git-diff main..feature
```

### Git Branch Analysis

```bash
# Compare with main branch
ctxman --git-branch main
```

## Output Formats

### TOON Format

Optimized for LLMs with 40-50% token reduction:

```bash
ctxman --cli --toon
```

### GitIngest Format

GitHub-ready markdown:

```bash
ctxman --cli --gitingest
```

### JSON Format

Machine-readable output:

```bash
ctxman --cli --output result.json
```

## Environment Variables

Configure via environment variables:

```bash
# Set default output format
export CTXMAN_OUTPUT_FORMAT=toon

# Enable method-level analysis by default
export CTXMAN_METHOD_LEVEL=true

# Set cache directory
export CTXMAN_CACHE_DIR=~/.ctxman/cache
```

## Programmatic API

Use Ctxman in your Node.js applications:

```javascript
import ctxman from 'ctxman';

// Basic analysis
const result = await ctxman.analyze({
  path: './src',
  methodLevel: true,
});

console.log(result.totalTokens);

// Watch mode
const watcher = ctxman.watch({
  path: './src',
  onChange: (result) => {
    console.log('Files changed:', result.files);
  },
});

// Stop watching
watcher.stop();
```

## Next Steps

- Explore [Features](/features) for detailed capabilities
- Check the [API Reference](/api-reference) for complete documentation
- Try the [Interactive Demo](/demo) to see it in action
- Read the [Contributing Guide](https://github.com/hakkisagdic/ctxman/blob/main/CONTRIBUTING.md) to get involved
