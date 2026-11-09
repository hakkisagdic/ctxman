#!/usr/bin/env node
/**
 * ctxman who - "Who knows about this?" Expert Finder across git blame, recency-decayed commit history,
 * CODEOWNERS stewardship, and natural-language topic search.
 */

import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../lib/utils/logger.js';

getLogger({ level: 'error', logToFile: false });
const writeOut = (text) => process.stdout.write(text);
console.log = console.info = console.debug = console.error;

const { findExperts, WhoError, DEFAULT_WHO_LIMIT, DEFAULT_COMMIT_WINDOW, DEFAULT_HALF_LIFE_DAYS } =
  await import('../lib/who/index.js');

const HELP = `Usage: ctxman who <target-or-topic> [options]

Find the code and domain experts for a file, symbol, line range, directory, or
natural-language topic by fusing surviving git blame ownership, recency-decayed
commit/churn depth, and CODEOWNERS stewardship (single-repo or multi-repo workspace).

Targets:
  <file>                    A single file (e.g. lib/why/index.js or <alias>/src/index.js)
  <file>:<symbol>           A function, method, or class (e.g. lib/why/index.js:explainHistory)
  <file>#L10-L40            A line range
  <directory>               A directory / subsystem (e.g. lib/rag or <alias>/src)
  "<topic query>"           A natural-language concept resolved via BM25 code search

Options:
      --root <dir>          Primary repository root (default: cwd)
      --repo <dir>          Additional repository root for multi-repo workspace (repeatable)
  -n, --limit <n>           Maximum experts to return (default: ${DEFAULT_WHO_LIMIT})
      --commits <n>         Commit window to examine (default: ${DEFAULT_COMMIT_WINDOW})
      --half-life <days>    Recency decay half-life in days (default: ${DEFAULT_HALF_LIFE_DAYS})
      --since <date>        Only examine commits after this date
      --style <style>       markdown (default), xml, or json
      --json                Same as --style json
  -o, --output <file>       Write output to a file instead of stdout
  -h, --help                Show this help
`;

const OPTIONS = {
  root: { type: 'string' },
  repo: { type: 'string', multiple: true },
  limit: { type: 'string', short: 'n' },
  commits: { type: 'string' },
  'half-life': { type: 'string' },
  since: { type: 'string' },
  style: { type: 'string' },
  json: { type: 'boolean' },
  output: { type: 'string', short: 'o' },
  help: { type: 'boolean', short: 'h' },
};

function fail(message, exitCode = 1) {
  process.stderr.write(`ctxman who: ${message}\n`);
  process.exitCode = exitCode;
}

async function run() {
  let parsed;
  try {
    parsed = parseArgs({ options: OPTIONS, allowPositionals: true });
  } catch (err) {
    fail(err.message);
    return;
  }

  const { values, positionals } = parsed;
  if (values.help) {
    writeOut(HELP);
    return;
  }

  const target = positionals.join(' ').trim();
  if (!target) {
    fail('missing <target-or-topic>. Run `ctxman who --help` for usage.');
    return;
  }

  const style = values.json ? 'json' : values.style || 'markdown';
  if (!['markdown', 'xml', 'json'].includes(style)) {
    fail(`unsupported --style "${style}" (expected markdown, xml, or json)`);
    return;
  }

  const rootDir = values.root ? path.resolve(process.cwd(), values.root) : process.cwd();
  const extraRepos = Array.isArray(values.repo)
    ? values.repo.map((r) => path.resolve(process.cwd(), r))
    : undefined;

  try {
    const result = await findExperts(rootDir, target, {
      repos: extraRepos,
      limit: values.limit ? Number(values.limit) : undefined,
      commitWindow: values.commits ? Number(values.commits) : undefined,
      halfLifeDays: values['half-life'] ? Number(values['half-life']) : undefined,
      since: values.since,
      style,
    });

    if (values.output) {
      fs.writeFileSync(values.output, result.text, 'utf8');
    } else {
      writeOut(result.text);
    }
  } catch (err) {
    if (err instanceof WhoError) {
      fail(err.message);
      return;
    }
    throw err;
  }
}

await run();
