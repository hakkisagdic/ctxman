# `ctxman focus`

Pack a single target file (or a specific symbol `<file>:<symbol>`) together with its neighborhood in the repository import and cross-file AST symbol call graphs into one LLM-ready document, across a single repository or a multi-repository workspace (`--repo`).

## Usage

```bash
ctxman focus <file>[:symbol] [root] [options]
ctxman focus src/auth/jwt.js:verifyToken --depth 1
ctxman focus src/auth/jwt.js --symbol verifyToken --calls-only
ctxman focus checkout-web/src/checkoutClient.js:submitCheckout --repo ../billing-api --depth 1
```

By default (`--depth 1`), `ctxman focus` traverses:

1. **Outgoing dependencies** (`<file>` -> modules it imports, or cross-file functions `<symbol>` calls) up to `--depth` hops.
2. **Incoming dependents** (modules that import `<file>`, or cross-file functions that call `<symbol>`) up to `--depth` hops.

When one or more `--repo <dir>` flags are passed, `ctxman focus` builds a unified multi-repository workspace graph (`buildWorkspaceGraph`) across the primary root and all additional repositories, resolving `<alias>/<path>[:symbol]` targets, cross-repo package/alias/relative imports, and cross-repo AST symbol call edges while enforcing each repository's `.ctxman/policy.json` rules.

When a symbol target (`<file>:<symbol>` or `-s, --symbol <name>`) is specified with call-graph traversal enabled (default), `ctxman focus`:

- Computes the intra-file helper closure of `<symbol>` so cross-file calls made through local helper functions are followed automatically.
- Resolves calls across barrel/re-export files (`index.js` / `index.ts`) and across workspace repositories directly to the defining module.
- Prioritizes direct symbol callers and callees ahead of general file-level imports when packing under a `--budget`.

Traversal is **directional**: following an outgoing dependency to a shared utility (such as `logger.js`) does not pull in unrelated sibling callers of `logger.js` at `--depth 2`.

When `--budget` is set, the target file is packed first, followed by distance-1 neighbors (prioritizing direct symbol call neighbors), then deeper hops, breaking ties by personalised PageRank centered on `<file>[:symbol]`.

## Options

| Option                             | Description                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `--repo DIR`                       | Include additional repository `DIR` in a multi-repository workspace (repeatable)         |
| `-r, --root DIR`                   | Primary project root directory (default: positional `[root]` or current directory)       |
| `-s, --symbol NAME`                | Focus on a specific function/method inside `<file>` (or `<file>:<symbol>`)               |
| `-d, --depth N`                    | Hops in the import/call graph (default: `1`; `0` packs only `<file>`)                    |
| `--imports-only`, `--no-importers` | Follow only outgoing imports / callees                                                   |
| `--importers-only`, `--no-imports` | Follow only incoming importers / callers                                                 |
| `--calls-only`                     | Follow only outgoing cross-file AST symbol calls                                         |
| `--callers-only`                   | Follow only incoming cross-file AST symbol callers                                       |
| `--calls` / `--no-calls`           | Enable or disable AST symbol call graph traversal (default: enabled)                     |
| `--no-tests`                       | Exclude test/spec files from the neighborhood                                            |
| `--budget TOKENS`                  | Token limit (e.g. `20000` or `20k`)                                                      |
| `--max-tokens TOKENS`              | Exit with code `2` if the document exceeds `TOKENS`                                      |
| `--style STYLE`                    | `xml` (default), `markdown`, `plain`, `json` (`--json`)                                  |
| `--compress`                       | Keep function signatures and elide function bodies                                       |
| `--line-numbers`                   | Prefix every line with its original line number                                          |
| `--no-tree`                        | Omit the directory tree header                                                           |
| `--header TEXT`                    | Prepend custom text at the top                                                           |
| `--instructions FILE`              | Append prompt instructions from `FILE` at the end                                        |
| `--no-redact`                      | Disable secret masking (refused if any workspace repository's policy requires redaction) |
| `--target-model ID`                | Count tokens and check context fit for a specific LLM                                    |
| `-o, --output FILE`                | Write document to `FILE` instead of `stdout`                                             |
| `--copy`                           | Copy document to clipboard                                                               |
| `-q, --quiet`                      | Suppress summary on `stderr`                                                             |

## Programmatic API & MCP

- Node API: `focusContext(root, target, options)` exported from `ctxman` (`target` accepts `'path/to/file.js'`, `'path/to/file.js:symbolName'`, or `'<alias>/path/to/file.js[:symbol]'` when `options.repos` is set; `options` supports `repos`, `symbol`, `callGraph`, `direction: 'both' | 'imports' | 'importers' | 'calls' | 'callers'`, `depth`, `budget`, `style`, `compress`, `lineNumbers`). Returns `result.focus` including `symbol`, `callEdges`, and `repos`.
- MCP tool: `focus_context` (`path`, `file`, `repos?`, `symbol?`, `depth?`, `direction?`, `callGraph?`, `includeTests?`, `budget?`, `style?`, `compress?`, `lineNumbers?`).
