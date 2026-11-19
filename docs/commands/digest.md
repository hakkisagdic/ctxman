# ctxman digest

Store full work outputs or agent results on disk under restricted permissions (`0700` store
directory, `0600` digest files) and inspect compact summaries, line ranges, or pattern matches on
demand.

```bash
ctxman digest write --id task-42 < report.md
ctxman digest read task-42 --lines 120-130
ctxman digest read task-42 --grep "error|warning"
ctxman digest list
```

## Subcommands

### `write`

```text
ctxman digest write --id <id> [--file <path>] [--store <dir>] [--done <text>] [--result <text>] [--open <text>] [--needs <text>] [--force]
```

- Reads full content from `--file` or `stdin` and writes `<store>/<id>.md` verbatim without LLM
  calls or network requests.
- Prints at most 7 lines: `id:`, `path:`, and up to 4 summary fields (`done`, `result`, `open`,
  `needs`), each truncated to 160 characters.
- When writer summary flags are omitted, falls back to rule-based extraction from the first two
  non-empty lines (`done`, `result`) and lines starting with `open`/`todo`/`pending` or
  `need(s)`/`question`.
- Refuses empty input or overwriting an existing id unless `--force` is passed.

### `read`

```text
ctxman digest read <id|path> [--lines A-B] [--grep PATTERN] [--store <dir>]
```

- Resolves `<id>` (`[A-Za-z0-9._-]`, 1–64 chars, no `..`) or a path inside the store; rejects `..`,
  external paths, and symlinks pointing outside the store with a non-zero exit code.
- Prints 1-based line-numbered output (`<line>: <content>`).
- `--lines A-B` (or `N`) selects an inclusive 1-based range (`A >= 1`, `A <= B`).
- `--grep` compiles a JavaScript `RegExp` (falling back to literal substring matching when invalid
  regex syntax is given), capped at 200 pattern characters and 500 matching lines.

### `list`

```text
ctxman digest list [--store <dir>] [--json]
```

Lists stored `.md` digests sorted by id with line count, byte size, and timestamp (or prints
`no digests stored` when empty).

## Store Resolution & Privacy

Store directory precedence:

1. `--store <dir>` (or `storeDir` option / MCP argument)
2. `CTXMAN_DIGEST_DIR` environment variable
3. `~/.ctxman/digests` (resolved via `os.homedir()`)

The MCP server exposes [`digest_read`](mcp.md#tools-20) (`ref`, `lines?`, `grep?`, `storeDir?`,
`repos?`) with the same store containment checks.

> **Privacy note:** `digest write` stores input verbatim without redacting sensitive values. Keep
> store permissions at `0700`/`0600` and avoid piping passwords, private keys, or credentials into
> stored digests.
