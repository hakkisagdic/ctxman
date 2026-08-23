# CLI Reference

<cite>
**Referenced Files in This Document**   
- [bin/cli.js](file://bin/cli.js) - *Updated in commit 6f5fea32*
- [ctxman.js](file://ctxman.js) - *Updated in commit 6f5fea32 and 0b9cbab0*
- [README.md](file://README.md) - *Updated in both commits*
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js) - *Added in commit 6f5fea32*
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js) - *Added in commit 6f5fea32*
</cite>

## Update Summary

**Changes Made**

- Added comprehensive documentation for new GitIngest functionality and JSON-based digest generation
- Updated available options section with new CLI flags: --gitingest (-g), --gitingest-from-report, and --gitingest-from-context
- Enhanced method-level analysis documentation with details about method filtering configuration
- Added new section for GitIngest format export with usage examples and output format details
- Updated usage examples to include new command combinations
- Expanded section sources to include newly added formatter and parser files

## Table of Contents

1. [Introduction](#introduction)
2. [Command Syntax](#command-syntax)
3. [Available Options](#available-options)
4. [Interactive Export Selection](#interactive-export-selection)
5. [Usage Examples](#usage-examples)
6. [GitIngest Format Export](#gitingest-format-export)
7. [Exit Codes and Error Handling](#exit-codes-and-error-handling)
8. [Performance Considerations](#performance-considerations)
9. [Shell Script Integration](#shell-script-integration)
10. [Troubleshooting Guide](#troubleshooting-guide)

## Introduction

The ctxman CLI provides a comprehensive tool for analyzing codebases and optimizing context for LLM consumption. It offers method-level filtering, exact token counting, and multiple export formats to support AI-assisted development workflows. The tool respects both .gitignore and custom ignore/include rules, providing flexible configuration options for different analysis scenarios.

**Section sources**

- [README.md](file://README.md#L0-L891)

## Command Syntax

The basic syntax for the ctxman CLI is:

```
ctxman [options]
```

The command accepts various options that control the analysis behavior, output format, and export destinations. When no options are specified, the tool runs in interactive mode, prompting the user to select export options after completing the analysis.

**Section sources**

- [bin/cli.js](file://bin/cli.js#L4-L25)
- [ctxman.js](file://ctxman.js#L815-L830)

## Available Options

The ctxman CLI supports the following options:

### --save-report (-s)

Saves a detailed JSON report of the analysis to token-analysis-report.json in the project root.

**Behavior**: Generates a comprehensive report containing metadata, summary statistics, and detailed information about each analyzed file.

**Return value**: Creates token-analysis-report.json file with structured analysis data.

### --no-verbose

Disables verbose output mode, suppressing the display of included files and directories during analysis.

**Behavior**: Runs the analysis without showing the list of files being processed, providing a cleaner output.

**Return value**: Standard analysis report without file listing details.

### --context-export

Generates an LLM context file list and saves it as llm-context.json in the project root.

**Behavior**: Creates a JSON file containing optimized project context suitable for LLM consumption.

**Return value**: Creates llm-context.json file with project metadata and organized file paths.

### --context-clipboard

Copies the LLM context directly to the system clipboard.

**Behavior**: Generates the context in JSON format and copies it to the clipboard using platform-specific commands (pbcopy on macOS, xclip/xsel on Linux, clip on Windows).

**Return value**: Context data copied to clipboard; displays character count upon success.

### --detailed-context

Uses the detailed context format instead of the default compact format.

**Behavior**: Generates a more comprehensive context output with additional metadata, categories, and importance scores.

**Return value**: Larger context output (~8.6k characters) with enhanced information.

### --method-level (-m)

Enables method-level analysis mode.

**Behavior**: Extracts and analyzes individual methods from JavaScript/TypeScript files, applying method-level filtering rules from .methodinclude and .methodignore files.

**Return value**: Includes method-specific information in the output, including method names, line numbers, and token counts.

### --gitingest (-g)

Generates a GitIngest-style digest file for LLM consumption.

**Behavior**: Creates a single text file (digest.txt) containing project summary, directory structure, and complete file contents with clear separators.

**Return value**: Creates digest.txt file with consolidated codebase information in a prompt-friendly format.

### --gitingest-from-report

Generates a GitIngest digest from an existing token-analysis-report.json file.

**Behavior**: Reads the JSON report and generates a digest without re-scanning the codebase, enabling fast digest generation.

**Return value**: Creates digest.txt file with content derived from the report data.

### --gitingest-from-context

Generates a GitIngest digest from an existing llm-context.json file.

**Behavior**: Reads the LLM context file and generates a digest without re-scanning the codebase, enabling fast digest generation.

**Return value**: Creates digest.txt file with content derived from the context data.

### --help (-h)

Displays the help message with available options and usage examples.

**Behavior**: Prints the help text to stdout and exits.

**Return value**: None; terminates the program after displaying help.

**Section sources**

- [README.md](file://README.md#L0-L891)
- [bin/cli.js](file://bin/cli.js#L4-L25)
- [ctxman.js](file://ctxman.js#L150-L170)

## Interactive Export Selection

When the ctxman is run without specifying any export options (--save-report, --context-export, or --context-clipboard), it automatically activates the interactive export selection feature. After completing the analysis, the tool presents a menu with four export options:

1. Save detailed JSON report (token-analysis-report.json)
2. Generate LLM context file (llm-context.json)
3. Copy LLM context to clipboard
4. No export (skip)

The user is prompted to enter a number (1-4) to select their preferred export option. This interactive mode ensures that users can choose the most appropriate export format after reviewing the analysis results, preventing missed opportunities to export valuable context data.

**Section sources**

- [README.md](file://README.md#L0-L891)
- [ctxman.js](file://ctxman.js#L618-L637)

## Usage Examples

The following examples demonstrate common command combinations:

### Method-level analysis with clipboard export

```bash
ctxman --method-level --context-clipboard
```

This command performs method-level analysis and copies the resulting context to the clipboard, ideal for quickly sharing focused code context with AI assistants.

### Save report with verbose output

```bash
ctxman --save-report --verbose
```

This combination saves a detailed JSON report while showing all included files during analysis, useful for comprehensive codebase reviews.

### Combined analysis with multiple outputs

```bash
ctxman --method-level --save-report --context-export --verbose
```

This command performs method-level analysis with verbose output while generating both a detailed report and an LLM context file, suitable for CI/CD pipelines and thorough codebase documentation.

### GitIngest digest generation

```bash
ctxman --gitingest
```

Generates a single digest.txt file containing the entire codebase in a prompt-friendly format for LLM consumption.

### Two-step digest generation

```bash
ctxman --save-report
ctxman --gitingest-from-report token-analysis-report.json
```

First analyzes the codebase and saves a report, then quickly generates a digest from the existing report without re-scanning.

**Section sources**

- [README.md](file://README.md#L0-L891)

## GitIngest Format Export

The ctxman now supports generating GitIngest-style digest files - a single, prompt-friendly text file perfect for LLM consumption.

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
```

### Output Format

The generated `digest.txt` file includes:

- Project name and file count
- Directory structure visualization with tree format
- Estimated token count
- File contents separated by clear delimiters
- When method-level filtering is active, only included methods are shown

**Section sources**

- [README.md](file://README.md#L0-L891)
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js#L13-L264)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L7-L47)

## Exit Codes and Error Handling

The ctxman CLI implements robust error handling mechanisms:

- **Success (exit code 0)**: Analysis completed successfully with all requested operations performed.
- **Invalid option (exit code 1)**: The command was called with unrecognized or malformed options.
- **File system error (exit code 1)**: Issues accessing files or directories during analysis.
- **Clipboard error**: When clipboard operations fail, the tool falls back to saving the context to llm-context.json with a warning message.

The tool gracefully handles missing configuration files and provides informative error messages. When tiktoken is not available for exact token counting, it falls back to smart estimation with a warning.

**Section sources**

- [ctxman.js](file://ctxman.js#L750-L772)
- [test/test-suite.js](file://test/test-suite.js#L0-L280)

## Performance Considerations

When analyzing large codebases, consider the following performance optimizations:

- Use .contextinclude to restrict analysis to essential files only
- Enable method-level analysis to focus on specific functionality
- Avoid verbose mode for large repositories to reduce output processing
- Use the compact context format for faster processing and smaller output
- Utilize JSON-based digest generation (--gitingest-from-report or --gitingest-from-context) for instant digest creation without re-scanning

The tool is optimized for performance with efficient directory scanning and token counting algorithms. For very large codebases, the initial scan may take several seconds, but subsequent analyses benefit from the filtering rules that reduce the number of files processed.

**Section sources**

- [README.md](file://README.md#L0-L891)
- [ctxman.js](file://ctxman.js#L225-L790)

## Shell Script Integration

The ctxman CLI can be integrated into shell scripts for automated workflows:

```bash
# Check if codebase exceeds token budget
TOKENS=$(ctxman --context-export --no-verbose | jq '.project.totalTokens')
if [ $TOKENS -gt 100000 ]; then
  echo "Codebase too large for LLM context!"
  exit 1
fi
```

```bash
# Daily analysis with timestamped reports
ctxman --save-report > reports/analysis-$(date +%Y%m%d).json
```

The tool's predictable output format and exit codes make it suitable for use in CI/CD pipelines, pre-commit hooks, and automated documentation generation workflows.

**Section sources**

- [README.md](file://README.md#L0-L891)

## Troubleshooting Guide

### Command not found

Ensure the package is installed globally:

```bash
npm install -g ctxman
```

### Invalid options

Verify the option names and syntax. Use --help to see valid options.

### Permission errors

On some systems, clipboard operations may require additional permissions. The tool automatically falls back to file output when clipboard access is denied.

### Missing expected files

Check if files are excluded by .gitignore or context rules. Use verbose mode to see which files are being processed.

### Token count discrepancies

Ensure tiktoken is installed for exact token counting. Without tiktoken, the tool uses estimation based on file type.

### GitIngest digest issues

- Ensure the required JSON files exist when using --gitingest-from-report or --gitingest-from-context
- Check file permissions for reading and writing digest.txt
- Verify the JSON format is valid when generating from existing files

**Section sources**

- [README.md](file://README.md#L0-L891)
- [test/test.js](file://test/test.js#L0-L61)
