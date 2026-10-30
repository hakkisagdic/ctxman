#!/usr/bin/env node

/**
 * ctxman search: ranked (BM25, semantic, or RRF hybrid) search over methods and code chunks
 *
 *   ctxman search "<query>" [path] [--repo DIR] [--hybrid | --mode bm25|semantic|hybrid]
 *                 [--limit N] [--max-tokens N] [--json] [--full]
 *                 [--no-redact] [-o FILE] [--copy]
 */

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { searchProject, DEFAULT_LIMIT, DEFAULT_MAX_TOKENS } from '../lib/search/bm25.js';
import { hybridSearch, SEARCH_MODES } from '../lib/search/hybrid.js';
import { searchWorkspace } from '../lib/workspace/index.js';
import { getLogger } from '../lib/utils/logger.js';
import ClipboardUtils from '../lib/utils/clipboard-utils.js';
import { exitOnBrokenPipe } from '../lib/utils/cli-output.js';

// `ctxman ... | head` closes stdout early; stop quietly instead of throwing EPIPE
exitOnBrokenPipe();

const PREVIEW_LINES = 8;

const OPTIONS = {
  limit: { type: 'string', short: 'n' },
  'max-tokens': { type: 'string' },
  repo: { type: 'string', multiple: true },
  hybrid: { type: 'boolean' },
  mode: { type: 'string' },
  json: { type: 'boolean' },
  full: { type: 'boolean' },
  'no-redact': { type: 'boolean' },
  output: { type: 'string', short: 'o' },
  copy: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

// stdout carries the results; scanner notices and log lines go to stderr
const write = (text) => process.stdout.write(text);
console.log = console.info = console.debug = console.error;

function printHelp() {
  write(`ctxman search - Ranked code search (BM25, semantic, or Reciprocal Rank Fusion hybrid)

Usage:
  ctxman search "<query>" [path] [options]

The query is a few words, identifiers, or a natural-language phrase. Identifiers are split
into words (getUserName, get_user_name and get-user-name all mean "get user name"), and a
chunk is a method or function, or a window of up to 40 lines of the code outside them.
.gitignore, .contextignore, .contextinclude, and .ctxman/policy.json apply.

Options:
  -n, --limit <n>        Number of results (default: ${DEFAULT_LIMIT})
  --max-tokens <n>       Token budget for the returned code (default: ${DEFAULT_MAX_TOKENS})
  --repo <dir>           Search across multiple repository roots under one token budget (repeatable)
  --hybrid               Fuse BM25 lexical search with local vector embeddings via RRF
  --mode <mode>          bm25 (default), hybrid, or semantic
  --full                 Print whole chunks instead of the first ${PREVIEW_LINES} lines
  --json                 Print the results as JSON
  --no-redact            Do not redact secrets in the returned code
  -o, --output <file>    Write the output to a file
  --copy                 Copy the output to the clipboard
  -h, --help             Show this help

Examples:
  ctxman search "parse config file"
  ctxman search "how authentication sessions expire" --hybrid
  ctxman search "invoice total" --repo ../api --repo ../billing
  ctxman search getUserName ./services/api --limit 5
  ctxman search "retry backoff" --json | jq '.results[].file'
`);
}

class UsageError extends Error {}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new UsageError(`${name} must be a positive integer, got "${value}"`);
  }
  return number;
}

function resolveMode(values) {
  if (values.hybrid && values.mode !== undefined && values.mode !== 'hybrid') {
    throw new UsageError(`Cannot combine --hybrid with --mode ${values.mode}`);
  }
  const mode = values.hybrid ? 'hybrid' : (values.mode ?? 'bm25');
  if (!SEARCH_MODES.includes(mode)) {
    throw new UsageError(`--mode must be one of ${SEARCH_MODES.join(', ')}, got "${mode}"`);
  }
  return mode;
}

/**
 * Human-readable listing
 * @param {object} result
 * @param {boolean} full - Whole chunks instead of a preview
 * @returns {string}
 */
function formatResults(result, full) {
  const modeLabel =
    result.effectiveMode && result.effectiveMode !== 'bm25'
      ? `${result.effectiveMode === 'hybrid' ? 'Hybrid (BM25 + semantic RRF)' : 'Semantic'} search`
      : 'Ranked search';
  const header = `${modeLabel} for "${result.query}" in ${result.root} (${result.files} files, ${result.chunks} chunks)\n`;
  if (result.results.length === 0) return `${header}\nNo matches.\n`;

  const width = String(result.results.length).length;
  const blocks = result.results.map((hit, i) => {
    const label = hit.name
      ? `  ${hit.parent ? `${hit.parent}.` : ''}${hit.name} (${hit.kind})`
      : '';
    const ranks =
      hit.bm25Rank !== undefined || hit.semanticRank !== undefined
        ? ` [${[
            hit.bm25Rank ? `bm25 #${hit.bm25Rank}` : null,
            hit.semanticRank ? `sem #${hit.semanticRank}` : null,
          ]
            .filter(Boolean)
            .join(', ')}]`
        : '';
    const lines = [
      `${String(i + 1).padStart(width)}. ${hit.file}:${hit.startLine}-${hit.endLine}${label}  score ${hit.score}${ranks}`,
    ];
    if (hit.text === null) {
      lines.push('    (code left out: token budget reached)');
      return lines.join('\n');
    }
    const code = hit.text.split('\n');
    const shown = full ? code : code.slice(0, PREVIEW_LINES);
    const numberWidth = String(hit.startLine + shown.length - 1).length;
    shown.forEach((line, j) => {
      lines.push(`    ${String(hit.startLine + j).padStart(numberWidth)} | ${line}`);
    });
    const hidden = hit.endLine - hit.startLine + 1 - shown.length;
    if (hidden > 0) {
      lines.push(`    ... ${hidden} more line${hidden === 1 ? '' : 's'}`);
    }
    return lines.join('\n');
  });
  return `${header}\n${blocks.join('\n\n')}\n`;
}

async function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    }));
  } catch (error) {
    throw new UsageError(error.message);
  }
  if (values.help) {
    printHelp();
    return;
  }

  const mode = resolveMode(values);
  const extraRepos = values.repo ?? [];
  if (extraRepos.length > 0 && mode !== 'bm25') {
    throw new UsageError('Multi-repository --repo search currently uses BM25 lexical mode');
  }

  // A last positional that names a directory is the project; the rest is the query
  let explicitRoot = null;
  const last = positionals.at(-1);
  if (positionals.length > 1 && fs.statSync(last, { throwIfNoEntry: false })?.isDirectory()) {
    explicitRoot = path.resolve(positionals.pop());
  }
  const root = explicitRoot ?? process.cwd();
  const query = positionals.join(' ').trim();
  if (!query) throw new UsageError('Missing query: ctxman search "<query>" [path]');

  const limit =
    values.limit === undefined ? DEFAULT_LIMIT : positiveInteger(values.limit, '--limit');
  const maxTokens =
    values['max-tokens'] === undefined
      ? DEFAULT_MAX_TOKENS
      : positiveInteger(values['max-tokens'], '--max-tokens');

  // Scan and analyzer progress lines are noise here; LOG_LEVEL still overrides
  getLogger().level = process.env.LOG_LEVEL || 'warn';
  const redact = values['no-redact'] !== true;

  let result;
  if (extraRepos.length > 0) {
    const repoList = [
      ...(explicitRoot ? [explicitRoot] : []),
      ...extraRepos.map((r) => path.resolve(r)),
    ];
    result = searchWorkspace(repoList, query, { limit, maxTokens, redact });
  } else if (mode === 'bm25') {
    result = searchProject(root, query, { limit, maxTokens, redact });
  } else {
    result = await hybridSearch(root, query, {
      mode,
      limit,
      maxTokens,
      redact,
      onProgress: (event) => {
        if (event === 'indexing') {
          console.error('Building local semantic embedding index (.ctxman/self-knowledge)...');
        }
      },
    });
  }

  if (Array.isArray(result.warnings)) {
    for (const warning of result.warnings) console.error(`Warning: ${warning}`);
  }

  const output = values.json
    ? `${JSON.stringify(result, null, 2)}\n`
    : formatResults(result, values.full === true);

  if (values.output) {
    fs.writeFileSync(values.output, output);
    console.error(`Wrote ${result.results.length} results to ${values.output}`);
  } else {
    write(output);
  }
  if (values.copy) ClipboardUtils.copy(output);
}

try {
  await main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  if (error instanceof UsageError) {
    console.error('Run `ctxman search --help` for usage.');
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
}
