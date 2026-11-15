#!/usr/bin/env node
/**
 * ctxman impact - Pre-change Blast Radius & Symbol Contract Simulator
 *
 * Usage: ctxman impact <file[:symbol]> [path] [--depth N] [--json]
 */

import path from 'path';
import { getLogger } from '../lib/utils/logger.js';
import { analyzeBlastRadius } from '../lib/impact/index.js';

function printHelp() {
  process.stdout.write(`ctxman impact - Pre-change Blast Radius & Symbol Contract Simulator

Usage: ctxman impact <file[:symbol]> [path] [options]

Options:
      --symbol NAME        Explicit symbol name inside target file
      --depth N            Maximum dependency hop depth (default: 2)
      --no-reviewers       Skip git history reviewer lookup
      --json               Output structured JSON instead of Markdown
  -h, --help               Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    symbol: null,
    depth: 2,
    includeReviewers: true,
    json: false,
    help: false,
    positionals: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--no-reviewers') {
      opts.includeReviewers = false;
    } else if (arg === '--symbol' && i + 1 < argv.length) {
      opts.symbol = argv[++i];
    } else if (arg.startsWith('--symbol=')) {
      opts.symbol = arg.slice('--symbol='.length);
    } else if (arg === '--depth' && i + 1 < argv.length) {
      opts.depth = Number(argv[++i]);
    } else if (arg.startsWith('--depth=')) {
      opts.depth = Number(arg.slice('--depth='.length));
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      opts.positionals.push(arg);
    }
  }

  return opts;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }

  if (args.positionals.length === 0) {
    process.stderr.write('Error: target file or file:symbol is required\n');
    process.exitCode = 1;
    return;
  }

  getLogger({ level: 'error', logToFile: false });
  console.log = console.info = console.debug = console.error;

  const target = args.positionals[0];
  const root = path.resolve(args.positionals[1] || '.');

  try {
    const result = analyzeBlastRadius(root, target, {
      symbol: args.symbol,
      depth: args.depth,
      includeReviewers: args.includeReviewers,
    });
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`${result.markdown}\n`);
    }
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exitCode = 1;
  }
}

main();
