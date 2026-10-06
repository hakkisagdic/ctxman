# Features

Ctxman is a powerful AI Development Platform with a comprehensive set of features designed for modern development workflows.

## 🚀 Platform Features

### Plugin Architecture

Ctxman features a modular plugin system that makes it easy to extend and customize:

- **Language Plugins**: Add support for new programming languages
- **Exporter Plugins**: Create custom output formats
- **Analyzer Plugins**: Extend analysis capabilities
- **Easy Integration**: Simple API for creating plugins

```javascript
// Example plugin structure
export default {
  name: 'my-plugin',
  type: 'language',
  extensions: ['.xyz'],
  analyze: async (content, filePath) => {
    // Custom analysis logic
  },
};
```

### Git Integration

Seamlessly integrate with your Git workflow:

- **Changed Files Analysis**: Analyze only modified files
- **Diff Analysis**: Compare changes between commits
- **Author Tracking**: Track code contributions
- **Branch Comparison**: Compare branches

```bash
# Analyze changed files in the last commit
ctxman --git-diff HEAD~1

# Analyze files changed in a specific branch
ctxman --git-branch feature/new-feature
```

### Watch Mode

Real-time file monitoring for instant feedback:

- **Auto-Analysis**: Automatically re-analyze on file changes
- **Live Updates**: See results instantly
- **Configurable Intervals**: Set custom debounce timing
- **Selective Watching**: Watch specific directories

```bash
# Start watch mode
ctxman watch

# Watch with specific options
ctxman watch --interval 1000 --output json
```

### REST API

HTTP server for programmatic access:

- **6 Endpoints**: Full API coverage
- **JSON Responses**: Standard REST format
- **CORS Support**: Cross-origin requests
- **Health Check**: Monitor server status

```bash
# Start API server
ctxman serve

# API is available at http://localhost:3000
curl http://localhost:3000/api/analyze
```

## 🎨 User Interface

### Interactive Wizard Mode

User-friendly guided setup for beginners:

- **Step-by-Step Process**: Clear guidance through options
- **Smart Defaults**: Sensible default values
- **Input Validation**: Catch errors early
- **Help Text**: Contextual help at every step

### CLI Mode

Traditional command-line interface for power users:

- **Direct Commands**: Skip the wizard
- **Shell Integration**: Perfect for scripts
- **Exit Codes**: Proper error handling
- **Piping Support**: Chain with other tools

## 🔢 Token Analysis

### Exact Token Counting

Accurate token counting for LLM planning:

- **tiktoken Integration**: GPT-4 compatible
- **Multiple Models**: Support for various LLM tokenizers
- **Exact Counts**: No estimation, actual token counts
- **Per-File Analysis**: Detailed breakdown

### Multi-Language Support

Analyze code in 14+ programming languages:

| Language   | Extensions      | Features                     |
| ---------- | --------------- | ---------------------------- |
| JavaScript | .js, .jsx, .mjs | Full AST analysis            |
| TypeScript | .ts, .tsx       | Type-aware analysis          |
| Python     | .py             | Method-level analysis        |
| PHP        | .php            | Class and function analysis  |
| Ruby       | .rb             | Module and method analysis   |
| Java       | .java           | Class and method analysis    |
| Kotlin     | .kt             | Function analysis            |
| C#         | .cs             | Class and method analysis    |
| Go         | .go             | Function analysis            |
| Rust       | .rs             | Function and struct analysis |
| Swift      | .swift          | Function analysis            |
| C/C++      | .c, .cpp, .h    | Function analysis            |
| Scala      | .scala          | Class and function analysis  |

### Method-Level Analysis

Get granular insights into your code:

- **Per-Function Tokens**: Token count for each function
- **Complexity Metrics**: Understand code complexity
- **Largest Functions**: Identify token-heavy code
- **Optimization Tips**: Suggestions for reduction

## 🎯 Filtering & Configuration

### Dual Ignore System

Flexible file filtering:

- **.gitignore Support**: Respect Git ignore rules
- **.contextignore**: Custom ignore patterns
- **.contextinclude**: Include-only mode
- **Priority System**: Clear precedence rules

### Method Filtering

Granular control over analysis:

- **.methodinclude**: Include specific methods
- **.methodignore**: Exclude specific methods
- **Pattern Matching**: Wildcards and regex support
- **Performance**: Skip unnecessary analysis

## 📊 Output Formats

### TOON Format

40-50% token reduction with optimized output:

- **Compact Structure**: Minimized redundancy
- **Semantic Preservation**: Keep meaning intact
- **LLM Optimized**: Perfect for AI consumption
- **Backward Compatible**: Easy to convert back

### GitIngest Format

GitHub-ready output format:

- **Markdown Compatible**: Works with GitHub
- **Syntax Highlighting**: Proper code blocks
- **File Trees**: Visual directory structure
- **Line Numbers**: Reference specific lines

### Standard Formats

Multiple output options:

- **JSON**: Machine-readable
- **Markdown**: Documentation-ready
- **Plain Text**: Simple and clean
- **Custom**: Build your own with plugins

## ⚡ Performance

### Caching System

Speed up repeated analyses:

- **Intelligent Cache**: Only re-analyze changed files
- **Configurable TTL**: Set cache expiration
- **Cache Invalidation**: Manual or automatic
- **Memory Efficient**: Low overhead

### Measured Speed

Handle large codebases efficiently (4-vCPU Linux VM, Node.js 22):

- **Fast Scanning**: ~1,900 files discovered with ignore rules in ~75 ms
- **Token Counting**: 1,135 files / 2.6M tokens counted with tiktoken in ~6 s
- **Progress Reporting**: Track analysis progress

## 🔧 Configuration

### Flexible Configuration

Multiple configuration options:

- **JSON Config**: Structured configuration
- **CLI Flags**: Quick overrides
- **Environment Variables**: CI/CD integration
- **Defaults**: Sensible out-of-the-box behavior

### Example Configuration

```json
{
  "output": {
    "format": "toon",
    "file": "output.md"
  },
  "analysis": {
    "methodLevel": true,
    "tokenCount": true
  },
  "exclude": ["node_modules", "dist", "*.test.js"]
}
```

## 🔐 Security

### Safe by Default

Security-first approach:

- **No External Calls**: All processing is local
- **File Validation**: Safe file handling
- **Memory Limits**: Prevent resource exhaustion
- **Input Sanitization**: Clean all inputs

---

Ready to get started? Check out our [Getting Started Guide](/getting-started) or try the [Interactive Demo](/demo).
