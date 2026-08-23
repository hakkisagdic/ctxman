# Core Features

<cite>
**Referenced Files in This Document**   
- [ctxman.js](file://ctxman.js) - *Updated in recent commit*
- [lib/analyzers/token-calculator.js](file://lib/analyzers/token-calculator.js) - *Updated in recent commit*
- [lib/analyzers/method-analyzer.js](file://lib/analyzers/method-analyzer.js) - *Updated in recent commit*
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js) - *Added in recent commit*
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js) - *Added in recent commit*
- [README.md](file://README.md)
- [index.js](file://index.js)
</cite>

## Update Summary

**Changes Made**

- Updated Method-Level Analysis section to include new GitIngest-style digest formatter and method filtering capabilities
- Added new section on GitIngest Digest Generation to cover the new formatter functionality
- Enhanced Token Counting section with updated context on GitIngest integration
- Added new sources for recently modified and added files
- Updated Feature Integration section to reflect new export options and formatter integration

## Table of Contents

1. [File-Level Analysis](#file-level-analysis)
2. [Method-Level Analysis](#method-level-analysis)
3. [Token Counting](#token-counting)
4. [GitIngest Digest Generation](#gitingest-digest-generation)
5. [Feature Integration](#feature-integration)
6. [Common Issues and Performance](#common-issues-and-performance)

## File-Level Analysis

The ctxman tool implements a comprehensive file-level analysis system that combines multiple filtering mechanisms to determine which files should be included in the token calculation process. The tool begins by scanning the entire directory structure starting from the project root, recursively traversing directories while respecting exclusion rules.

The file scanning process is implemented in the `scanDirectory` method of the `TokenCalculator` class, which examines each file and directory in the project. During this process, the tool applies a hierarchical filtering system that respects both `.gitignore` patterns and custom configuration files. Files are only included in the analysis if they pass all filtering criteria and are identified as text files through the `isTextFile` method, which checks file extensions and base names against a predefined list of text-based formats.

The filtering system prioritizes configuration files in a specific order: `.gitignore` rules are always respected, followed by `.contextinclude` (which takes precedence in INCLUDE mode), and then `.contextignore` (used in EXCLUDE mode when no include file exists). This multi-layered approach ensures that developers can precisely control which files are analyzed, allowing for focused examination of core application logic while excluding documentation, configuration, and test files.

**Section sources**

- [ctxman.js](file://ctxman.js#L376-L406)
- [ctxman.js](file://ctxman.js#L288-L315)
- [README.md](file://README.md#L294-L356)

## Method-Level Analysis

The ctxman tool provides sophisticated method-level analysis capabilities for JavaScript and TypeScript files, enabling granular examination of individual functions within code files. This feature is implemented through the `MethodAnalyzer` and `MethodFilterParser` classes, which work together to extract and filter methods based on configurable rules.

The `MethodAnalyzer` class uses a series of regular expressions to identify various JavaScript function patterns, including traditional function declarations, object method syntax, arrow functions, and async functions. When method-level analysis is enabled via the `--method-level` flag, the tool extracts all methods from eligible code files and captures metadata such as method name and line number. The `extractMethodContent` method then isolates the complete method body for individual token counting.

Method filtering is controlled by `.methodinclude` and `.methodignore` configuration files, which allow developers to include or exclude specific methods using pattern matching. The `MethodFilterParser` class processes these files, converting glob patterns to regular expressions for efficient matching. When an include file is present, only methods matching the specified patterns are included; otherwise, the tool excludes methods matching patterns in the ignore file. This system supports various pattern types including exact matches, wildcards, class-specific methods (using `Class.*` syntax), and file-specific methods (using `file.method` syntax).

**Section sources**

- [ctxman.js](file://ctxman.js#L14-L67)
- [ctxman.js](file://ctxman.js#L69-L109)
- [ctxman.js](file://ctxman.js#L357-L377)
- [README.md](file://README.md#L544-L610)
- [lib/analyzers/method-analyzer.js](file://lib/analyzers/method-analyzer.js#L7-L92) - _Updated in recent commit_
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L7-L47) - _Added in recent commit_

## Token Counting

The ctxman tool employs a dual approach to token counting, prioritizing accuracy while providing a reliable fallback mechanism. The primary method uses the `tiktoken` library to provide exact GPT-4 compatible token counts, which is essential for accurately estimating how much code can fit within an LLM's context window. When the `tiktoken` package is installed, the tool uses the `cl100k_base` encoding (used by GPT-4, ChatGPT-4, and text-embedding-ada-002) to encode the text content and count tokens precisely.

The token counting process is implemented in the `calculateTokens` method of the `TokenCalculator` class, which attempts to use `tiktoken` first and falls back to estimation if the library is not available or if an error occurs. The estimation mechanism uses a character-based approach with different ratios for various file types, as different file formats have different average characters per token. For example, JavaScript and TypeScript files use a ratio of 3.2 characters per token, while Markdown files use 4.0, and JSON files use 2.5. This estimation provides approximately 95% accuracy compared to exact counting.

The tool also tracks token statistics at multiple levels, including per-file, per-extension, and per-directory counts, providing detailed insights into the codebase composition. When method-level analysis is enabled, the tool additionally counts tokens for individual methods, allowing developers to identify particularly large or complex functions that might need refactoring.

**Section sources**

- [ctxman.js](file://ctxman.js#L253-L286)
- [ctxman.js](file://ctxman.js#L288-L315)
- [README.md](file://README.md#L356)

## GitIngest Digest Generation

The ctxman tool now includes a GitIngest-style digest formatter that generates comprehensive, prompt-friendly text files from code analysis results. This feature is implemented through the `GitIngestFormatter` class, which creates structured output suitable for LLM context consumption.

The digest generation process begins with the `GitIngestFormatter` constructor, which accepts the project root, analysis statistics, and file analysis results. The formatter automatically detects method filtering configuration through the `detectMethodFilters` method, enabling method-level filtering when `.methodinclude` or `.methodignore` files exist in the project.

The generated digest includes several components: a summary header with project information and token estimates, a directory tree structure showing the project layout, and file contents formatted with clear separators. When method-level filtering is active, the formatter extracts only the methods that match the filter criteria rather than including entire files, making the digest more focused and efficient.

The formatter supports multiple generation methods: direct creation from live analysis, generation from existing `token-analysis-report.json` files, and creation from `llm-context.json` files. This flexibility allows users to generate digests quickly from previously saved analysis results without re-scanning the entire codebase. The `--gitingest-from-report` and `--gitingest-from-context` CLI flags enable these alternative generation methods.

**Section sources**

- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js#L13-L264) - _Added in recent commit_
- [ctxman.js](file://ctxman.js#L524-L597) - _Updated in recent commit_
- [lib/analyzers/token-calculator.js](file://lib/analyzers/token-calculator.js#L524-L597) - _Updated in recent commit_
- [test/test-gitingest.js](file://test/test-gitingest.js#L0-L172) - _Added in recent commit_
- [test/test-gitingest-json.js](file://test/test-gitingest-json.js#L0-L224) - _Added in recent commit_

## Feature Integration

The core features of the ctxman tool are orchestrated through the `TokenCalculator` class, which integrates file-level analysis, method-level analysis, token counting, and digest generation into a cohesive workflow. The `run` method serves as the main entry point, coordinating the entire analysis process from directory scanning to final reporting.

The integration begins with initialization of the various components: the `GitIgnoreParser` for file filtering, the `MethodAnalyzer` and `MethodFilterParser` for method extraction (when enabled), and the token counting system. The tool then scans the directory structure, applying filtering rules to determine which files to analyze. For each included file, it reads the content and calculates tokens, optionally extracting and analyzing individual methods when the `methodLevel` option is enabled.

The results are aggregated in comprehensive statistics that track files, tokens, bytes, and lines at various levels of granularity. The tool can generate different output formats depending on the use case: a compact format for LLM context optimization, a detailed method-level context when requested, or a comprehensive JSON report for analysis and monitoring. The `generateLLMContext` method creates structured output that can be exported to a file or copied to the clipboard, making it easy to share codebase context with AI assistants.

Additionally, the tool now supports direct generation of GitIngest-style digests through the `saveGitIngestDigest` method, which creates an instance of `GitIngestFormatter` and saves the formatted digest to `digest.txt`. This integration allows users to generate comprehensive code summaries with a single command.

**Section sources**

- [ctxman.js](file://ctxman.js#L213-L251)
- [ctxman.js](file://ctxman.js#L498-L539)
- [ctxman.js](file://ctxman.js#L774-L813)
- [lib/analyzers/token-calculator.js](file://lib/analyzers/token-calculator.js#L13-L642) - _Updated in recent commit_

## Common Issues and Performance

The ctxman tool addresses several common issues that arise in code analysis, particularly around pattern matching accuracy and token counting precision. One common issue is pattern matching failures, which can occur when configuration files contain syntax errors or when negation patterns (`!pattern`) are not properly understood. The tool provides verbose output to help diagnose these issues, showing which mode is active (INCLUDE or EXCLUDE) and how many rules were loaded from each configuration file.

For large codebases, performance is optimized through several mechanisms. The tool avoids unnecessary file reads by first checking filtering rules before processing file content. It also uses efficient regular expressions for method extraction and pattern matching, compiling patterns once during initialization rather than repeatedly. The directory scanning process skips common exclusion directories like `node_modules`, `.git`, and `dist` by default, reducing the number of filesystem operations.

Inaccurate token counts can occur when the `tiktoken` library is not installed, forcing the tool to rely on estimation. While the estimation is generally accurate (~95% compared to exact counts), it may vary depending on the specific characteristics of the code. Developers working with strict token limits should install `tiktoken` for precise counting. The tool also provides detailed reporting that breaks down token usage by file type and directory, helping identify unexpected large files or directories that might be skewing the overall count.

When using the GitIngest digest generation feature, users should be aware that generating from existing JSON files (`token-analysis-report.json` or `llm-context.json`) is significantly faster than scanning the entire codebase, especially for large projects. However, this approach relies on the freshness of the JSON files, so users should ensure their analysis data is up-to-date before generating digests.

**Section sources**

- [ctxman.js](file://ctxman.js#L253-L286)
- [ctxman.js](file://ctxman.js#L376-L406)
- [README.md](file://README.md#L544-L610)
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js#L13-L264) - _Added in recent commit_
