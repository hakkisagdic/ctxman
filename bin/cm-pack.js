#!/usr/bin/env node
/**
 * ctxman pack - the contents of a project's files in one LLM-ready document
 *
 * stdout carries only the document (unless -o/--copy); the summary, notices and errors go
 * to stderr. Exit codes: 0 done, 1 error, 2 the document is larger than --max-tokens.
 */

import fs from 'fs';
import path from 'path';
import { getLogger } from '../lib/utils/logger.js';

const STYLES = ['xml', 'markdown', 'plain', 'json'];
// Exit code when the document is larger than --max-tokens
const EXIT_TOO_LARGE = 2;

function printHelp() {
  process.stdout.write(`ctxman pack - file contents in one LLM-ready document

Usage: ctxman pack [path] [options]

Packs the files of a project (default: the current directory) into one document: a
directory tree, then every file, then your instructions last. .gitignore, .contextignore
and .contextinclude decide which files are included; binary files and files over 1 MiB
are skipped. Secrets (API keys, tokens, private keys) are masked.

Selection:
      --include GLOB       Only files matching GLOB (repeatable or comma-separated)
      --exclude GLOB       Leave out files matching GLOB (repeatable or comma-separated)
      --stdin              Read the file list from stdin, one path per line, instead of
                           scanning; paths must lie inside the project, ignore files apply
  -0, --null               With --stdin: paths are separated by NUL bytes
                           (find -print0, git ls-files -z)
      --max-file-size SIZE Skip larger files (default 1m; bytes, or with a k/m suffix)

Document:
      --style STYLE        xml (default; Anthropic's <documents> format), markdown, plain, json
      --json               Same as --style json
      --no-tree            Leave out the directory tree
      --header TEXT        Text at the top
      --instructions FILE  Append the text of FILE at the end, after the files
      --line-numbers       Number every line (original numbers, also with --compress)
      --compress           Keep signatures, replace function bodies with a one-line
                           placeholder (languages of the method analyzers)
      --no-redact          Do not mask secrets

Size:
      --budget TOKENS      Keep the document within TOKENS (e.g. 50000 or 50k): the
                           highest-ranked files first (ranking of ctxman map), the files
                           left out are listed with their token counts
      --max-tokens TOKENS  Exit with code 2, writing nothing, when the document is larger
      --split TOKENS       With -o: write numbered parts of at most TOKENS each
                           (FILE.1.xml, FILE.2.xml, ...)
      --target-model ID    Count with this model's tokenizer encoding and report how the
                           document fits its context window (see ctxman --list-llms)

Output:
  -o, --output FILE        Write to FILE instead of stdout
      --copy               Copy to the clipboard instead of stdout
  -q, --quiet              No summary on stderr
  -h, --help               Show this help

Examples:
  ctxman pack -o context.xml
  ctxman pack src --include "**/*.ts" --exclude "**/*.test.ts" --style markdown
  ctxman pack --compress --budget 100k --instructions task.md --copy
  git ls-files -z -- '*.py' | ctxman pack --stdin -0 --line-numbers
  ctxman pack --target-model gpt-4o --max-tokens 120k -q -o context.xml
  ctxman pack --split 150k -o context.xml          # context.1.xml, context.2.xml, ...
`);
}

/** "8000", "8k", "1.5k" or "2m" → 8000 / 1500 / 2000000 */
function parseTokens(text, flag) {
  const match = /^(\d+(?:\.\d+)?)([km])?$/i.exec(String(text).trim());
  const scale = { k: 1e3, m: 1e6 }[match?.[2]?.toLowerCase()] ?? 1;
  const value = match ? Math.round(Number(match[1]) * scale) : NaN;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} needs a positive number of tokens (e.g. 50000 or 50k), got ${text}`);
  }
  return value;
}

/** "4096", "512k" or "2m" (KiB/MiB) → bytes */
function parseSize(text, flag) {
  const match = /^(\d+)([km])?$/i.exec(String(text).trim());
  const scale = { k: 1024, m: 1024 * 1024 }[match?.[2]?.toLowerCase()] ?? 1;
  const value = match ? Number(match[1]) * scale : NaN;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} needs a size in bytes (e.g. 500000, 512k or 2m), got ${text}`);
  }
  return value;
}

const VALUE_OPTIONS = {
  '--include': 'include',
  '--exclude': 'exclude',
  '--max-file-size': 'maxFileSize',
  '--style': 'style',
  '--header': 'header',
  '--instructions': 'instructions',
  '--budget': 'budget',
  '--max-tokens': 'maxTokens',
  '--split': 'split',
  '--target-model': 'targetModel',
  '--output': 'output',
  '-o': 'output',
};

const FLAG_OPTIONS = {
  '--stdin': ['stdin', true],
  '--null': ['nul', true],
  '-0': ['nul', true],
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

/**
 * Parse the command line
 * @param {string[]} argv
 * @returns {object}
 */
function parseArgs(argv) {
  const options = { include: [], exclude: [], tree: true, redact: true, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      options.paths.push(...argv.slice(i + 1));
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
      if (key === 'include' || key === 'exclude') {
        options[key].push(...value.split(',').filter((glob) => glob.trim()));
      } else {
        options[key] = value;
      }
    } else if (FLAG_OPTIONS[name] && eq < 0) {
      const [key, value] = FLAG_OPTIONS[name];
      options[key] = value;
    } else if (arg.startsWith('-') && arg !== '-') {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.paths.push(arg);
    }
  }

  if (options.paths.length > 1) {
    throw new Error(`Expected one project path, got ${options.paths.length}`);
  }
  if (options.style !== undefined && !STYLES.includes(options.style)) {
    throw new Error(`--style must be one of ${STYLES.join(', ')}`);
  }
  for (const [key, flag] of [
    ['budget', '--budget'],
    ['maxTokens', '--max-tokens'],
    ['split', '--split'],
  ]) {
    if (options[key] !== undefined) options[key] = parseTokens(options[key], flag);
  }
  if (options.maxFileSize !== undefined) {
    options.maxFileSize = parseSize(options.maxFileSize, '--max-file-size');
  }
  if (options.nul && !options.stdin) throw new Error('-0/--null only applies to --stdin');
  if (options.split && !options.output) {
    throw new Error('--split writes numbered files: give the first name with -o/--output');
  }
  if (options.split && options.copy) throw new Error('--split cannot be combined with --copy');
  return options;
}

/** Paths of the parts of a split output: context.xml → context.1.xml, context.2.xml, ... */
function partPath(output, index, count) {
  const extension = path.extname(output);
  const base = output.slice(0, output.length - extension.length);
  return `${base}.${String(index).padStart(String(count).length, '0')}${extension}`;
}

/** Existing files that look like parts of `output` (left out of the pack, like the output) */
function existingParts(output) {
  const directory = path.dirname(output);
  const extension = path.extname(output);
  const base = path.basename(output, extension);
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escape(base)}\\.\\d+${escape(extension)}$`);
  try {
    return fs
      .readdirSync(directory)
      .filter((name) => pattern.test(name))
      .map((name) => path.join(directory, name));
  } catch (_error) {
    return [];
  }
}

const formatNumber = (n) => Number(n).toLocaleString('en-US');

/** A path as the user would type it: relative to the current directory when below it */
function display(file) {
  const relative = path.relative(process.cwd(), file);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file;
}

function printSummary(result, extras) {
  const lines = [];
  const style = result.style;
  lines.push(
    `ctxman pack: ${formatNumber(result.files.length)} file(s), ` +
      `${formatNumber(result.totalTokens)} tokens (${style}, ${result.encoding})`
  );
  if (result.budget) {
    const omitted = result.omitted.length;
    const omittedTokens = result.omitted.reduce((sum, file) => sum + file.tokens, 0);
    lines.push(
      `  Budget ${formatNumber(result.budget.limit)}: ${formatNumber(result.budget.used)} used` +
        (omitted
          ? `; ${formatNumber(omitted)} file(s) left out (${formatNumber(omittedTokens)} tokens)`
          : '; every file fits')
    );
  }
  if (result.compression) {
    const { files, bodies, originalTokens, savedTokens } = result.compression;
    const percent = originalTokens ? Math.round((savedTokens / originalTokens) * 100) : 0;
    lines.push(
      `  Compressed ${formatNumber(bodies)} function ${bodies === 1 ? 'body' : 'bodies'} in ` +
        `${formatNumber(files)} file(s): ` +
        `${formatNumber(savedTokens)} tokens saved (${percent}%)`
    );
  }
  if (result.redactions.total) {
    const types = Object.entries(result.redactions.byType)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    lines.push(`  Redacted ${formatNumber(result.redactions.total)} secret(s): ${types}`);
  }
  if (result.skipped.length) {
    const reasons = {};
    for (const file of result.skipped) reasons[file.reason] = (reasons[file.reason] ?? 0) + 1;
    const text = Object.entries(reasons)
      .map(([reason, count]) => `${count} ${reason}`)
      .join(', ');
    lines.push(`  Skipped ${formatNumber(result.skipped.length)} file(s): ${text}`);
  }
  if (!result.files.length && !result.omitted.length) {
    lines.push(
      '  Warning: no files to pack (check the path, --include/--exclude and the ignore files)'
    );
  }
  for (const file of result.splitFiles) {
    lines.push(`  ${file.path} alone exceeds a part: split by lines into ${file.pieces} pieces`);
  }
  if (result.model) {
    const model = result.model;
    const how = model.exact ? 'exact' : 'approximate';
    lines.push(
      `  ${model.name} (${model.id}): ${model.percentOfWindow.toFixed(1)}% of the ` +
        `${formatNumber(model.contextWindow)}-token window, ` +
        `${model.fits ? 'fits' : "doesn't fit"} (${how} count, ${model.encoding})`
    );
    if (model.fits && model.maxRecommendedInput && result.totalTokens > model.maxRecommendedInput) {
      lines.push(
        `  Note: above the recommended ${formatNumber(model.maxRecommendedInput)} input tokens ` +
          'for this model; consider --budget or --compress'
      );
    }
  }
  lines.push(...extras.map((line) => `  ${line}`));
  process.stderr.write(`${lines.join('\n')}\n`);
}

/** The largest packed files, to say what to leave out when --max-tokens is exceeded */
function largestFiles(result, count = 5) {
  return [...result.files]
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, count)
    .map((file) => `    ${formatNumber(file.tokens).padStart(9)}  ${file.path}`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\nRun "ctxman pack --help" for usage.\n`);
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    printHelp();
    return;
  }

  // stdout carries only the document: logger lines and ignore-file notices (console.log in
  // shared modules) go to stderr, and pack writes no log files into the project
  getLogger({ level: process.env.LOG_LEVEL || 'warn', logToFile: false });
  console.log = console.info = console.debug = console.error;

  try {
    const { packContext } = await import('../lib/pack/index.js');
    const root = path.resolve(args.paths[0] ?? '.');
    const output = args.output ? path.resolve(args.output) : null;

    const options = {
      style: args.style,
      include: args.include,
      exclude: args.exclude,
      maxFileSize: args.maxFileSize,
      tree: args.tree,
      header: args.header,
      lineNumbers: args.lineNumbers,
      compress: args.compress,
      redact: args.redact,
      budget: args.budget,
      split: args.split,
      targetModel: args.targetModel,
      // A previous output inside the project is not packed again
      excludeFiles: output ? [output, ...(args.split ? existingParts(output) : [])] : [],
    };
    if (args.instructions !== undefined) {
      options.instructions = fs.readFileSync(path.resolve(args.instructions), 'utf8');
    }
    if (args.stdin) {
      const input = fs.readFileSync(0, 'utf8');
      options.files = input
        .split(args.nul ? '\0' : '\n')
        .map((line) => (args.nul ? line : line.replace(/\r$/, '')))
        .filter((line) => line.trim() !== '');
      options.cwd = process.cwd();
    }

    const result = await packContext(root, options);
    const extras = [];

    if (args.maxTokens && result.totalTokens > args.maxTokens) {
      if (!args.quiet) printSummary(result, extras);
      process.stderr.write(
        `Error: the document has ${formatNumber(result.totalTokens)} tokens, more than ` +
          `--max-tokens ${formatNumber(args.maxTokens)}; nothing was written. Largest files:\n` +
          `${largestFiles(result).join('\n')}\n`
      );
      process.exitCode = EXIT_TOO_LARGE;
      return;
    }

    let toStdout = !output && !args.copy;
    if (output && result.parts) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      const written = new Set();
      for (const part of result.parts) {
        const file = partPath(output, part.index, result.parts.length);
        fs.writeFileSync(file, part.text);
        written.add(file);
        extras.push(`Part ${part.index}: ${display(file)} (${formatNumber(part.tokens)} tokens)`);
      }
      // Parts of an earlier, longer run are left alone, but they are not part of this output
      const stale = existingParts(output).filter((file) => !written.has(file));
      if (stale.length) {
        extras.push(
          `Note: ${stale.map(display).join(', ')} ${stale.length === 1 ? 'is' : 'are'} ` +
            'from an earlier run, not part of this output'
        );
      }
    } else if (output) {
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
    process.exitCode = 1;
  }
}

// `ctxman pack | head` closes the pipe early: stop quietly instead of crashing on EPIPE
process.stdout.on('error', (error) => {
  if (error.code !== 'EPIPE') throw error;
  process.exit(process.exitCode ?? 0);
});

main();
