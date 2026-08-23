# Configuration

<cite>
**Referenced Files in This Document**   
- [README.md](file://README.md) - *Updated with method filtering examples*
- [ctxman.js](file://ctxman.js) - *Main orchestrator with method-level analysis support*
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js) - *Added in commit 6f5fea3204f18ec9d0802a00b400af1bb823e411*
- [lib/utils/config-utils.js](file://lib/utils/config-utils.js) - *Modified to support method filter initialization*
</cite>

## Update Summary

**Changes Made**

- Updated Method Filtering System section with implementation details from new files
- Added Pattern Syntax Guide updates based on actual code implementation
- Enhanced Configuration Examples with accurate method filtering scenarios
- Fixed outdated information about method filtering logic
- Added new section sources reflecting actual code files analyzed

## Table of Contents

1. [File Filtering System](#file-filtering-system)
2. [Method Filtering System](#method-filtering-system)
3. [Pattern Syntax Guide](#pattern-syntax-guide)
4. [Configuration Examples](#configuration-examples)
5. [Common Configuration Issues](#common-configuration-issues)
6. [Best Practices](#best-practices)

## File Filtering System

The ctxman tool implements a dual-mode file filtering system that allows precise control over which files are included in token analysis. This system operates through two complementary configuration files: `.contextignore` for EXCLUDE mode and `.contextinclude` for INCLUDE mode.

The filtering system follows a strict priority hierarchy where `.contextinclude` takes precedence over `.contextignore`. When both files exist, the tool operates in INCLUDE mode, completely ignoring the `.contextignore` file. This priority ensures that users can create focused analysis sets with precise file selection while maintaining the ability to fall back to exclusion-based filtering.

In EXCLUDE mode (when only `.contextignore` exists), the tool includes all files except those matching patterns in the `.contextignore` file. This follows traditional gitignore-style exclusion logic and is the default mode when no `.contextinclude` file is present. The `.contextignore` file is pre-configured to exclude documentation files (`.md`, `.txt`), configuration files (`.json`, `.yml`), infrastructure and deployment files, testing directories, build artifacts, and specific code paths like `utility-mcp/src/workflows/**` and `utility-mcp/src/testing/**`.

In INCLUDE mode (when `.contextinclude` exists), the tool includes only files matching patterns in the `.contextinclude` file, regardless of any rules in `.contextignore`. This mode provides more precise control for specific file selection and is ideal for creating focused analysis sets. The default `.contextinclude` configuration includes core JavaScript files from `utility-mcp/src/**/*.js` while using negation patterns to exclude specific subdirectories like workflows and testing utilities.

The complete configuration file priority order is: 1) `.gitignore` (always respected), 2) `.contextinclude` (highest priority), 3) `.contextignore` (fallback when no include file exists). This layered approach ensures that standard git exclusions are always applied while providing flexible, project-specific filtering options.

**Section sources**

- [README.md](file://README.md#L121-L150)
- [README.md](file://README.md#L294-L356)
- [ctxman.js](file://ctxman.js#L128-L151)

## Method Filtering System

The ctxman tool provides sophisticated method-level filtering capabilities through `.methodinclude` and `.methodignore` configuration files. These files work in conjunction with the `--method-level` command-line option to enable granular control over which methods are analyzed and included in the output.

Method filtering operates on a similar principle to file filtering but with additional pattern matching capabilities specific to code structure. When method-level analysis is enabled, the tool parses JavaScript files to identify methods using regular expression patterns that match function declarations, method assignments, and arrow functions. The identified methods are then filtered based on the rules defined in the method configuration files.

The `.methodinclude` file specifies which methods should be included in the analysis. When this file exists, the tool operates in INCLUDE mode for methods, meaning only methods matching the specified patterns will be included. The `.methodignore` file specifies which methods should be excluded from analysis when operating in EXCLUDE mode (when no `.methodinclude` file exists).

The method filtering system supports several pattern types: exact method names (e.g., `calculateTokens`), wildcard patterns using `*` (e.g., `*Handler` to match all methods ending with "Handler"), class-specific methods using the `Class.*` syntax (e.g., `TokenCalculator.*` to include all methods in the TokenCalculator class), and file-specific methods using the `file.method` syntax (e.g., `server.handleRequest` to target a specific method in a specific file).

The filtering logic is implemented in the `MethodFilterParser` class, which loads the configuration files, parses the patterns into regular expressions, and evaluates each method against these patterns. For INCLUDE mode, a method is included if it matches any pattern in the `.methodinclude` file. For EXCLUDE mode, a method is included only if it does not match any pattern in the `.methodignore` file. The system also supports negation patterns prefixed with `!` to exclude specific methods from broader inclusion rules.

**Section sources**

- [README.md](file://README.md#L544-L610)
- [ctxman.js](file://ctxman.js#L69-L96)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L7-L47)
- [lib/utils/config-utils.js](file://lib/utils/config-utils.js#L29-L50)

## Pattern Syntax Guide

The ctxman tool supports a comprehensive pattern syntax for both file and method filtering, enabling flexible and precise configuration. The pattern system includes wildcards, negation, and specific targeting mechanisms that allow users to create sophisticated filtering rules.

For file patterns, the tool supports the following syntax elements: `**` for recursive matching across directories, `*` for single-level wildcard matching, and `!` for negation. The `**` wildcard matches zero or more directories, allowing patterns like `**/*.md` to match markdown files in any directory. The `*` wildcard matches any sequence of characters within a single directory level, such as `*.js` to match all JavaScript files in the current directory. Directory patterns should end with a trailing slash (e.g., `docs/`) to specifically target directories.

Method patterns support additional syntax for code-specific filtering. In addition to the standard wildcards and negation, method patterns support class-level filtering using the `Class.*` syntax, which includes all methods within a specific class. File-specific method targeting is achieved with the `file.method` syntax, allowing precise control over individual methods in specific files. Pattern matching is case-insensitive by default, and comments can be included in configuration files by starting lines with the `#` character.

The pattern evaluation follows specific rules: patterns are processed in order, with later patterns potentially overriding earlier ones, especially when using negation. When a negation pattern (prefixed with `!`) appears after a broader inclusion pattern, it excludes files or methods that would otherwise be included. For example, the pattern sequence `src/**/*.js` followed by `!src/**/*.test.js` includes all JavaScript files in the src directory except those with a `.test.js` extension.

It's important to note that inline comments within pattern lines are not supported; comments must be on separate lines. Pattern syntax should be carefully validated, as incorrect patterns may lead to unexpected file inclusions or exclusions. The tool provides verbose output that shows which mode is active and can help diagnose pattern matching issues.

**Section sources**

- [README.md](file://README.md#L544-L610)
- [README.md](file://README.md#L418)
- [ctxman.js](file://ctxman.js#L153-L173)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L25-L35)

## Configuration Examples

The ctxman tool provides practical configuration examples that demonstrate how to focus on core application logic or exclude test files effectively. These examples illustrate both EXCLUDE and INCLUDE mode configurations for different use cases.

For EXCLUDE mode, users can modify the `.contextignore` file to expand or restrict the analysis scope. To include documentation files that are normally excluded, users can comment out or remove the `**/*.md` line from the `.contextignore` file. To exclude specific large files or directories, additional patterns can be added, such as `your-large-file.js` or `specific-directory/**`. The default `.contextignore` configuration focuses on core application logic by excluding documentation, configuration files, infrastructure code, workflows, and testing utilities.

For INCLUDE mode, users create a `.contextinclude` file to specify exactly which files should be analyzed. A common pattern is to include all JavaScript files in a source directory while excluding specific subdirectories using negation. For example:

```
# Include all JS files in src
src/**/*.js
# Exclude legacy code
!src/legacy/**
# Exclude test files
!src/**/*.test.js
```

This configuration includes all JavaScript files in the src directory except those in the legacy subdirectory or with a `.test.js` extension. Another example focuses on core business logic by including specific entry points and source files:

```
# Include main entry point
utility-mcp/index.js
# Include all src JavaScript files except workflows and testing
utility-mcp/src/**/*.js
!utility-mcp/src/workflows/**
!utility-mcp/src/testing/**
```

For method-level filtering, the `.methodinclude` file can be configured to focus on core business logic methods. Examples include:

```
# Core business logic methods
calculateTokens
generateLLMContext
analyzeFile
handleRequest
validateInput
processData

# Pattern matching for method categories
*Handler          # All methods ending with 'Handler'
*Validator        # All methods ending with 'Validator'
*Manager          # All methods ending with 'Manager'
TokenCalculator.* # All methods in TokenCalculator class
```

Conversely, the `.methodignore` file can exclude utility and debug methods:

```
# Exclude utility and debug methods
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

**Section sources**

- [README.md](file://README.md#L294-L356)
- [README.md](file://README.md#L544-L610)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L37-L45)

## Common Configuration Issues

Users of the ctxman tool may encounter several common configuration issues related to pattern syntax, file inclusion/exclusion behavior, and interaction between different filter files. Understanding these issues and their solutions is essential for effective configuration.

One frequent issue involves pattern syntax errors, particularly with wildcard usage. Users sometimes confuse `*` (single-level wildcard) with `**` (recursive wildcard), leading to unexpected results. For example, using `docs/*.md` will only match markdown files in the immediate docs directory, while `docs/**/*.md` matches markdown files in docs and all its subdirectories. Another common syntax issue is the placement of negation patterns; negation patterns must come after the patterns they modify to be effective.

Unexpected file inclusions or exclusions often occur due to the priority hierarchy between configuration files. Since `.contextinclude` takes precedence over `.contextignore`, users may be confused when removing patterns from `.contextignore` doesn't change the analysis results. In such cases, the `.contextinclude` file is likely active and controlling the filtering behavior. Users should check for the presence of `.contextinclude` and either modify it or remove it to revert to EXCLUDE mode.

Interaction between different filter files can also cause confusion. The tool respects `.gitignore` rules in addition to its own configuration files, meaning files excluded by `.gitignore` will not be analyzed regardless of context rules. This layered exclusion can make it difficult to understand why certain files are missing from the analysis. Using verbose mode can help diagnose these issues by showing which mode is active and providing insight into the filtering process.

Other common issues include using directory patterns without proper syntax (patterns should use `docs/**` rather than `docs/`), having inline comments in pattern files (comments must be on separate lines starting with `#`), and not accounting for file extensions in method patterns. Users may also encounter issues when patterns contain special regex characters that need to be escaped, though the tool automatically handles most special characters in pattern conversion.

**Section sources**

- [README.md](file://README.md#L418)
- [README.md](file://README.md#L378-L408)
- [ctxman.js](file://ctxman.js#L175-L211)

## Best Practices

To create effective filter configurations for different use cases, users should follow several best practices that leverage the full capabilities of the ctxman tool's filtering system.

For general development workflows, use INCLUDE mode with `.contextinclude` for maximum precision. Start with broad inclusion patterns and use negation to exclude specific files or directories. For example, include all JavaScript files in the source directory with `src/**/*.js` and then exclude test files with `!src/**/*.test.js` and legacy code with `!src/legacy/**`. This approach ensures comprehensive coverage while maintaining control over what is excluded.

When focusing on core application logic, create a `.contextinclude` file that specifically targets entry points and core modules. Include main application files explicitly and use pattern matching to capture related components. For method-level analysis, combine exact method names for critical business logic with pattern matching for method categories (e.g., `*Handler`, `*Validator`) to ensure comprehensive coverage of essential functionality.

For testing and debugging scenarios, use method-level filtering to isolate specific components. Create a `.methodinclude` file that focuses on the methods being debugged, using both exact names and pattern matching to capture related functionality. Conversely, use `.methodignore` to exclude noise from utility methods, logging, and debugging functions that might clutter the analysis.

Always validate configurations using verbose mode, which shows which filtering mode is active and provides detailed information about included and excluded files. This transparency helps identify configuration issues and ensures the analysis scope matches expectations. When troubleshooting, temporarily simplify configurations to isolate issues, starting with basic patterns and gradually adding complexity.

Organize configuration files with clear comments explaining the purpose of each pattern. Group related patterns together and use comments to document the rationale behind inclusions and exclusions. This documentation helps maintain configurations over time and makes them easier to understand for other team members.

Finally, consider the performance implications of different filtering approaches. While INCLUDE mode provides precise control, it requires careful maintenance as the codebase evolves. EXCLUDE mode may be more maintainable for stable project structures but risks including unwanted files as new directories are added. Regularly review and update filter configurations to ensure they continue to meet the project's analysis needs.

**Section sources**

- [README.md](file://README.md#L30-L103)
- [README.md](file://README.md#L253-L293)
- [ctxman.js](file://ctxman.js#L408-L447)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L7-L47)
