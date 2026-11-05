#!/usr/bin/env node
/**
 * ctxman diagnose - stack-trace & failure root-cause bundle
 *
 * stdout carries the diagnosis document (unless -o/--output or --copy); summary goes to stderr.
 * Exit codes: 0 done, 1 error, 2 invalid arguments / options.
 */

import fs from 'fs';
import { getLogger } from '../lib/utils/logger.js';

function printHelp() {
  process.stdout.write(`ctxman diagnose - root-cause context bundle for stack traces & test failures

Usage: ctxman diagnose [log-file-or-text] [options]

Parses stack trace frames across Node, TS, Python, Go, Rust, Java, C#, Vitest,
resolves implicated files safely inside the repository, extracts enclosing method
code windows, 1-hop graph neighbors (across module imports and the AST symbol
call graph), and recent git history packed within the budget.

Options:
      --stdin              Read failure log or stack trace from stdin
      --budget TOKENS      Token budget (e.g. 24000, 24k; default: 24000)
      --json               Output in JSON format (default: markdown)
      --calls              Include cross-file AST symbol call graph edges (default)
      --no-calls           Disable AST symbol call graph edges (module imports only)
      --no-redact          Do not mask secrets
  -o, --output FILE        Write output to FILE instead of stdout
      --copy               Copy document to clipboard
  -q, --quiet              Do not print summary to stderr
  -h, --help               Show this help

Examples:
  ctxman diagnose error.log
  npm test 2>&1 | ctxman diagnose --stdin
  ctxman diagnose "Error: invalid token at src/auth.js:42:10" --budget 20k
  ctxman diagnose failure.txt --json -o diagnosis.json
`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    return;
  }

  getLogger({ level: process.env.LOG_LEVEL || 'error', logToFile: false });
  console.log = console.info = console.debug = console.error;

  const { diagnoseFailure } = await import('../lib/diagnose/index.js');
  const { parseBudget } = await import('../lib/task/index.js');

  let inputArg = null;
  let useStdin = false;
  let budget = 24000;
  let format = 'markdown';
  let callGraph = true;
  let redact = true;
  let outputFile = null;
  let copy = false;
  let quiet = false;

  try {
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];

      if (arg === '--stdin') {
        useStdin = true;
      } else if (arg === '--budget') {
        budget = parseBudget(argv[++i]);
      } else if (arg.startsWith('--budget=')) {
        budget = parseBudget(arg.slice('--budget='.length));
      } else if (arg === '--json') {
        format = 'json';
      } else if (arg === '--calls' || arg === '--call-graph') {
        callGraph = true;
      } else if (arg === '--no-calls' || arg === '--no-call-graph') {
        callGraph = false;
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
        if (inputArg === null) {
          inputArg = arg;
        } else {
          inputArg += ` ${arg}`;
        }
      } else {
        process.stderr.write(`Unknown option: ${arg}\n`);
        process.exitCode = 2;
        return;
      }
    }
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  let traceText = '';
  if (useStdin || (!inputArg && !process.stdin.isTTY)) {
    traceText = await readStdin();
  } else if (inputArg) {
    if (fs.existsSync(inputArg) && fs.statSync(inputArg).isFile()) {
      traceText = fs.readFileSync(inputArg, 'utf-8');
    } else {
      traceText = inputArg;
    }
  }

  if (!traceText || !traceText.trim()) {
    process.stderr.write('Error: Failure log or stack trace is required.\n');
    process.exitCode = 2;
    return;
  }

  try {
    const root = process.cwd();
    const result = await diagnoseFailure(root, traceText, {
      budget,
      format,
      callGraph,
      redact,
      output: outputFile,
    });

    if (copy) {
      const { default: ClipboardUtils } = await import('../lib/utils/clipboard-utils.js');
      await ClipboardUtils.copy(result.text);
      if (!quiet) {
        process.stderr.write(`Copied ${result.totalTokens} tokens to clipboard.\n`);
      }
    } else if (!outputFile) {
      process.stdout.write(result.text + (result.text.endsWith('\n') ? '' : '\n'));
    }

    if (!quiet) {
      process.stderr.write(
        `Diagnosed: ${result.implicatedFiles.length} implicated file(s), ${result.totalTokens}/${result.budget} tokens.\n`
      );
      if (outputFile) {
        process.stderr.write(`Saved to: ${outputFile}\n`);
      }
    }
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

process.stdout.on('error', (error) => {
  if (error.code !== 'EPIPE') throw error;
  process.exit(process.exitCode ?? 0);
});

main();
