# `ctxman pack` — file contents in one LLM-ready document

`ctxman pack` puts the contents of a project's files into a single document you can paste
into a chat, attach to a prompt or send through an API: a directory tree, then every file,
then your instructions. The same ignore rules as the rest of ctxman decide which files go
in, secrets are masked, and the result can be compressed to signatures, trimmed to a token
budget or cut into parts.

```bash
ctxman pack                                   # current directory, XML, to stdout
ctxman pack -o context.xml                    # to a file
ctxman pack src --style markdown --copy       # Markdown, to the clipboard
ctxman pack --compress --budget 100k --instructions task.md -o context.xml
```

The document goes to stdout (or to `-o`/`--copy`); a summary goes to stderr:

```text
ctxman pack: 42 file(s), 30,000 tokens (xml, cl100k_base)
  Budget 30,000: 30,000 used; 431 file(s) left out (1,032,697 tokens)
  Compressed 512 function bodies in 40 file(s): 71,695 tokens saved (75%)
  Skipped 1 file(s): 1 too-large
  Claude Sonnet 5.5 (claude-sonnet-5-5): 3.0% of the 1,000,000-token window, fits (approximate count, cl100k_base)
  Written to context.xml
```

## Styles

`--style xml` (the default) is the long-context format from Anthropic's prompting guide:

```xml
<directory_structure>
src/
  math.js
README.md
</directory_structure>

<documents>
<document index="1">
<source>README.md</source>
<document_content>
# Demo
</document_content>
</document>
<document index="2">
<source>src/math.js</source>
<document_content>
export function add(a, b) {
  return a + b;
}
</document_content>
</document>
</documents>

<instructions>
Explain add().
</instructions>
```

File contents are **not** XML-escaped: models read raw code best, and escaping every `<`
and `&` costs tokens. Only a closing tag of the wrapper itself (`</document_content>`,
`</document>` or `</documents>`, in any case) inside a file has its `<` written as `&lt;`,
so a file cannot end its own document early. Paths and the tree are escaped.

| Style      | Layout                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `xml`      | As above; `<omitted_files>` and `<instructions>` at the end when present                                                          |
| `markdown` | `## Directory structure`, `## Files` with a `### path` heading and a fenced block per file, `## Omitted files`, `## Instructions` |
| `plain`    | `Directory structure:`, then `=== path ===` before each file                                                                      |
| `json`     | `{header?, tree?, files: [{path, tokens, content}], omitted?, instructions?}`; `--json` is the same                               |

In Markdown, each fence is one backtick longer than the longest run of backticks in the
file (at least three), so no content can close it, and its language comes from the file
extension.

### Instructions last

`--header TEXT` goes at the very top; `--instructions FILE` goes at the very end, after
every file. Anthropic's long-context prompting guidance is to put long documents first and
the query last: it reports that queries at the end can improve response quality by up to
30% in its tests, especially with complex, multi-document inputs. The model then reads the
material first and meets the question right where it starts answering, instead of having
to carry it across the whole document. The omitted-files list (with `--budget`) also
comes after the files, just before the instructions.

## Options

| Option                 | Default | Description                                                                           |
| ---------------------- | ------- | ------------------------------------------------------------------------------------- |
| `[path]`               | `.`     | Project root                                                                          |
| `--include GLOB`       |         | Only files matching GLOB; repeatable or comma-separated                               |
| `--exclude GLOB`       |         | Leave out files matching GLOB; repeatable or comma-separated                          |
| `--stdin`              | off     | Read the file list from stdin (one path per line) instead of scanning                 |
| `-0, --null`           | off     | With `--stdin`: paths are separated by NUL bytes (`find -print0`, `git ls-files -z`)  |
| `--max-file-size SIZE` | `1m`    | Skip larger files; bytes or with a `k`/`m` suffix (KiB/MiB)                           |
| `--style STYLE`        | `xml`   | `xml`, `markdown`, `plain` or `json`                                                  |
| `--json`               |         | Same as `--style json`                                                                |
| `--no-tree`            |         | Leave out the directory tree                                                          |
| `--header TEXT`        |         | Text at the top                                                                       |
| `--instructions FILE`  |         | The text of FILE at the end, after the files                                          |
| `--line-numbers`       | off     | Number every line (`12 \| code`); with `--compress` the numbers are the original ones |
| `--compress`           | off     | Keep signatures, replace function bodies with a one-line placeholder                  |
| `--no-redact`          |         | Do not mask secrets                                                                   |
| `--budget TOKENS`      |         | Keep the document within TOKENS (`50000`, `50k`), the highest-ranked files first      |
| `--max-tokens TOKENS`  |         | Exit with code 2, writing nothing, when the document is larger                        |
| `--split TOKENS`       |         | With `-o`: write numbered parts of at most TOKENS each                                |
| `--target-model ID`    |         | Count with this model's tokenizer encoding and report the fit (`ctxman --list-llms`)  |
| `-o, --output FILE`    |         | Write to FILE instead of stdout (the file itself is never packed)                     |
| `--copy`               |         | Copy to the clipboard instead of stdout (stdout if no clipboard tool works)           |
| `-q, --quiet`          |         | No summary on stderr                                                                  |

Token counts accept `k` and `m` suffixes (`8k` = 8,000).

## Selecting files

Files come from the same scan as `ctxman --cli`: `.gitignore`, then `.contextinclude` (an
allow list, when present) or `.contextignore`; `node_modules`, `.git`, `dist`, `build` and
`coverage` are always skipped, as are files whose extension the scanner does not treat as
text. `--include` and `--exclude` narrow that set further, with the same pattern syntax
(`**/*.ts`, `src/`, `/README.md` anchored to the root, `!pattern`).

Files whose first 8,000 bytes contain a NUL byte are skipped as binary; files larger than
`--max-file-size` are skipped as too large. Both show up in the summary.

### `--stdin`

```bash
git ls-files -z -- '*.py' | ctxman pack --stdin -0
git diff --name-only main | ctxman pack --stdin --line-numbers
fd -e go | ctxman pack --stdin --compress
```

The list replaces the scan; its order is kept. Relative paths are taken from the current
directory. Every path must lie inside the project root once symlinks are resolved: `..`,
an absolute path elsewhere or a symlink pointing out stops the command with an error. The
ignore files still apply (a listed file in `node_modules/` or matched by `.gitignore` is
skipped and counted as `ignored`), but the scanner's extension list does not: a listed
`.mjs` file is packed, binaries are still detected by content.

## `--compress`

Compression keeps everything a reader needs to navigate the code (imports, types, class
headers, comments and docstrings, signatures, top-level statements) and replaces each
function body with a one-line placeholder in the language's own comment syntax:

```js
export class Scanner {
  constructor(rootPath, options = {}) {
    /* … 20 lines */
  }

  scan() {
    /* … 9 lines */
  }

  shouldIgnore(relativePath, fullPath = path.join(this.rootPath, relativePath)) {
    return this.gitIgnore.isIgnored(fullPath, relativePath);
  }
}
```

```python
    async def greet(self, loud=False) -> str:
        """Say hello."""
        ...  # 2 lines
```

On ctxman's own source it saves about 70% of the tokens.

- **Which functions**: the method analyzers of `ctxman -m` (JavaScript/TypeScript, Python,
  Java, C#, Go, Rust, PHP, Ruby, Kotlin, Swift, C/C++, Scala) say which functions exist and
  on which line they are declared.
- **Where a body is**: the analyzers' own end-line search scans braces line by line and
  cannot tell whether a line starts inside a multi-line string, so the body range is found
  again with a lexer that knows each language's comments, strings, raw strings, template
  literals and regex literals. Python bodies are found by indentation (docstrings are
  kept), Ruby bodies between `def` and the `end` at the same indentation.
- **Conservative**: a body is replaced only when its braces are unambiguous (the `{` ends
  the signature line or stands alone on the next one, after at most a few continuation
  lines such as `where`, `throws` or a C++ initializer list); expression bodies
  (`=> x * 2`, `fun f() = 1`), declarations without a body (overloads, interface methods),
  one-line bodies shorter than the placeholder and files whose brackets do not balance are
  left as they are. The result is lexed again and dropped if its brackets no longer
  balance.
- **Nested functions** are not elided twice: a body inside a replaced body goes with it.
- With `--line-numbers`, the remaining lines keep their original numbers.
- The summary reports the bodies replaced and the tokens saved. Languages without a
  method analyzer (Markdown, JSON, YAML, ...) are packed unchanged.

## `--budget`

With a budget the document is guaranteed to stay at or under that many tokens, counted on
the rendered document itself (the tree, the wrappers, the omitted list and the
instructions included).

- **Ranking**: files are ranked like `ctxman map` ranks them: PageRank over the import
  graph, blended with git change frequency and symbol references (see
  [map.md](map.md#how-files-are-ranked)). Files many others import come first. Files the
  graph does not cover (documentation, configuration, data, files the map skips as
  minified) follow in path order. This ranking was chosen over the size-and-path heuristic
  of the REST API's `targetTokens` because it reflects what the code actually depends on.
- **Packing**: files are taken in rank order; a file that does not fit is skipped and
  smaller, lower-ranked files can still use the room. The per-file sizes are estimates,
  so the document is then counted exactly and the lowest-ranked files are dropped until it
  fits, and the best-ranked files left out are tried once more.
- **Omitted files** are listed at the end of the document (before the instructions) with
  their token counts, most important first: the first 20 by name, the rest as a count.
- The packed files keep their path order in the document.
- `--compress` is applied before the budget, so compressed files are what is measured and
  more of them fit.
- A budget too small for the document without any file (tree, header, omitted list,
  instructions) is an error.

## `--split`

```bash
ctxman pack --split 150k -o context.xml
# context.1.xml, context.2.xml, ... (zero-padded from 10 parts on: context.01.xml)
```

Every part is a complete document in the chosen style, labelled `Part 2 of 5`, of at most
the given number of tokens. Part 1 carries the header and the tree, the last part the
omitted list and the instructions (in a part of their own if needed), and document numbers
continue across parts. Files are never cut, except a file that is larger than a part on
its own: it is split by lines into pieces labelled `path (lines 1-420 of 1,200)`, and the
summary says so. `--split` needs `-o` and cannot be combined with `--copy`.

`--budget` and `--max-tokens` apply to the whole document; the parts together are a little
larger because each repeats its label and wrapper. Part files of an earlier run that are
not part of the new output are left in place and named in the summary.

## `--target-model`

```bash
ctxman pack --target-model gpt-4o
ctxman pack --target-model claude-opus-5-5 --budget 600k
```

Every count (per file, the budget, the parts, `--max-tokens`) uses that model's tiktoken
encoding: `o200k_base` for OpenAI models since GPT-4o, `cl100k_base` otherwise. The
summary reports how much of the model's context window the document uses, whether it
fits, and a note when it is above the model's recommended input size. The count is exact
for OpenAI models with a published encoding and approximate for the others (Claude,
Gemini, ... use their own tokenizers); for an exact Claude count, pipe the document to
`ctxman count - --model <id> --api`. Unknown model ids are an error.

## Secrets

Secrets in the formats of `lib/utils/secret-redactor.js` (private keys, AWS, GitHub,
GitLab, Slack, Stripe, Google, Anthropic, OpenAI and npm keys) are replaced with
`[REDACTED:<type>]` in file contents, the header and the instructions, and the summary
counts them by type. `--no-redact` turns this off. Masking happens after line numbering,
so a masked multi-line private key does not shift the numbers of the lines after it.

## Exit codes and CI

| Code | Meaning                                                                                  |
| ---- | ---------------------------------------------------------------------------------------- |
| `0`  | Done                                                                                     |
| `1`  | Error: invalid option, path outside the project, unknown model, budget or part too small |
| `2`  | The document is larger than `--max-tokens`                                               |

With exit code 2 nothing is written (not to stdout, the file or the clipboard), so a
pipeline never passes an oversized document on; the five largest files are listed on
stderr to show what to leave out.

```bash
# Fail the build when the packed context outgrows what the agent is given
ctxman pack --compress --target-model gpt-4o --max-tokens 120k -q -o context.xml
```

## Library and MCP

```js
import { packContext } from 'ctxman';

const result = await packContext('/path/to/project', {
  style: 'markdown',
  include: ['src/**'],
  compress: true,
  budget: 50000,
  targetModel: 'gpt-4o',
  instructions: 'Find the bug in the parser.',
});
result.text; // the document
result.totalTokens; // its tokens
result.omitted; // [{path, tokens}] left out by the budget
result.parts; // with `split`: [{index, text, tokens, files}]
```

Errors are `PackError`s with a `code` (`ROOT_NOT_FOUND`, `PATH_OUTSIDE_ROOT`,
`INVALID_OPTION`, `UNKNOWN_MODEL`, `BUDGET_TOO_SMALL`, `SPLIT_TOO_SMALL`). See
`index.d.ts` for every field.

The MCP server (`ctxman mcp`) offers the same as the `pack_context` tool, with `path`,
`include`, `exclude`, `files` (project-relative), `style`, `compress`, `lineNumbers`,
`tree`, `instructions` (text), `budget` and `targetModel`. Its budget defaults to 20,000
tokens so a whole project does not flood the client's context; secrets are always
redacted, and with `ctxman mcp --root` both `path` and `files` must stay inside the root.
It returns the document and a one-line summary.

## Limits

- Ranking for `--budget` needs import parsing: in languages `ctxman map` does not parse,
  files fall back to path order after the ranked ones. Building the graph scans the
  project a second time and reads up to 300 commits of git history (about 2 s on a
  300-file project).
- `--compress` only knows the functions the method analyzers find; some (e.g. Python
  `__init__`, Ruby `initialize`, Go `main`) are skipped by the analyzers and stay whole.
  Bodies with an unusual brace layout are left whole on purpose.
- Content is read as UTF-8; other encodings are packed as decoded.
- The whole document is built in memory; packing a very large repository without
  `--budget` or `--split` produces a very large string.
