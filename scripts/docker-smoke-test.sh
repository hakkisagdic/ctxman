#!/usr/bin/env bash
# Smoke test of a ctxman container image (used by .github/workflows/docker.yml):
#
#   scripts/docker-smoke-test.sh ctxman:test
#
# Checks that the image runs as a non-root user, counts tokens exactly (tiktoken), writes
# its report into the mounted project, runs git on a project owned by another uid and
# answers an MCP initialize request over stdio.
set -euo pipefail

image="${1:?usage: $0 IMAGE}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

step() { printf '\n== %s\n' "$*"; }
fail() {
  echo "::error title=docker smoke test::$*"
  exit 1
}

step 'version'
docker run --rm "$image" --version | tee "$work/version.txt"
grep -q '^Ctxman v' "$work/version.txt" || fail 'ctxman --version printed no version'

step 'non-root user'
uid="$(docker run --rm --entrypoint id "$image" -u)"
[ "$uid" != 0 ] || fail 'the image runs as root'

# A small git project, owned by the user running this script
project="$work/project"
mkdir -p "$project/src"
printf 'export function add(a, b) {\n  return a + b;\n}\n' > "$project/src/add.js"
printf '# Smoke test\n' > "$project/README.md"
git -C "$project" init -q
git -C "$project" -c user.name=t -c user.email=t@t add -A
git -C "$project" -c user.name=t -c user.email=t@t commit -qm init

step 'git on a project owned by another uid'
docker run --rm -v "$project:/work" "$image" --changed-since HEAD | tee "$work/changed.txt"
grep -q 'No changed files to analyze' "$work/changed.txt" || fail '--changed-since HEAD failed'

step 'analysis with a report in the mounted project'
docker run --rm --user "$(id -u):$(id -g)" -v "$project:/work" "$image" --save-report \
  | tee "$work/analysis.txt"
grep -q 'Exact (using tiktoken)' "$work/analysis.txt" || fail 'token counts are not exact'
[ -s "$project/token-analysis-report.json" ] || fail 'no token-analysis-report.json in /work'
files="$(node -p "require(process.argv[1]).summary.totalFiles" "$project/token-analysis-report.json")"
[ "$files" = 2 ] || fail "expected 2 analyzed files, got $files"

step 'MCP server over stdio'
request='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0"}}}'
printf '%s\n' "$request" \
  | timeout 60 docker run -i --rm -v "$project:/work" --entrypoint node "$image" /app/bin/mcp-server.js \
  | tee "$work/mcp.txt"
grep -q '"serverInfo":{"name":"ctxman"' "$work/mcp.txt" || fail 'no MCP initialize response'

step 'all checks passed'
