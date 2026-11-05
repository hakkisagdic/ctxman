# `ctxman who` — who knows about this?

`ctxman who` ranks code and domain experts for a file, a symbol (`file:symbol`), a line range
(`file#L10-L40`), a directory, or a natural-language topic query by combining four signals from
local git history and repository stewardship files:

1. **Surviving line ownership** (`git blame -w`, honoring `.git-blame-ignore-revs` when present)
2. **Recency-decayed commit history** (exponential half-life decay, default 90 days)
3. **Historical commit and line-churn depth** (`git log --no-merges --numstat`)
4. **Declared stewardship** from `CODEOWNERS` (`.github/CODEOWNERS`, `CODEOWNERS`,
   `docs/CODEOWNERS`, `.gitlab/CODEOWNERS`)

When `<target>` does not match a file, symbol, or directory path, `ctxman who` automatically
resolves the query to the top matching files using `ctxman search` (BM25 over methods and code
chunks). Everything runs 100% offline.

```bash
ctxman who lib/why/index.js                         # whole file
ctxman who lib/why/index.js:explainHistory          # specific function/method
ctxman who lib/why/index.js#L1-L80                  # specific line range
ctxman who lib/rag                                  # directory / subsystem
ctxman who "hybrid search RRF"                      # natural-language topic (BM25 resolution)
ctxman who lib/api/mcp/server.js --style json       # structured JSON output
```

## Scoring Formula

For each author across the resolved target files:

$$\text{baseScore} = 0.45 \times \text{blameShare} + 0.35 \times \text{recencyShare} + 0.20 \times \text{commitShare}$$

$$\text{score} = \min\bigl(1.0,\ \text{baseScore} + (\text{isCodeOwner} ? 0.15 : 0)\bigr)$$

where:

- `blameShare` is the fraction of surviving lines attributed to the author via `git blame -w`
- `recencyShare` is the author's share of exponentially decayed commits
  ($w_i = e^{-\lambda \Delta t_i}$ with $\lambda = \ln 2 / \text{halfLifeDays}$)
- `commitShare` is the author's share of total non-merge commits in the commit window
- `isCodeOwner` is `true` when the author's name, handle, or email matches a `CODEOWNERS` rule
  for the target path(s)

Each ranked expert is also assigned a role badge (`CODEOWNER`, `Primary Author`,
`Active Maintainer`, or `Contributor`) and up to 3 recent commit subjects with short SHA and UTC
date.

## Options

| Option              | Default    | Description                                                     |
| ------------------- | ---------- | --------------------------------------------------------------- |
| `-n, --limit N`     | `5`        | Maximum number of ranked experts to return                      |
| `--half-life DAYS`  | `90`       | Exponential recency decay half-life in days                     |
| `--window N`        | `200`      | Maximum non-merge commits examined in `git log`                 |
| `--since DATE`      | none       | Only examine commits after `DATE` (`2026-01-01`, `"6 months"`)  |
| `--style STYLE`     | `markdown` | Output format: `markdown`, `xml`, or `json` (`--json` shortcut) |
| `-o, --output FILE` | stdout     | Write output to `FILE`                                          |
| `-h, --help`        |            | Show command help                                               |

## Library and MCP

```js
import { findExperts } from 'ctxman';

const result = await findExperts('/path/to/repo', 'lib/why/index.js:explainHistory', {
  limit: 5,
  halfLifeDays: 90,
  style: 'markdown', // or 'xml', 'json'
});

console.log(result.text);
console.log(result.experts);
```

The MCP server exposes `find_experts` with `path`, `target`, `limit`, `halfLifeDays`, and `style`.
