# ctxman mcp

Run ctxman as a [Model Context Protocol](https://modelcontextprotocol.io) server, and add it
to an MCP client (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf) with one command.

```bash
ctxman mcp install --client claude-desktop   # write the client's config
ctxman mcp                                   # what the client then runs (stdio)
```

## Starting the server

```text
ctxman mcp [--transport stdio|sse] [--port N] [--host ADDR] [--api-key KEY] [--cors] [--root DIR]
```

| Option                     | Default     | Meaning                                                                   |
| -------------------------- | ----------- | ------------------------------------------------------------------------- |
| `--transport <stdio\|sse>` | `stdio`     | `sse` serves the streamable HTTP transport on `http://HOST:PORT/mcp`      |
| `--port <n>`               | `3000`      | HTTP port                                                                 |
| `--host <address>`         | `127.0.0.1` | HTTP address; a non-loopback address without `--api-key` prints a warning |
| `--api-key <key>`          | none        | HTTP requests must send it in the `x-api-key` header                      |
| `--cors`                   | off         | Send CORS headers on HTTP                                                 |
| `--root <dir>`             | none        | Confine every tool and prompt path to `<dir>` (see [Sandbox](#sandbox))   |
| `-h`, `--help`             |             | Show the help, including the clients and scopes                           |

Every option takes its value either as `--port 3000` or as `--port=3000`. Unknown options and
invalid values (`--port abc`, `--transport ws`) stop with exit code 2 instead of starting a
server with defaults.

`bin/mcp-server.js` still works for existing configurations and starts the same server; it keeps
its old tolerance (unknown options are ignored, an unknown transport means stdio).

With the stdio transport, stdout carries only JSON-RPC messages; ctxman's own notices go to
stderr. The server stops when the client closes its stdin.

## Adding ctxman to a client

```text
ctxman mcp install   --client <name> [--scope user|project] [options]
ctxman mcp uninstall --client <name> [--scope user|project] [options]
ctxman mcp config    --client <name> [--scope user|project] [options]
```

| Option                    | Meaning                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `--client <name>`         | `claude-desktop`, `claude-code`, `cursor`, `vscode` or `windsurf` (required)        |
| `--scope <user\|project>` | Which configuration; the default depends on the client (table below)                |
| `--name <name>`           | Server name in the configuration (default `ctxman`; letters, digits, `_`, `.`, `-`) |
| `--project <dir>`         | Project directory for `--scope project` (default: the current directory)            |
| `--file <path>`           | Use this configuration file instead of the client's default location                |
| `--npx`                   | Run `npx -y ctxman mcp` instead of this installation (on Windows: `cmd /c npx ...`) |
| `--root <dir>`            | Start the server with `--root <dir>`                                                |
| `--force`                 | Replace an existing entry of the same name that differs                             |
| `--dry-run`               | Print the file as it would be written; write nothing                                |
| `--print`                 | Print the snippet instead of writing (same as `config`)                             |
| `--json`                  | Print the result of `install` / `uninstall` as JSON                                 |

By default the entry runs this installation with absolute paths, so it does not depend on the
client's `PATH` or working directory:

```json
{
  "mcpServers": {
    "ctxman": {
      "command": "/usr/local/bin/node",
      "args": ["/usr/local/lib/node_modules/ctxman/bin/cli.js", "mcp"]
    }
  }
}
```

`command` is the Node.js binary that ran `ctxman mcp install` (`process.execPath`). After
upgrading Node.js or moving ctxman, run `install --force` again, or use `--npx`. A project-scope
file is usually committed; use `--npx` there so it works on every machine.

### How the file is changed

- The entry is merged into the file: other servers and other settings stay as they are, in
  their order. Missing directories are created. The file is written as 2-space JSON.
- Before a file is changed, its previous version is copied to `<file>.bak`.
- An identical `ctxman` entry is left alone ("nothing changed"), so `install` can be run again.
- A different entry with the same name is not replaced without `--force` (exit code 1); use
  `--name` to add a second one.
- Files that are not plain JSON (comments, trailing commas, syntax errors) are refused and left
  untouched; add the entry by hand with the snippet from `ctxman mcp config`.
- `uninstall` removes only the entry with that name; when there is none, nothing is written.

### Clients and configuration files

The default scope is marked with \*.

| Client           | Scope     | File ctxman writes                                                                                                                                                                                                       | Servers key  |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `claude-desktop` | user\*    | macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`, Linux `~/.config/Claude/claude_desktop_config.json` (`$XDG_CONFIG_HOME/Claude` when set) | `mcpServers` |
| `claude-code`    | project\* | `<project>/.mcp.json` (entries carry `"type": "stdio"`)                                                                                                                                                                  | `mcpServers` |
| `claude-code`    | user      | none: prints `claude mcp add --scope user --transport stdio ctxman -- <node> <cli.js> mcp`                                                                                                                               |              |
| `cursor`         | user\*    | `~/.cursor/mcp.json`                                                                                                                                                                                                     | `mcpServers` |
| `cursor`         | project   | `<project>/.cursor/mcp.json`                                                                                                                                                                                             | `mcpServers` |
| `vscode`         | project\* | `<project>/.vscode/mcp.json` (entries carry `"type": "stdio"`)                                                                                                                                                           | `servers`    |
| `vscode`         | user      | none: prints `code --add-mcp '{"name":"ctxman",...}'`                                                                                                                                                                    |              |
| `windsurf`       | user\*    | none unless `--file` is given: prints the snippet and where to put it                                                                                                                                                    | `mcpServers` |

Sources, checked in October 2026:

- **Claude Desktop** — MCP documentation, "Connect to local MCP servers":
  <https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers> (macOS and Windows paths,
  `mcpServers`, `command`/`args`). The docs do not have a Linux section; the Linux path is the one
  their command examples use, and Claude Desktop on Linux keeps its data (logs) under
  `~/.config/Claude` according to
  <https://claude.com/docs/third-party/claude-desktop/configuration>. If your build uses another
  directory, pass it with `--file`.
- **Claude Code** — <https://code.claude.com/docs/en/mcp>: project servers live in `.mcp.json`
  at the project root under `mcpServers`; user-scope servers are stored in `~/.claude.json`
  together with Claude Code's other state, which is why ctxman prints the `claude mcp add`
  command (the `--` separates Claude Code's options from the server command) rather than editing
  that file. Claude Code asks you to approve servers from `.mcp.json` on its next start.
- **Cursor** — <https://cursor.com/docs/mcp>: `.cursor/mcp.json` in the project and
  `~/.cursor/mcp.json` globally, both with `mcpServers`; the project file wins for the same name.
- **VS Code** — <https://code.visualstudio.com/docs/agents/reference/mcp-configuration> and
  <https://code.visualstudio.com/docs/agent-customization/mcp-servers>: workspace servers in
  `.vscode/mcp.json` under `servers` (`type`, `command`, `args`); user-level servers through the
  "MCP: Open User Configuration" command or `code --add-mcp '<json>'`. VS Code's `mcp.json` may
  contain comments, which ctxman refuses to rewrite (see above).
- **Windsurf** — <https://docs.windsurf.com/windsurf/cascade/mcp>: **not verified to one file**.
  The current docs name `~/.config/devin/mcp_config.json` (`$XDG_CONFIG_HOME/devin/`,
  `%APPDATA%\devin\` on Windows) as the file Cascade's "Open MCP config file" action opens, and
  `~/.codeium/windsurf/mcp_config.json` as the editor's discovery file; older guides only know
  the latter. ctxman therefore prints the snippet; open the file from Cascade (MCPs, "Open MCP
  config file") and pass it with `--file`, for example
  `ctxman mcp install --client windsurf --file ~/.codeium/windsurf/mcp_config.json`.

Some of these pages could not be fetched from the build environment (DNS); their content was
checked through search excerpts of the same pages. Clients change these locations from time to
time: `--file` and `config` always work.

### Examples

```bash
# Claude Desktop, then restart it
$ ctxman mcp install --client claude-desktop
Created /Users/me/Library/Application Support/Claude/claude_desktop_config.json (Claude Desktop, user scope)
Restart Claude Desktop to load the server.

# A portable entry for the team, in the project's .mcp.json
$ ctxman mcp install --client claude-code --npx

# Running it again is harmless; a different entry needs --force
$ ctxman mcp install --client claude-desktop --npx
/Users/me/Library/Application Support/Claude/claude_desktop_config.json (Claude Desktop, user scope) already has a different "ctxman" entry:
{ ... }
Use --force to replace it (the old file is kept as .bak), or --name.

# See the change first
$ ctxman mcp install --client cursor --scope project --dry-run

# Only the snippet (JSON on stdout, the target on stderr)
$ ctxman mcp config --client vscode > snippet.json

# Claude Code user scope: run the printed command
$ ctxman mcp install --client claude-code --scope user
claude mcp add --scope user --transport stdio ctxman -- /usr/local/bin/node /usr/local/lib/node_modules/ctxman/bin/cli.js mcp

# Remove it again (the previous file is kept as .bak)
$ ctxman mcp uninstall --client claude-desktop
```

## Tools (19)

| Tool                    | Arguments                                                                                                                  | Returns                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `analyze_codebase`      | `path`                                                                                                                     | Statistics and token counts                                                                                             |
| `generate_context`      | `path`, `template?`, `maxTokens?`                                                                                          | LLM context                                                                                                             |
| `git_diff`              | `path`, `branch?`                                                                                                          | `git diff <branch>`                                                                                                     |
| `search_code`           | `path`, `query`, `type?` (`regex`, `substring`, `ranked`, `semantic`, `hybrid`), `repos?`                                  | Matching lines or ranked/hybrid code chunks (below)                                                                     |
| `list_methods`          | `path` (directory or file), `file?`                                                                                        | Methods per file                                                                                                        |
| `get_symbol`            | `path`, `name`, `file?`, `redact?`                                                                                         | Source of a named method, function or class                                                                             |
| `repo_map`              | `path`, `tokens?`, `focus?`, `repos?`                                                                                      | Ranked repository map within a token budget (`ctxman map`)                                                              |
| `pr_context`            | `path`, `base?`, `head?`, `budget?`, `style?`                                                                              | Review context for a branch (`ctxman pr`)                                                                               |
| `count_tokens`          | `path` or `text`, `model?`, `top?`                                                                                         | Token count for a model and the fit in its window (`ctxman count`)                                                      |
| `explain_history`       | `path`, `target`, `limit?`, `budget?`, `since?`, `patches?`, `discussions?`, `maxDiscussions?`, `analyzer?`, `analyzerDb?` | Why code looks as it does: git history, references, institutional citations, owners, tests, PR threads                  |
| `pack_context`          | `path`, `include?`, `exclude?`, `files?`, `style?`, `budget?`, `repos?`                                                    | File contents in one LLM-ready document (`ctxman pack`)                                                                 |
| `focus_context`         | `path`, `file`, `symbol?`, `depth?`, `direction?`, `callGraph?`, `style?`, `compress?`, `budget?`                          | Import & AST symbol call-graph neighborhood slice around a file or `file:symbol` (`ctxman focus`)                       |
| `check_policy`          | `path`                                                                                                                     | The effective export policy, or why its files are invalid (`ctxman policy check`)                                       |
| `audit_log`             | `path`, `since?`, `limit?`                                                                                                 | Exports recorded in the policy's audit log (`ctxman audit`)                                                             |
| `ask_codebase`          | `path`, `query`, `limit?`                                                                                                  | Files closest in meaning to a question, from a local SQLite embedding index (`ctxman ask`)                              |
| `task_context`          | `path`, `task`, `budget?`, `format?`, `model?`                                                                             | Task-driven auto context: hybrid search seeds, AST call & import 1-hop code, 2-hop signatures, repo map (`ctxman task`) |
| `diagnose_failure`      | `path`, `trace`, `budget?`, `format?`                                                                                      | Stack-trace & failure root-cause bundle: implicated frames, methods, AST call & import 1-hop & git history              |
| `find_experts`          | `path`, `target`, `limit?`, `halfLifeDays?`, `style?`                                                                      | Expert Finder ("Who knows about this?"): blame share, recency-decayed commits & CODEOWNERS (`ctxman who`)               |
| `query_knowledge_graph` | `path`, `query?`, `file?`, `depth?`, `limit?`, `refresh?`, `repos?`                                                        | File nodes, method declarations, and import/dependency edges from `.ctxman/self-knowledge/index.sqlite`                 |

`explain_history` takes `patches?` (each commit's diff), `discussions?` (GitHub/GitLab PR, MR and
issue threads referenced in commit history), and `analyzer?` / `analyzerDb?` (institutional memory
citations from `.plansmith/analyzer.sqlite`); see [`ctxman why`](why.md).

`focus_context` packs `file` (or `file:symbol` / `symbol`) together with its `depth`-hop import and
cross-file AST symbol call neighborhood (`direction`: `'both'`, `'imports'`, `'importers'`, `'calls'`,
or `'callers'`, default `'both'`) within `budget` (default 20,000 tokens); see [`ctxman focus`](focus.md).

`task_context` builds a complete task bundle for `task` within `budget` (default 32,000 tokens),
combining `hybridSearch` seed discovery, 1-hop full source (prioritizing cross-file AST symbol
callers and callees), 2-hop compressed signatures, and a ranked `renderRepoMap` architectural
overview; see [`ctxman task`](task.md).

`diagnose_failure` parses stack traces across JS/TS, Python, Go, Rust, Java, C#, and Vitest,
resolving in-repo files and combining enclosing methods, 1-hop AST symbol call & import graph
neighbors, and recent git history (`explainHistory`) within `budget` (default 24,000 tokens); see
[`ctxman diagnose`](diagnose.md).

`find_experts` ranks domain experts for a file, symbol (`file:symbol`), line range (`file#L10-L40`),
directory, or natural-language topic query by combining `git blame -w` line ownership (`0.45`),
exponential recency-decayed commit history (`0.35`, default 90-day half-life), total commit share
(`0.20`), and a `+0.15` `CODEOWNERS` stewardship bonus; see [`ctxman who`](who.md).

`query_knowledge_graph` queries the persistent SQLite knowledge graph (`graph_nodes` and `graph_edges`
in `.ctxman/self-knowledge/index.sqlite`) and the cached `IncrementalAnalyzer` state, automatically
bootstrapping the graph when empty or when `refresh: true` is passed, and honouring per-repository
`.ctxman/policy.json` deny rules. When `repos` is provided, nodes and cross-repo import edges across all
repositories are indexed and returned under `<alias>/<path>`.

`repo_map`, `search_code` (`ranked`, `semantic`, `hybrid`), `pack_context`, and `query_knowledge_graph` accept an optional
`repos` array of repository directories to run across a multi-repository workspace under a single
shared token budget, prefixing paths with `<alias>/<path>`. When `--root` is active, every entry in
`repos` (and `analyzerDb` on `explain_history`) must also resolve inside the sandbox root.

`audit_log` reads only the logs the policy names (or `.ctxman/audit.log`); no argument names
another file. `ask_codebase` (and `search_code` with `type: "semantic"` or `"hybrid"`) uses the
built-in Node.js `node:sqlite` `SqliteVectorStore` (`.ctxman/self-knowledge/index.sqlite`) and
`AutoEmbeddingProvider` (using `@xenova/transformers` when installed, or deterministic offline
256-dim `LocalHashEmbeddingProvider` otherwise). Files left out by the ignore files or denied by
the export policy are not indexed or returned, and secrets in the snippets are redacted.

### `search_code` with `type: "ranked"` or `type: "hybrid"`

BM25 ranking over code chunks: each method/function found by the method analyzers is a chunk,
and the code outside them (or a whole file without methods) is cut into windows of up to 40
lines. Identifiers are split into words, so `getUserName`, `get_user_name` and "user name" match
each other. With `type: "hybrid"`, BM25 chunks and local vector similarity hits are fused via
Reciprocal Rank Fusion (`1 / (k + rank)`). Extra arguments: `limit` (default 10), `maxTokens`
(token budget for the returned code, default 4000) and `redact` (default true). See
[search.md](search.md) for the ranking details.

```json
{
  "name": "search_code",
  "arguments": { "path": "/work/app", "query": "expire session", "type": "ranked", "limit": 3 }
}
```

```json
{
  "query": "expire session",
  "root": "/work/app",
  "files": 2,
  "chunks": 4,
  "tokens": 32,
  "results": [
    {
      "file": "src/session.js",
      "name": "expireSession",
      "kind": "method",
      "parent": "SessionStore",
      "startLine": 6,
      "endLine": 8,
      "score": 2.527,
      "tokens": 14,
      "text": "  expireSession(id) {\n    this.sessions.delete(id);\n  }"
    },
    {
      "file": "src/session.js",
      "name": null,
      "kind": "window",
      "startLine": 1,
      "endLine": 1,
      "score": 0.5594,
      "tokens": 5,
      "text": "export class SessionStore {"
    },
    {
      "file": "src/session.js",
      "name": "constructor",
      "kind": "method",
      "parent": "SessionStore",
      "startLine": 2,
      "endLine": 4,
      "score": 0.524,
      "tokens": 13,
      "text": "  constructor() {\n    this.sessions = new Map();\n  }"
    }
  ]
}
```

The index is kept in memory per project and rebuilt only for files whose modification time or
size changed, so later queries are fast. `regex` (the default) and `substring` perform line-level
matching.

### `get_symbol`

The full source of a method, function or class, with its file and line range. Exact names are
tried first, then a case-insensitive match; `Class.method` (or `Class::method`, `Class#method`)
narrows to the methods of a class (for Go, of the receiver type). Every match is listed (up to
10, within 20 000 tokens of source). When nothing matches, similar names come back as
`suggestions`.

```json
{ "name": "get_symbol", "arguments": { "path": "/work/app", "name": "SessionStore.expireSession" } }
```

```json
{
  "query": "SessionStore.expireSession",
  "match": "exact",
  "total": 1,
  "symbols": [
    {
      "name": "expireSession",
      "kind": "method",
      "parent": "SessionStore",
      "file": "src/session.js",
      "startLine": 6,
      "endLine": 8,
      "tokens": 14,
      "source": "  expireSession(id) {\n    this.sessions.delete(id);\n  }"
    }
  ]
}
```

A miss looks like `{ "match": "none", "total": 0, "symbols": [], "suggestions": [{ "name":
"expireSession", "kind": "method", "parent": "SessionStore", "file": "src/session.js",
"startLine": 6 }] }`. `file` restricts the lookup to one project-relative file.

Both tools use the Scanner, so `.gitignore`, `.contextignore` and `.contextinclude` apply, and
both redact secrets in the code they return unless `redact: false` is passed.

## Sandbox

Every tool's `path` must name an existing directory (`list_methods` also accepts a file);
anything else is an error instead of an empty analysis.

With `--root <dir>` (or the `CTXMAN_MCP_ROOT` environment variable; `--root` wins) the server
also:

- rejects any tool `path` (and every `repos` entry and `analyzerDb` path) outside `<dir>` after
  resolving symlinks, so `..`, absolute paths elsewhere and symlinks pointing out are refused;
- resolves relative paths against `<dir>`, and uses `<dir>` when a tool call has no `path`;
- applies the same rule to the `projectPath` and `filePath` arguments of the prompts;
- serves `file://codebase/...` resources from `<dir>`;
- limits `git_diff` to `<dir>` (`git diff <branch> -- .`) when the repository is larger.

```bash
ctxman mcp --root ~/code/my-project
ctxman mcp install --client claude-desktop --root ~/code/my-project
```

Without `--root` the server behaves as before: any existing directory the server process can
read is allowed.

## Limits

- Configuration files with comments (JSONC) are not rewritten; use `config` and edit by hand.
- Claude Code user scope, VS Code user level and Windsurf (without `--file`) are print-only.
- The entry holds the absolute path of the Node.js binary; re-run `install --force` after
  changing Node.js versions, or use `--npx`.
- `--root` checks the paths given to ctxman's tools and prompts. A tool that runs git can still
  show history of the repository that contains the root; only `git_diff` is narrowed to it.
- Ranked search and `get_symbol` use the regex method analyzers: languages they do not cover
  are searched by line windows only, and an unusual construct (for example a regex literal that
  contains braces) can make a method's range too long or too short.
- The per-project index lives in the server's memory (file contents of up to 1 MiB per file,
  for the 8 most recently searched projects); the first query on a large project reads every
  file (about 1 s for 400 files).
