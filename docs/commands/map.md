# `ctxman map` — ranked repository map

`ctxman map` gives an LLM a compact overview of a codebase: the most important files,
each with one line per function (line number, signature, tokens), trimmed to a token
budget. Importance comes from the import graph (PageRank, as in Aider's repo map), recent
git activity (as in yek) and how often other files mention a file's functions.

```bash
ctxman map                          # current directory, 2048 tokens, text
ctxman map path/to/project --tokens 4096
```

```text
lib/utils/logger.js (score 0.887, 1714 tokens)
  11: constructor(options = {}) [293 tok]
  52: initializeLogDirectory() [131 tok]
  129: log(level, message, meta = {}) [76 tok]
  270: function getLogger(options = {}) [29 tok]
lib/rag/Indexer.js (score 0.245, 651 tokens)
  16: constructor(vectorStore) [23 tok]
  36: async index(sourceName, options = {}) [393 tok]
index.js (score 0.219, 425 tokens)
```

Each header shows the file's score (0 to 1) and the tokens of the whole file; each
function line shows its line number, its declaration on one line (multi-line parameter
lists are joined, bodies cut off, at most 120 characters) and the tokens of its body.

The map goes to stdout; a one-line summary (files, tokens used, edges, history, time)
and any warnings go to stderr.

## Options

| Option               | Default | Description                                                                                       |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `[path]`             | `.`     | Project root                                                                                      |
| `-t, --tokens N`     | `2048`  | Token budget of the rendered map                                                                  |
| `-f, --focus PATH`   |         | Bias the ranking toward a file or folder and the files next to it in the import graph; repeatable |
| `--history N`        | `300`   | Commits of git history to mine for change frequency; `0` disables                                 |
| `--order rank\|path` | `rank`  | Order of the files in the output                                                                  |
| `--important-last`   | off     | Highest-ranked file at the end (rank order only)                                                  |
| `--style STYLE`      | `text`  | `text`, `markdown`, `json` or `dot` (Graphviz)                                                    |
| `--json`             |         | Same as `--style json`                                                                            |
| `--graph`            | off     | Print the dependency edges instead of the map                                                     |
| `-o, --output FILE`  |         | Write to a file instead of stdout                                                                 |
| `--copy`             |         | Copy to the clipboard instead of stdout                                                           |
| `--no-redact`        |         | Do not mask secrets in signatures                                                                 |
| `-q, --quiet`        |         | No summary or warnings on stderr                                                                  |

A focus path may be project-relative, relative to the current directory, or absolute; it
must stay inside the project.

## How files are ranked

```text
score(f) = (wP·P(f) + wH·H(f) + wS·S(f)) / (wP + wH + wS)

P(f) = PR(f) / max PR                    PageRank over the import graph
H(f) = ln(1 + c(f)) / ln(1 + max c)      c = commits touching f among the last N
S(f) = ln(1 + s(f)) / ln(1 + max s)      s = symbol references of f

wP = 0.70   wH = 0.25   wS = 0.05
```

- **PageRank** runs over the file dependency graph with edges from importer to imported,
  so files many others build on rank high. Damping 0.85; the rank of files without
  imports (dangling nodes) is redistributed like the random jump, so all scores sum to 1;
  power iteration stops when the L1 change drops below n × 1e-10 (at most 200 rounds).
- **Focus** personalises the random jump: 90% of it goes to the focus files (weight 1)
  and the files they import or are imported by (weight 0.5), 10% stays uniform so
  unrelated files keep a rank.
- **Change frequency** counts, for each file, the commits among the last `--history`
  (merges excluded) that touched it. The logarithm keeps one hot file from flattening
  the rest.
- **Symbol references**: for each function name a file defines (3+ characters), the
  number of other files that mention the name, divided by the number of files defining
  it (so `constructor` or `render`, defined everywhere, earns little). With the small
  weight it mainly breaks ties between files PageRank cannot tell apart.
- A component that is 0 for every file (no git repository, `--history 0`, no references)
  drops out and the others are renormalised. Equal scores are ordered by path, so the
  output is deterministic for a given tree and history.

## Budget

Files are taken best rank first; every whole file whose block still fits is included (a
file that does not fit is skipped and smaller, lower-ranked files may still fill the
rest). The rendered map is then counted with `TokenUtils` (tiktoken `cl100k_base`, or the
estimate when tiktoken is missing) and the lowest-ranked files are dropped until it fits,
so the output never exceeds `--tokens`. Markdown counts its title too.

With `--style json` the document holds `files` (the map entries — the same files the text
map would include — with per-function signatures and tokens), `nodes` (every file with
rank, score, raw PageRank, change count, symbol references, focus and inclusion flags),
`edges` (`from`, `to`, `weight`) and `stats`. Only `files` follows the budget; `tokens`
is the size of the equivalent text map.

`--graph` (and `--style dot`) print the whole graph without a budget:

```bash
ctxman map --graph                       # "a.js -> b.js" lines
ctxman map --style dot | dot -Tsvg > deps.svg
```

## Which imports are resolved

Only files of the project are graph nodes, so packages, the standard library and ignored
files are unresolved and skipped. Regex based, no AST.

| Language              | Resolved                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript/TypeScript | `import`/`export … from`, side-effect and dynamic `import()`, `require()`; relative paths with extension and `index` resolution, `./a.js` → `a.ts`; `paths`/`baseUrl` of a root `tsconfig.json`/`jsconfig.json` |
| Python                | `import a.b`, `from a.b import c` (c as submodule too), relative `from . import x` / `from ..pkg import y`; searched under the root, `src/`, the importer's top package and its folder                          |
| Go                    | Imports under the module path of a `go.mod` → every non-test file of that package directory (weight split between them)                                                                                         |
| Java/Kotlin/Scala     | `import a.b.C`, wildcards, `import static`, Kotlin top-level functions, Scala `{A, B}` — by the declared `package`, so any source layout works                                                                  |
| C#                    | `using A.B;` → files declaring `namespace A.B`; `using static A.B.C`                                                                                                                                            |
| PHP                   | `use A\B\C` (also grouped and trait `use`) by declared `namespace` + file name; `require`/`include` with literal or `__DIR__` paths                                                                             |
| Ruby                  | `require_relative`; `require` of files under `lib/` or the root                                                                                                                                                 |
| C/C++                 | `#include "x.h"` next to the file, at the root, `include/`, `src/`, else the closest file whose path ends with it; `<...>` is ignored                                                                           |
| Rust                  | `mod x;`, `use crate::/super::/self::` paths (with `{…}` groups), workspace crates by their `Cargo.toml` name                                                                                                   |
| Swift                 | Functions are listed; no import edges (Swift imports whole modules)                                                                                                                                             |

Files the scanner skips (`.gitignore`, `.contextignore`, `.contextinclude`, `node_modules`,
`dist`, …) are not in the map. Files over 512 KiB or with an average line over 300
characters (minified bundles) are left out and counted in the summary.

## Library and MCP

```js
import { buildRepoGraph, rankFiles, renderRepoMap } from 'ctxman';

const graph = buildRepoGraph('.', { history: 300 }); // nodes, edges, history counts
const ranked = rankFiles(graph, { focus: ['src/server.js'] }); // best first
const { output, files, tokens } = renderRepoMap('.', { tokens: 1024, style: 'markdown' });
```

The MCP server exposes the tool `repo_map` with `path` (project root), optional
`tokens` and `focus` (array of project-relative paths); it returns the text map.

## Limits

- Regex parsing: imports inside comments or strings can create edges, and unusual syntax
  (macros, conditional includes, computed `require` paths) is missed.
- Same-package references without imports (Go, Java, C#) are not edges; symbol
  references cover them only partly.
- Not resolved: `package.json` `exports`/`imports`, tsconfig `extends`, Python
  namespace-package tricks, PHP `include_path`, C include paths from build files.
- Function lines come from ctxman's method analyzer, so its false positives (a call
  followed by `{`) and misses appear in the map.
- Token counts per function are of the function's source text; file headers count the
  whole file.
