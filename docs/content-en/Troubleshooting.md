# Troubleshooting

<cite>
**Referenced Files in This Document**   
- [ctxman.js](file://ctxman.js) - *Updated in commit 6f5fea32*
- [README.md](file://README.md) - *Updated in commit 6f5fea32*
- [bin/cli.js](file://bin/cli.js)
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js) - *Added in commit 6f5fea32*
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js) - *Added in commit 6f5fea32*
</cite>

## Table of Contents

1. [Include/Exclude Mode Confusion](#includeexclude-mode-confusion)
2. [Pattern Matching Issues](#pattern-matching-issues)
3. [Token Counting Discrepancies](#token-counting-discrepancies)
4. [Missing Files in Analysis](#missing-files-in-analysis)
5. [Unexpected File Inclusions](#unexpected-file-inclusions)
6. [Performance Issues with Large Codebases](#performance-issues-with-large-codebases)
7. [Diagnostic Steps](#diagnostic-steps)
8. [Common Environment Issues](#common-environment-issues)
9. [GitIngest Digest Generation Issues](#gitingest-digest-generation-issues)
10. [Method-Level Filtering Problems](#method-level-filtering-problems)

## Include/Exclude Mode Confusion

The ctxman tool uses a priority-based system for file inclusion and exclusion. The presence of a `.contextinclude` file takes precedence over `.contextignore`, which can lead to confusion when users expect files to be included but they're excluded.

When `.contextinclude` exists, the tool operates in INCLUDE mode, meaning only files matching the patterns in this file will be included in the analysis. This overrides any `.contextignore` rules. Users might expect files to be included based on their `.contextignore` configuration, but if a `.contextinclude` file exists, those expectations will not be met.

The tool clearly indicates which mode is active during execution. In INCLUDE mode, it displays "📅 Found calculator config - using INCLUDE mode", while in EXCLUDE mode it shows "📅 Found calculator config - using EXCLUDE mode". This visual cue helps identify the current filtering mode.

**Section sources**

- [ctxman.js](file://ctxman.js#L134-L157)
- [ctxman.js](file://ctxman.js#L181-L217)
- [README.md](file://README.md#L121-L150)

## Pattern Matching Issues

Pattern matching in the ctxman tool follows specific syntax rules that users must understand to configure their `.contextignore` and `.methodinclude` files correctly. Common issues include incorrect syntax, missing negation patterns, and misunderstanding of wildcard behavior.

The tool converts patterns to regular expressions for matching, with specific transformations:

- `**` becomes `.*` (matches any number of directories)
- `*` becomes `[^/]*` (matches any characters except directory separators)
- `?` becomes `[^/]` (matches any single character except directory separators)

Negation patterns (prefixed with `!`) work differently in INCLUDE versus EXCLUDE modes. In INCLUDE mode, negation patterns exclude files from the included set, while in EXCLUDE mode, they re-include files that would otherwise be excluded. A common mistake is placing negation patterns in the wrong order, as the tool processes patterns sequentially.

**Section sources**

- [ctxman.js](file://ctxman.js#L159-L179)
- [ctxman.js](file://ctxman.js#L219-L257)
- [README.md](file://README.md#L544-L610)

## Token Counting Discrepancies

The ctxman tool provides both exact and estimated token counts, which can lead to discrepancies that users might find confusing. The tool first attempts to use the tiktoken library for exact GPT-4 compatible token counting. If tiktoken is not available, it falls back to an estimation algorithm.

The estimation algorithm uses predefined characters-per-token ratios for different file types:

- JavaScript/TypeScript: 3.2 characters per token
- JSON: 2.5 characters per token
- Markdown: 4.0 characters per token
- HTML/XML: 2.8 characters per token
- Default: 3.5 characters per token

These estimates are typically around 95% accurate compared to exact counts. Users might notice differences between the estimated counts and what they expect from other tools. The tool clearly indicates which counting method is being used in the output: "🎯 Token calculation: ✅ Exact (using tiktoken)" for exact counts or "🎯 Token calculation: ⚠️ Estimated" for estimates.

**Section sources**

- [ctxman.js](file://ctxman.js#L259-L292)
- [ctxman.js](file://ctxman.js#L385-L400)
- [README.md](file://README.md#L801-L879)

## Missing Files in Analysis

Files may be missing from analysis due to the multi-layered filtering system. The tool respects three levels of configuration files in order of priority:

1. `.gitignore` (always respected)
2. `.contextinclude` (highest priority for inclusion)
3. `.contextignore` (used when no include file exists)

A file might be missing from analysis if it's excluded by any of these mechanisms. Even if a file is not explicitly mentioned in `.contextignore`, it might be excluded by a pattern like `**/*.md` or `node_modules/**`. Users should check all three configuration files to understand why a file is missing.

Additionally, the tool only analyzes text files, determined by file extension and basename. Files with extensions not in the recognized text extensions list or basenames not in the text files list will be skipped entirely, even if they're not explicitly ignored.

**Section sources**

- [ctxman.js](file://ctxman.js#L181-L217)
- [ctxman.js](file://ctxman.js#L414-L453)
- [README.md](file://README.md#L294-L356)

## Unexpected File Inclusions

Unexpected file inclusions can occur when users misunderstand the interaction between different configuration files. The most common cause is the presence of a `.contextinclude` file when the user expects EXCLUDE mode behavior. In INCLUDE mode, only files matching the patterns in `.contextinclude` are included, which might include files the user expected to be excluded.

Another cause is the use of broad patterns like `**/*.js` without proper negation. For example, if a user wants to include all JavaScript files except those in test directories, they need to explicitly add a negation pattern like `!**/*.test.js` or `!test/**`.

The tool's verbose output can help identify why files are being included. When running with the `--verbose` flag, the tool shows which mode is active and can help trace the inclusion logic.

**Section sources**

- [ctxman.js](file://ctxman.js#L134-L157)
- [ctxman.js](file://ctxman.js#L181-L217)
- [README.md](file://README.md#L544-L610)

## Performance Issues with Large Codebases

Performance issues with large codebases typically stem from the tool needing to scan and analyze every file in the project directory. The scanning process recursively traverses directories, which can be slow for deeply nested structures with many files.

The tool automatically skips certain directories like `node_modules`, `.git`, `dist`, and `build` to improve performance. However, if a codebase has many files in analyzable categories (JavaScript, TypeScript, Markdown, etc.), the analysis can still be time-consuming.

Method-level analysis (`--method-level` flag) significantly increases processing time as the tool needs to parse each file to extract method definitions and calculate tokens for each method individually. For very large codebases, this can result in noticeable delays.

**Section sources**

- [ctxman.js](file://ctxman.js#L455-L485)
- [ctxman.js](file://ctxman.js#L521-L545)
- [bin/cli.js](file://bin/cli.js#L20-L35)

## Diagnostic Steps

To diagnose issues with the ctxman tool, users should follow these steps:

1. Run the tool with the `--verbose` flag to see detailed output about which files are being processed and which rules are being applied.

2. Check the initial output to determine which mode is active (INCLUDE or EXCLUDE) and which configuration file is being used.

3. Use the `--save-report` option to generate a detailed JSON report that includes information about all processed files, their token counts, and which rules were applied.

4. Examine the configuration files (`.gitignore`, `.contextignore`, `.contextinclude`) for conflicting or incorrect patterns.

5. Verify that the tiktoken dependency is installed if exact token counts are required.

The tool provides clear visual indicators in its output that help with diagnosis, such as the number of files ignored due to `.gitignore` rules versus context rules, and whether exact or estimated token counting is being used.

**Section sources**

- [ctxman.js](file://ctxman.js#L609-L643)
- [ctxman.js](file://ctxman.js#L715-L743)
- [bin/cli.js](file://bin/cli.js#L41-L66)

## Common Environment Issues

Common environment issues include missing dependencies and permission errors. The most frequent dependency issue is the absence of the tiktoken library, which is required for exact token counting. When tiktoken is not installed, the tool automatically falls back to estimation mode, but users should install it via `npm install tiktoken` for accurate results.

Permission errors can occur when the tool doesn't have read access to certain files or directories in the codebase. This might happen when running the tool in restricted environments or when file permissions are set too narrowly. Users should ensure the tool has appropriate read permissions for all files they want to analyze.

Another common issue is running the tool from the wrong directory. The tool analyzes the current working directory by default, so users must ensure they're in the correct project root when executing the command.

**Section sources**

- [ctxman.js](file://ctxman.js#L259-L292)
- [ctxman.js](file://ctxman.js#L825-L840)
- [README.md](file://README.md#L294-L356)

## GitIngest Digest Generation Issues

With the implementation of GitIngest-style digest formatting, new issues may arise related to digest generation. The `--gitingest` flag generates a single-file digest for LLM consumption, but users may encounter problems with this feature.

Common issues include:

- Missing digest.txt output when using `--gitingest` flag
- Incorrect token estimates in the generated digest
- Directory tree structure not reflecting actual project structure
- File contents missing from the digest output

The GitIngestFormatter automatically detects and applies method-level filtering when `.methodinclude` or `.methodignore` files exist. If method filtering is active, the digest will include a note indicating whether INCLUDE or EXCLUDE mode is active for methods.

When generating digests from existing JSON reports using `--gitingest-from-report` or `--gitingest-from-context`, ensure the specified JSON file exists and has the correct structure. The tool will display an error message if the file is not found or has invalid format.

**Section sources**

- [ctxman.js](file://ctxman.js#L294-L382)
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js#L1-L269)
- [README.md](file://README.md#L100-L150)

## Method-Level Filtering Problems

Method-level filtering allows users to include or exclude specific methods from analysis using `.methodinclude` and `.methodignore` files. Issues may arise when these files are not properly configured.

The MethodFilterParser processes these files and converts patterns to regular expressions. Patterns support wildcards (`*`) which are converted to `.*` in regex. Patterns are case-insensitive and can match method names or file.method combinations.

Common problems include:

- Patterns not matching expected methods due to incorrect syntax
- Negation patterns not working as expected
- Method filtering not being applied when expected

The tool logs messages when method filter rules are loaded:

- "🔧 Method include rules loaded: X patterns" when `.methodinclude` is detected
- "🚫 Method ignore rules loaded: X patterns" when `.methodignore` is detected

Method filtering is automatically detected and applied by the GitIngestFormatter when generating digests, ensuring consistent behavior between regular analysis and digest generation.

**Section sources**

- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L1-L51)
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js#L15-L25)
- [README.md](file://README.md#L200-L250)
