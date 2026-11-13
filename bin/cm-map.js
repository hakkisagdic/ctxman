#!/usr/bin/env node
/**
 * ctxman map - ranked repository map trimmed to a token budget
 */

import fs from 'fs';
import path from 'path';
import { getLogger } from '../lib/utils/logger.js';
import { exitOnBrokenPipe } from '../lib/utils/cli-output.js';

// `ctxman ... | head` closes stdout early; stop quietly instead of throwing EPIPE
exitOnBrokenPipe();

const STYLES = ['text', 'markdown', 'json', 'dot'];
const ORDERS = ['rank', 'path'];

function printHelp() {
  console.log(`Repository map - the most important files and their signatures, within a token budget

Usage: ctxman map [path] [options]

Files are ranked by PageRank over the import graph (importer -> imported), blended with
git change frequency and how often other files mention their functions. The best files
are listed with one line per function (line, signature, tokens) until the budget is full.

Options:
  -t, --tokens N           Token budget for the map (default: 2048)
      --remote SPEC        Clone and map a remote Git repo (URL, github:owner/repo, owner/repo)
      --branch REF         Branch or tag ref to checkout with --remote
      --repo DIR           Additional repository root for a multi-repo workspace map
                           under one shared token budget (repeatable)
  -f, --focus PATH         Bias the ranking toward a file, file:symbol, or folder and its
                           neighbours (repeatable)
      --history N          Commits of git history to mine for change frequency
                           (default: 300, 0 disables)
      --order rank|path    Order of the files in the output (default: rank)
      --important-last     Highest-ranked file at the end (rank order only)
      --style STYLE        text (default), markdown, json, dot (Graphviz)
      --json               Same as --style json
      --graph              Print the dependency edges instead of the map
  -c, --call-graph         Include cross-file AST symbol call graph edges
  -o, --output FILE        Write to FILE instead of stdout
      --copy               Copy to the clipboard instead of stdout
      --no-redact          Do not mask secrets in signatures
  -q, --quiet              No summary on stderr
  -h, --help               Show this help

Score:
  0.70 x PageRank + 0.25 x change frequency + 0.05 x symbol references, each scaled to 0..1
  (without git history: the other two, renormalised). See docs/commands/map.md.

Examples:
  ctxman map                                # map of the current directory, 2048 tokens
  ctxman map --tokens 4096 --style markdown
  ctxman map --call-graph                   # annotate methods with cross-file call targets
  ctxman map --graph --call-graph           # print both import and symbol call edges
  ctxman map --repo ../api --repo ../web --tokens 4096
  ctxman map src --focus src/server.js      # around the file you are working on
  ctxman map --important-last -o map.txt    # best files last, next to your question
  ctxman map --graph --style dot | dot -Tsvg > deps.svg
`);
}

/**
 * Parse the command line
 * @param {string[]} argv
 * @returns {Object}
 */
function parseArgs(argv) {
  const options = {
    root: null,
    remote: null,
    branch: null,
    repos: [],
    tokens: undefined,
    focus: [],
    history: undefined,
    order: undefined,
    importantLast: false,
    style: undefined,
    graph: false,
    callGraph: false,
    output: null,
    copy: false,
    redact: true,
    quiet: false,
    help: false,
  };
  const integer = (name, value, minimum) => {
    if (!/^\d+$/.test(value ?? '') || Number(value) < minimum) {
      throw new Error(`${name} needs an integer >= ${minimum}, got ${JSON.stringify(value)}`);
    }
    return Number(value);
  };

  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let inline;
    if (arg.startsWith('--') && arg.includes('=')) {
      inline = arg.slice(arg.indexOf('=') + 1);
      arg = arg.slice(0, arg.indexOf('='));
    }
    const value = () => {
      if (inline !== undefined) return inline;
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };

    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-t':
      case '--tokens':
        options.tokens = integer(arg, value(), 1);
        break;
      case '--remote':
        options.remote = value();
        break;
      case '--branch':
        options.branch = value();
        break;
      case '--repo':
        options.repos.push(value());
        break;
      case '-f':
      case '--focus':
        options.focus.push(value());
        break;
      case '--history':
        options.history = integer(arg, value(), 0);
        break;
      case '--order':
        options.order = value();
        if (!ORDERS.includes(options.order)) {
          throw new Error(`--order must be one of ${ORDERS.join(', ')}`);
        }
        break;
      case '--important-last':
        options.importantLast = true;
        break;
      case '--style':
        options.style = value();
        if (!STYLES.includes(options.style)) {
          throw new Error(`--style must be one of ${STYLES.join(', ')}`);
        }
        break;
      case '--json':
        options.style = 'json';
        break;
      case '--graph':
        options.graph = true;
        break;
      case '-c':
      case '--call-graph':
        options.callGraph = true;
        break;
      case '-o':
      case '--output':
        options.output = value();
        break;
      case '--copy':
        options.copy = true;
        break;
      case '--no-redact':
        options.redact = false;
        break;
      case '-q':
      case '--quiet':
        options.quiet = true;
        break;
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        if (options.root !== null) throw new Error(`Unexpected argument: ${arg}`);
        options.root = arg;
    }
  }
  if (options.importantLast && options.order === 'path') {
    throw new Error('--important-last cannot be combined with --order path');
  }
  return options;
}

/**
 * A focus path is project-relative when it exists under the project, otherwise taken
 * from the current directory (`ctxman map ../app --focus ../app/src/a.js`). Preserves
 * an optional `:symbol` suffix.
 */
function focusPath(root, entry) {
  const lastColon = entry.lastIndexOf(':');
  let pathPart = entry;
  let symbolSuffix = '';
  if (lastColon > 1 && !fs.existsSync(path.resolve(root, entry))) {
    pathPart = entry.slice(0, lastColon);
    symbolSuffix = entry.slice(lastColon);
  }
  if (path.isAbsolute(pathPart) || fs.existsSync(path.resolve(root, pathPart))) {
    return `${pathPart}${symbolSuffix}`;
  }
  const fromCwd = path.resolve(pathPart);
  return fs.existsSync(fromCwd) ? `${fromCwd}${symbolSuffix}` : entry;
}

function formatMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error('Run "ctxman map --help" for usage.');
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    printHelp();
    return;
  }

  // stdout carries only the map: logger lines and ignore-file notices go to stderr, and
  // the map writes no log files into the project
  getLogger({ level: process.env.LOG_LEVEL || 'warn', logToFile: false });
  console.log = console.info = console.debug = console.error;
  const { renderRepoMap } = await import('../lib/map/index.js');
  const { mapWorkspace } = await import('../lib/workspace/index.js');
  const { default: ClipboardUtils } = await import('../lib/utils/clipboard-utils.js');

  let result;
  if (options.remote) {
    const { withRemoteRepo } = await import('../lib/utils/remote-repo.js');
    result = await withRemoteRepo(options.remote, { branch: options.branch }, (remoteDir) =>
      renderRepoMap(remoteDir, {
        tokens: options.tokens,
        focus: options.focus.map((entry) => focusPath(remoteDir, entry)),
        history: options.history,
        order: options.order,
        importantLast: options.importantLast,
        style: options.style,
        graph: options.graph,
        callGraph: options.callGraph,
        redact: options.redact,
      })
    );
  } else if (options.repos.length > 0) {
    const repoList = [
      ...(options.root !== null ? [path.resolve(options.root)] : []),
      ...options.repos.map((r) => path.resolve(r)),
    ];
    result = mapWorkspace(repoList, {
      tokens: options.tokens,
      focus: options.focus,
      history: options.history,
      order: options.order,
      importantLast: options.importantLast,
      style: options.style,
      graph: options.graph,
      callGraph: options.callGraph,
      redact: options.redact,
    });
  } else {
    const root = path.resolve(options.root ?? '.');
    result = renderRepoMap(root, {
      tokens: options.tokens,
      focus: options.focus.map((entry) => focusPath(root, entry)),
      history: options.history,
      order: options.order,
      importantLast: options.importantLast,
      style: options.style,
      graph: options.graph,
      callGraph: options.callGraph,
      redact: options.redact,
    });
  }

  if (options.output) {
    fs.writeFileSync(options.output, result.output);
  }
  if (options.copy && !ClipboardUtils.copy(result.output)) {
    process.exitCode = 1;
  }
  if (!options.output && !options.copy) {
    process.stdout.write(result.output);
  }

  if (options.quiet) return;
  for (const warning of result.warnings) console.error(`warning: ${warning}`);
  const { stats } = result;
  const parts = [];
  if (result.repos?.length > 1) parts.push(`${result.repos.length} repos`);
  if (options.graph || result.style === 'dot') {
    parts.push(`${stats.edges} edges between ${stats.files} files`);
    if (options.callGraph && stats.callEdges !== undefined) {
      parts.push(`${stats.callEdges} call edges`);
    }
  } else {
    parts.push(`${result.files.length} of ${stats.files} files`);
    parts.push(`${result.tokens}/${result.budget} tokens`);
    parts.push(`${stats.edges} import edges`);
    if (options.callGraph && stats.callEdges !== undefined) {
      parts.push(`${stats.callEdges} call edges`);
    }
  }
  const history = result.graph.history;
  if (history.available) parts.push(`history ${history.commits} commits`);
  if (stats.skipped.length > 0) parts.push(`${stats.skipped.length} large/minified files left out`);
  const redacted = Object.values(stats.redactions).reduce((sum, count) => sum + count, 0);
  if (redacted > 0) parts.push(`${redacted} secrets redacted`);
  parts.push(formatMs(stats.timings.total));
  console.error(`ctxman map: ${parts.join(' \u00b7 ')}`);
  if (options.output) console.error(`Map written to ${options.output}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
