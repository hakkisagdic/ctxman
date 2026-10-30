# `ctxman focus`

Pack a single target file together with its neighborhood in the repository import graph into one LLM-ready document.

## Usage

```bash
ctxman focus <file> [root] [options]
```

By default (`--depth 1`), `ctxman focus` traverses:

1. **Outgoing imports** (`<file>` -> modules it imports) up to `--depth` hops.
2. **Incoming importers** (modules that import `<file>`) up to `--depth` hops.

Traversal is **directional**: following an outgoing dependency to a shared utility (such as `logger.js`) does not pull in unrelated sibling callers of `logger.js` at `--depth 2`.

When `--budget` is set, the target file is packed first, followed by distance-1 neighbors, then deeper hops, breaking ties by personalised PageRank centered on `<file>`.

## Options

| Option                             | Description                                                      |
| ---------------------------------- | ---------------------------------------------------------------- |
| `-d, --depth N`                    | Hops in the import graph (default: `1`; `0` packs only `<file>`) |
| `--imports-only`, `--no-importers` | Follow only outgoing imports                                     |
| `--importers-only`, `--no-imports` | Follow only incoming importers                                   |
| `--no-tests`                       | Exclude test/spec files from the neighborhood                    |
| `--budget TOKENS`                  | Token limit (e.g. `20000` or `20k`)                              |
| `--max-tokens TOKENS`              | Exit with code `2` if the document exceeds `TOKENS`              |
| `--style STYLE`                    | `xml` (default), `markdown`, `plain`, `json` (`--json`)          |
| `--compress`                       | Keep function signatures and elide function bodies               |
| `--line-numbers`                   | Prefix every line with its original line number                  |
| `--no-tree`                        | Omit the directory tree header                                   |
| `--header TEXT`                    | Prepend custom text at the top                                   |
| `--instructions FILE`              | Append prompt instructions from `FILE` at the end                |
| `--no-redact`                      | Disable secret masking (refused if policy requires redaction)    |
| `--target-model ID`                | Count tokens and check context fit for a specific LLM            |
| `-o, --output FILE`                | Write document to `FILE` instead of `stdout`                     |
| `--copy`                           | Copy document to clipboard                                       |
| `-q, --quiet`                      | Suppress summary on `stderr`                                     |

## Programmatic API & MCP

- Node API: `focusContext(root, target, options)` exported from `ctxman`.
- MCP tool: `focus_context` (`path`, `file`, `depth`, `direction`, `includeTests`, `budget`, `style`, `compress`, `lineNumbers`).
