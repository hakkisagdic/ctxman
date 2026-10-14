# CI and containers: GitHub Action and Docker image

ctxman runs in CI in two ways:

- **GitHub Action** (`action.yml` in the repository root): counts the tokens of a project or of the files a pull request changes, fails the job over a token budget, checks the fit in a model's context window, writes a job summary and can upload the context file as an artifact.
- **Docker image** (`Dockerfile`): the ctxman CLI and MCP server with exact token counts, for any CI system or a machine without Node.js.

## GitHub Action

### Quick start

```yaml
# .github/workflows/ctxman-check.yml
name: ctxman context check
on: pull_request
permissions:
  contents: read
jobs:
  context:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # changed-since needs the base commit
      - uses: hakkisagdic/ctxman@main # pin a release tag or commit SHA
        with:
          changed-since: ${{ github.event.pull_request.base.sha }}
          max-tokens: 50000
          target-model: claude-sonnet-5-5
```

A complete example, with an artifact and a step that reads the outputs, is in [`examples/github-actions/ctxman-check.yml`](../../examples/github-actions/ctxman-check.yml).

### Inputs

| Input             | Default          | Description                                                                                                                                                                                                   |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`            | `.`              | Directory to analyze, relative to the workspace. Paths outside the workspace (`..`, absolute paths, symlinks leading out) are rejected.                                                                       |
| `target-model`    |                  | Model id from `ctxman --list-llms` (for example `claude-sonnet-5-5`, `gpt-6.1-sol`, `gemini-3.8-flash`). Sets the `fits` output. Unknown ids fail the step.                                                   |
| `max-tokens`      |                  | Token budget, a positive whole number. The step fails when the analyzed files hold more tokens.                                                                                                               |
| `changed-since`   |                  | Only analyze files changed since this commit, branch or tag, typically `${{ github.event.pull_request.base.sha }}`. Needs `path` to be the repository root and the commit in the checkout (`fetch-depth: 0`). |
| `method-level`    | `false`          | Method-level analysis (`--method-level`).                                                                                                                                                                     |
| `export`          | `none`           | Write the LLM context file: `none`, `json`, `toon`, `markdown` or `xml`.                                                                                                                                      |
| `upload-artifact` | `false`          | Upload the context file and the JSON report as a workflow artifact.                                                                                                                                           |
| `artifact-name`   | `ctxman-context` | Artifact name. Names must be unique within a workflow run, so give each use of the action its own (for example in a matrix).                                                                                  |
| `node-version`    | `22`             | Node.js version installed with `actions/setup-node` (22 or newer). Empty (`''`) keeps the Node.js already set up in the job.                                                                                  |
| `version`         |                  | ctxman version or npm dist-tag to run (`3.0.0`, `latest`). Empty runs the code of the action ref itself, which is the usual choice: to run another ctxman release, use the action at that release's tag.      |

### Outputs

| Output         | Description                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `total-tokens` | Tokens of the analyzed files (`0` when `changed-since` matched no files).                                          |
| `total-files`  | Number of analyzed files.                                                                                          |
| `fits`         | `true` or `false`: whether `total-tokens` fits the context window of `target-model`. Empty without `target-model`. |
| `report-path`  | Path of `token-analysis-report.json` (under `RUNNER_TEMP`). Empty when `changed-since` matched no files.           |
| `context-path` | Path of the exported context file (under `RUNNER_TEMP`). Empty when `export` is `none`.                            |

`fits` compares with the whole context window. The job summary also says when the files are above ctxman's recommended input (60% of the window, so that instructions and the answer still fit).

The action does not fail when the files do not fit `target-model`; it adds a warning. To fail, check the output:

```yaml
- uses: hakkisagdic/ctxman@main
  id: ctxman
  with:
    target-model: gpt-6.1-sol
- if: steps.ctxman.outputs.fits == 'false'
  run: exit 1
```

### Job summary

Each run adds a summary to the job page:

- total tokens and files, the scope (all files or the files changed since a ref) and whether counts are exact (tiktoken) or estimated,
- the budget (`max-tokens`) and the model window (`target-model`) with usage in percent,
- the 10 largest files by tokens with their share,
- the ctxman version and the context file name.

File names are HTML-escaped in the summary, and workflow commands are switched off (`::stop-commands::`) while the CLI prints its report, so names and contents of the analyzed repository cannot inject annotations or outputs.

### Exit codes

| Code | Meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| 0    | Analysis done, within `max-tokens` (when set).                        |
| 1    | The analyzed files exceed `max-tokens`. The summary is written too.   |
| 2    | Invalid input, or the analysis failed. An annotation names the cause. |

With `upload-artifact: true` the artifact is uploaded also after an exceeded budget, so the report of the failing run can be inspected.

### How it runs

1. `actions/setup-node` with `node-version` (skipped when it is empty).
2. `scripts/action/install.sh`: `npm ci --omit=dev --omit=optional --ignore-scripts` in the action's checkout (tiktoken is a dependency, so token counts are exact). Using the action several times in one job installs once. With `version`, the npm package is installed under `RUNNER_TEMP` instead.
3. `scripts/action/run.mjs`: validates the inputs, runs `ctxman --save-report` with the matching flags in `path`, moves `token-analysis-report.json` and the context file from the project to a new directory under `RUNNER_TEMP` (a file that was already in the project is copied instead), and writes outputs and summary.
4. `actions/upload-artifact` when `upload-artifact` is `true`.

The action needs no secrets and no permissions beyond `contents: read`; its only network access is the npm registry during the install.

### Security

- Inputs reach the scripts only through `env:`, never by interpolation into a shell script.
- `changed-since` must match a strict pattern (letters, digits, `._/-`, optionally `~N` or `^N`; no `..`, no `@{`, no leading `-`), must pass ctxman's `isValidGitRef`, and must resolve to a commit (`git rev-parse --verify`). Git runs without a shell.
- `path` is resolved with symlinks and must stay inside `GITHUB_WORKSPACE`.
- `version` must look like an npm version or dist-tag.

### Recipes

Budget for the whole repository on every push:

```yaml
on: push
jobs:
  context:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hakkisagdic/ctxman@main
        with:
          max-tokens: 400000
          export: toon
          upload-artifact: true
```

One package of a monorepo against a model window:

```yaml
- uses: hakkisagdic/ctxman@main
  with:
    path: packages/api
    target-model: claude-sonnet-5-5
    method-level: true
```

The analysis respects `.gitignore`, `.contextignore`/`.contextinclude` and `.methodignore`/`.methodinclude` of the analyzed directory, so the budget applies to the context you would actually give an LLM.

## Docker image

### Build and run

```bash
docker build -t ctxman .

# Analyze the current directory (mounted at /work, the working directory)
docker run --rm -v "$PWD:/work" ctxman --cli

# Reports and context files are written into the project
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" ctxman --save-report --context-export -o toon

# Only the files changed since main
docker run --rm -v "$PWD:/work" ctxman --changed-since main

# Help (the default command)
docker run --rm ctxman
```

ctxman writes into the project: reports, context files, and with `--cli` a context version under `.ctxman/`. The image runs as uid 1000; when the mounted directory is not writable for that uid, pass `--user "$(id -u):$(id -g)"` so ctxman runs as you.

Once a release has been tagged after this image was added, it is also available as `ghcr.io/hakkisagdic/ctxman` (tags `X.Y.Z`, `X.Y`, `X` and `latest`, for `linux/amd64` and `linux/arm64`).

### MCP server over stdio

The MCP server talks JSON-RPC on stdin/stdout, so run the container with `-i` and without `-t`:

```bash
docker run -i --rm -v "$PWD:/work" ctxman mcp
```

In an MCP client configuration (Claude Desktop, Claude Code, Cursor, ...):

```json
{
  "mcpServers": {
    "ctxman": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "/path/to/project:/work",
        "ghcr.io/hakkisagdic/ctxman:latest",
        "mcp",
        "--root",
        "/work"
      ]
    }
  }
}
```

The tools take an absolute project `path`, and inside the container the project is `/work`. To let the assistant use host paths unchanged, mount the project at the same path and run as yourself: `-v "$PWD:$PWD" -w "$PWD" --user "$(id -u):$(id -g)"`.

When ctxman has an `mcp` subcommand, the shorter form is `docker run -i --rm -v "$PWD:/work" ctxman mcp`.

### REST API server

The server binds to localhost by default, which is unreachable from outside the container; bind to all interfaces and publish the port, with a token:

```bash
docker run --rm -p 3000:3000 -v "$PWD:/work" ctxman serve --host 0.0.0.0 --auth-token "$TOKEN"
```

Add `--init` to `docker run` for long-running commands (`serve`, `watch`) so Ctrl+C and `docker stop` reach Node.js.

### Image contents

- Two stages on `node:22-alpine`: production dependencies from `package-lock.json` (`npm ci --omit=dev --omit=optional`, which includes tiktoken for exact counts); the final image adds `git` and the files of the npm package (`bin/`, `lib/`, `.ctxman/` profiles and templates).
- Runs as the unprivileged `node` user (uid 1000); `WORKDIR /work`; `ENTRYPOINT ["node", "/app/bin/cli.js"]`, `CMD ["--help"]`.
- `/work` is a git `safe.directory`, so git commands work on a mounted project that belongs to another uid.
- `.dockerignore` is an allowlist: only the copied files enter the build context (no `.git`, `node_modules`, `website`, `desktop-app`, `test`, `docs` or `.env` files).

### Container limits

- `ctxman ask` is not available: its vector store and embedding model are optional dependencies and are left out of the image.
- Clipboard options (`--context-clipboard`) have no clipboard in a container; ctxman falls back to writing the file.
- The interactive wizard (`ctxman` without options) needs a terminal: use `docker run -it`, or pass options such as `--cli` or `--save-report`.

## Workflows in this repository

- `.github/workflows/action-selftest.yml` runs the action from the checkout (`uses: ./`) on this repository on pull requests, pushes to `main` and manual runs: the whole repository with a generous budget, `lib/` against a model window, the pull request's changed files, and an exceeded budget that must fail.
- `.github/workflows/docker.yml` builds the image and runs `scripts/docker-smoke-test.sh` (version, non-root user, exact counts, a report written into the mounted project, git on a project owned by another uid, an MCP `initialize` over stdio) on pull requests that touch the image. On `v*` tags it runs the same test, then pushes `linux/amd64` and `linux/arm64` images to `ghcr.io/<owner>/<repo>`; only this job has `packages: write`.

## Limits

- `changed-since` needs `path` to be the repository root, since ctxman's git integration reads `.git` in the analyzed directory.
- The action is tested on `ubuntu-latest`. Its steps use `bash`, which GitHub's macOS and Windows runners also provide, but they have not been tested there.
- ctxman creates a `.ctxman/logs/` directory in the analyzed project (empty unless warnings are logged); add it to `.gitignore` if a later step commits files.
- `version` installs from npm. The published 3.0.0 always writes `llm-context.json`, whatever the `export` format; the action then reports that file as `context-path`.
