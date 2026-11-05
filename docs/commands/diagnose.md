# `ctxman diagnose` — stack-trace & failure root-cause bundle

`ctxman diagnose` parses a stack trace, test failure output, or CI error log and assembles an
LLM-ready root-cause context bundle within a strict token budget:

1. **Multi-language stack frame parser (`parseStackFrames`)** — extracts file paths, line numbers,
   column numbers, and function names across JavaScript/TypeScript (Node.js/V8), Python
   (`File "...", line N, in fn`), Rust (`--> src/main.rs:42:13`), Go, Java, C# (`in file.cs:line 42`),
   and Vitest (`❯ path/to/file.js:42:15`).
2. **Safe in-repo resolution** — resolves implicated files inside the repository root (rejecting
   external paths and files denied by `.ctxman/policy.json`).
3. **Enclosing symbol & code window extraction** — locates the innermost enclosing function,
   method, or class via `extractCodeUnits` and renders a highlighted line window (`>  42 | ...`).
4. **1-hop import neighborhood** — lists files directly importing or imported by the implicated
   files via `buildRepoGraph`.
5. **Recent git history (`explainHistory`)** — attaches recent commits, references, and authors
   that touched the implicated files so an agent or developer can immediately spot regressions.

```bash
# Pass a stack trace directly or pipe from a failing test run
ctxman diagnose "Error: boom\n    at parseTargetSpec (lib/why/target.js:42:11)"
npm test 2>&1 | ctxman diagnose --budget 20k
ctxman diagnose --file ci-failure.log --format json
```

## Options

| Option              | Default    | Description                                            |
| ------------------- | ---------- | ------------------------------------------------------ |
| `--file FILE`       | stdin/arg  | Read stack trace or failure log from `FILE`            |
| `--budget TOKENS`   | `24000`    | Maximum token budget (`24000`, `24k`)                  |
| `--format FORMAT`   | `markdown` | Output format: `markdown`, `json`, or `xml` (`--json`) |
| `--window N`        | `12`       | Context lines before and after each implicated line    |
| `--no-redact`       | `false`    | Disable automatic secret redaction                     |
| `-o, --output FILE` | stdout     | Write diagnosis report to `FILE`                       |
| `-h, --help`        |            | Show command help                                      |

## Library and MCP

```js
import { diagnoseFailure, parseStackFrames } from 'ctxman';

const report = await diagnoseFailure('/path/to/repo', stackTraceText, {
  budget: 24000,
  format: 'markdown',
  windowLines: 12,
});

console.log(report.implicatedFiles);
console.log(report.text);
```

The MCP server exposes `diagnose_failure` with `path`, `trace`, `budget`, and `format`.
