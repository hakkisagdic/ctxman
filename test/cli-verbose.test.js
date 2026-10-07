/**
 * --verbose is documented as "Show all included files": every analysed file is listed,
 * not only the top-5 files the regular report shows.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CLI = path.resolve('bin/cli.js');
const FILES = [
  'README.md',
  'docs/guide.md',
  'lib/math.py',
  'src/app.js',
  'src/config.js',
  'src/utils.ts',
  'test/app.test.js',
];

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, HOME: cwd },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 30000,
  });
}

describe('CLI --verbose', () => {
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-verbose-'));
    FILES.forEach((file, i) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      // Different sizes so the top-5 list cannot happen to cover every file
      fs.writeFileSync(path.join(dir, file), `value_${i} = "${'x '.repeat(20 * (i + 1))}"\n`);
    });
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('lists every included file', () => {
    const r = runCli(dir, ['--cli', '--verbose', '--save-report']);
    expect(r.status, r.stderr).toBe(0);
    const listing = r.stdout.split(`INCLUDED FILES (${FILES.length}):`)[1];
    expect(listing, 'no included-files section in stdout').toBeDefined();
    for (const file of FILES) {
      expect(listing).toMatch(new RegExp(`tokens - ${file.replace(/\./g, '\\.')}$`, 'm'));
    }
  });

  test('is not printed without --verbose', () => {
    const r = runCli(dir, ['--cli', '--save-report']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('INCLUDED FILES');
  });
});
