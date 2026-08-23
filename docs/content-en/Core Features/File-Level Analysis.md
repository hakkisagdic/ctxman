# File-Level Analysis

<cite>
**Referenced Files in This Document**   
- [ctxman.js](file://ctxman.js)
</cite>

## Table of Contents

1. [File-Level Analysis](#file-level-analysis)
2. [Directory Scanning and Filtering](#directory-scanning-and-filtering)
3. [GitIgnore Processing](#gitignore-processing)
4. [Text File Detection](#text-file-detection)
5. [File Filtering and Token Counting Relationship](#file-filtering-and-token-counting-relationship)
6. [Statistics Tracking](#statistics-tracking)
7. [Common Issues and Optimization](#common-issues-and-optimization)

## Directory Scanning and Filtering

The TokenCalculator class implements recursive directory scanning while respecting multiple ignore rules. The scanDirectory method traverses the file system starting from a specified directory, applying filtering logic at each level to determine which files should be included in the analysis.

The scanning process begins by reading all items in the current directory and processing them sequentially. For each item, the system first constructs both the full path and relative path from the project root. It then checks whether the file or directory should be ignored by calling the isIgnored method of the GitIgnoreParser instance. If the item is ignored, it increments the appropriate counter in the statistics and continues to the next item.

For non-ignored items, the system determines whether the item is a file or directory. Directory traversal is limited to specific directories, excluding common development directories such as node_modules, .git, coverage, dist, and build. This prevents the analysis from processing unnecessary files and improves performance. When a directory is not excluded, the scanDirectory method calls itself recursively to process the contents of that directory.

Text files that pass the ignore checks are added to the results array, which is returned after all items in the directory have been processed. This recursive approach ensures comprehensive coverage of the file system while maintaining efficient filtering at each level of the directory hierarchy.

**Section sources**

- [ctxman.js](file://ctxman.js#L385-L412)

## GitIgnore Processing

The GitIgnoreParser class handles the processing of ignore and include patterns from multiple sources, implementing a priority-based system for rule evaluation. The class processes three types of configuration files: .gitignore, .contextignore, and .contextinclude, with .contextinclude having the highest priority.

During initialization, the GitIgnoreParser loads patterns from the specified configuration files. When both .contextinclude and .contextignore exist, the include file takes precedence, implementing an "include-only" mode where only files matching the include patterns are processed. This priority system allows users to switch between exclusion-based filtering (where most files are included by default) and inclusion-based filtering (where only explicitly specified files are included).

The pattern processing involves converting glob-style patterns into regular expressions for efficient matching. The convertToRegex method handles various pattern features including directory markers (/), negation (!), wildcards (*), and recursive wildcards (**). Directory patterns are treated specially, matching both the directory itself and all files within it. Negation patterns allow specific exceptions to broader ignore rules, providing fine-grained control over the filtering process.

The isIgnored method implements the core filtering logic, first checking .gitignore rules, then applying calculator-specific rules based on whether include or exclude mode is active. In include mode, a file is considered ignored if it doesn't match any include pattern (after accounting for negations), while in exclude mode, a file is ignored if it matches any exclude pattern. This two-tiered approach ensures compatibility with existing .gitignore conventions while providing enhanced filtering capabilities.

**Section sources**

- [ctxman.js](file://ctxman.js#L124-L229)

## Text File Detection

The isTextFile method determines whether a file should be analyzed based on its extension and basename. This filtering mechanism ensures that only text-based files are processed for token counting, avoiding binary files and other non-text content that would not be suitable for LLM context generation.

The method uses two criteria to identify text files: file extension and basename patterns. For extensions, it maintains a comprehensive set of common text-based file types including source code files (.js, .ts, .py, .java, etc.), markup languages (.html, .xml, .svg), configuration formats (.json, .yml, .toml), and documentation formats (.md, .txt). Files with these extensions are automatically considered text files regardless of their name.

In addition to extension-based detection, the method checks for specific basename patterns that commonly appear in development projects. These include files like Dockerfile, Makefile, LICENSE, README, and CHANGELOG, which may not have standard extensions but contain important textual content. The method performs a case-insensitive search for these patterns within the filename, allowing for variations like readme.md, LICENSE.txt, or CHANGELOG.

This dual-criteria approach provides flexible file detection that accommodates both conventional naming patterns and common exceptions in development workflows. By combining extension and basename analysis, the system can accurately identify text files across various project structures and naming conventions.

**Section sources**

- [ctxman.js](file://ctxman.js#L306-L321)

## File Filtering and Token Counting Relationship

File filtering directly impacts token counting by determining which files are included in the analysis process. The filtering pipeline operates as a series of gates that files must pass through before their tokens are counted. Only files that survive all filtering stages are processed for token calculation, ensuring that the final token count reflects only the desired subset of the codebase.

The filtering process occurs in a specific order: first .gitignore rules are applied, then calculator-specific rules (.contextinclude or .contextignore), and finally the text file check. This sequence ensures that obviously irrelevant files (like those in node_modules) are excluded early, improving performance by avoiding unnecessary processing. Files that pass all filters are then analyzed to determine their token count using either the tiktoken library for exact counting or an estimation algorithm when tiktoken is not available.

The relationship between filtering and token counting is reflected in the tool's output, which provides detailed statistics about both included and excluded files. This transparency allows users to understand exactly how filtering decisions affect the final token count and adjust their configuration files accordingly. The system also distinguishes between files ignored due to .gitignore rules versus those filtered by context rules, providing insight into which configuration files are most influential in shaping the analysis scope.

**Section sources**

- [ctxman.js](file://ctxman.js#L385-L412)
- [ctxman.js](file://ctxman.js#L124-L229)
- [ctxman.js](file://ctxman.js#L306-L321)

## Statistics Tracking

The TokenCalculator class maintains comprehensive statistics about the analysis process, tracking both included and excluded files across multiple dimensions. The statistics are stored in the stats object, which is initialized with counters for total files, tokens, bytes, lines, and various categorizations.

As files are processed, the updateStats method increments the appropriate counters and updates extension-specific and directory-specific statistics. Each file contributes to the overall totals and also populates the byExtension and byDirectory breakdowns, allowing for detailed analysis of the codebase composition. The largestFiles array maintains a record of the most significant files by token count, enabling identification of potential optimization targets.

The system tracks ignored files separately, distinguishing between those excluded by .gitignore rules and those filtered by context rules. This separation provides valuable feedback about the effectiveness of different filtering strategies and helps users understand the impact of their configuration choices. The countIgnoredFiles method recursively counts files within ignored directories, ensuring accurate statistics even when entire directory trees are excluded.

These statistics are used to generate the final analysis report, which includes summary metrics, extension breakdowns, and rankings of the largest files and directories. This comprehensive reporting enables users to make informed decisions about their codebase structure and filtering configuration.

**Section sources**

- [ctxman.js](file://ctxman.js#L455-L489)
- [ctxman.js](file://ctxman.js#L715-L743)
- [ctxman.js](file://ctxman.js#L673-L696)

## Common Issues and Optimization

Several common issues can arise when configuring file-level analysis, primarily related to misconfigured ignore patterns or performance bottlenecks with large directories. One frequent issue is the incorrect ordering of include/exclude rules, where negation patterns are placed after more general patterns, causing them to be ineffective. Users should ensure that negation patterns (those starting with !) are positioned appropriately within their configuration files to achieve the desired filtering behavior.

Another common issue is the use of overly broad patterns that either exclude necessary files or include too many irrelevant files. For example, using **/*.js might include test files or generated code that should be excluded from LLM context. Conversely, overly specific patterns might miss important files. Users should carefully review their patterns and use the tool's verbose output to verify that the expected files are being included or excluded.

Performance bottlenecks can occur when analyzing very large directories or when the filtering configuration requires extensive pattern matching. To optimize performance, users should employ precise include rules to limit the scope of analysis to only essential files. Using .contextinclude with specific patterns rather than relying solely on .contextignore with broad exclusions can significantly improve performance by reducing the number of files that need to be processed.

Additional optimization strategies include avoiding recursive wildcards (**/ ) when possible, as they require more extensive file system traversal, and ensuring that the most commonly matched patterns are listed first in configuration files to minimize the number of pattern comparisons needed. Regularly reviewing and refining the filtering configuration based on the tool's statistics can help maintain optimal performance and accuracy.

**Section sources**

- [ctxman.js](file://ctxman.js#L385-L412)
- [ctxman.js](file://ctxman.js#L124-L229)
- [ctxman.js](file://ctxman.js#L306-L321)
