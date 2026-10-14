# `ctxman why` — why is the code like this?

`ctxman why` collects everything the repository knows about why a file, a function or a range
of lines looks the way it does, and renders it as one document for an LLM (or a person): the
commits that shaped it with their full messages, the issues, pull requests and tickets they
reference, who wrote which lines, the files that change together with it, the docs, ADRs,
changelog entries and comments that mention it, TODO-style notes inside it and the tests that
reference it. Everything comes from the local git history and the working tree: no network
access, no API tokens.

```bash
ctxman why src/cart.js:total                     # a function or method
ctxman why src/cart.js#L40-L72 --patches         # a line range, with each commit's diff
ctxman why lib/server.js --since "1 year ago"    # a whole file, following renames
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
4. **Ownership** — `git blame -w` of the current lines (honouring `.git-blame-ignore-revs`
   when the project has one): lines, share, commits and last change per author. Uncommitted
   lines count as `(uncommitted)`.
5. **Co-change coupling** — files that changed in the same commits as the target file, with
   how often and the confidence (co-changes / changes of the target). The last 500 non-merge
   commits of the file are examined (`--coupling-window`); commits touching more than 50 files
   (formatting runs, mass renames, vendored updates) are skipped as noise. The file's own
   former names are not listed; files that no longer exist are marked. Top 10.
6. **Related text** — lines of tracked files that mention the symbol (or the file name when
   the target is a file or a range; `cart/index.js` for generic names like `index.js`):
   ADRs (files under `adr/` or `decisions/`, or named like `adr-0003.md`) first, then changelogs, other docs
   (Markdown, AsciiDoc, reStructuredText, text) and code comments, each with the nearest
   heading. Mentions in code that are not comments are left out. At most 3 per file, 20 in all.
7. **Notes in the target** — `TODO`, `FIXME`, `HACK`, `XXX` and `NOTE` comments inside the
   range, with the author in `TODO(alice):` form.
8. **Tests** — test files (`test/`, `__tests__/`, `*.test.*`, `*_test.go`, `test_*.py`,
   `FooTest.java`, ...) that mention the symbol or the file, or import the module; up to 10,
   with up to 5 matching lines each.
9. **Question** — `--ask`, last, with an instruction to cite commits, references and paths and
   to say when the history does not explain something.

Example (trimmed):

```markdown
# Why: `total` in `src/cart.js`

## History

3 commits that changed lines 7-14 (`git log -L`), newest first.

### 2. fix(cart): round totals to cents (#12)

`89bfc86` · 2024-01-02 · Alice · refs: #12, ABC-34

> Floating point totals showed 0.30000000000000004 to customers.
> Fixes #12, see ABC-34 and https://example.com/rounding-notes.
>
> Co-authored-by: Bob <bob@example.com>

## References

- Pull request #12 (fixes / closes): https://github.com/acme/shop/pull/12 (89bfc86)
- Ticket ABC-34 (89bfc86)

## Related text

- `docs/adr/0003-rounding.md:5` (ADR, "Decision"): We round in `total()` only, never in helpers.
- `CHANGELOG.md:5` (changelog, "1.1.0"): - `total` now rounds to cents (#12)
```

stdout carries only the document, so `ctxman why src/cart.js:total | llm` works. Warnings and
a one-line summary go to stderr:

```text
ctxman why: src/cart.js:total (lines 7-14): 3 commits, 7 references, 2 authors, 5 co-changed files, 3 related snippets, 1 note, 1 test file; 1,008 tokens
```

## Options

| Option                | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| `-n, --limit N`       | Commits to include (default 20)                                          |
| `--since DATE`        | Only commits after DATE (`2024-01-01`, `"6 months ago"`)                 |
| `--rev REF`           | Explain the code as of REF instead of the working tree                   |
| `--patches`           | Include each commit's diff of the target                                 |
| `--coupling-window N` | Commits of the file examined for co-changes (default 500, `0` turns off) |
| `--budget TOKENS`     | Keep the output within TOKENS (`8000`, `8k`)                             |
| `--style STYLE`       | `markdown` (default), `xml` or `json`; `--json` is short for json        |
| `--ask "QUESTION"`    | Append a question at the end                                             |
| `-o, --output FILE`   | Write to FILE instead of stdout                                          |
| `--copy`              | Copy to the clipboard instead of stdout (falls back to stdout)           |
| `--no-redact`         | Do not mask secrets                                                      |
| `-h, --help`          | Show the help                                                            |

Exit codes: `0` success, `1` the target cannot be explained (not a git repository, file
outside the repository or not tracked, symbol not found, unknown revision, budget too small),
`2` a usage error (unknown option; malformed number, style, date or revision).

## Token budget

`--budget` counts tokens on the rendered output (tiktoken `cl100k_base`, or the estimate when
tiktoken is not installed) and never exceeds the budget. While the document is too long it
drops, in this order:

1. patches,
2. related text,
3. tests,
4. co-change details,
5. older commits (the newest one stays),

keeping as many items of the last section it touches as still fit. Only when that is not
enough does it drop references, notes, blame authors, source lines and finally the last
commit. The document then starts with `> Trimmed to fit N tokens: omitted ...`. When even the
target summary does not fit, the command fails with the number of tokens it needs.

## Styles

- **Markdown** (default): the sections above, with fenced source and diffs (the fence grows
  when the code contains backticks) and commit bodies as quotes.
- **XML**: `<why_context>` with `<target>`, `<history>` / `<commit>`, `<references>`,
  `<ownership>`, `<coupling>`, `<related>`, `<notes>`, `<tests>` and `<question>`; text is
  entity-escaped.
- **JSON**: the collected data (`target`, `repository`, `history`, `references`, `ownership`,
  `coupling`, `related`, `notes`, `tests`, `warnings`, `trimmed`, `question`).

## Working tree, revisions and shallow clones

- With uncommitted changes, the lines you name are mapped onto `HEAD` before `git log -L`
  reads them (a warning says which lines). Lines that are new and uncommitted have no history.
  A file that is not tracked is refused; a file staged but never committed shows its source,
  blame and notes without history.
- `--rev REF` reads the file, its history, blame and co-changes as of `REF`. Related text and
  tests are still searched in the working tree. For a file that no longer exists, the error
  names the commit that deleted or renamed it and the `--rev` to use.
- In a shallow clone the document warns that history is truncated, and marks the oldest commit
  it has as the **shallow clone boundary**: git shows that commit as if it created the code.
  `git fetch --unshallow` fetches the rest.

## Filters, redaction and safety

- `.gitignore`, `.contextignore` and `.contextinclude` apply: an excluded target is explained
  without its source (and without patches), and excluded files do not appear in co-changes,
  related text or tests. Files the scanner never exports (binary files, `.env`, `*.pem` and
  similar) are treated the same way.
- Secrets in the source, commit messages, patches and snippets are replaced with
  `[REDACTED:<type>]`; a warning counts them. `--no-redact` turns this off.
- Targets must stay inside the repository, also after following symlinks; `.git/` is refused.
  `--rev` is checked with the shared ref rule (letters, digits and `/ - _ . @ ^ ~`, no leading
  `-`) and must name a commit. git always runs with an argument list, never through a shell,
  and paths reach git as literal pathspecs.

## Library and MCP

```js
import { explainHistory } from 'ctxman';

const result = await explainHistory('/path/to/repo', 'src/cart.js:total', {
  limit: 10,
  since: '1 year ago',
  patches: true,
  style: 'markdown', // or 'xml', 'json'
  budget: 8000,
  ask: 'Why do we round here?',
});
console.log(result.text); // the rendered document
console.log(result.tokens, result.omitted, result.warnings);
console.log(result.data.history.commits, result.data.references.issues);
```

The target can also be an object: `{ file: 'src/cart.js', symbol: 'total' }` or
`{ file: 'src/cart.js', startLine: 40, endLine: 72 }`. Further options: `rev`, `redact`,
`couplingWindow`, `couplingTop` (default 10), `maxFilesPerCommit` (default 50), `maxRelated`
(default 20), `maxTests` (default 10) and `cwd` (where relative targets start; default the
root). Target paths must stay inside `root`. Expected failures throw an `Error` with a `code`:
`NOT_A_GIT_REPO`, `PATH_OUTSIDE_ROOT`, `FILE_NOT_FOUND`, `NOT_A_FILE`, `NOT_TRACKED`,
`SYMBOL_NOT_FOUND` (with `candidates`), `INVALID_SYMBOL`, `INVALID_RANGE`, `BINARY_TARGET`,
`INVALID_REF`, `UNKNOWN_REF`, `INVALID_OPTION`, `BUDGET_TOO_SMALL` (with `minimum`).

The MCP server exposes the same as the `explain_history` tool: `path` (project root) and
`target` (required), `limit`, `budget` (default 20000), `since` and `patches`. It returns the
Markdown document; with `ctxman mcp --root DIR` both `path` and the target must lie inside
`DIR`.

## Limits

- Symbols are found with regular expressions, not a parser: unusual formatting can hide a
  definition or give it a wrong end line. A line range always works.
- `git log -L` tracks lines through edits but not through moves to another file; a symbol
  moved from another file shows history from the move onwards. Whole-file history follows
  renames.
- References are only as good as the commit messages: squash merges that keep the `(#45)`
  suffix link to their pull request, plain merges without it do not. Links are built from the
  `origin` URL and are not checked online; self-hosted GitLab and Bitbucket hosts are
  recognised when their name contains `gitlab` or `bitbucket`.
- Related text and tests are found by name (`git grep`, tracked files only), so common names
  such as `get` or `run` produce noise and renamed symbols are missed.
