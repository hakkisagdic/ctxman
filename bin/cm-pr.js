#!/usr/bin/env node
/**
 * ctxman pr - review context for a branch, the staged changes or the working tree
 *
 * stdout carries only the context (unless -o/--copy); everything else, including notices
 * printed by shared modules with console.log, goes to stderr.
 */

import fs from 'fs';
import path from 'path';
import { exitOnBrokenPipe } from '../lib/utils/cli-output.js';

// `ctxman ... | head` closes stdout early; stop quietly instead of throwing EPIPE
exitOnBrokenPipe();

// Shared modules (ignore-file notices, the logger) print with console.log; keep stdout
// for the context itself
const writeOut = (text) => process.stdout.write(text);
console.log = console.info = console.debug = console.error;

const VALUE_OPTIONS = {
  '--base': 'base',
  '--head': 'head',
  '--unified': 'unified',
  '-U': 'unified',
  '--ask': 'ask',
  '--instructions': 'instructions',
  '--budget': 'budget',
  '--style': 'style',
  '--output': 'output',
  '-o': 'output',
};

const FLAG_OPTIONS = {
  '--staged': ['staged', true],
  '--cached': ['staged', true],
  '--working': ['working', true],
  '--no-diff': ['diff', false],
  '--with-tests': ['withTests', true],
  '--with-files': ['withFiles', true],
  '--no-redact': ['redact', false],
  '--copy': ['copy', true],
  '--json': ['style', 'json'],
  '--quiet': ['quiet', true],
  '-q': ['quiet', true],
  '--help': ['help', true],
  '-h': ['help', true],
};

/**
 * Parse the command line
 * @param {string[]} argv
 * @returns {object}
 */
function parseArgs(argv) {
  const parsed = { paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      parsed.paths.push(...argv.slice(i + 1));
      break;
    }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    if (VALUE_OPTIONS[name]) {
      let value;
      if (eq > 0) value = arg.slice(eq + 1);
      else if (i + 1 < argv.length) value = argv[++i];
      else throw new Error(`${name} needs a value`);
      parsed[VALUE_OPTIONS[name]] = value;
    } else if (FLAG_OPTIONS[name] && eq < 0) {
      const [key, value] = FLAG_OPTIONS[name];
      parsed[key] = value;
    } else if (arg.startsWith('-') && arg !== '-') {
      throw new Error(`Unknown option: ${arg} (see ctxman pr --help)`);
    } else {
      parsed.paths.push(arg);
    }
  }
  if (parsed.paths.length > 1) {
    throw new Error(`Expected one project path, got ${parsed.paths.length}`);
  }
  return parsed;
}

/** "8000", "8k" or "1.5k" → 8000 / 1500 */
function parseTokenCount(text) {
  const match = /^(\d+(?:\.\d+)?)(k)?$/i.exec(String(text).trim());
  const value = match ? Math.round(Number(match[1]) * (match[2] ? 1000 : 1)) : NaN;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid --budget: ${text}`);
  return value;
}

function parseCount(text, flag) {
  if (!/^\d+$/.test(String(text))) throw new Error(`Invalid ${flag}: ${text}`);
  return Number(text);
}

const formatNumber = (n) => Number(n).toLocaleString('en-US');

function printSummary(result, extras) {
  const { stats } = result;
  const lines = [];
  if (result.mode === 'range') {
    lines.push(
      `ctxman pr: ${result.head.ref} into ${result.base.ref} (merge base ${result.mergeBase.short})`
    );
  } else {
    const what = result.mode === 'staged' ? 'staged changes' : 'working tree';
    lines.push(`ctxman pr: ${what} against ${result.base.ref} (${result.mergeBase.short})`);
  }
  lines.push(
    `  ${stats.commits} commit(s), ${stats.files} file(s) (+${stats.additions} -${stats.deletions}), ` +
      `${stats.changedMethods} changed method(s), ${stats.deletedMethods} deleted, ` +
      `${stats.relatedTests} related test(s)`
  );
  const sections = Object.entries(result.sections)
    .map(([name, tokens]) => `${name} ${formatNumber(tokens)}`)
    .join(', ');
  lines.push(`  ${formatNumber(result.tokens)} tokens (${result.style}): ${sections}`);
  if (result.budget) {
    const state = result.budget.over ? 'over budget' : 'within budget';
    lines.push(`  Budget ${formatNumber(result.budget.limit)}: ${state}`);
    for (const label of result.budget.dropped) lines.push(`    dropped ${label}`);
  }
  const redacted = Object.entries(result.redactions);
  if (redacted.length) {
    const total = redacted.reduce((sum, [, n]) => sum + n, 0);
    lines.push(
      `  Redacted ${total} secret(s): ${redacted.map(([type, n]) => `${n} ${type}`).join(', ')}`
    );
  }
  for (const warning of result.warnings) lines.push(`  Warning: ${warning}`);
  lines.push(...extras.map((line) => `  ${line}`));
  process.stderr.write(`${lines.join('\n')}\n`);
}

function printHelp() {
  writeOut(`ctxman pr - pull-request / branch review context for an LLM

Usage: ctxman pr [options] [path]

Compares the head with the merge base of base and head (what a pull request shows) and
writes, in this order: a summary, the commit log, the changed files, the full source of
every changed method (and the list of deleted ones), the unified diff, related tests,
optionally the changed files' full contents, and your question last.

Arguments:
  path                     Project directory inside a git work tree (default: current
                           directory); a subdirectory limits the change to that directory

What to compare:
  --base REF               Base branch/commit (default: origin/HEAD, else main, else master)
  --head REF               Head branch/commit (default: HEAD)
  --staged                 Staged changes (index) against HEAD, or against --base
  --working                Working tree, untracked files included, against HEAD or --base

Content:
  -U, --unified N          Context lines in the diff (default: 3)
  --no-diff                Leave out the unified diff
  --with-tests             Include the related tests' contents
  --with-files             Include the changed files' full contents
  --ask "QUESTION"         Append a question at the end
  --instructions FILE      Append the instructions in FILE at the end
  --budget TOKENS          Keep the output under TOKENS (e.g. 8000 or 8k): drops full
                           files, then test contents, test paths, diffs, method sources,
                           the method list, commit bodies, the log, the file list
  --no-redact              Do not mask secrets (keys, tokens) in the output

Output:
  --style STYLE            markdown (default), xml or json
  --json                   Same as --style json
  -o, --output FILE        Write to FILE instead of stdout
  --copy                   Copy to the clipboard instead of stdout
  -q, --quiet              No summary on stderr
  -h, --help               Show this help

.gitignore, .contextignore and .contextinclude decide which changed files have their
diff, methods and contents included; excluded files are still listed.

Examples:
  ctxman pr                                  # current branch against the default branch
  ctxman pr --base main --head feature/login -o review.md
  ctxman pr --working --ask "Anything risky in these changes?"
  ctxman pr --budget 16k --style xml --with-tests --copy
`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    printHelp();
    return;
  }

  try {
    const options = {
      base: args.base,
      head: args.head,
      staged: args.staged,
      working: args.working,
      diff: args.diff,
      withTests: args.withTests,
      withFiles: args.withFiles,
      redact: args.redact,
      style: args.style,
      ask: args.ask,
    };
    if (args.unified !== undefined) options.unified = parseCount(args.unified, '--unified');
    if (args.budget !== undefined) options.budget = parseTokenCount(args.budget);
    if (args.instructions !== undefined) {
      options.instructions = fs.readFileSync(path.resolve(args.instructions), 'utf8');
    }

    const { buildPrContext } = await import('../lib/pr/pr-context.js');
    const result = await buildPrContext(args.paths[0] || process.cwd(), options);

    const extras = [];
    let toStdout = !args.output && !args.copy;
    if (args.output) {
      const outputPath = path.resolve(args.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, result.output);
      extras.push(`Written to ${outputPath}`);
    }
    if (args.copy) {
      const { default: ClipboardUtils } = await import('../lib/utils/clipboard-utils.js');
      if (!ClipboardUtils.copy(result.output) && !args.output) {
        extras.push('Clipboard unavailable; writing to stdout instead');
        toStdout = true;
      }
    }
    if (toStdout) writeOut(result.output);
    if (!args.quiet) printSummary(result, extras);
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

main();
