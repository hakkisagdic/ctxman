import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import TokenCalculator from '../lib/analyzers/token-calculator.js';

const BIN = fileURLToPath(new URL('../bin/', import.meta.url));

describe('CLI subcommand entry points', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-subcommands-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Both scripts are ESM; a CommonJS require() here crashes before any output
  function run(script, args) {
    return spawnSync(process.execPath, [path.join(BIN, script), ...args], {
      cwd: tempDir,
      encoding: 'utf-8',
      env: { ...process.env, HOME: tempDir, USERPROFILE: tempDir },
    });
  }

  it('cm-gitingest.js prints its help', () => {
    const result = run('cm-gitingest.js', ['--help']);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: ctxman github <url>');
  });

  it('cm-update.js reports the package version', () => {
    const result = run('cm-update.js', ['info']);
    const { version } = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Current version: ${version}`);
  });
});

describe('TokenCalculator.analyze', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-analyze-'));
    fs.writeFileSync(path.join(tempDir, 'a.js'), 'export const a = 1;\n');
    fs.mkdirSync(path.join(tempDir, 'src'));
    fs.writeFileSync(path.join(tempDir, 'src', 'b.md'), '# Title\n\nSome text.\n');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('scans and analyzes the project without printing or exporting', () => {
    const calculator = new TokenCalculator(tempDir);

    const results = calculator.analyze();

    expect(results.map((r) => r.relativePath).sort()).toEqual(['a.js', path.join('src', 'b.md')]);
    expect(calculator.stats.totalFiles).toBe(2);
    expect(calculator.stats.totalTokens).toBe(results.reduce((sum, r) => sum + r.tokens, 0));
  });
});

describe('ctxman --changed-since', () => {
  let repo;

  const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf-8' });

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-changed-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    fs.mkdirSync(path.join(repo, 'src'));
    for (const name of ['a', 'b', 'c']) {
      fs.writeFileSync(path.join(repo, 'src', `${name}.js`), `export const ${name} = 1;\n`);
    }
    git('add', '-A');
    git('commit', '-q', '-m', 'initial');
    fs.writeFileSync(path.join(repo, 'src', 'b.js'), 'export const b = 2;\n');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('analyzes only the files changed since the given ref', () => {
    const result = spawnSync(
      process.execPath,
      [path.join(BIN, 'cli.js'), '--changed-since', 'HEAD', '--cli', '--save-report'],
      { cwd: repo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    );

    expect(result.status).toBe(0);
    const report = JSON.parse(
      fs.readFileSync(path.join(repo, 'token-analysis-report.json'), 'utf-8')
    );
    expect(report.files.map((file) => file.relativePath)).toEqual([path.join('src', 'b.js')]);
  });
});
