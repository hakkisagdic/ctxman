# `ctxman why` — why is the code like this?

`ctxman why` collects everything the repository knows about why a file, a function or a range
of lines looks the way it does, and renders it as one document for an LLM (or a person): the
commits that shaped it with their full messages, the issues, pull requests and tickets they
reference (and optionally their GitHub or GitLab discussions with `--discussions`), institutional
memory citations from `@plansmithai/analyzer` SQLite databases (`--analyzer` / `--analyzer-db`),
optional local AI-assistant chat citations via `keyflip` (`--chats`),
who wrote which lines, the files that change together with it, the docs, ADRs, changelog entries
and comments that mention it, TODO-style notes inside it and the tests that reference it. By
default everything comes from the local git history, `.plansmith/analyzer.sqlite` (when present),
and the working tree with no network access; passing `--discussions` opts into fetching referenced
issue/PR/MR context, and passing `--chats` opts into local `keyflip` chat search when allowed by policy.

```bash
ctxman why src/cart.js:total                                       # a function or method (offline)
ctxman why src/cart.js:total --discussions                         # enrich referenced GitHub/GitLab issues & PRs
ctxman why src/cart.js:total --chats                               # include local AI-assistant chats via keyflip
ctxman why src/cart.js:total --analyzer-db .plansmith/analyzer.sqlite # attach institutional memory citations
ctxman why src/cart.js#L40-L72 --patches                           # a line range, with each commit's diff
ctxman why lib/server.js --since "1 year ago"                      # a whole file, following renames
ctxman why billing-api/src/invoice.js:createInvoice --repo ../billing-api --repo ../checkout-web
ctxman why src/cart.js:Cart.total --ask "Why do we round here?" --copy
```

> From a local checkout, run `node bin/cli.js why <target>` (the legacy `ctxman.js` script does not dispatch `why`).

## Targets

Paths are relative to the current directory (or prefixed with `<alias>/` when `--repo` is passed)
and must lie inside a repository in the workspace.

| Target                      | Meaning                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `src/cart.js`               | The whole file; history follows renames (`git log --follow`)          |
| `src/cart.js:total`         | A function, method or class, with its doc comment and decorators      |
| `src/cart.js:Cart.total`    | A method of a class (`Cart::total` and `Cart#total` work too)         |
| `src/cart.js#L40-L72`       | A line range (GitHub style); `#L40` is a single line                  |
| `src/cart.js:40-72`         | The same range, compiler style                                        |
| `<alias>/src/cart.js:total` | Target inside a named repository of a multi-repo workspace (`--repo`) |

Symbols are found with ctxman's method analyzers (the 14 languages of `ctxman -m`) plus a
scan for classes, structs, interfaces, traits, `impl` blocks, modules and similar containers.
`Class.method` looks for the method inside the class body, and also finds members defined
outside it (Go receivers, C++ `Type::method`, JavaScript `Type.prototype.method =`). When
several definitions share the name, the first is used and a warning names the count. A plain
name no analyzer recognises (for example a SQL function) falls back to git's own funcname
matching (`git log -L :name:file`); the warning says the range is approximate. An unknown name
fails with up to five close matches:

```text
$ ctxman why src/cart.js:totl
ctxman why: Symbol totl not found in src/cart.js. Did you mean: total?
```

## Multi-Repository Workspaces (`--repo <dir>`)

Pass `--repo <dir>` (repeatable; `--repo=<dir>` works too) to explain code across a multi-repo
workspace:

- Targets can be `<alias>/<path>[:symbol|#L10-L40]` or a relative path unambiguous across the
  workspace. You can even run `ctxman why` from a non-git parent directory as long as the
  resolved target belongs to one of the `--repo` git repositories.
- `git log`, `git blame -w`, and co-change coupling run inside the target file's owning
  repository, while **Related text** (ADRs, changelogs, docs, code comments) and **Tests** are
  discovered across every repository in the workspace and reported under `<alias>/<path>`.
- Every repository's `.ctxman/policy.json` is enforced: denied targets exit with code `3`, and
  denied files in sibling repositories are omitted from cross-repo related text and tests.

## What the document contains

Sections appear in this order; empty ones are left out.

1. **Target** — path, symbol and kind, line range, revision, the web URL of `origin` when it
   is a GitHub, GitLab or Bitbucket remote, and the source of the target (secrets masked).
2. **History** — the commits that changed the lines, newest first (`git log -L
<start>,<end>:<file>`; for a whole file `git log --follow`), each with short hash, author
   date (UTC), author, the references it mentions and its full message body. `--patches` adds
   each commit's diff of the target. When the history was cut by `--limit`, the section says
   so.
3. **References** — mined from the commit messages, each with the commits that mention it:
   - issues and pull requests: `#12`, `owner/repo#12`, `GH-12`, closing keywords
     (`fixes #12`, `closes`, `resolves`), a squash-merge suffix `(#45)` and
     `Merge pull request #45` (pull requests), GitLab `!45` (merge requests). With a GitHub,
     GitLab or Bitbucket `origin` each gets a web link (`/pull/45`, `/-/merge_requests/45`,
     `/pull-requests/45`, `/issues/12`);
   - ticket keys such as `ABC-34` (Jira, Linear, YouTrack style; `UTF-8`, `SHA-256`, `RFC-1234`
     and similar are ignored), CVE ids and URLs (credentials removed);
   - `Co-authored-by:` and `Reviewed-by:` trailers.
4. **Discussions & PR/MR Evidence** (`--discussions`) — when opted in, enriches referenced GitHub
   issues/PRs and GitLab issues/MRs, and walks each target commit through GitHub
   (`GET /repos/{owner}/{repo}/commits/{sha}/pulls` -> PR body, `/pulls/{n}/comments` inline diff
   comments, `/pulls/{n}/reviews`, and closed issues referenced by closing keywords) or GitLab
   (`repository/commits/{sha}/merge_requests` -> MR notes excluding system notes, and
   `closes_issues`). Responses are cached locally in `.ctxman/evidence/github.sqlite` (`node:sqlite`)
   using `ETag` / `If-None-Match` (when `--since` is set, entries fetched at or after `--since` are
   reused without network; older entries are revalidated). Supports GitHub Enterprise (`/api/v3`) and
   self-hosted GitLab (`/api/v4`). Tokens are read in order `GITHUB_TOKEN`, `GH_TOKEN`,
   `gh auth token` (2 s timeout) for GitHub and `GITLAB_TOKEN`, `GL_TOKEN` for GitLab, and are never
   cached, logged, or written to output. Missing tokens, unreachable hosts, or HTTP 403/429 rate
   limits degrade gracefully with partial/cached citations and `warnings[]`. Note: remotes whose
   hostname does not contain `github` or `gitlab` default to `provider: null` and require
   `--provider github|gitlab` (or `CTXMAN_GIT_PROVIDER` / `CTXMAN_GITHUB_API_URL` /
   `CTXMAN_GITLAB_API_URL`).
5. **Institutional Memory Citations** (`--analyzer` / `--analyzer-db <path>`) — queries the
   `@plansmithai/analyzer` SQLite `documents` table (`.plansmith/analyzer.sqlite` by default when
   present) for commits, pull requests, issues, Slack threads, Linear issues, and Jira tickets
   referencing the target file, symbol, or commit SHAs, with secret redaction applied.
6. **Local Chats** (`--chats`, `--chats-weak`) — disabled by default in both the CLI and `.ctxman/policy.json`.
   When opted in and allowed by `sources.chat.enabled: true`, searches local AI-assistant
   conversations exclusively through the `keyflip` CLI (`conv search ... --json --limit N --no-subagents`),
   filters hits client-side to the repository root (`hit.cwd`), redacts secrets before capping
   excerpts at 800 characters, and emits `kind: "chat"` citations (`ref: "<id>#<chunk>"`) with
   attached `links[]` (`path`, `symbol`, `sha`, `time`) from `linkChatToCode`. By default `--chats`
   keeps only parts with strong links (`path`, `symbol`, `sha`) to the target; `--chats-weak`
   implies `--chats` and also retains time-only matches within 24 hours of a commit. When
   `keyflip` is absent from `PATH`, `--chats` degrades silently to identical output without `--chats`.
   Conversation text is never cached to disk, never logged in audit files, and never exposed via
   MCP `explain_history` or REST `GET /api/v1/why`.
7. **Ownership** — `git blame -w` of the current lines (honouring `.git-blame-ignore-revs`
   when the project has one): lines, share, commits and last change per author. Uncommitted
   lines count as `(uncommitted)`.
8. **Co-change coupling** — files that changed in the same commits as the target file, with
   how often and the confidence (co-changes / changes of the target). The last 500 non-merge
   commits of the file are examined (`--coupling-window`); commits touching more than 50 files
   (formatting runs, mass renames, vendored updates) are skipped as noise. The file's own
   former names are not listed; files that no longer exist are marked. Top 10.
9. **Related text** — lines of tracked files that mention the symbol (or the file name when
   the target is a file or a range; `cart/index.js` for generic names like `index.js`):
   ADRs (files under `adr/` or `decisions/`, or named like `adr-0003.md`) first, then changelogs, other docs
   (Markdown, AsciiDoc, reStructuredText, text) and code comments, each with the nearest
   heading. Mentions in code that are not comments are left out. At most 3 per file, 20 in all.
10. **Notes in the target** — `TODO`, `FIXME`, `HACK`, `XXX` and `NOTE` comments inside the
    range, with the author in `TODO(alice):` form.
11. **Tests** — test files (`test/`, `__tests__/`, `*.test.*`, `*_test.go`, `test_*.py`,
    `FooTest.java`, ...) that mention the symbol or the file, or import the module; up to 10,
    with up to 5 matching lines each.
12. **Sources** — when evidence citations exist, a trailing `Sources:` list (Markdown) or
    `<sources>` block (XML) resolving each inline `[n]` marker on commits, discussions, and
    comments to its uniform `Evidence` record.
13. **Question** — `--ask`, last, with an instruction to cite commits, references and paths and
    to say when the history does not explain something.

## Options

| Option                 | Description                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- |
| `--repo DIR`           | Add a repository to a multi-repo workspace (repeatable)                      |
| `-n, --limit N`        | Commits to include (default 20)                                              |
| `--since DATE`         | Only commits after DATE (`2024-01-01`, `"6 months ago"`)                     |
| `--rev REF`            | Explain the code as of REF instead of the working tree                       |
| `--patches`            | Include each commit's diff of the target                                     |
| `--chats`              | Search local AI-assistant chats via `keyflip` (default off; requires policy) |
| `--chats-weak`         | Include time-only chat matches within 24 h of a commit (implies `--chats`)   |
| `--discussions`        | Fetch referenced GitHub/GitLab issue, PR and MR discussions and evidence     |
| `--provider PROVIDER`  | Override remote provider (`github` or `gitlab`) for custom hostnames         |
| `--max-discussions N`  | Maximum remote discussions to fetch (default 10)                             |
| `--max-comments N`     | Maximum comments fetched per discussion (default 5)                          |
| `--source-timeout MS`  | Per-source timeout in ms for evidence connectors (default 5000)              |
| `--analyzer`           | Query `.plansmith/analyzer.sqlite` for institutional memory citations        |
| `--analyzer-db <path>` | Explicit path to `@plansmithai/analyzer` SQLite database file or directory   |
| `--coupling-window N`  | Commits of the file examined for co-changes (default 500, `0` turns off)     |
| `--budget TOKENS`      | Keep the output within TOKENS (`8000`, `8k`)                                 |
| `--style STYLE`        | `markdown` (default), `xml` or `json`; `--json` is short for json            |
| `--ask "QUESTION"`     | Append a question at the end                                                 |
| `-o, --output FILE`    | Write to FILE instead of stdout                                              |
| `--copy`               | Copy to the clipboard instead of stdout (falls back to stdout)               |
| `--no-redact`          | Do not mask secrets                                                          |
| `-h, --help`           | Show the help                                                                |

Exit codes: `0` success, `1` the target cannot be explained (not a git repository, file
outside the repository or not tracked, symbol not found, unknown revision, budget too small),
`2` a usage error (unknown option; malformed number, style, date or revision), `3` target
denied by export policy.

## Token budget

`--budget` counts tokens on the rendered output (tiktoken `cl100k_base`, or the estimate when
tiktoken is not installed) and never exceeds the budget. While the document is too long it
drops, in this order:

1. patches,
2. remote discussions,
3. institutional citations,
4. evidence citations,
5. related text,
6. tests,
7. co-change details,
8. older commits (the newest one stays),

keeping as many items of the last section it touches as still fit. Only when that is not
enough does it drop references, notes, blame authors, source lines and finally the last
commit.

## Styles

- **Markdown** (default): the sections above (plus `Workspace repositories` when `--repo` is
  used), with fenced source and diffs (the fence grows when the code contains backticks),
  commit/discussion bodies as quotes, `[n]` citation markers on cited findings, and a trailing
  `Sources:` list.
- **XML**: `<why_context>` with `<repositories>` (when multi-repo), `<target>`, `<history>` /
  `<commit>` (with `citation="[n]"`), `<references>`, `<discussions>` (when populated, with
  `citation="[n]"`), `<institutional_citations>` (when populated), `<ownership>`, `<coupling>`,
  `<related>`, `<notes>`, `<tests>`, `<sources>` (when populated, `<evidence marker="[n]" ...>`)
  and `<question>`; text is entity-escaped.
- **JSON**: the collected data (`repos`, `target`, `repository`, `history`, `references`,
  `discussions`, `institutionalCitations`, `citations`, `ownership`, `coupling`, `related`, `notes`,
  `tests`, `warnings`, `trimmed`, `question`), where `citations` holds uniform `Evidence` records
  (commits, optional remote discussions/review comments, and custom `evidenceSources`, each with a
  redacted excerpt capped at 800 characters and token count) and cited findings carry `citation`
  and `citationId`. When `.ctxman/policy.json` enables `audit`, `ctxman why` records one export
  event via `recordExport` (default off).

## Library and MCP

```js
import {
  explainHistory,
  queryAnalyzerCitations,
  createChatEvidenceSource,
  linkChatToCode,
  normalizeEvidence,
  runSources,
  renderCitations,
} from 'ctxman';

const result = await explainHistory('/path/to/repo', 'src/cart.js:total', {
  limit: 10,
  since: '1 year ago',
  patches: true,
  discussions: true,
  chats: false, // opt in when policy allows sources.chat.enabled: true
  chatsWeak: false, // opt in to include 24 h time-proximity matches
  maxDiscussions: 5,
  analyzer: true,
  analyzerDb: '/path/to/repo/.plansmith/analyzer.sqlite',
  repos: ['../billing-api', '../checkout-web'], // optional multi-repo workspace
  style: 'markdown', // or 'xml', 'json'
  budget: 8000,
  ask: 'Why do we round here?',
});
console.log(result.text);
const { citations } = result.data;
process.stdout.write(`${renderCitations(citations)}\n`);
console.log(result.data.institutionalCitations);
```

The MCP server exposes `explain_history` with `path`, `target`, `limit`, `budget`, `since`,
`patches`, `discussions`, `maxDiscussions`, `analyzer`, `analyzerDb`, and `repos`.
