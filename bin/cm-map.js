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
  -f, --focus PATH         Bias the ranking toward a file or folder and its neighbours
                           (repeatable)
      --history N          Commits of git history to mine for change frequency
                           (default: 300, 0 disables)
      --order rank|path    Order of the files in the output (default: rank)
      --important-last     Highest-ranked file at the end (rank order only)
      --style STYLE        text (default), markdown, json, dot (Graphviz)
      --json               Same as --style json
      --graph              Print the dependency edges instead of the map
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
    tokens: undefined,
    focus: [],
    history: undefined,
    order: undefined,
    importantLast: false,
    style: undefined,
    graph: false,
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
 * from the current directory (`ctxman map ../app --focus ../app/src/a.js`)
 */
function focusPath(root, entry) {
  if (path.isAbsolute(entry) || fs.existsSync(path.resolve(root, entry))) return entry;
  const fromCwd = path.resolve(entry);
  return fs.existsSync(fromCwd) ? fromCwd : entry;
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
  const { default: ClipboardUtils } = await import('../lib/utils/clipboard-utils.js');

  const root = path.resolve(options.root ?? '.');
  const result = renderRepoMap(root, {
    tokens: options.tokens,
    focus: options.focus.map((entry) => focusPath(root, entry)),
    history: options.history,
    order: options.order,
    importantLast: options.importantLast,
    style: options.style,
    graph: options.graph,
    redact: options.redact,
  });

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
  if (options.graph || result.style === 'dot') {
    parts.push(`${stats.edges} edges between ${stats.files} files`);
  } else {
    parts.push(`${result.files.length} of ${stats.files} files`);
    parts.push(`${result.tokens}/${result.budget} tokens`);
    parts.push(`${stats.edges} import edges`);
  }
  const history = result.graph.history;
  if (history.available) parts.push(`history ${history.commits} commits`);
  if (stats.skipped.length > 0) parts.push(`${stats.skipped.length} large/minified files left out`);
  const redacted = Object.values(stats.redactions).reduce((sum, count) => sum + count, 0);
  if (redacted > 0) parts.push(`${redacted} secrets redacted`);
  parts.push(formatMs(stats.timings.total));
  console.error(`ctxman map: ${parts.join(' · ')}`);
  if (options.output) console.error(`Map written to ${options.output}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
