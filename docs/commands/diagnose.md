# `ctxman diagnose` — stack-trace & failure root-cause bundle

`ctxman diagnose` parses a stack trace, test failure output, or CI error log and assembles an
LLM-ready root-cause context bundle within a strict token budget across a single repository or a
multi-repository workspace (`--repo`):

1. **Multi-language stack frame parser (`parseStackFrames`)** — extracts file paths, line numbers,
   column numbers, and function names across JavaScript/TypeScript (Node.js/V8), Python
   (`File "...", line N, in fn`), Rust (`--> src/main.rs:42:13`), Go, Java, C# (`in file.cs:line 42`),
   and Vitest (`❯ path/to/file.js:42:15`).
2. **Safe single-repo & multi-repo resolution** — resolves implicated files inside the repository
   root or across all `--repo` workspace roots (`<alias>/<path>`, absolute paths inside any
   workspace repo, or repo-relative paths), rejecting external paths and files denied by any
   repository's `.ctxman/policy.json`.
3. **Enclosing symbol & code window extraction** — locates the innermost enclosing function,
   method, or class via `extractCodeUnits` in the owning repository and renders a highlighted line
   window (`>  42 | ...`).
4. **1-hop AST symbol call & import neighborhood** — prioritizes cross-file and cross-repo functions
   directly called by or calling the implicated stack-frame methods (including intra-file helper
   closures and barrel re-exports via `graph.callEdges` from `buildRepoGraph` or
   `buildWorkspaceGraph`), followed by 1-hop import neighbors, and annotates
   `## Related 1-Hop Neighborhood` entries with `caller -> callee` relationships.
5. **Recent git history (`explainHistory`)** — attaches recent commits, references, and authors
   from each implicated file's owning git repository so an agent or developer can immediately spot
   regressions.

```bash
# Pass a stack trace directly or pipe from a failing test run
ctxman diagnose "Error: boom\n    at parseTargetSpec (lib/why/target.js:42:11)"
npm test 2>&1 | ctxman diagnose --budget 20k
ctxman diagnose "Error at billing-api/src/invoice.js:3:10" --repo ../checkout-web
ctxman diagnose ci-failure.log --format json
ctxman diagnose ci-failure.log --no-calls   # import-only 1-hop neighbors
```

## Options

| Option                   | Default    | Description                                                           |
| ------------------------ | ---------- | --------------------------------------------------------------------- |
| `--repo DIR`             |            | Include additional repository `DIR` in workspace (repeatable)         |
| `-r, --root DIR`         | `.`        | Primary repository root directory                                     |
| `--stdin`                | `false`    | Read stack trace or failure log from `stdin`                          |
| `--budget TOKENS`        | `24000`    | Maximum token budget (`24000`, `24k`)                                 |
| `--format FORMAT`        | `markdown` | Output format: `markdown`, `json`, or `xml` (`--json`)                |
| `--calls` / `--no-calls` | `true`     | Enable or disable cross-file AST symbol call graph neighbor expansion |
| `--no-redact`            | `false`    | Disable automatic secret redaction                                    |
| `-o, --output FILE`      | stdout     | Write diagnosis report to `FILE`                                      |
| `-h, --help`             |            | Show command help                                                     |

## Library and MCP

```js
import { diagnoseFailure } from 'ctxman';

const report = await diagnoseFailure('/path/to/billing-api', stackTraceText, {
  repos: ['/path/to/checkout-web'],
  budget: 24000,
  format: 'markdown',
  windowLines: 12,
  callGraph: true,
});

console.log(report.repos, report.implicatedFiles, report.callEdges);
console.log(report.text);
```

The MCP server exposes `diagnose_failure` with `path`, `trace`, `repos`, `budget`, `callGraph`, and `format`.
