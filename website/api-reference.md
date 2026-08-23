# API Reference

Complete reference for Ctxman CLI, REST API, and programmatic usage.

## CLI Reference

### Global Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--cli` | `-c` | Run in CLI mode (skip wizard) | `false` |
| `--help` | `-h` | Show help | - |
| `--version` | `-v` | Show version | - |
| `--path` | `-p` | Directory to analyze | Current directory |
| `--output` | `-o` | Output file path | `stdout` |

### Analysis Options

| Option | Description | Default |
|--------|-------------|---------|
| `--method-level` | Enable method-level token analysis | `false` |
| `--token-count` | Calculate exact token counts | `true` |
| `--tiktoken` | Use tiktoken for exact counting | `true` |
| `--include-comments` | Include comments in analysis | `false` |

### Output Format Options

| Option | Description |
|--------|-------------|
| `--toon` | Output in TOON format (40-50% reduction) |
| `--gitingest` | Output in GitIngest format |
| `--json` | Output as JSON |
| `--markdown` | Output as Markdown |

### Git Integration Options

| Option | Description |
|--------|-------------|
| `--git-diff <ref>` | Analyze files changed in diff |
| `--git-diff --cached` | Analyze staged changes |
| `--git-branch <branch>` | Compare with branch |
| `--git-author <author>` | Filter by author |

### Watch Mode Options

| Option | Description | Default |
|--------|-------------|---------|
| `--interval <ms>` | Debounce interval | `1000` |
| `--ignore <pattern>` | Patterns to ignore | - |

### Server Options

| Option | Description | Default |
|--------|-------------|---------|
| `--port <port>` | API server port | `3000` |
| `--host <host>` | API server host | `localhost` |

## CLI Commands

### `ctxman` (Default)

Start interactive wizard mode:

```bash
ctxman
```

### `ctxman watch`

Start watch mode:

```bash
ctxman watch [options]
```

### `ctxman serve`

Start REST API server:

```bash
ctxman serve [options]
```

### `ctxman config`

Manage configuration:

```bash
# Show current configuration
ctxman config show

# Set configuration value
ctxman config set output.format toon
```

## REST API

### Base URL

```
http://localhost:3000/api
```

### Authentication

Currently, the API runs locally without authentication. For production use, add a reverse proxy with authentication.

### Endpoints

#### POST /api/analyze

Analyze code in a directory.

**Request Body:**

```json
{
  "path": "./src",
  "methodLevel": true,
  "outputFormat": "json",
  "exclude": ["*.test.js"],
  "include": []
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalTokens": 12345,
    "totalFiles": 42,
    "files": [
      {
        "path": "src/index.js",
        "tokens": 234,
        "lines": 45,
        "methods": []
      }
    ]
  }
}
```

#### GET /api/status

Get server status.

**Response:**

```json
{
  "status": "running",
  "uptime": 3600,
  "version": "3.0.0"
}
```

#### GET /api/config

Get current configuration.

**Response:**

```json
{
  "output": {
    "format": "json",
    "file": null
  },
  "analysis": {
    "methodLevel": true,
    "tokenCount": true
  }
}
```

#### POST /api/config

Update configuration.

**Request Body:**

```json
{
  "output": {
    "format": "markdown"
  }
}
```

**Response:**

```json
{
  "success": true,
  "config": {
    "output": {
      "format": "markdown"
    }
  }
}
```

#### POST /api/cache/clear

Clear the analysis cache.

**Response:**

```json
{
  "success": true,
  "message": "Cache cleared"
}
```

#### GET /health

Health check endpoint.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Programmatic API

### Installation

```bash
npm install ctxman
```

### Import

```javascript
import ctxman from 'ctxman';
// or
const ctxman = require('ctxman');
```

### Methods

#### `ctxman.analyze(options)`

Analyze code in a directory.

```javascript
const result = await ctxman.analyze({
  path: './src',
  methodLevel: true,
  outputFormat: 'json',
  exclude: ['*.test.js']
});

console.log(result.totalTokens);
console.log(result.files);
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | `'.'` | Directory to analyze |
| `methodLevel` | `boolean` | `false` | Enable method-level analysis |
| `outputFormat` | `string` | `'json'` | Output format |
| `exclude` | `string[]` | `[]` | Patterns to exclude |
| `include` | `string[]` | `[]` | Patterns to include |

**Returns:** `Promise<AnalysisResult>`

#### `ctxman.watch(options)`

Start watch mode.

```javascript
const watcher = ctxman.watch({
  path: './src',
  interval: 1000,
  onChange: (result) => {
    console.log('Analysis updated:', result.totalTokens);
  },
  onError: (error) => {
    console.error('Watch error:', error);
  }
});

// Stop watching
watcher.stop();
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | `'.'` | Directory to watch |
| `interval` | `number` | `1000` | Debounce interval (ms) |
| `onChange` | `function` | - | Callback on change |
| `onError` | `function` | - | Callback on error |

**Returns:** `Watcher` object with `stop()` method.

#### `ctxman.serve(options)`

Start REST API server.

```javascript
const server = await ctxman.serve({
  port: 3000,
  host: 'localhost'
});

// Stop server
server.stop();
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | `3000` | Server port |
| `host` | `string` | `'localhost'` | Server host |

**Returns:** `Promise<Server>` object with `stop()` method.

#### `ctxman.configure(options)`

Set global configuration.

```javascript
ctxman.configure({
  defaultOutputFormat: 'toon',
  defaultMethodLevel: true
});
```

### Types

```typescript
interface AnalysisResult {
  totalTokens: number;
  totalFiles: number;
  totalLines: number;
  files: FileResult[];
  methods?: MethodResult[];
}

interface FileResult {
  path: string;
  tokens: number;
  lines: number;
  language: string;
  methods?: MethodResult[];
}

interface MethodResult {
  name: string;
  tokens: number;
  lines: number;
  file: string;
}

interface Watcher {
  stop(): void;
}

interface Server {
  stop(): Promise<void>;
}
```

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Configuration error |
| 4 | Analysis error |
| 5 | File system error |

## Error Handling

### CLI Errors

Errors are written to stderr with a descriptive message:

```bash
ctxman --invalid-option
# Error: Unknown option '--invalid-option'
# Run 'ctxman --help' for usage information.
```

### API Errors

API errors return JSON with error details:

```json
{
  "success": false,
  "error": {
    "code": "ANALYSIS_ERROR",
    "message": "Failed to analyze directory",
    "details": "Permission denied: /root/secret"
  }
}
```

## Rate Limiting

The REST API includes built-in rate limiting:

- **Window**: 15 minutes
- **Max Requests**: 100 per IP

Override in configuration:

```javascript
ctxman.serve({
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100
  }
});
```

## Caching

### Cache Configuration

```javascript
ctxman.configure({
  cache: {
    enabled: true,
    ttl: 3600000, // 1 hour
    directory: '.ctxman/cache'
  }
});
```

### Cache Invalidation

```bash
# Clear cache via CLI
ctxman cache clear

# Clear cache via API
curl -X POST http://localhost:3000/api/cache/clear
```

## Examples

### Basic Analysis

```javascript
import ctxman from 'ctxman';

const result = await ctxman.analyze({ path: './src' });
console.log(`Total tokens: ${result.totalTokens}`);
```

### Method-Level Analysis

```javascript
const result = await ctxman.analyze({
  path: './src',
  methodLevel: true
});

result.files.forEach(file => {
  console.log(`\n${file.path}:`);
  file.methods?.forEach(method => {
    console.log(`  ${method.name}: ${method.tokens} tokens`);
  });
});
```

### Watch Mode with Server

```javascript
import ctxman from 'ctxman';

// Start server
const server = await ctxman.serve({ port: 3000 });

// Start watch mode
const watcher = ctxman.watch({
  path: './src',
  onChange: (result) => {
    console.log(`Analysis updated: ${result.totalTokens} tokens`);
  }
});

// Cleanup on exit
process.on('SIGINT', async () => {
  watcher.stop();
  await server.stop();
  process.exit(0);
});
```

---

Need help? Check the [Troubleshooting Guide](https://github.com/hakkisagdic/ctxman/blob/main/docs/content-en/Troubleshooting.md) or open an [issue on GitHub](https://github.com/hakkisagdic/ctxman/issues).
