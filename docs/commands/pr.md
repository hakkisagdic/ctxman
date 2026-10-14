# `ctxman pr` — pull-request review context

`ctxman pr` turns a branch (or your uncommitted changes) into one document an LLM can review:
what changed, why, the full source of every method the change touches, the diff, and the tests
that cover it. Your question goes last, after the long material, which is where long-context
models answer best.

```bash
ctxman pr                                  # current branch against the default branch
ctxman pr --base main --head feature/login -o review.md
ctxman pr --working --ask "Anything risky in these changes?"
ctxman pr --budget 16k --style xml --with-tests --copy
```

## What is compared

| Mode        | Command                           | Compared                                                                 |
| ----------- | --------------------------------- | ------------------------------------------------------------------------ |
| Branch      | `ctxman pr [--base B] [--head H]` | `git merge-base B H` .. `H` (what a pull request shows)                  |
| Staged      | `ctxman pr --staged`              | the index against `HEAD` (or against the merge base with `--base`)       |
| Uncommitted | `ctxman pr --working`             | the working tree, untracked files included, against `HEAD` (or `--base`) |

- `--head` defaults to `HEAD`.
- `--base` defaults to the remote default branch (`origin/HEAD`, e.g. `origin/main`) when it
  is set, else `main`, else `master`.
- `--working --base main` shows everything your branch would bring into `main`, including
  work you have not committed yet.
- A path argument inside the repository limits the change to that directory:
  `ctxman pr packages/api`. The commit log then lists only commits that touch it, and related
  tests are searched in it.

Refs are checked before git runs: only letters, digits and `/ - _ . @ ^ ~` are accepted and a
ref may not start with `-`, so `--base '--output=/tmp/x'` or `--base '$(touch x)'` is refused.
git is always run with an argument list, never through a shell.

## Sections

The output has these sections, in this order:

1. **Summary** — base, head and merge base (short SHAs), commit count, files changed by status,
   added/removed lines, changed/deleted method counts, related tests, a heuristic impact level,
   tokens per section and, with `--budget`, what was dropped.
2. **Commits** — oldest first: short SHA, subject, author, date and the message body.
3. **Changed files** — status (added, modified, deleted, renamed with similarity, copied),
   path (old → new for renames) and added/removed lines.
4. **Changed methods** — every method whose lines the diff touches, with file, name, line
   range at head, whether it is new (`added`) or existed at the base (`modified`), and its full
   current source. A change inside a nested function is reported once, on the outer method.
   Then **deleted methods**: methods found in the base version of a file (read with
   `git show base:path`) that the head version no longer has, with their line range at base.
5. **Diff** — the unified diff (`--unified N` context lines, default 3; `--no-diff` leaves it
   out).
6. **Related tests** — test files that:
   - are named after a changed file (`calc.js` ↔ `calc.test.js`, `calc.spec.ts`,
     `__tests__/calc.js`, `test_calc.py`, `calc_test.py`, `calc_test.go`, `CalcTest.java`,
     `calc_spec.rb`; `index.js` / `__init__.py` match by directory name),
   - are Go tests in the same package directory as a changed `.go` file,
   - import a changed module (JavaScript/TypeScript `import`/`require`/`vi.mock`, Python
     `import`/`from ... import`),
   - mention a changed class (Java, Kotlin, C#, Scala, Swift, PHP), or call a changed or deleted
     method (`name(`; names that many tests call, and short or generic names such as `init`
     or `render`, are ignored),
   - or are themselves part of the change.

   Each test is listed with the reasons, strongest matches first (at most 50). With
   `--with-tests` their contents follow.

7. **Changed file contents** — with `--with-files`, the full head version of every changed file
   that is not deleted, binary or larger than 1 MiB.
8. **Instructions / Question** — `--instructions FILE` and `--ask "QUESTION"`, last.

## Options

| Option                | Description                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `--base REF`          | Base branch or commit                                                       |
| `--head REF`          | Head branch or commit (default `HEAD`)                                      |
| `--staged`            | Compare the index instead of a commit                                       |
| `--working`           | Compare the working tree, untracked files included                          |
| `-U, --unified N`     | Context lines in the diff (default 3)                                       |
| `--no-diff`           | Leave out the unified diff                                                  |
| `--with-tests`        | Include the related tests' contents                                         |
| `--with-files`        | Include the changed files' full contents                                    |
| `--ask "QUESTION"`    | Append a question at the end                                                |
| `--instructions FILE` | Append the instructions in FILE at the end                                  |
| `--budget TOKENS`     | Keep the output under TOKENS (`8000`, `8k`)                                 |
| `--no-redact`         | Do not mask secrets                                                         |
| `--style STYLE`       | `markdown` (default), `xml` or `json`; `--json` is short for `--style json` |
| `-o, --output FILE`   | Write to FILE instead of stdout                                             |
| `--copy`              | Copy to the clipboard instead of stdout (falls back to stdout)              |
| `-q, --quiet`         | No summary on stderr                                                        |

Options also accept the `--option=value` form.

stdout carries only the context, so `ctxman pr | llm` and `ctxman pr > review.md` work; the
run summary (sizes, budget decisions, redactions, warnings) goes to stderr.

## Token budget

`--budget` counts tokens (tiktoken `cl100k_base`, or the estimate when tiktoken is not
installed) on the rendered output and, while it is over, drops material from the least to the
most important:

1. full file contents (largest first)
2. related test contents (largest first)
3. related test paths (weakest matches first)
4. per-file diffs (largest first — lock files and generated files usually go first)
5. method sources (largest first; the methods stay listed by name and line range)
6. the changed methods list
7. commit message bodies, then the commit log
8. the changed files list

The summary and the question are never dropped. The summary says what was dropped; when even
the summary and the question exceed the budget, the output says it is still over and the run
prints a warning.

```text
$ ctxman pr --with-files --with-tests --budget 1200 -o review.md
ctxman pr: feature into main (merge base 7ab10f8)
  2 commit(s), 7 file(s) (+9 -9), 4 changed method(s), 1 deleted, 3 related test(s)
  1,155 tokens (markdown): summary 238, commits 62, files 153, methods 252, diff 448
  Budget 1,200: within budget
    dropped full contents of 6 file(s) (lib/store.py, src/calc.js, src/label.js, server/server.go, docs/handbook.md, +1 more)
    dropped contents of 3 related test(s) (src/calc.test.js, server/server_test.go, tests/test_store.py)
    dropped 3 related test path(s)
    dropped diff of 1 file(s) (src/calc.js)
  Redacted 2 secret(s): 2 aws-access-key-id
  Written to /home/me/project/review.md
```

## Styles

**Markdown** (default): headings per section, a table of changed files, fenced code blocks
(the fence grows when the code itself contains backticks).

**XML**: simple tags per section (`<summary>`, `<commits>`, `<changed_files>`,
`<changed_methods>`, `<diff>`, `<related_tests>`, `<changed_file_contents>`, `<instructions>`,
`<question>`) inside `<pr_context>`. Method, test and file bodies use the document layout from
Anthropic's long-context guidance, numbered across the whole output:

```xml
<documents>
<document index="1">
<source>src/calc.js:1-6 (add, modified)</source>
<document_content>
export function add(a, b) {
  ...
}
</document_content>
</document>
</documents>
```

Bodies are not entity-escaped, so the model reads the code as written; treat the result as
prompt markup, not as input for an XML parser.

**JSON**: one object with `summary`, `commits`, `files`, `methods` (`changed`, `deleted`),
`diff` (per file), `relatedTests`, `fileContents` and `request`; sections that are empty or
dropped are absent.

## Filters and redaction

- `.gitignore`, `.contextignore` and `.contextinclude` (in the project directory) decide which
  changed files have their diff, methods and contents included. Excluded files are still listed
  in the summary and the file list, marked with the filter that excluded them. Files in
  `node_modules`, `dist`, `build`, `coverage` and VCS directories are treated the same way.
- Secrets in the diff, method sources, file and test contents and commit messages are replaced
  with `[REDACTED:<type>]` (AWS keys, GitHub/GitLab/Slack/Stripe/Google/Anthropic/OpenAI/npm
  tokens, private keys). `--no-redact` turns this off.

## Library and MCP

```js
import { buildPrContext } from 'ctxman';

const result = await buildPrContext('/path/to/repo', {
  base: 'main',
  head: 'feature/login',
  style: 'xml',
  budget: 16000,
  withTests: true,
  ask: 'Is the session handling safe?',
});
console.log(result.output); // the rendered context
console.log(result.tokens, result.sections, result.budget?.dropped);
console.log(result.methods.changed, result.methods.deleted, result.relatedTests);
```

Options mirror the command line (`base`, `head`, `staged`, `working`, `unified`, `diff`,
`withTests`, `withFiles`, `ask`, `instructions` (text), `budget`, `style`, `redact`). The
result also carries the parsed `commits`, `files`, `stats`, `redactions` and `warnings`.

The MCP server exposes the same as the `pr_context` tool with `path` (required), `base`, `head`,
`budget` and `style`.

## Limits

- Methods are found with ctxman's regex analyzers, not a parser: a call such as
  `defineConfig({...})` can be taken for a method, and Go functions are detected only when
  exported (capitalised). Files over 1 MiB are not analysed.
- A method that is renamed shows up as one added and one deleted method.
- Related tests come from names, imports and references, not from coverage data; a test that
  reaches the code indirectly is not found. Import resolution covers relative JavaScript and
  TypeScript specifiers and Python modules; other languages rely on names and references.
  With more than 3,000 test files only names and Go packages are compared.
- A shallow clone may not contain the merge base; fetch more history or pass `--base`.
- The token counts in the summary are approximate (the summary contains its own count).
