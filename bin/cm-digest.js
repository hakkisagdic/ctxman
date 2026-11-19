#!/usr/bin/env node
/**
 * ctxman digest - store and inspect compact work/session digests locally
 *
 *   ctxman digest write --id <id> [--file <path>] [--store <dir>] [--force]
 *   ctxman digest read <id|path> [--lines A-B] [--grep PATTERN] [--store <dir>]
 *   ctxman digest list [--store <dir>] [--json]
 */

import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../lib/utils/logger.js';
import { exitOnBrokenPipe } from '../lib/utils/cli-output.js';

exitOnBrokenPipe();

// stdout carries only the digest output or JSON; logs/errors stay on stderr.
getLogger({ level: 'error', logToFile: false });
console.log = console.info = console.debug = console.error;

const { writeDigest, readDigest, listDigests } = await import('../lib/context/digest.js');

const HELP = `Usage: ctxman digest <command> [options]

Store full work outputs under a compact store (~/.ctxman/digests by default,
mode 700/600) and read targeted line ranges or pattern matches back out.

Commands:
  write --id ID [options]   Read stdin or --file and store <store>/<id>.md
  read <id|path> [options]  Print numbered lines (--lines A-B, --grep PATTERN)
  list [options]            List stored digests with line counts and sizes

Options:
      --id <id>             Digest identifier (1-64 chars: [A-Za-z0-9._-])
      --file <path>         Read input text from a file instead of stdin (write)
      --store <dir>         Override store directory (default: CTXMAN_DIGEST_DIR or ~/.ctxman/digests)
      --done <text>         Summary field: completed work (write)
      --result <text>       Summary field: outcome or metrics (write)
      --open <text>         Summary field: remaining open items (write)
      --needs <text>        Summary field: pending questions or inputs (write)
      --force               Overwrite an existing digest with the same id (write)
      --lines <A-B>         1-based inclusive line range A-B or single line N (read)
      --grep <pattern>      JS regex filter (falls back to literal match; max 200 chars, 500 lines) (read)
      --json                Output list results as JSON (list)
  -h, --help                Show this help
`;

const OPTIONS = {
  id: { type: 'string' },
  file: { type: 'string' },
  store: { type: 'string' },
  done: { type: 'string' },
  result: { type: 'string' },
  open: { type: 'string' },
  needs: { type: 'string' },
  lines: { type: 'string' },
  grep: { type: 'string' },
  json: { type: 'boolean' },
  force: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

function fail(message, exitCode = 1) {
  process.stderr.write(`ctxman digest: ${message}\n`);
  process.exitCode = exitCode;
}

async function readStdinText() {
  if (process.stdin.isTTY) {
    throw new Error('no input provided on stdin (pass --file or pipe stdin)');
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({ args: process.argv.slice(2), options: OPTIONS, allowPositionals: true });
  } catch (error) {
    fail(`${error.message}\nRun "ctxman digest --help" for usage.`);
    return;
  }

  const { values, positionals } = parsed;
  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP);
    return;
  }

  const [subcommand, ...rest] = positionals;

  try {
    if (subcommand === 'write') {
      if (!values.id) {
        fail('--id is required for write');
        return;
      }
      const text =
        values.file !== undefined
          ? fs.readFileSync(path.resolve(values.file), 'utf8')
          : await readStdinText();

      const res = writeDigest({
        id: values.id,
        text,
        storeDir: values.store,
        force: Boolean(values.force),
        done: values.done,
        result: values.result,
        open: values.open,
        needs: values.needs,
      });
      process.stdout.write(res.output);
      return;
    }

    if (subcommand === 'read') {
      if (rest.length === 0) {
        fail('missing digest id or path for read');
        return;
      }
      if (rest.length > 1) {
        fail(`expected one digest id or path, got ${rest.length}`);
        return;
      }
      const res = readDigest({
        ref: rest[0],
        lines: values.lines,
        grep: values.grep,
        storeDir: values.store,
      });
      process.stdout.write(res.text);
      if (res.truncated) {
        process.stderr.write('ctxman digest: grep output capped at 500 matching lines\n');
      }
      return;
    }

    if (subcommand === 'list') {
      if (rest.length > 0) {
        fail(`unexpected arguments for list: ${rest.join(' ')}`);
        return;
      }
      const items = listDigests({ storeDir: values.store });
      if (values.json) {
        process.stdout.write(`${JSON.stringify(items, null, 2)}\n`);
        return;
      }
      if (items.length === 0) {
        process.stdout.write('no digests stored\n');
        return;
      }
      for (const item of items) {
        process.stdout.write(
          `${item.id}\t${item.lines} lines\t${item.bytes} bytes\t${item.updatedAt}\n`
        );
      }
      return;
    }

    fail(`unknown subcommand "${subcommand}" (expected write, read, or list)`);
  } catch (error) {
    fail(error.message);
  }
}

await main();
