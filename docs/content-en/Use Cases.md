# Use Cases

<cite>
**Referenced Files in This Document**   
- [README.md](file://README.md)
- [ctxman.js](file://ctxman.js)
- [index.js](file://index.js)
- [bin/cli.js](file://bin/cli.js)
</cite>

## Table of Contents

1. [LLM Context Optimization](#llm-context-optimization)
2. [Codebase Analysis](#codebase-analysis)
3. [CI/CD Integration](#cicd-integration)
4. [Common Challenges and Solutions](#common-challenges-and-solutions)
5. [Best Practices and Performance Considerations](#best-practices-and-performance-considerations)

## LLM Context Optimization

The ctxman tool enables efficient management of token budgets for AI assistants by generating focused context files and filtering out non-essential code. It supports two primary modes of operation: EXCLUDE mode (via `.contextignore`) and INCLUDE mode (via `.contextinclude`), with the latter taking precedence. This dual filtering system ensures precise control over which files are included in the analysis, allowing developers to focus exclusively on core application logic.

For LLM context export, the tool provides two formats: an ultra-compact format (~2.3k characters) and a detailed format (~8.6k characters). The compact format generates structured JSON output ideal for programmatic processing and AI consumption, while the detailed format includes additional metadata such as file categories and importance scores. When using the `--context-clipboard` or `--context-export` options, the tool outputs a clean directory structure without token counts, making it suitable for frequent AI interactions.

Method-level filtering further enhances context optimization through `.methodinclude` and `.methodignore` configuration files. These allow developers to include or exclude specific methods based on naming patterns, enabling highly targeted analysis. For example, specifying `*Handler`, `*Validator`, or `TokenCalculator.*` in `.methodinclude` focuses the context on critical business logic components.

**Section sources**

- [README.md](file://README.md#L1-L891)
- [ctxman.js](file://ctxman.js#L1-L865)

## Codebase Analysis

The ctxman tool provides comprehensive insights into token distribution across the codebase, identifying large files and methods while tracking complexity over time. Using exact token counting via tiktoken (GPT-4 compatible), it delivers accurate metrics that help maintain optimal code health. In the absence of tiktoken, the tool falls back to smart estimation with ~95% accuracy.

Key analytical features include:

- **Token distribution by file type**: Detailed breakdown of tokens per extension
- **Largest files identification**: Top 5 largest files ranked by token count
- **Directory-level statistics**: Token usage aggregated by top-level directories
- **Method-level analysis**: Extraction and analysis of individual methods from JavaScript/TypeScript files

The tool generates a detailed report showing total files analyzed, total tokens, average tokens per file, and files ignored due to `.gitignore` or context rules. This information is crucial for understanding project complexity and identifying potential refactoring opportunities. The `--save-report` option exports this data to `token-analysis-report.json`, enabling historical tracking and trend analysis.

**Section sources**

- [README.md](file://README.md#L1-L891)
- [ctxman.js](file://ctxman.js#L1-L865)

## CI/CD Integration

The ctxman tool can be seamlessly integrated into CI/CD pipelines for automated code size monitoring, quality gates, and documentation generation. Its command-line interface supports non-interactive execution, making it suitable for use in pre-commit hooks, daily monitoring scripts, and continuous integration workflows.

Common integration patterns include:

- **Pre-commit hooks**: Running `ctxman --context-clipboard` before commits to ensure only essential code is considered for AI review
- **Daily monitoring scripts**: Executing `ctxman --save-report` to generate daily analysis reports for trend tracking
- **Quality gates**: Implementing token budget checks in pipelines using scriptable output (e.g., parsing JSON output to enforce maximum token limits)
- **Automated documentation**: Generating up-to-date context files that reflect current codebase structure

The interactive export selection feature prompts users to choose between saving a detailed JSON report, generating an LLM context file, copying context to clipboard, or skipping export—ensuring flexibility in different usage scenarios.

**Section sources**

- [README.md](file://README.md#L1-L891)
- [bin/cli.js](file://bin/cli.js#L1-L67)

## Common Challenges and Solutions

Several common challenges arise when using the ctxman tool, particularly around configuration and filtering behavior:

**Include vs Exclude Mode Confusion**: The presence of `.contextinclude` takes priority over `.contextignore`. If unexpected files are being included or excluded, verify which configuration file exists and remove the unwanted one.

**Pattern Matching Issues**: Ensure no inline comments exist in pattern files, as they can interfere with parsing. Use proper glob patterns (`docs/**` instead of `docs/`) and test configurations with verbose mode to see inclusion/exclusion reasons.

**Token Count Discrepancies**: If token counts appear too high or low, check whether important files are being excluded by `.gitignore` or context rules. Use `--verbose` to inspect which files are being processed.

**Missing Expected Files**: Files may be excluded due to `.gitignore` rules (always respected) or incorrect pattern syntax. Verify that files are recognized as text files and use verbose mode to determine exclusion reasons.

**Clipboard Functionality Failures**: On Linux systems, ensure either `xclip` or `xsel` is installed for clipboard operations. The tool automatically attempts both utilities if one fails.

**Section sources**

- [README.md](file://README.md#L1-L891)
- [ctxman.js](file://ctxman.js#L1-L865)

## Best Practices and Performance Considerations

To maximize effectiveness when using the ctxman tool, follow these best practices:

**Configuration Management**: Use `.contextinclude` for precise control over analysis scope, especially in large repositories. Keep patterns simple and test them incrementally.

**Performance Optimization**: The tool is optimized for performance, but analyzing very large codebases may benefit from method-level filtering to reduce processing overhead. Enable method-level analysis only when necessary.

**Exact Token Counting**: Install the `tiktoken` package (`npm install tiktoken`) for GPT-4 compatible exact token counting. Without it, the tool uses estimation with ~95% accuracy.

**Regular Monitoring**: Integrate the tool into regular development workflows through pre-commit hooks or scheduled scripts to maintain awareness of codebase growth and complexity trends.

**Output Utilization**: Leverage both compact and detailed output formats appropriately—use compact JSON for AI interactions and detailed reports for architectural planning and onboarding.

**Method-Level Filtering**: Use `.methodinclude` and `.methodignore` files to focus on core business logic during debugging or code reviews, reducing cognitive load and improving analysis relevance.

**Section sources**

- [README.md](file://README.md#L1-L891)
- [ctxman.js](file://ctxman.js#L1-L865)
