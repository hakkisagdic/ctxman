/**
 * A rerun must not analyse the reports, context exports, digests and .ctxman/ state that
 * an earlier ctxman run wrote into the project.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CLI = path.resolve('bin/cli.js');

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, HOME: cwd },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 30000,
  });
}

function reportedFiles(dir) {
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'token-analysis-report.json'), 'utf8'));
  return report.files.map((f) => f.relativePath.split(path.sep).join('/')).sort();
}

describe('CLI rerun ignores ctxman output', () => {
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-own-output-'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'src/app.js'), 'export function start() {\n  return 1;\n}\n');
    fs.writeFileSync(path.join(dir, 'README.md'), '# Project\n');
    // A user's own file that only shares a name with ctxman output, outside the project root
    fs.writeFileSync(path.join(dir, 'docs/digest.txt'), 'notes\n');
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('second run reports the same project files as the first', () => {
    const args = ['--cli', '--save-report', '--context-export', '--gitingest'];
    const first = runCli(dir, args);
    expect(first.status, first.stderr).toBe(0);
    const expected = ['README.md', 'docs/digest.txt', 'src/app.js'];
    expect(reportedFiles(dir)).toEqual(expected);

    // The first run wrote these; --cli also records a context version under .ctxman/
    for (const output of ['token-analysis-report.json', 'llm-context.json', 'digest.txt']) {
      expect(fs.existsSync(path.join(dir, output))).toBe(true);
    }
    expect(fs.readdirSync(path.join(dir, '.ctxman/versions')).length).toBeGreaterThan(0);

    const second = runCli(dir, args);
    expect(second.status, second.stderr).toBe(0);
    expect(reportedFiles(dir)).toEqual(expected);
  });
});
