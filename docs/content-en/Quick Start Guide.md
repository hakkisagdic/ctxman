# Quick Start Guide

<cite>
**Referenced Files in This Document**   
- [README.md](file://README.md)
- [ctxman.js](file://ctxman.js)
- [bin/cli.js](file://bin/cli.js)
</cite>

## Table of Contents

1. [Introduction](#introduction)
2. [Basic Workflow](#basic-workflow)
3. [Running the Tool Interactively](#running-the-tool-interactively)
4. [Understanding the Analysis Output](#understanding-the-analysis-output)
5. [Export Options and Selection](#export-options-and-selection)
6. [Common Usage Patterns](#common-usage-patterns)
7. [Method-Level Analysis](#method-level-analysis)
8. [Clipboard Integration](#clipboard-integration)
9. [Configuration and Pattern Files](#configuration-and-pattern-files)
10. [Troubleshooting Common Issues](#troubleshooting-common-issues)

## Introduction

The ctxman CLI tool is designed to optimize LLM context by providing exact token counting, method-level filtering, and intelligent file selection. This quick start guide will help you get up and running with the tool, understand its core functionality, and effectively use its features for AI-assisted development workflows.

**Section sources**

- [README.md](file://README.md#L0-L891)

## Basic Workflow

The ctxman tool follows a simple three-step workflow: analysis, output interpretation, and export selection. The tool analyzes your codebase to calculate exact token counts, presents detailed information about file composition and token distribution, and provides multiple options for exporting the results in formats suitable for LLM consumption.

The default behavior is interactive, guiding users through the process and prompting for export preferences when no specific export option is specified via command line flags. This ensures users can always choose the most appropriate output format for their current needs.

```mermaid
flowchart TD
Start([Run ctxman]) --> Analysis["Analyze codebase\nCalculate token counts"]
Analysis --> Output["Display analysis results\nToken statistics, file types,\nlargest files, directories"]
Output --> ExportDecision{"Export option\nspecified?"}
ExportDecision --> |No| InteractiveExport["Prompt user for export choice"]
ExportDecision --> |Yes| DirectExport["Execute specified export"]
InteractiveExport --> SaveReport["Save detailed JSON report"]
InteractiveExport --> ContextFile["Generate LLM context file"]
InteractiveExport --> Clipboard["Copy context to clipboard"]
InteractiveExport --> NoExport["Skip export"]
DirectExport --> SaveReport
DirectExport --> ContextFile
DirectExport --> Clipboard
SaveReport --> End([Complete])
ContextFile --> End
Clipboard --> End
NoExport --> End
```

**Diagram sources**

- [ctxman.js](file://ctxman.js#L793-L813)
- [README.md](file://README.md#L0-L891)

**Section sources**

- [ctxman.js](file://ctxman.js#L793-L813)
- [README.md](file://README.md#L0-L891)

## Running the Tool Interactively

To run the ctxman tool interactively, simply execute the command without any flags:

```bash
ctxman
```

This will initiate the analysis process, scan your project directory while respecting .gitignore rules and any calculator-specific ignore/include patterns, calculate token counts for all relevant files, and display a comprehensive report. After the analysis completes, if no export option was specified, the tool will prompt you to select an export method.

The interactive mode is ideal for first-time users and those who want to explore different export options based on the analysis results. The tool provides clear guidance throughout the process, making it easy to understand what files were analyzed and how the token counts were calculated.

**Section sources**

- [README.md](file://README.md#L0-L891)
- [ctxman.js](file://ctxman.js#L793-L813)

## Understanding the Analysis Output

When you run the ctxman tool, it produces a detailed analysis report that includes several key pieces of information. The output begins with metadata about the analysis process, including the project root directory, configuration mode (INCLUDE or EXCLUDE), and token calculation method (exact using tiktoken or estimated).

The main report includes:

- Total files analyzed and total token count
- Total size in MB and total lines of code
- Average tokens per file
- Number of files ignored by .gitignore and context rules
- Breakdown by file type (extension), showing files, tokens, size, and lines
- Top 5 largest files by token count
- Top 5 largest directories by token count

Understanding token counts is crucial for LLM context management. The tool uses tiktoken for GPT-4 compatible exact counting when available, falling back to estimation with approximately 95% accuracy if tiktoken is not installed. The verbose output (enabled by default) shows all included files, providing transparency into what contributes to your token count.

```mermaid
flowchart TD
Start([Analysis Output]) --> Metadata["Metadata Section\nProject path, configuration mode,\ntoken calculation method"]
Metadata --> Summary["Summary Statistics\nTotal files, tokens, size,\nlines, average tokens per file"]
Summary --> IgnoredFiles["Ignored Files Count\n.gitignore exclusions,\ncalculator rule exclusions"]
IgnoredFiles --> FileTypeBreakdown["File Type Breakdown\nExtension, files, tokens,\nsize, lines"]
FileTypeBreakdown --> LargestFiles["Top 5 Largest Files\nBy token count with percentages"]
LargestFiles --> LargestDirectories["Top 5 Largest Directories\nBy token count with percentages"]
LargestDirectories --> Tip["Usage Tip\nSave detailed report option"]
```

**Diagram sources**

- [ctxman.js](file://ctxman.js#L683-L703)
- [README.md](file://README.md#L0-L891)

**Section sources**

- [ctxman.js](file://ctxman.js#L683-L703)
- [README.md](file://README.md#L0-L891)

## Export Options and Selection

The ctxman tool provides multiple export options to accommodate different use cases. When no export option is specified via command line flags, the tool enters interactive export mode, prompting the user to select from four options:

1. Save detailed JSON report (token-analysis-report.json)
2. Generate LLM context file (llm-context.json)
3. Copy LLM context to clipboard
4. Skip export

The interactive export selection ensures that users never miss the opportunity to export their analysis results in the format they need. This feature is particularly helpful for beginners who may not be familiar with all the available export options.

For automated workflows, you can specify export options directly via command line flags, bypassing the interactive prompt. The available flags are:

- `--save-report` or `-s`: Save a detailed JSON report
- `--context-export`: Generate an LLM context file
- `--context-clipboard`: Copy context directly to clipboard

```mermaid
stateDiagram-v2
[*] --> AnalysisComplete
AnalysisComplete --> InteractiveMode : No export flags
AnalysisComplete --> DirectExport : Export flags specified
InteractiveMode --> SaveReport : User selects option 1
InteractiveMode --> ContextFile : User selects option 2
InteractiveMode --> Clipboard : User selects option 3
InteractiveMode --> NoExport : User selects option 4
DirectExport --> SaveReport : --save-report flag
DirectExport --> ContextFile : --context-export flag
DirectExport --> Clipboard : --context-clipboard flag
SaveReport --> Complete
ContextFile --> Complete
Clipboard --> Complete
NoExport --> Complete
Complete --> [*]
```

**Diagram sources**

- [ctxman.js](file://ctxman.js#L575-L616)
- [bin/cli.js](file://bin/cli.js#L4-L25)

**Section sources**

- [ctxman.js](file://ctxman.js#L575-L616)
- [bin/cli.js](file://bin/cli.js#L4-L25)

## Common Usage Patterns

The ctxman tool supports several common usage patterns that cater to different development workflows. The most basic pattern is running the tool interactively without any flags, which provides a complete analysis and prompts for export options:

```bash
ctxman
```

For users who want to quickly generate LLM context and copy it to the clipboard, the `--context-clipboard` flag provides a streamlined workflow:

```bash
ctxman --context-clipboard
```

This command analyzes the codebase and copies the optimized context directly to the clipboard in JSON format, ready for pasting into an LLM interface.

Another common pattern is method-level analysis, which focuses on extracting and analyzing specific methods from JavaScript/TypeScript files rather than entire files:

```bash
ctxman --method-level
```

You can also combine multiple flags to create more complex workflows. For example, to perform method-level analysis and save both a detailed report and export the context to a file:

```bash
ctxman --method-level --save-report --context-export
```

The tool also supports verbose output (enabled by default) which shows all included files, or quiet mode with `--no-verbose` which suppresses the file listing.

**Section sources**

- [README.md](file://README.md#L0-L891)
- [ctxman.js](file://ctxman.js#L793-L813)

## Method-Level Analysis

Method-level analysis is a powerful feature that allows you to focus on specific methods within your codebase rather than analyzing entire files. This is particularly useful for LLM context optimization, as it enables you to include only the most relevant code sections while excluding boilerplate and utility methods.

To enable method-level analysis, use the `--method-level` flag:

```bash
ctxman --method-level
```

When method-level analysis is enabled, the tool extracts methods from JavaScript/TypeScript files using pattern matching for function declarations, method assignments, and arrow functions. The analysis includes information about each method's name, line number, and token count.

The tool supports method filtering through configuration files:

- `.methodinclude`: Include only specified methods (takes priority)
- `.methodignore`: Exclude specified methods

These files use pattern matching syntax where you can specify exact method names, patterns with wildcards (*), or class.method notation. For example:

```
# .methodinclude - include only these methods
calculateTokens
*Handler
*Validator
TokenCalculator.*
```

Method-level analysis produces a different output format that organizes context by methods rather than files, making it easier to manage LLM context when you need to focus on specific functionality.

```mermaid
flowchart TD
Start([Method-Level Analysis]) --> EnableFlag["Use --method-level flag"]
EnableFlag --> MethodExtraction["Extract methods from JS/TS files\nusing regex patterns"]
MethodExtraction --> MethodFiltering["Apply method filtering rules\nfrom .methodinclude/.methodignore"]
MethodFiltering --> TokenCalculation["Calculate tokens for each method"]
TokenCalculation --> ContextGeneration["Generate method-level context\norganized by file path"]
ContextGeneration --> ExportOptions["Export via specified method\nreport, file, or clipboard"]
```

**Diagram sources**

- [ctxman.js](file://ctxman.js#L14-L67)
- [ctxman.js](file://ctxman.js#L118-L223)

**Section sources**

- [ctxman.js](file://ctxman.js#L14-L67)
- [ctxman.js](file://ctxman.js#L118-L223)

## Clipboard Integration

The ctxman tool provides seamless clipboard integration, allowing you to copy the generated LLM context directly to your system clipboard with the `--context-clipboard` flag:

```bash
ctxman --context-clipboard
```

This feature works across platforms (macOS, Linux, and Windows) using the appropriate system commands (pbcopy, xclip/xsel, or clip). The tool copies the context in JSON format, identical to what would be saved in the llm-context.json file, ensuring consistency between clipboard and file exports.

The clipboard integration is particularly useful for quickly sharing context with LLMs without having to save and manually copy from a file. The output is optimized for LLM consumption, using a compact format by default that minimizes character count while preserving essential information.

If the clipboard operation fails (e.g., due to missing system utilities), the tool automatically falls back to saving the context to llm-context.json as a safeguard, ensuring you don't lose the generated context.

```mermaid
sequenceDiagram
participant User as "User"
participant Tool as "ctxman"
participant System as "Operating System"
participant Clipboard as "System Clipboard"
User->>Tool : Run with --context-clipboard
Tool->>Tool : Analyze codebase and generate context
Tool->>Tool : Format context as JSON
Tool->>System : Execute platform-specific copy command
alt macOS
System->>Clipboard : pbcopy with context string
else Linux
System->>Clipboard : xclip or xsel with context string
else Windows
System->>Clipboard : clip with context string
end
Clipboard-->>Tool : Copy confirmation
alt Copy successful
Tool-->>User : "Context copied to clipboard!"
else Copy failed
Tool->>Tool : Save context to llm-context.json
Tool-->>User : "Failed to copy, saved to file instead"
end
```

**Diagram sources**

- [ctxman.js](file://ctxman.js#L541-L567)
- [README.md](file://README.md#L0-L891)

**Section sources**

- [ctxman.js](file://ctxman.js#L541-L567)
- [README.md](file://README.md#L0-L891)

## Configuration and Pattern Files

The ctxman tool uses several configuration files to control which files and methods are included in the analysis. Understanding these files is essential for customizing the tool to your specific needs.

The primary configuration files for file-level filtering are:

- `.contextinclude`: Include only files matching the specified patterns (takes priority)
- `.contextignore`: Exclude files matching the specified patterns

The tool follows a priority order for configuration files:

1. `.gitignore` (always respected)
2. `.contextinclude` (highest priority for files)
3. `.contextignore` (used when no include file exists)

When `.contextinclude` exists, the tool operates in INCLUDE mode, meaning only files matching the include patterns are analyzed (except those excluded by .gitignore). When only `.contextignore` exists, the tool operates in EXCLUDE mode, analyzing all files except those matching the ignore patterns.

For method-level analysis, the tool uses:

- `.methodinclude`: Include only specified methods
- `.methodignore`: Exclude specified methods

These files support pattern matching with wildcards (*) and can specify exact method names, patterns, or class.method notation. The syntax is straightforward, with each line representing a pattern and lines starting with # treated as comments.

```mermaid
graph TB
subgraph "Configuration Priority"
A[".gitignore"]
B[".contextinclude"]
C[".contextignore"]
end
subgraph "Method Filtering"
D[".methodinclude"]
E[".methodignore"]
end
A --> |Always respected| Analysis["Code Analysis"]
B --> |Takes priority| Analysis
C --> |Used if no include file| Analysis
D --> |Method-level include| Analysis
E --> |Method-level exclude| Analysis
style A fill:#f9f,stroke:#333
style B fill:#f9f,stroke:#333
style C fill:#f9f,stroke:#333
style D fill:#bbf,stroke:#333
style E fill:#bbf,stroke:#333
style Analysis fill:#9f9,stroke:#333
```

**Diagram sources**

- [ctxman.js](file://ctxman.js#L118-L223)
- [README.md](file://README.md#L0-L891)

**Section sources**

- [ctxman.js](file://ctxman.js#L118-L223)
- [README.md](file://README.md#L0-L891)

## Troubleshooting Common Issues

When getting started with the ctxman tool, you may encounter a few common issues. Understanding these and their solutions will help you use the tool more effectively.

**Understanding verbose output**: The tool's verbose output (enabled by default) can be overwhelming for beginners. It shows all included files, token counts, and detailed statistics. To reduce output, use the `--no-verbose` flag, though this is not recommended as it reduces transparency about what files are being analyzed.

**Interpreting token counts**: The tool uses tiktoken for exact token counting when available. If you haven't installed tiktoken, the tool falls back to estimation mode. To ensure exact counts, install tiktoken:

```bash
npm install tiktoken
```

**Configuration file issues**: A common source of confusion is the interaction between `.contextinclude` and `.contextignore`. Remember that `.contextinclude` takes priority - if it exists, the tool operates in INCLUDE mode and ignores `.contextignore`. If you're not seeing expected files, check whether a `.contextinclude` file exists.

**Pattern matching problems**: When creating patterns in configuration files, ensure there are no inline comments and that patterns use the correct syntax. Use `**` for recursive matching and `*` for single-level matching. Test patterns with verbose output to verify they work as expected.

**Method-level analysis issues**: When using method-level analysis, ensure your `.methodinclude` or `.methodignore` files are in the correct location (project root or tool directory) and use proper pattern syntax. The tool will indicate which mode is active in the output.

**Section sources**

- [README.md](file://README.md#L0-L891)
- [ctxman.js](file://ctxman.js#L793-L813)
