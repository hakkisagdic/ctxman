#!/usr/bin/env node
/**
 * ctxman focus - pack a target file (or file:symbol) and its import/call neighborhood
 *
 * stdout carries only the document (unless -o/--copy); summary and notices go to stderr.
 * Exit codes: 0 done, 1 error, 2 invalid policy / exceeds --max-tokens, 3 refused by policy.
 */

import fs from 'fs';
import path from 'path';
import { getLogger } from '../lib/utils/logger.js';

const STYLES = ['xml', 'markdown', 'plain', 'json'];
const EXIT_TOO_LARGE = 2;

function printHelp() {
  process.stdout.write(`ctxman focus - pack a file (or file:symbol) and its import/call neighborhood

Usage: ctxman focus <file[:symbol]> [root] [options]

Resolves <file> inside the project (default root: current directory) or across a
multi-repository workspace (--repo), traverses the repository import graph and
cross-file AST symbol call graph up to --depth hops (both outgoing imports/calls
and incoming importers/callers by default), and packs the target file first
followed by its closest neighbors.

Graph Neighborhood:
      --repo DIR           Additional repository root for cross-repo neighborhood (repeatable)
  -d, --depth N            Hops in the import/call graph (default: 1; 0 = target file only)
  -s, --symbol NAME        Focus the cross-file call graph around a specific function/method
      --imports-only       Follow only outgoing imports/callees (dependencies of <file>)
      --importers-only     Follow only incoming importers/callers (files depending on <file>)
      --calls-only         Follow only outgoing cross-file function calls
      --callers-only       Follow only incoming cross-file function callers
      --no-calls           Disable cross-file AST call graph edges (module imports only)
      --no-imports         Same as --importers-only
      --no-importers       Same as --imports-only
      --no-tests           Exclude test/spec files from the neighborhood

Document & Size:
      --budget TOKENS      Token limit (e.g. 20000 or 20k); target first, closest hops next
      --max-tokens TOKENS  Exit with code 2, writing nothing, when the document is larger
      --style STYLE        xml (default), markdown, plain, json
      --json               Same as --style json
      --no-tree            Leave out the directory tree
      --header TEXT        Text at the top
      --instructions FILE  Append the text of FILE at the end, after the files
      --line-numbers       Number every line
      --compress           Keep signatures, replace function bodies with placeholders
      --no-redact          Do not mask secrets
      --target-model ID    Count with this model's tokenizer encoding and report fit

Output:
  -o, --output FILE        Write to FILE instead of stdout
      --copy               Copy to the clipboard instead of stdout
  -q, --quiet              No summary on stderr
  -h, --help               Show this help

Examples:
  ctxman focus src/auth/login.ts
  ctxman focus src/auth/login.ts:authenticate --depth 2
  ctxman focus billing-api/src/invoice.js --repo ../checkout-web --depth 2
  ctxman focus src/auth/login.ts --depth 2 --budget 25k --style markdown
  ctxman focus lib/pack/index.js --imports-only --compress --copy
  ctxman focus src/billing.js --no-tests -o focus-billing.xml
`);
}

function parseTokens(text, flag) {
  const match = /^(\d+(?:\.\d+)?)([km])?$/i.exec(String(text).trim());
  const scale = { k: 1e3, m: 1e6 }[match?.[2]?.toLowerCase()] ?? 1;
  const value = match ? Math.round(Number(match[1]) * scale) : NaN;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} needs a positive number of tokens (e.g. 20000 or 20k), got ${text}`);
  }
  return value;
}

function parseDepth(text) {
  const value = Number(String(text).trim());
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--depth needs a non-negative integer, got ${text}`);
  }
  return value;
}

const VALUE_OPTIONS = {
  '--root': 'root',
  '-r': 'root',
  '--repo': 'repos',
  '--depth': 'depth',
  '-d': 'depth',
  '--symbol': 'symbol',
  '-s': 'symbol',
  '--budget': 'budget',
  '--max-tokens': 'maxTokens',
  '--style': 'style',
  '--header': 'header',
  '--instructions': 'instructions',
  '--target-model': 'targetModel',
  '--output': 'output',
  '-o': 'output',
};

const FLAG_OPTIONS = {
  '--imports-only': ['importers', false],
  '--importers-only': ['imports', false],
  '--calls-only': ['direction', 'calls'],
  '--callers-only': ['direction', 'callers'],
  '--calls': ['callGraph', true],
  '--no-calls': ['callGraph', false],
  '--no-imports': ['imports', false],
  '--no-importers': ['importers', false],
  '--no-tests': ['includeTests', false],
  '--json': ['style', 'json'],
  '--tree': ['tree', true],
  '--no-tree': ['tree', false],
  '--line-numbers': ['lineNumbers', true],
  '--compress': ['compress', true],
  '--redact': ['redact', true],
  '--no-redact': ['redact', false],
  '--copy': ['copy', true],
  '--quiet': ['quiet', true],
  '-q': ['quiet', true],
  '--help': ['help', true],
  '-h': ['help', true],
};

export function parseFocusArgs(argv) {
  const options = {
    repos: [],
    depth: 1,
    imports: true,
    importers: true,
    callGraph: true,
    includeTests: true,
    tree: true,
    redact: true,
    positional: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      options.positional.push(...argv.slice(i + 1));
      break;
    }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    if (VALUE_OPTIONS[name]) {
      let value;
      if (eq > 0) value = arg.slice(eq + 1);
      else if (i + 1 < argv.length) value = argv[++i];
      else throw new Error(`${name} needs a value`);
      const key = VALUE_OPTIONS[name];
      if (key === 'repos') {
        options.repos.push(value);
      } else {
        options[key] = value;
      }
    } else if (FLAG_OPTIONS[name] && eq < 0) {
      const [key, value] = FLAG_OPTIONS[name];
      options[key] = value;
    } else if (arg.startsWith('-') && arg !== '-') {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.positional.push(arg);
    }
  }

  if (options.help) return options;

  if (options.positional.length === 0) {
    throw new Error('Missing target <file>');
  }
  if (options.positional.length > 2) {
    throw new Error(
      `Expected <file> [root], got ${options.positional.length} positional arguments`
    );
  }

  options.depth = parseDepth(options.depth);
  if (!options.imports && !options.importers && !options.direction && options.depth > 0) {
    throw new Error(
      'Cannot disable both --imports and --importers (use --depth 0 for target only)'
    );
  }
  if (options.style !== undefined && !STYLES.includes(options.style)) {
    throw new Error(`--style must be one of ${STYLES.join(', ')}`);
  }
  if (options.budget !== undefined) options.budget = parseTokens(options.budget, '--budget');
  if (options.maxTokens !== undefined) {
    options.maxTokens = parseTokens(options.maxTokens, '--max-tokens');
  }

  return options;
}

const formatNumber = (n) => Number(n).toLocaleString('en-US');

function display(file) {
  const relative = path.relative(process.cwd(), file);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file;
}

function printSummary(result, extras) {
  const { focus } = result;
  const packedNeighbors = Math.max(0, result.files.length - 1);
  const targetLabel = focus.symbol ? `${focus.target}:${focus.symbol}` : focus.target;
  const repoLabel =
    result.repos?.length > 1 ? ` across ${formatNumber(result.repos.length)} repos` : '';
  const lines = [
    `ctxman focus: ${targetLabel} + ${formatNumber(packedNeighbors)}/${formatNumber(focus.neighbors.length)} neighbor(s)${repoLabel} ` +
      `(depth ${focus.depth}, ${focus.direction}), ${formatNumber(result.totalTokens)} tokens (${result.style}, ${result.encoding})`,
  ];
  if (result.budget) {
    const omitted = result.omitted.length;
    lines.push(
      `  Budget ${formatNumber(result.budget.limit)}: ${formatNumber(result.budget.used)} used` +
        (omitted ? `; ${formatNumber(omitted)} neighbor(s) left out` : '; every file fits')
    );
  }
  if (result.compression) {
    lines.push(
      `  Compressed ${formatNumber(result.compression.bodies)} function bodies: ` +
        `${formatNumber(result.compression.savedTokens)} tokens saved`
    );
  }
  if (result.redactions.total) {
    lines.push(`  Redacted ${formatNumber(result.redactions.total)} secret(s)`);
  }
  lines.push(...extras.map((line) => `  ${line}`));
  process.stderr.write(`${lines.join('\n')}\n`);
}

async function main() {
  let args;
  try {
    args = parseFocusArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\nRun "ctxman focus --help" for usage.\n`);
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    printHelp();
    return;
  }

  getLogger({ level: process.env.LOG_LEVEL || 'warn', logToFile: false });
  console.log = console.info = console.debug = console.error;

  try {
    const { focusContext } = await import('../lib/focus/index.js');
    const [target, explicitRoot] = args.positional;
    const root = path.resolve(args.root ?? explicitRoot ?? '.');
    const output = args.output ? path.resolve(args.output) : null;

    const options = {
      repos: args.repos.map((r) => path.resolve(r)),
      depth: args.depth,
      symbol: args.symbol,
      direction: args.direction,
      imports: args.imports,
      importers: args.importers,
      callGraph: args.callGraph,
      includeTests: args.includeTests,
      cwd: args.root || explicitRoot ? root : process.cwd(),
      style: args.style,
      tree: args.tree,
      header: args.header,
      lineNumbers: args.lineNumbers,
      compress: args.compress,
      redact: args.redact,
      budget: args.budget,
      targetModel: args.targetModel,
      excludeFiles: output ? [output] : [],
    };
    if (args.instructions !== undefined) {
      options.instructions = fs.readFileSync(path.resolve(args.instructions), 'utf8');
    }

    const result = await focusContext(root, target, options);
    const extras = [];

    if (args.maxTokens && result.totalTokens > args.maxTokens) {
      if (!args.quiet) printSummary(result, extras);
      process.stderr.write(
        `Error: the document has ${formatNumber(result.totalTokens)} tokens, more than ` +
          `--max-tokens ${formatNumber(args.maxTokens)}; nothing was written.\n`
      );
      process.exitCode = EXIT_TOO_LARGE;
      return;
    }

    let toStdout = !output && !args.copy;
    if (output) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, result.text);
      extras.push(`Written to ${display(output)}`);
    }
    if (args.copy) {
      const { default: ClipboardUtils } = await import('../lib/utils/clipboard-utils.js');
      if (!ClipboardUtils.copy(result.text) && !output) {
        extras.push('Clipboard unavailable; writing to stdout instead');
        toStdout = true;
      }
    }
    if (toStdout) process.stdout.write(result.text);
    if (!args.quiet) printSummary(result, extras);
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = error.exitCode ?? 1;
  }
}

process.stdout.on('error', (error) => {
  if (error.code !== 'EPIPE') throw error;
  process.exit(process.exitCode ?? 0);
});

main();
