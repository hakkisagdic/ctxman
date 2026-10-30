#!/usr/bin/env node
/**
 * ctxman task - task-driven auto context pack
 *
 * stdout carries the context document (unless -o/--output or --copy); summary goes to stderr.
 * Exit codes: 0 done, 1 error, 2 invalid arguments / options.
 */

import fs from 'fs';
import { buildTaskContext, parseBudget } from '../lib/task/index.js';
import ClipboardUtils from '../lib/utils/clipboard-utils.js';
import { getLogger } from '../lib/utils/logger.js';

getLogger({ level: 'error', logToFile: false });
console.log = console.info = console.debug = console.error;

function printHelp() {
  process.stdout.write(`ctxman task - build task-driven context bundle around a goal

Usage: ctxman task "<goal>" [root] [options]

Discovers seed files and symbols via hybrid search, traverses 1-hop full code
and 2-hop compressed signatures around them, prepends an architectural repo map,
and packs everything strictly within the token budget.

Options:
      --budget TOKENS      Token budget (e.g. 32000, 32k, 40k; default: 32000)
      --model MODEL        Target model profile (e.g. claude-sonnet-4-5)
      --format FORMAT      Output format: markdown (default), json, xml
      --json               Shorthand for --format json
      --search-mode MODE   Search mode: hybrid (default), bm25, semantic
      --no-redact          Do not mask secrets
  -o, --output FILE        Write output to FILE instead of stdout
      --copy               Copy document to clipboard
  -q, --quiet              Do not print summary to stderr
  -h, --help               Show this help

Examples:
  ctxman task "Add SQLite vector store"
  ctxman task "Fix OAuth token refresh" --budget 40k --format json
  ctxman task "Refactor tokenizer" -o task-context.md
`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  let goal = null;
  let root = process.cwd();
  let budget = 32000;
  let model = null;
  let format = 'markdown';
  let searchMode = 'hybrid';
  let redact = true;
  let outputFile = null;
  let copy = false;
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--budget') {
      budget = parseBudget(argv[++i], '--budget');
    } else if (arg.startsWith('--budget=')) {
      budget = parseBudget(arg.slice('--budget='.length), '--budget');
    } else if (arg === '--model' || arg === '--target-model') {
      model = argv[++i];
    } else if (arg.startsWith('--model=')) {
      model = arg.slice('--model='.length);
    } else if (arg === '--format') {
      format = argv[++i];
    } else if (arg.startsWith('--format=')) {
      format = arg.slice('--format='.length);
    } else if (arg === '--json') {
      format = 'json';
    } else if (arg === '--search-mode') {
      searchMode = argv[++i];
    } else if (arg.startsWith('--search-mode=')) {
      searchMode = arg.slice('--search-mode='.length);
    } else if (arg === '--no-redact') {
      redact = false;
    } else if (arg === '-o' || arg === '--output') {
      outputFile = argv[++i];
    } else if (arg.startsWith('-o=')) {
      outputFile = arg.slice('-o='.length);
    } else if (arg.startsWith('--output=')) {
      outputFile = arg.slice('--output='.length);
    } else if (arg === '--copy') {
      copy = true;
    } else if (arg === '-q' || arg === '--quiet') {
      quiet = true;
    } else if (!arg.startsWith('-')) {
      if (goal === null) {
        goal = arg;
      } else if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
        root = arg;
      } else {
        // Append additional goal words if unquoted
        goal += ` ${arg}`;
      }
    } else {
      process.stderr.write(`Unknown option: ${arg}\n`);
      process.exit(2);
    }
  }

  if (!goal) {
    process.stderr.write('Error: A task goal is required.\n');
    process.exit(2);
  }

  try {
    const result = await buildTaskContext(root, goal, {
      budget,
      model,
      format,
      searchMode,
      redact,
      output: outputFile,
    });

    if (copy) {
      await ClipboardUtils.copy(result.text);
      if (!quiet) {
        process.stderr.write(`Copied ${result.totalTokens} tokens to clipboard.\n`);
      }
    } else if (!outputFile) {
      process.stdout.write(result.text + (result.text.endsWith('\n') ? '' : '\n'));
    }

    if (!quiet) {
      process.stderr.write(
        `Task Context: ${result.files.length} file(s), ${result.totalTokens}/${result.budget} tokens (${result.format}).\n`
      );
      if (outputFile) {
        process.stderr.write(`Saved to: ${outputFile}\n`);
      }
    }
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

main();
