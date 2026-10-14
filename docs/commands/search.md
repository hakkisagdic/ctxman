# ctxman search

Ranked code search over a project: the methods, functions and code windows that best match a
few words or identifiers, best first, with their code. The same engine serves the MCP tool
`search_code` with `type: "ranked"` (see [mcp.md](mcp.md)).

```bash
ctxman search "parse config file"
ctxman search getUserName ./services/api --limit 5
```

## Usage

```text
ctxman search "<query>" [path] [options]
```

The query can also be given unquoted (`ctxman search user session`). When there is more than
one word and the last one names an existing directory, that directory is the project;
otherwise the current directory is searched.

| Option               | Default | Meaning                                                   |
| -------------------- | ------- | --------------------------------------------------------- |
| `-n`, `--limit <n>`  | 10      | Number of results                                         |
| `--max-tokens <n>`   | 4000    | Token budget for the returned code (all results together) |
| `--full`             | off     | Print whole chunks instead of their first 8 lines         |
| `--json`             | off     | Print the results as JSON                                 |
| `--no-redact`        | off     | Do not redact secrets in the returned code                |
| `-o`, `--output <f>` |         | Write the output to a file instead of stdout              |
| `--copy`             | off     | Copy the output to the clipboard                          |
| `-h`, `--help`       |         | Show the help                                             |

Exit codes: 0 (also when nothing matches), 1 on errors, 2 on usage errors.

## Output

```text
$ ctxman search "user name" --limit 2
Ranked search for "user name" in /work/app (2 files, 4 chunks)

1. src/a.js:1-3  getUserName (function)  score 2.9247
    1 | export function getUserName(id) {
    2 |   return users.get(id).name;
    3 | }

2. README.md:1-2  score 0.788
    1 | # Notes
    2 | user sessions are stored in memory
```

With `--json`:

```json
{
  "query": "save session",
  "root": "/work/app",
  "files": 2,
  "chunks": 4,
  "tokens": 11,
  "results": [
    {
      "file": "src/a.js",
      "name": "save",
      "kind": "method",
      "parent": "SessionStore",
      "startLine": 6,
      "endLine": 8,
      "score": 2.6814,
      "tokens": 11,
      "text": "  save(session) {\n    return session;\n  }"
    }
  ]
}
```

`name` is `null` and `kind` is `window` for a window of code outside methods. When the token
budget runs out, the result that crosses it is cut to the lines that fit (`truncated: true`)
and later results keep their location and score with `text: null`.

## How it ranks

- **Files**: found with the Scanner, so `.gitignore`, `.contextignore` and `.contextinclude`
  apply. Files over 1 MiB are skipped.
- **Chunks**: every method/function the method analyzers find (JavaScript/TypeScript, Python,
  Java, C#, Go, Rust, PHP, Ruby, Kotlin, Swift, C/C++, Scala) is one chunk. The code outside them
  (imports, constants, class headers) and whole files of other types (Markdown, JSON, ...) are
  cut into windows of up to 40 lines; blank lines at the edges are dropped. Minified files
  (average line over 250 characters) are searched by windows only.
- **Terms**: words are split at camelCase, snake_case and kebab-case boundaries and
  lowercased (`parseHTTPResponse` gives `parse`, `http`, `response`), plus the joined form
  (`parsehttpresponse`) so an exact identifier ranks above code that merely uses the same words.
  Simple English plurals are folded (`users` -> `user`, `classes` -> `class`); there is no other
  stemming. Single characters are ignored.
- **Score**: Okapi BM25 (k1 = 1.2, b = 0.75) over the chunk text, its name (counted three more
  times) and its file path. Rare terms weigh more than common ones; shorter chunks win over long
  ones with the same matches. Equal scores are ordered by file path and line, so results are
  stable.
- **Secrets**: chunks are indexed after secret redaction, so a query cannot find a secret by its
  value; the returned code is redacted as well unless `--no-redact` is given.

The CLI builds the index on every run (about 1 s for a 400-file project). The MCP server keeps it
in memory and re-reads only files whose modification time or size changed.

## Library

```js
import { searchProject, BM25Index, tokenize } from './lib/search/bm25.js';
import { getSymbol } from './lib/search/symbols.js';

const { results } = searchProject('/work/app', 'retry backoff', { limit: 5, maxTokens: 2000 });
const { symbols } = getSymbol('/work/app', 'HttpClient.request');

// The engine on its own
const index = new BM25Index();
index.add({ id: 'a' }, tokenize('function retryWithBackoff() {}'));
index.search('retry backoff'); // [{ doc: { id: 'a' }, id: 0, score: ... }]
```

## Limits

- Lexical ranking: it finds code that uses the query's words (after identifier splitting),
  not code that means the same thing with other words. There are no embeddings.
- Method ranges come from the regex method analyzers; an unusual construct (for example a regex
  literal containing braces) can make a range too long or too short. Code outside methods is
  still searchable through the windows.
- The whole project is read on the first query, and the file contents stay in memory while the
  index is cached (MCP server only).
