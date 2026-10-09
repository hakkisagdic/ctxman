#!/usr/bin/env bash
# Install step of the ctxman GitHub Action (action.yml): prepares the ctxman CLI that
# scripts/action/run.mjs runs and writes its path to the `cli` step output.
#
#   CTXMAN_VERSION empty  the action's own checkout ($GITHUB_ACTION_PATH) with the production
#                         dependencies locked in its package-lock.json
#   CTXMAN_VERSION set    that version or dist-tag of the ctxman npm package
#
# Both get tiktoken, which is a devDependency of ctxman, so token counts are exact.
# Optional dependencies (the vector store and embeddings of `ctxman ask`) are left out, and
# no install scripts run.
set -euo pipefail

action_dir="${GITHUB_ACTION_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
version="${CTXMAN_VERSION:-}"
npm_flags=(--no-audit --no-fund --ignore-scripts --loglevel=error)

# The tiktoken version the action's lockfile pins
tiktoken_version="$(node -p "require(process.argv[1]).packages['node_modules/tiktoken'].version" \
  "$action_dir/package-lock.json")"

if [ -z "$version" ]; then
  marker="$action_dir/node_modules/.ctxman-action-installed"
  # A second use of the action in the same job reuses the installation
  if [ ! -f "$marker" ]; then
    (cd "$action_dir" && npm ci --omit=dev --omit=optional "${npm_flags[@]}")
    # `npm install tiktoken --omit=dev` skips it as a devDependency of this package, so
    # install it on its own and copy it in (it has no dependencies)
    tmp="$(mktemp -d)"
    npm install --prefix "$tmp" "${npm_flags[@]}" "tiktoken@$tiktoken_version"
    rm -rf "$action_dir/node_modules/tiktoken"
    cp -R "$tmp/node_modules/tiktoken" "$action_dir/node_modules/tiktoken"
    rm -rf "$tmp"
    touch "$marker"
  fi
  cli="$action_dir/bin/cli.js"
else
  if ! [[ "$version" =~ ^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$ ]]; then
    echo "::error title=ctxman::version must be an npm version or dist-tag, such as 3.0.0 or latest"
    exit 1
  fi
  prefix="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ctxman-cli-$version"
  # A global install under a private prefix: npm 10 fails to build the local tree of some
  # published versions (3.0.0: "Cannot read properties of null (reading 'edgesOut')").
  # Global packages live in lib/node_modules, or node_modules on Windows; tiktoken next to
  # ctxman is found by its imports
  find_cli() {
    for dir in "$prefix/lib/node_modules" "$prefix/node_modules"; do
      if [ -f "$dir/ctxman/bin/cli.js" ]; then
        echo "$dir/ctxman/bin/cli.js"
        return
      fi
    done
  }
  if [ -z "$(find_cli)" ]; then
    mkdir -p "$prefix"
    npm install --global --prefix "$prefix" --omit=optional "${npm_flags[@]}" \
      "ctxman@$version" "tiktoken@$tiktoken_version"
  fi
  cli="$(find_cli)"
  if [ -z "$cli" ]; then
    echo "::error title=ctxman::ctxman@$version was installed without bin/cli.js"
    exit 1
  fi
fi

# Run from the CLI's own directory: ctxman creates .ctxman/logs in its working directory
(cd "$(dirname "$cli")/.." && node "$cli" --version)
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "cli=$cli" >> "$GITHUB_OUTPUT"
fi
