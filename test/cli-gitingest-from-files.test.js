import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CLI = path.resolve('bin/cli.js');

// README: two-step workflow, digest generated from an existing JSON file without re-scanning
describe('cli --gitingest-from-report / --gitingest-from-context', () => {
  let dir;

  const run = (args) =>
    spawnSync(process.execPath, [CLI, ...args], {
      cwd: dir,
      env: { ...process.env, HOME: dir },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 30000,
    });
  const digest = () => path.join(dir, 'digest.txt');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-digest-'));
    fs.writeFileSync(path.join(dir, 'app.js'), 'function startServer() {\n  return 1;\n}\n');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('builds digest.txt from the default token-analysis-report.json', () => {
    expect(run(['--save-report']).status).toBe(0);

    const r = run(['--gitingest-from-report']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Report loaded');
    expect(r.stdout).not.toContain('PROJECT TOKEN ANALYSIS REPORT');
    expect(fs.readFileSync(digest(), 'utf8')).toContain('function startServer');
  }, 60000);

  it('builds digest.txt from a named report file', () => {
    expect(run(['--save-report']).status).toBe(0);
    fs.renameSync(path.join(dir, 'token-analysis-report.json'), path.join(dir, 'my-report.json'));

    const r = run(['--gitingest-from-report', 'my-report.json']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Generated from: my-report.json');
    expect(fs.readFileSync(digest(), 'utf8')).toContain('function startServer');
  }, 60000);

  it('builds digest.txt from llm-context.json', () => {
    expect(run(['--context-export']).status).toBe(0);

    const r = run(['--gitingest-from-context']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Context loaded');
    expect(fs.readFileSync(digest(), 'utf8')).toContain('function startServer');
  }, 60000);

  it('fails when the report file does not exist', () => {
    const r = run(['--gitingest-from-report', 'missing.json']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Report file not found');
    expect(fs.existsSync(digest())).toBe(false);
  }, 30000);
});
