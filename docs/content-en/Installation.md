# Installation

<cite>
**Referenced Files in This Document**   
- [README.md](file://README.md)
- [package.json](file://package.json)
- [bin/cli.js](file://bin/cli.js)
- [ctxman.js](file://ctxman.js)
</cite>

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Methods](#installation-methods)
3. [Token Counting Configuration](#token-counting-configuration)
4. [Configuration Files](#configuration-files)
5. [Verification and Usage](#verification-and-usage)
6. [Integration with Development Workflows](#integration-with-development-workflows)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

Before installing the ctxman tool, ensure your system meets the following requirements:

- **Node.js**: Version 14.0.0 or higher (specified in package.json under "engines")
- **npm**: Node Package Manager, typically installed with Node.js

These prerequisites are essential for both global and local installations of the package. The tool is designed to work across different operating systems including macOS, Linux, and Windows, leveraging Node.js's cross-platform capabilities for consistent behavior.

**Section sources**

- [package.json](file://package.json#L15-L17)

## Installation Methods

The ctxman tool can be installed using npm through two primary methods: globally or locally. Each method serves different use cases depending on your development workflow.

### Global Installation

Global installation makes the `ctxman` command available system-wide, allowing you to use it from any directory in your terminal:

```bash
npm install -g ctxman
```

This approach is recommended if you plan to use the tool across multiple projects or want to access it as a standalone CLI tool from anywhere in your system. After global installation, you can run `ctxman` commands directly without prefixing them with `npx`.

### Local Installation

Local installation adds the package as a dependency to your current project:

```bash
npm install ctxman
```

This method is ideal when you want to include ctxman as part of a specific project's toolchain or when working in a team environment where consistent tool versions are important. With local installation, you can execute the tool using `npx`:

```bash
npx ctxman --help
```

Local installation ensures that all team members use the same version of the tool as defined in the project's package-lock.json, promoting consistency across development environments.

**Section sources**

- [README.md](file://README.md#L235-L245)

## Token Counting Configuration

The ctxman tool provides two methods for token counting, with an optional dependency that enhances accuracy.

### Exact Token Counting with tiktoken

For precise token counting that matches GPT-4's tokenization, install the tiktoken package:

```bash
npm install tiktoken
```

When tiktoken is available, the tool uses exact token counting by loading the cl100k_base encoding (used by GPT-4). This provides the most accurate token counts for LLM context management.

### Fallback to Smart Estimation

If tiktoken is not installed, the tool automatically falls back to a smart estimation algorithm with approximately 95% accuracy. The estimation uses character-to-token ratios specific to file types:

- JavaScript/TypeScript: 3.2 characters per token
- JSON: 2.5 characters per token
- Markdown: 4.0 characters per token
- HTML/XML: 2.8 characters per token
- Other text files: 3.5 characters per token

The tool first attempts to load tiktoken, and if unsuccessful, uses the estimation method. This is implemented in the `calculateTokens` method of the TokenCalculator class, which tries to require tiktoken and catches any errors to fall back to estimation.

**Section sources**

- [README.md](file://README.md#L219-L223)
- [ctxman.js](file://ctxman.js#L287-L317)

## Configuration Files

The ctxman tool uses several configuration files to control file and method inclusion/exclusion, with a defined priority hierarchy.

### File-Level Configuration

#### .contextignore (EXCLUDE Mode)

This file contains patterns for files to exclude from analysis. It follows gitignore-style syntax:

```bash
**/*.md              # All documentation
**/*.json            # All configuration files
infrastructure/**    # Infrastructure code
```

#### .contextinclude (INCLUDE Mode)

This file specifies patterns for files to include in analysis, taking priority over .contextignore:

```bash
utility-mcp/src/**/*.js
!utility-mcp/src/workflows/**
```

### Method-Level Configuration

#### .methodinclude

Defines methods to include in method-level analysis:

```bash
calculateTokens
*Handler
TokenCalculator.*
```

#### .methodignore

Specifies methods to exclude from analysis:

```bash
*test*
*debug*
console
```

### Configuration Priority Hierarchy

The tool follows a strict priority order when determining which files and methods to analyze:

1. **`.gitignore`** - Always respected (project root)
2. **`.contextinclude`** - Highest priority for files (INCLUDE mode)
3. **`.contextignore`** - Used when no include file exists (EXCLUDE mode)
4. **`.methodinclude`** - Highest priority for methods (INCLUDE mode)
5. **`.methodignore`** - Used when no method include file exists (EXCLUDE mode)

When both .contextinclude and .contextignore exist, the include file takes precedence and the ignore file is ignored. This allows for precise control over analysis scope.

**Section sources**

- [README.md](file://README.md#L145-L184)
- [ctxman.js](file://ctxman.js#L108-L218)

## Verification and Usage

After installation, verify the tool is working correctly and explore its basic usage patterns.

### Verification

Test the installation by accessing the help menu:

```bash
ctxman --help
```

This should display the CLI options and usage information, confirming the tool is properly installed and accessible. The help output includes available options like `--save-report`, `--context-export`, and `--method-level`, along with examples of common usage patterns.

### Basic Usage Examples

#### Interactive Analysis

Running the tool without arguments initiates interactive mode with export options:

```bash
ctxman
```

#### Direct Export Options

```bash
# Save detailed JSON report
ctxman --save-report

# Generate LLM context file
ctxman --context-export

# Copy context to clipboard
ctxman --context-clipboard
```

#### Method-Level Analysis

```bash
# Analyze specific methods only
ctxman --method-level --context-clipboard
```

The tool provides immediate feedback during execution, showing whether it's using exact token counting (with tiktoken) or estimation, the analysis mode (INCLUDE/EXCLUDE), and summary statistics upon completion.

**Section sources**

- [README.md](file://README.md#L247-L255)
- [bin/cli.js](file://bin/cli.js#L35-L65)

## Integration with Development Workflows

The ctxman tool can be integrated into various development workflows to optimize LLM context usage and monitor codebase complexity.

### Package.json Scripts

Add custom scripts to your project's package.json:

```json
"scripts": {
  "analyze": "ctxman",
  "analyze:methods": "ctxman --method-level",
  "llm-context": "ctxman --context-clipboard"
}
```

Then use them with:

```bash
npm run analyze
npm run llm-context
```

### CI/CD Integration

Incorporate the tool into continuous integration pipelines to monitor codebase growth:

```bash
# In CI script
ctxman --save-report
TOKENS=$(jq '.summary.totalTokens' token-analysis-report.json)
if [ $TOKENS -gt 100000 ]; then
  echo "Codebase exceeds LLM context limits"
  exit 1
fi
```

### Pre-commit Hooks

Use as a pre-commit hook to ensure code stays within token budgets before pushing changes.

### LLM Context Preparation

The tool generates optimized file lists for LLM consumption in two formats:

- **Compact format** (~2.3k characters): Minimal JSON structure for frequent AI interactions
- **Detailed format** (~8.6k characters): Comprehensive context for initial project analysis

These outputs can be automatically fed into AI-assisted development workflows, ensuring developers work with the most relevant code context.

**Section sources**

- [README.md](file://README.md#L201-L217)
- [package.json](file://package.json#L7-L13)

## Troubleshooting

Address common issues that may arise during installation and usage of the ctxman tool.

### Permission Errors (Global Installation)

When installing globally, you might encounter permission errors:

```bash
npm install -g ctxman
# Error: EACCES: permission denied
```

**Solutions:**

- Use a Node.js version manager like nvm that installs Node.js in your home directory
- Change npm's default directory to avoid permission issues
- Use sudo (not recommended for security reasons): `sudo npm install -g ctxman`

### Missing Dependencies

If tiktoken fails to install, the tool automatically falls back to estimation mode. To resolve installation issues:

```bash
# Clear npm cache
npm cache clean --force

# Reinstall with fresh dependencies
npm install tiktoken
```

### Configuration Issues

#### Include vs Exclude Mode Confusion

- **Problem**: Unexpected files included/excluded
- **Solution**: Check for .contextinclude file presence, as it takes priority over .contextignore

#### Pattern Matching Problems

- Ensure patterns don't have inline comments
- Use `**` for recursive matching, `*` for single level
- Test patterns with verbose mode to see matching behavior

### Platform-Specific Issues

On Linux systems without proper clipboard tools:

```bash
# Install required clipboard utilities
sudo apt-get install xclip xsel  # Debian/Ubuntu
sudo yum install xclip           # CentOS/RHEL
```

The tool automatically tries alternative clipboard commands if the primary one fails, providing fallback mechanisms for cross-platform compatibility.

**Section sources**

- [README.md](file://README.md#L257-L284)
- [ctxman.js](file://ctxman.js#L565-L585)
