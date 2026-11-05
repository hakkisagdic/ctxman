# `ctxman why` — why is the code like this?

`ctxman why` collects everything the repository knows about why a file, a function or a range
of lines looks the way it does, and renders it as one document for an LLM (or a person): the
commits that shaped it with their full messages, the issues, pull requests and tickets they
reference (and optionally their GitHub or GitLab discussions with `--discussions`), institutional
memory citations from `@plansmithai/analyzer` SQLite databases (`--analyzer` / `--analyzer-db`),
who wrote which lines, the files that change together with it, the docs, ADRs, changelog entries
and comments that mention it, TODO-style notes inside it and the tests that reference it. By
default everything comes from the local git history, `.plansmith/analyzer.sqlite` (when present),
and the working tree with no network access; passing `--discussions` opts into fetching referenced
issue/PR/MR context.

```bash
ctxman why src/cart.js:total                                       # a function or method (offline)
ctxman why src/cart.js:total --discussions                         # enrich referenced GitHub/GitLab issues & PRs
ctxman why src/cart.js:total --analyzer-db .plansmith/analyzer.sqlite # attach institutional memory citations
ctxman why src/cart.js#L40-L72 --patches                           # a line range, with each commit's diff
ctxman why lib/server.js --since "1 year ago"                      # a whole file, following renames
ctxman why src/cart.js:Cart.total --ask "Why do we round here?" --copy
```

## Targets

Paths are relative to the current directory and must lie inside the repository.

| Target                   | Meaning                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `src/cart.js`            | The whole file; history follows renames (`git log --follow`)     |
| `src/cart.js:total`      | A function, method or class, with its doc comment and decorators |
| `src/cart.js:Cart.total` | A method of a class (`Cart::total` and `Cart#total` work too)    |
| `src/cart.js#L40-L72`    | A line range (GitHub style); `#L40` is a single line             |
| `src/cart.js:40-72`      | The same range, compiler style                                   |

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
4. **Discussions** (`--discussions`) — when opted in, fetches titles, states, labels,
   descriptions and top comments for referenced GitHub issues/PRs (including GitHub Enterprise
   `/api/v3`) or GitLab issues/MRs (including self-hosted `/api/v4`, ignoring system notes).
   Uses `GITHUB_TOKEN` / `GH_TOKEN` or `GITLAB_TOKEN` / `GL_TOKEN` when present. Network
   failures, missing tokens or rate limits emit a warning without failing the command.
5. **Institutional Memory Citations** (`--analyzer` / `--analyzer-db <path>`) — queries the
   `@plansmithai/analyzer` SQLite `documents` table (`.plansmith/analyzer.sqlite` by default when
   present) for commits, pull requests, issues, Slack threads, Linear issues, and Jira tickets
   referencing the target file, symbol, or commit SHAs, with secret redaction applied.
6. **Ownership** — `git blame -w` of the current lines (honouring `.git-blame-ignore-revs`
   when the project has one): lines, share, commits and last change per author. Uncommitted
   lines count as `(uncommitted)`.
7. **Co-change coupling** — files that changed in the same commits as the target file, with
   how often and the confidence (co-changes / changes of the target). The last 500 non-merge
   commits of the file are examined (`--coupling-window`); commits touching more than 50 files
   (formatting runs, mass renames, vendored updates) are skipped as noise. The file's own
   former names are not listed; files that no longer exist are marked. Top 10.
8. **Related text** — lines of tracked files that mention the symbol (or the file name when
   the target is a file or a range; `cart/index.js` for generic names like `index.js`):
   ADRs (files under `adr/` or `decisions/`, or named like `adr-0003.md`) first, then changelogs, other docs
   (Markdown, AsciiDoc, reStructuredText, text) and code comments, each with the nearest
   heading. Mentions in code that are not comments are left out. At most 3 per file, 20 in all.
9. **Notes in the target** — `TODO`, `FIXME`, `HACK`, `XXX` and `NOTE` comments inside the
   range, with the author in `TODO(alice):` form.
10. **Tests** — test files (`test/`, `__tests__/`, `*.test.*`, `*_test.go`, `test_*.py`,
    `FooTest.java`, ...) that mention the symbol or the file, or import the module; up to 10,
    with up to 5 matching lines each.
11. **Question** — `--ask`, last, with an instruction to cite commits, references and paths and
    to say when the history does not explain something.

## Options

| Option                 | Description                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| `-n, --limit N`        | Commits to include (default 20)                                            |
| `--since DATE`         | Only commits after DATE (`2024-01-01`, `"6 months ago"`)                   |
| `--rev REF`            | Explain the code as of REF instead of the working tree                     |
| `--patches`            | Include each commit's diff of the target                                   |
| `--discussions`        | Fetch referenced GitHub/GitLab issue, PR and MR discussions                |
| `--max-discussions N`  | Maximum remote discussions to fetch (default 10)                           |
| `--max-comments N`     | Maximum comments fetched per discussion (default 5)                        |
| `--analyzer`           | Query `.plansmith/analyzer.sqlite` for institutional memory citations      |
| `--analyzer-db <path>` | Explicit path to `@plansmithai/analyzer` SQLite database file or directory |
| `--coupling-window N`  | Commits of the file examined for co-changes (default 500, `0` turns off)   |
| `--budget TOKENS`      | Keep the output within TOKENS (`8000`, `8k`)                               |
| `--style STYLE`        | `markdown` (default), `xml` or `json`; `--json` is short for json          |
| `--ask "QUESTION"`     | Append a question at the end                                               |
| `-o, --output FILE`    | Write to FILE instead of stdout                                            |
| `--copy`               | Copy to the clipboard instead of stdout (falls back to stdout)             |
| `--no-redact`          | Do not mask secrets                                                        |
| `-h, --help`           | Show the help                                                              |

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
4. related text,
5. tests,
6. co-change details,
7. older commits (the newest one stays),

keeping as many items of the last section it touches as still fit. Only when that is not
enough does it drop references, notes, blame authors, source lines and finally the last
commit.

## Styles

- **Markdown** (default): the sections above, with fenced source and diffs (the fence grows
  when the code contains backticks) and commit/discussion bodies as quotes.
- **XML**: `<why_context>` with `<target>`, `<history>` / `<commit>`, `<references>`,
  `<discussions>` (when populated), `<institutional_citations>` (when populated), `<ownership>`,
  `<coupling>`, `<related>`, `<notes>`, `<tests>` and `<question>`; text is entity-escaped.
- **JSON**: the collected data (`target`, `repository`, `history`, `references`,
  `discussions`, `institutionalCitations`, `ownership`, `coupling`, `related`, `notes`, `tests`,
  `warnings`, `trimmed`, `question`).

## Library and MCP

```js
import { explainHistory, queryAnalyzerCitations } from 'ctxman';

const result = await explainHistory('/path/to/repo', 'src/cart.js:total', {
  limit: 10,
  since: '1 year ago',
  patches: true,
  discussions: true,
  maxDiscussions: 5,
  analyzer: true,
  analyzerDb: '/path/to/repo/.plansmith/analyzer.sqlite',
  style: 'markdown', // or 'xml', 'json'
  budget: 8000,
  ask: 'Why do we round here?',
});
console.log(result.text);
console.log(result.data.institutionalCitations);
```

The MCP server exposes `explain_history` with `path`, `target`, `limit`, `budget`, `since`,
`patches`, `discussions`, `maxDiscussions`, `analyzer`, and `analyzerDb`.
