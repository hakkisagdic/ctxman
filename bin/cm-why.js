#!/usr/bin/env node
/**
 * ctxman why - "why is the code like this?" context from the local git history
 *
 *   ctxman why <file>               history of a whole file
 *   ctxman why <file>:<symbol>      a function, method or class (Class.method works too)
 *   ctxman why <file>#L10-L40       a line range
 *
 * The document goes to stdout (or -o / --copy); the summary and warnings go to stderr.
 */

import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../lib/utils/logger.js';

// stdout carries the document: the shared logger must neither print to it nor create log
// files in the user's repository, and notices printed with console.log go to stderr.
// The library is imported afterwards because its modules create the logger on import
getLogger({ level: 'error', logToFile: false });
const writeOut = (text) => process.stdout.write(text);
console.log = console.info = console.debug = console.error;

const { explainHistory, findRepositoryRoot, WhyError } = await import('../lib/why/index.js');
const { default: ClipboardUtils } = await import('../lib/utils/clipboard-utils.js');

const HELP = `Usage: ctxman why <target> [options]

Explain why code looks the way it does: the commits that shaped it (with their
messages), the issues, tickets and URLs they reference, blame ownership, files
that change together with it, docs / ADRs / changelog entries / comments that
mention it, TODO-style notes inside it and the tests that reference it. Built
from the local git history; no network access.

Targets (paths are relative to the current directory, inside the repository):
  <file>                    The whole file (history follows renames)
  <file>:<symbol>           A function, method or class: total, Cart.total, Cart::total
  <file>#L10-L40            A line range (also <file>#L10 and <file>:10-40)

Options:
  -n, --limit <n>           Commits to include (default: 20)
      --since <date>        Only commits after this date ("2024-01-01", "6 months ago")
      --rev <ref>           Explain the code as of this revision (default: working tree)
      --patches             Include each commit's diff of the target
      --coupling-window <n> Commits of the file examined for co-changes (default: 500, 0 = off)
      --budget <tokens>     Keep the output within this many tokens (8000 or 8k); drops
                            patches, related text, tests, coupling details and older
                            commits first
      --style <style>       markdown (default), xml or json
      --json                Same as --style json
      --ask <question>      Append a question at the end of the document
  -o, --output <file>       Write the document to a file instead of stdout
      --copy                Copy the document to the clipboard instead of stdout
      --no-redact           Do not mask secrets (API keys, tokens, private keys)
  -h, --help                Show this help

Examples:
  ctxman why src/cart.js:total
  ctxman why src/cart.js#L40-L72 --patches --budget 8000
  ctxman why lib/server.js --since "1 year ago" --style xml -o why.xml
  ctxman why src/cart.js:total --ask "Why do we round here instead of in applyDiscount?" --copy
`;

const OPTIONS = {
  limit: { type: 'string', short: 'n' },
  since: { type: 'string' },
  rev: { type: 'string' },
  patches: { type: 'boolean' },
  'coupling-window': { type: 'string' },
  budget: { type: 'string' },
  style: { type: 'string' },
  json: { type: 'boolean' },
  ask: { type: 'string' },
  output: { type: 'string', short: 'o' },
  copy: { type: 'boolean' },
  'no-redact': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

function fail(message, exitCode = 1) {
  process.stderr.write(`ctxman why: ${message}\n`);
  process.exitCode = exitCode;
}

/** "8000", "8k" or "1.5k" -> 8000 / 1500; anything else is left for the library to reject */
function parseTokenCount(text) {
  if (text === undefined) return undefined;
  const match = /^(\d+(?:\.\d+)?)k$/i.exec(text.trim());
  return match ? Math.round(Number(match[1]) * 1000) : text;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * One-line summary for stderr
 */
function summarize(result) {
  const { data } = result;
  const { target } = data;
  const where = target.symbol ? `${target.path}:${target.symbol}` : target.path;
  const span =
    target.wholeFile || target.startLine === null
      ? ''
      : ` (lines ${target.startLine}-${target.endLine})`;
  const references = Object.values(data.references).reduce((sum, list) => sum + list.length, 0);
  const parts = [
    plural(data.history.commits.length, 'commit'),
    plural(references, 'reference'),
    plural(data.ownership?.authors.length ?? 0, 'author'),
    plural(data.coupling?.files.length ?? 0, 'co-changed file'),
    plural(data.related.length, 'related snippet'),
    plural(data.notes.length, 'note'),
    plural(data.tests.length, 'test file'),
  ];
  const budget = result.budget ? ` of ${result.budget.toLocaleString('en-US')}` : '';
  const omitted = Object.entries(result.omitted)
    .map(([key, count]) => `${count} ${key}`)
    .join(', ');
  return (
    `ctxman why: ${where}${span}: ${parts.join(', ')}; ` +
    `${result.tokens.toLocaleString('en-US')}${budget} tokens` +
    (omitted ? ` (omitted to fit: ${omitted})` : '')
  );
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({ args: process.argv.slice(2), options: OPTIONS, allowPositionals: true });
  } catch (error) {
    fail(`${error.message}\nRun "ctxman why --help" for usage.`, 2);
    return;
  }
  const { values, positionals } = parsed;

  if (values.help || positionals.length === 0) {
    writeOut(HELP);
    return;
  }
  if (positionals.length > 1) {
    fail(
      `expected one target, got ${positionals.length}: ${positionals.join(' ')} (quote the --ask question)`,
      2
    );
    return;
  }

  const cwd = process.cwd();
  let result;
  try {
    const root = findRepositoryRoot(cwd);
    result = await explainHistory(root, positionals[0], {
      cwd,
      limit: values.limit,
      since: values.since,
      rev: values.rev,
      patches: values.patches,
      couplingWindow: values['coupling-window'],
      budget: parseTokenCount(values.budget),
      style: values.json ? 'json' : values.style,
      ask: values.ask,
      redact: !values['no-redact'],
    });
  } catch (error) {
    if (error instanceof WhyError) {
      const exitCode = { INVALID_OPTION: 2, INVALID_REF: 2, POLICY_DENIED: 3 }[error.code] ?? 1;
      fail(error.message, exitCode);
    } else {
      fail(error.message);
    }
    return;
  }

  let toStdout = !values.output && !values.copy;
  if (values.output) {
    const file = path.resolve(cwd, values.output);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, result.text);
    process.stderr.write(`Wrote ${path.relative(cwd, file) || file}\n`);
  }
  if (values.copy) {
    if (ClipboardUtils.copy(result.text)) {
      process.stderr.write('Copied to the clipboard\n');
    } else if (!values.output) {
      process.stderr.write('Clipboard unavailable; writing to stdout instead\n');
      toStdout = true;
    }
  }
  if (toStdout) writeOut(result.text);

  for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);
  process.stderr.write(`${summarize(result)}\n`);
}

await main();
