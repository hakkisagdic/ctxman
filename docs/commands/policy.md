# Export policy, audit log and AI-tool ignore files

`ctxman policy`, `ctxman audit` and `--respect-ignore-files` give a repository (and an
organisation) a say in what ctxman may export to an LLM:

- **Deny rules**: files that are never exported, whatever the flags.
- **Limits**: required secret redaction, a maximum export size, allowed target models.
- **Audit log**: one JSON line per export: who, when, where to, which files, and a SHA-256
  of the exported text.
- **Ignore-file interop**: honour `.cursorignore`, `.aiexclude` and the other AI tools'
  ignore files instead of copying them into `.contextignore`.

This is the local equivalent of the centrally enforced content exclusion and audit logs of
hosted assistants (Copilot content exclusion, Sourcegraph context filters, ...).

> **Not a security boundary.** The policy protects a team against _accidental_ exports: a
> forgotten `--no-redact`, a context file that grew past what was agreed, a secrets folder
> that `.contextinclude` happened to match. Anyone who can run ctxman on the machine can also
> edit the policy file, unset `CTXMAN_POLICY`, delete the audit log, or simply `cat` the
> files. Keep real secrets out of the working tree and use your platform's access controls
> for anything that must be enforced against a determined local user.

## Quick start

```bash
ctxman policy init      # writes .ctxman/policy.json (starter policy)
$EDITOR .ctxman/policy.json
ctxman policy check     # validates it and prints the effective policy
git add .ctxman/policy.json
echo .ctxman/audit.log >> .gitignore
```

From then on every export (`--context-export`, `--context-clipboard`, `--save-report`,
`--gitingest`, `ctxman github`, the REST `POST /api/v1/context` endpoint and the MCP
`generate_context` tool) is checked against the policy and logged.

## Policy files

| File                                                   | Scope        | Who sets it                                               |
| ------------------------------------------------------ | ------------ | --------------------------------------------------------- |
| `.ctxman/policy.json` in the project root              | project      | committed with the repository                             |
| the file named by `CTXMAN_POLICY=/path/to/policy.json` | organisation | the user's environment (shell profile, dotfiles, MDM, CI) |

Both apply at the same time, and the stricter value wins on every field:

| Field                 | How the two files combine                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `deny`                | union: a path denied by either file is denied (a project `!pattern` cannot re-allow an organisation deny) |
| `requireRedaction`    | true when either file sets it                                                                             |
| `maxExportTokens`     | the lower limit                                                                                           |
| `allowedTargetModels` | a model must be allowed by every file that has the field                                                  |
| `ignoreFiles`         | union                                                                                                     |
| `audit`               | each file that enables auditing gets its own log (the same event is written to both)                      |

If `CTXMAN_POLICY` names a file that does not exist, or either file is invalid, commands
that export stop with exit code 2 instead of running without the policy.

## Schema

```json
{
  "$comment": "free-form notes: keys starting with $ are ignored",
  "version": 1,
  "deny": ["secrets/", "**/*.pem", "customer-data/**", ".env.*", "!.env.example"],
  "requireRedaction": true,
  "maxExportTokens": 200000,
  "allowedTargetModels": ["claude-*", "gpt-5*"],
  "ignoreFiles": [".cursorignore", ".aiexclude"],
  "audit": { "enabled": true, "path": ".ctxman/audit.log" }
}
```

| Field                 | Type                                | Default             | Meaning                                                                                                                                       |
| --------------------- | ----------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`             | `1`                                 | required            | Schema version.                                                                                                                               |
| `deny`                | array of patterns                   | `[]`                | Files that are never analysed or exported, even with `--no-redact`, `.contextinclude`, a template or a profile that would include them.       |
| `requireRedaction`    | boolean                             | `false`             | Secret redaction must stay on: `--no-redact` is refused. Method source in `--save-report -m` reports is redacted too.                         |
| `maxExportTokens`     | positive integer or `null`          | `null` (no limit)   | Exports whose files add up to more tokens fail.                                                                                               |
| `allowedTargetModels` | non-empty array of globs, or `null` | `null` (any model)  | `--target-model` (or a template's/profile's model) must match one glob; `*` = any characters, `?` = one, case-insensitive.                    |
| `ignoreFiles`         | array of file names, or `["all"]`   | `[]`                | Other tools' ignore files to honour, see [below](#ai-tool-ignore-files).                                                                      |
| `audit.enabled`       | boolean                             | `true` with `audit` | Write the audit log.                                                                                                                          |
| `audit.path`          | path                                | `.ctxman/audit.log` | Relative to the project root and inside it. Only the organisation file may use an absolute path (e.g. a central `/var/log/ctxman/audit.log`). |

Unknown fields are errors, so a typo such as `"denny"` is caught. `ctxman policy check`
lists every problem with the file and the field:

```text
❌ Invalid ctxman policy /work/app/.ctxman/policy.json:
  - "maxExportTokens" must be a positive integer or null (got "lots")
  - "denny" is not a policy field (known fields: version, deny, requireRedaction, ...)
```

### Deny patterns

Deny patterns use `.gitignore` syntax, read with the same parser as `.contextignore`:

- `*.pem`, `**/*.pem`: at any depth (a pattern without a leading `/` matches in any directory).
- `/config/prod.json`: only at the project root.
- `secrets/`: everything below a `secrets` directory; `secrets/**` is equivalent.
- `!secrets/README.md`: re-allows a path matched by an earlier line of the **same file**; the
  last matching line wins.

Patterns are matched case-sensitively against the path relative to the project root.

Denied files are removed before analysis, so they appear in no count, report, context file,
digest, REST or MCP response. ctxman says how many it removed, never which:

```text
🛡️  Export policy: .ctxman/policy.json
📁 Found 41 text files to analyze
🛡️  Removed 3 files denied by the export policy (never exported)
```

Everything built on `lib/core/Scanner.js` (every REST endpoint and MCP tool, and new
commands) loads the policy and drops denied files automatically. `ctxman pr` and `ctxman why`,
which read from git, leave denied files out too; `why` on a denied file exits with code 3.

### Refused exports

When an export breaks a rule, nothing is written or sent, the refusal is logged, and:

- the CLI prints every broken rule and exits with **code 3**;
- the REST API answers **HTTP 403** with `{"error", "statusCode": 403, "violations": [{"rule", "message", "sources"}]}`;
- the MCP tool returns an error result (`isError: true`) with the same message.

```text
❌ Export refused by the ctxman policy:
  - secret redaction is required, so --no-redact is refused (set in /work/app/.ctxman/policy.json)
  - the export has 312,480 tokens, over the limit of 200,000 (set in /etc/ctxman/policy.json); narrow it with .contextinclude, --changed-only or a template
```

`maxExportTokens` compares against the token total of the files in the export (the "Total
tokens" figure ctxman prints), not the length of the serialized output.

## Audit log

While `audit` is enabled, each export appends one JSON object per line (JSON Lines). The
log is append-only, created with its directories on first use (mode 0600), and a write
failure only prints a warning: it never fails the export.

```json
{
  "id": "3a7b989d-393e-4071-9d62-50c0affce262",
  "timestamp": "2026-10-09T05:49:50.120Z",
  "outcome": "exported",
  "command": "cli --context-export",
  "root": "/work/app",
  "user": "alice",
  "host": "alice-laptop",
  "gitHead": "56983c8bcceaceb9a52dfb373f5a4583d34ae039",
  "targetModel": "claude-sonnet-5-5",
  "format": "toon",
  "destination": "/work/app/llm-context.toon",
  "fileCount": 41,
  "totalTokens": 52310,
  "redactions": 0,
  "removedByPolicy": 3,
  "files": ["src/index.js", "src/server.js"],
  "sha256": "33f4183bbe1064be0f4f8bda6fe46af80927f627c2335190d518a253b7b49faa",
  "ctxmanVersion": "3.0.0"
}
```

- `destination` is `clipboard`, `stdout`, `rest`, `mcp` or the file written (`outputFiles`
  lists every chunk of a chunked digest).
- `sha256` is the hash of exactly the text that left ctxman (the response body for REST, the
  digest file(s) for `--gitingest`). Compare it with a file someone pasted into a chat to
  prove where it came from. The text itself is never logged.
- Refused exports are logged with `"outcome": "refused"`, `"sha256": null` and the
  `violations`.
- `gitHead` is `null` outside a git repository.

### `ctxman audit`

```bash
ctxman audit                     # last 50 exports as a table
ctxman audit --since 7d          # an age (30m, 12h, 7d, 2w) or a date (2026-10-01, ISO time)
ctxman audit --limit 0           # everything
ctxman audit --json | jq '.[] | select(.outcome == "refused")'
ctxman audit --file /var/log/ctxman/audit.log
```

```text
TIME (UTC)           RESULT   USER         COMMAND                    DESTINATION                  MODEL            FILES  TOKENS     REDACT SHA256
------------------------------------------------------------------------------------------------------------------------------------------------------
2026-10-09T05:49:50Z exported alice        cli --context-export       llm-context.json             -                41     52310      0      33f4183bbe10
2026-10-09T05:50:08Z refused  alice        cli --gitingest            -                            -                41     52310      0      -

2 events from /work/app/.ctxman/audit.log
```

| Option         | Meaning                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `--since DATE` | Only events at or after a date/ISO time, or within an age (`7d`)         |
| `--limit N`    | The last N events (default 50 for the table, all with `--json`; 0 = all) |
| `--json`       | A JSON array of the events                                               |
| `--file PATH`  | Read this log instead of the policy's log(s)                             |

Without `--file`, the command reads every log the effective policy writes (events present in
both the organisation and the project log are shown once), or `.ctxman/audit.log` when no
policy enables auditing.

## AI-tool ignore files

Many assistants keep their own ignore file. ctxman can honour them, with `.gitignore` syntax
and the same parser as `.gitignore`/`.contextignore` (only the files in the project root are
read):

| File                    | Tool                                                   |
| ----------------------- | ------------------------------------------------------ |
| `.cursorignore`         | Cursor                                                 |
| `.cursorindexingignore` | Cursor (indexing only)                                 |
| `.aiexclude`            | Gemini Code Assist (an empty file excludes everything) |
| `.geminiignore`         | Gemini CLI                                             |
| `.augmentignore`        | Augment Code                                           |
| `.tabnineignore`        | Tabnine                                                |
| `.devinignore`          | Devin                                                  |
| `.codeiumignore`        | Windsurf (Codeium)                                     |
| `.aiderignore`          | Aider                                                  |
| `.clineignore`          | Cline                                                  |
| `.rooignore`            | Roo Code                                               |
| `.continueignore`       | Continue                                               |
| `.repomixignore`        | Repomix                                                |
| `.gitingestignore`      | Gitingest                                              |

Turn them on per run or in the policy:

```bash
ctxman --cli --respect-ignore-files all
ctxman --cli --respect-ignore-files .cursorignore,.aiexclude --context-export
```

```json
{ "version": 1, "ignoreFiles": [".cursorignore", ".aiexclude"] }
```

Any other bare file name (e.g. `.myteamignore`) is accepted too. Each file is applied on its
own (a path is skipped when any file ignores it). Nothing changes when neither the flag nor
the policy names a file. Files skipped this way are counted separately:

```text
🧩 AI-tool ignore files: .cursorignore (2 patterns), .aiexclude (not found)
🧩 Filtered 12 files due to AI-tool ignore files
```

Unlike `deny`, ignore files only filter what ctxman analyses; they are not checked again at
export time.

## Exit codes

| Code | Meaning                                                                        |
| ---- | ------------------------------------------------------------------------------ |
| 0    | Success (or no policy)                                                         |
| 2    | Invalid policy file / missing `CTXMAN_POLICY` file / bad `ctxman audit` option |
| 3    | Export refused by the policy                                                   |

## Using the policy from code

```js
import { loadPolicy, guardExport, enforceExport, recordExport } from './lib/policy/index.js';

const policy = loadPolicy(root); // { env } option to read another environment
const scanner = new Scanner(root, { policy }); // drops denied files
// ...build the export text...
guardExport(policy, {
  command: 'pack',
  destination: 'stdout',
  format: 'xml',
  targetModel,
  files, // relative paths or { relativePath, tokens }
  tokens,
  redact, // false when --no-redact was given
  redactions, // count, or { type: count } from the secret redactor
  text, // only its SHA-256 is logged
}); // throws PolicyViolationError (statusCode 403, exitCode 3)
```

`guardExport()` is `enforceExport()` followed by `recordExport()`; call them separately when
the check must happen before the export is built.

## Limits

- Ignore files are read from the project root only; nested `.cursorignore` files are not.
- Matching is case-sensitive, also on case-insensitive file systems.
- The `allowedTargetModels` check only applies when a target model is named; an export
  without `--target-model` is not refused.
- `--multi-repo`, the dashboard and watch mode do not export file contents and are not
  audited.
