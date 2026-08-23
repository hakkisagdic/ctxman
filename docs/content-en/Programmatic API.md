# Programmatic API

<cite>
**Referenced Files in This Document**   
- [ctxman.js](file://ctxman.js) - *Updated in recent commit*
- [index.js](file://index.js) - *Updated in recent commit*
- [README.md](file://README.md)
- [lib/analyzers/token-calculator.js](file://lib/analyzers/token-calculator.js) - *Core implementation*
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js) - *Added in recent commit*
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js) - *Added in recent commit*
</cite>

## Update Summary

**Changes Made**

- Updated TokenAnalyzer class documentation to reflect its alias relationship with TokenCalculator
- Added new sections for GitIngestFormatter and MethodFilterParser classes
- Updated configuration options to include the new gitingest option
- Added documentation for the new generateDigestFromReport and generateDigestFromContext functions
- Updated usage examples to include the new formatter and parser classes
- Enhanced core components diagram to show new relationships

## Table of Contents

1. [Introduction](#introduction)
2. [Core Components](#core-components)
3. [TokenAnalyzer Class](#tokenanalyzer-class)
4. [Configuration Options](#configuration-options)
5. [Data Models](#data-models)
6. [Usage Examples](#usage-examples)
7. [Error Handling](#error-handling)
8. [Performance Considerations](#performance-considerations)
9. [Migration Guidance](#migration-guidance)

## Introduction

The ctxman tool provides a programmatic interface for analyzing codebases and generating optimized context for LLM (Large Language Model) consumption. The primary entry point is the TokenAnalyzer class, which enables developers to integrate token analysis capabilities directly into Node.js applications. This API allows for automated analysis of project files, method-level extraction, and generation of context-optimized outputs for AI-assisted development workflows.

The tool is designed to help developers understand their codebase complexity, optimize LLM context usage, and automate analysis tasks within development pipelines. It supports both file-level and method-level analysis, with flexible configuration options for filtering and output formats.

**Section sources**

- [README.md](file://README.md#L1-L100)

## Core Components

The ctxman tool is built around several core components that work together through composition to provide comprehensive analysis capabilities. The TokenAnalyzer class serves as the primary interface, orchestrating interactions between specialized components for different aspects of the analysis process.

The architecture follows a modular design where each component has a specific responsibility:

- GitIgnoreParser handles file exclusion based on .gitignore and custom ignore rules
- MethodAnalyzer extracts method definitions from code files
- MethodFilterParser applies inclusion/exclusion rules to methods
- TokenCalculator performs the core analysis and token counting
- GitIngestFormatter generates GitIngest-style digest files

These components are composed within the TokenAnalyzer (implemented as TokenCalculator) to provide a cohesive analysis experience. This design allows for independent development and testing of each component while maintaining a simple interface for end users.

```mermaid
classDiagram
class TokenAnalyzer {
+constructor(directoryPath, options)
+run()
}
class GitIgnoreParser {
+constructor(gitignorePath, calculatorIgnorePath, calculatorIncludePath)
+isIgnored(filePath, relativePath)
}
class MethodAnalyzer {
+extractMethods(content, filePath)
+getLineNumber(content, index)
+isKeyword(name)
}
class MethodFilterParser {
+constructor(methodIncludePath, methodIgnorePath)
+shouldIncludeMethod(methodName, fileName)
}
class GitIngestFormatter {
+constructor(projectRoot, stats, analysisResults)
+generateDigest()
+saveToFile(outputPath)
}
TokenAnalyzer --> GitIgnoreParser : "uses"
TokenAnalyzer --> MethodAnalyzer : "uses"
TokenAnalyzer --> MethodFilterParser : "uses"
TokenAnalyzer --> GitIngestFormatter : "uses for gitingest option"
GitIngestFormatter --> MethodAnalyzer : "uses for method extraction"
GitIngestFormatter --> MethodFilterParser : "uses for method filtering"
```

**Diagram sources**

- [ctxman.js](file://ctxman.js#L14-L109)
- [ctxman.js](file://ctxman.js#L118-L223)
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js#L13-L264)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L7-L47)

**Section sources**

- [ctxman.js](file://ctxman.js#L14-L223)
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js#L13-L264)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L7-L47)

## TokenAnalyzer Class

The TokenAnalyzer class is the primary entry point for the ctxman tool's programmatic interface. It provides a simple yet powerful API for analyzing codebases and generating optimized context for LLM consumption.

### Constructor Parameters

The TokenAnalyzer constructor accepts two parameters:

```javascript
const analyzer = new TokenAnalyzer(directoryPath, options);
```

- `directoryPath` (string): The path to the directory that should be analyzed. This is typically the root of your project or a specific subdirectory you want to analyze.
- `options` (object): Configuration options that control the behavior of the analysis. See the Configuration Options section for details.

**Important Note**: TokenAnalyzer is actually an alias for the TokenCalculator class. In the codebase, TokenAnalyzer is exported as an alias of TokenCalculator in the index.js file for backward compatibility. This means that TokenAnalyzer and TokenCalculator are the same class with two different names.

### run() Method

The `run()` method executes the complete analysis process and generates the results. When called, it performs the following steps:

1. Scans the specified directory and its subdirectories
2. Applies ignore rules from .gitignore and custom configuration files
3. Analyzes each file to calculate token counts
4. Optionally performs method-level analysis when enabled
5. Generates comprehensive reports and exports
6. Outputs results to console and/or files based on configuration

The method is designed to be asynchronous in nature, though it doesn't return a Promise directly. Instead, it handles asynchronous operations internally, particularly when dealing with file system operations and clipboard integration.

```mermaid
sequenceDiagram
participant Application
participant TokenAnalyzer
participant GitIgnoreParser
participant MethodAnalyzer
participant MethodFilterParser
participant GitIngestFormatter
Application->>TokenAnalyzer : new TokenAnalyzer(path, options)
TokenAnalyzer->>TokenAnalyzer : Initialize components
Application->>TokenAnalyzer : run()
TokenAnalyzer->>GitIgnoreParser : Check if file should be ignored
loop For each file
TokenAnalyzer->>TokenAnalyzer : Read file content
TokenAnalyzer->>TokenAnalyzer : Calculate tokens
alt methodLevel enabled
TokenAnalyzer->>MethodAnalyzer : extractMethods(content)
loop For each method
MethodAnalyzer->>MethodFilterParser : shouldIncludeMethod()
MethodFilterParser-->>MethodAnalyzer : Include/Exclude decision
end
end
TokenAnalyzer->>TokenAnalyzer : Update statistics
end
alt gitingest enabled
TokenAnalyzer->>GitIngestFormatter : Generate digest
GitIngestFormatter->>GitIngestFormatter : Apply method filtering
GitIngestFormatter->>GitIngestFormatter : Format as GitIngest digest
end
TokenAnalyzer->>TokenAnalyzer : Generate reports
TokenAnalyzer->>Application : Output results
```

**Diagram sources**

- [ctxman.js](file://ctxman.js#L225-L790)
- [lib/analyzers/token-calculator.js](file://lib/analyzers/token-calculator.js#L13-L522)

**Section sources**

- [ctxman.js](file://ctxman.js#L225-L790)
- [index.js](file://index.js#L1-L8)
- [lib/analyzers/token-calculator.js](file://lib/analyzers/token-calculator.js#L13-L522)

## Configuration Options

The TokenAnalyzer class accepts various options through the options object parameter in its constructor. These options control the behavior of the analysis process and allow for customization based on specific use cases.

### Available Options

| Option           | Type    | Default | Description                                                                               |
| ---------------- | ------- | ------- | ----------------------------------------------------------------------------------------- |
| methodLevel      | boolean | false   | Enables method-level analysis, extracting individual methods from code files              |
| verbose          | boolean | false   | Controls whether detailed information is displayed during analysis                        |
| saveReport       | boolean | false   | Saves a detailed JSON report of the analysis to token-analysis-report.json                |
| contextExport    | boolean | false   | Generates an LLM context file (llm-context.json) with optimized file listings             |
| contextClipboard | boolean | false   | Copies the LLM context directly to the system clipboard                                   |
| gitingest        | boolean | false   | Generates a GitIngest-style digest file (digest.txt) containing the full codebase content |

### Option Interactions

These options can be combined to achieve different analysis workflows:

- Using `methodLevel: true` enables extraction of individual methods from JavaScript/TypeScript files, providing more granular analysis
- Combining `saveReport: true` with other options allows for both immediate feedback and persistent storage of analysis results
- Using `contextExport: true` or `contextClipboard: true` generates optimized context for LLM consumption, either saving to a file or copying to clipboard
- The `verbose` option controls the amount of information displayed during analysis, with more details shown when enabled
- The `gitingest: true` option generates a comprehensive digest file that includes the full content of all analyzed files in a GitIngest-style format, which is particularly useful for providing complete context to LLMs

When no export options are specified, the tool will prompt the user to select an export option after completing the analysis.

**Section sources**

- [README.md](file://README.md#L100-L300)
- [ctxman.js](file://ctxman.js#L225-L232)
- [lib/analyzers/token-calculator.js](file://lib/analyzers/token-calculator.js#L13-L522)

## Data Models

The ctxman tool uses specific data models to represent files and methods during analysis. These models are used internally and form the structure of the generated reports and context exports.

### FileInfo Model

The FileInfo model represents information about an analyzed file:

```typescript
interface FileInfo {
  path: string; // Absolute path to the file
  relativePath: string; // Path relative to the project root
  sizeBytes: number; // File size in bytes
  tokens: number; // Calculated token count
  lines: number; // Number of lines in the file
  extension: string; // File extension
  methods?: MethodInfo[]; // Array of methods (when methodLevel is enabled)
}
```

### MethodInfo Model

The MethodInfo model represents information about an extracted method:

```typescript
interface MethodInfo {
  name: string; // Method name
  line: number; // Line number where the method is defined
  tokens: number; // Token count for the method content
  file: string; // Relative path to the file containing the method
}
```

These models are used to structure the analysis results and are serialized in the generated JSON reports. When method-level analysis is enabled, the tool creates a hierarchical structure where files contain arrays of their methods, allowing for detailed analysis of code complexity at both file and method levels.

The data models are designed to be lightweight and focused on the essential information needed for token analysis and LLM context optimization.

**Section sources**

- [ctxman.js](file://ctxman.js#L400-L420)
- [ctxman.js](file://ctxman.js#L480-L500)

## Usage Examples

The ctxman tool can be integrated into Node.js applications for automated analysis. The following examples demonstrate common usage patterns.

### Basic Integration

```javascript
const { TokenAnalyzer } = require('ctxman');

// Basic file-level analysis
const analyzer = new TokenAnalyzer('./src', {
  verbose: true,
  saveReport: true,
});

analyzer.run();
```

### Method-Level Analysis

```javascript
// Method-level analysis with all outputs
const methodAnalyzer = new TokenAnalyzer('./src', {
  methodLevel: true,
  saveReport: true,
  contextExport: true,
  verbose: true,
});

methodAnalyzer.run();
```

### LLM-Optimized Context Generation

```javascript
// Generate context optimized for LLM consumption
const llmAnalyzer = new TokenAnalyzer('./src', {
  methodLevel: true,
  contextClipboard: true,
});

llmAnalyzer.run();
```

### GitIngest Digest Generation

```javascript
// Generate GitIngest-style digest
const digestAnalyzer = new TokenAnalyzer('./src', {
  gitingest: true,
  methodLevel: true,
});

digestAnalyzer.run();
```

### Using GitIngestFormatter Directly

```javascript
// Use GitIngestFormatter directly for custom digest generation
const { GitIngestFormatter } = require('ctxman');
const { TokenAnalyzer } = require('ctxman');

// First run analysis to get results
const analyzer = new TokenAnalyzer('./src', { methodLevel: true });
const analysisResults = []; // This would be populated during analysis

// Create formatter with results
const formatter = new GitIngestFormatter(process.cwd(), analyzer.stats, analysisResults);

// Generate and save digest
formatter.saveToFile('custom-digest.txt');
```

### Using MethodFilterParser Directly

```javascript
// Use MethodFilterParser directly for method filtering
const { MethodFilterParser } = require('ctxman');

// Create filter parser with custom paths
const methodFilter = new MethodFilterParser(
  './.methodinclude', // Path to include file
  './.methodignore' // Path to ignore file
);

// Check if a method should be included
const shouldInclude = methodFilter.shouldIncludeMethod('getUser', 'UserService');
```

### Generate Digest from Existing Reports

```javascript
// Generate GitIngest digest from existing token-analysis-report.json
const { generateDigestFromReport } = require('ctxman');

generateDigestFromReport('token-analysis-report.json');

// Generate GitIngest digest from existing llm-context.json
const { generateDigestFromContext } = require('ctxman');

generateDigestFromContext('llm-context.json');
```

These examples show how the TokenAnalyzer can be configured for different use cases, from basic analysis to LLM-optimized context generation. The flexibility of the options allows developers to tailor the analysis to their specific needs, whether for development, debugging, or automated workflows.

**Section sources**

- [README.md](file://README.md#L700-L800)
- [index.js](file://index.js#L1-L48)
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js#L13-L264)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L7-L47)

## Error Handling

The ctxman tool includes comprehensive error handling to ensure robust operation in various environments. The analysis process is designed to gracefully handle file system errors and other exceptions that may occur during execution.

When a file cannot be read or analyzed, the tool creates an error entry in the results with the error message, allowing the analysis to continue with other files. This prevents a single problematic file from stopping the entire analysis process.

The tool also handles platform-specific issues, particularly with clipboard operations. On unsupported platforms, it falls back to saving the context to a file instead of attempting clipboard operations that would fail.

For configuration issues, the tool provides clear feedback about which configuration files are being used and in what mode (INCLUDE or EXCLUDE). This helps users understand why certain files might be included or excluded from the analysis.

The error handling strategy prioritizes completing the analysis over stopping at the first error, ensuring that users receive as much information as possible even when some parts of the process encounter issues.

**Section sources**

- [ctxman.js](file://ctxman.js#L400-L415)
- [ctxman.js](file://ctxman.js#L700-L730)

## Performance Considerations

When using the ctxman API programmatically, several performance considerations should be taken into account:

### Token Counting Methods

The tool supports two methods for token counting:

- **Exact counting** using the tiktoken library (requires installation)
- **Estimation** using character-based heuristics (fallback when tiktoken is not available)

For optimal accuracy, install the tiktoken package:

```bash
npm install tiktoken
```

### Analysis Scope

The performance of the analysis is directly related to the size of the codebase being analyzed. To optimize performance:

- Limit the analysis to specific directories when possible
- Use configuration files (.contextignore, .contextinclude) to exclude irrelevant files
- Consider the trade-off between analysis depth and execution time

### Method-Level Analysis

Enabling method-level analysis significantly increases processing time as it requires parsing code to identify individual methods. This feature should be used when method-level insights are needed, but disabled for simple file-level analysis.

### Asynchronous Operations

While the `run()` method doesn't return a Promise, it performs several asynchronous operations internally, particularly for file system access and clipboard operations. In automated workflows, consider the execution time required for large codebases.

The tool is optimized for performance with caching and efficient file system operations, but very large codebases may still require significant processing time.

**Section sources**

- [ctxman.js](file://ctxman.js#L300-L350)
- [README.md](file://README.md#L500-L600)

## Migration Guidance

When upgrading or migrating to newer versions of the ctxman tool, consider the following guidance:

### Version Compatibility

The tool maintains backward compatibility for its core API. The TokenAnalyzer class interface has remained stable across versions, ensuring that existing integrations continue to work.

### Configuration Changes

Check the release notes for any changes to configuration file formats or option parameters. While the core options remain consistent, new options may be added in newer versions.

### New Features

Recent updates have introduced several new features that enhance the tool's capabilities:

- **GitIngestFormatter**: A new formatter class that generates GitIngest-style digest files containing the full codebase content
- **MethodFilterParser**: A new parser class that handles method-level filtering based on .methodinclude and .methodignore files
- **gitingest option**: A new configuration option that enables generation of GitIngest-style digest files
- **generateDigestFromReport and generateDigestFromContext**: New utility functions that can generate GitIngest digests from existing report files without re-scanning the codebase

### Dependency Management

Ensure that required dependencies are properly installed, particularly tiktoken for exact token counting. The tool will fall back to estimation if tiktoken is not available, but with reduced accuracy.

### Testing

After upgrading, test the analysis with your typical codebases to ensure expected behavior. Pay particular attention to:

- File inclusion/exclusion patterns
- Token count accuracy
- Export functionality
- Method-level analysis (if used)

The tool's output format for JSON reports and context exports is designed to be stable, minimizing the impact of upgrades on downstream processes that consume these outputs.

**Section sources**

- [README.md](file://README.md#L800-L891)
- [index.js](file://index.js#L1-L48)
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js#L13-L264)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L7-L47)
