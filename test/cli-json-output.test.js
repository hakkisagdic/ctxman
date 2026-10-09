import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CLI = path.resolve('bin/cli.js');

// With --json, the whole of stdout must parse as one JSON document
describe('cli --json output', () => {
  let dir;

  const run = (args) =>
    spawnSync(process.execPath, [CLI, ...args], {
      cwd: dir,
      env: { ...process.env, HOME: dir },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 30000,
    });

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-json-'));
    fs.writeFileSync(path.join(dir, 'app.js'), 'function main() {\n  return 1;\n}\n');
    expect(run(['--snapshot', 'first']).status).toBe(0);
    fs.appendFileSync(path.join(dir, 'app.js'), 'function more() {\n  return 2;\n}\n');
    expect(run(['--snapshot', 'second']).status).toBe(0);
  }, 60000);

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('--diff-last --json prints only JSON', () => {
    const r = run(['--diff-last', '--json']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveProperty('totalTokenDiff');
  }, 30000);

  it('--snapshot-trend --json prints only JSON', () => {
    const r = run(['--snapshot-trend', '--json']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveProperty('snapshotCount', 2);
  }, 30000);

  it('--ai-suggest --json prints only JSON', () => {
    const r = run(['--ai-suggest', '--json']);
    expect(r.status).toBe(0);
    expect(typeof JSON.parse(r.stdout).score).toBe('number');
  }, 30000);
});
