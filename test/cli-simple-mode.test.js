import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CLI = path.resolve('bin/cli.js');

describe('cli --simple', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-simple-'));
    fs.writeFileSync(path.join(dir, 'app.js'), 'function main() {\n  return 1;\n}\n');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('prints the report without the interactive export menu', () => {
    const r = spawnSync(process.execPath, [CLI, '--cli', '--simple'], {
      cwd: dir,
      env: { ...process.env, HOME: dir },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 30000,
    });

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('PROJECT TOKEN ANALYSIS REPORT');
    expect(r.stdout).not.toContain('Which export option');
    expect(r.stdout).not.toContain('Export Options');
  });
});
