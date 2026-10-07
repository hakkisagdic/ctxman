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

describe('ctxman subcommand routing', () => {
  let tempDir;
  let trace;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-routing-'));
    trace = path.join(tempDir, 'trace.jsonl');
    // Preloaded into every node process: records which cm-*.js script starts, with which
    // arguments, and stops it before it does any work (no model download, no network)
    fs.writeFileSync(
      path.join(tempDir, 'trace.mjs'),
      `import fs from 'node:fs';
const script = process.argv[1] || '';
if (/cm-(ask|update|gitingest)\\.js$/.test(script)) {
  fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify(process.argv.slice(1)) + '\\n');
  process.exit(0);
}
`
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const cli = (...args) =>
    spawnSync(process.execPath, [path.join(BIN, 'cli.js'), ...args], {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HOME: tempDir,
        USERPROFILE: tempDir,
        NODE_OPTIONS: `--import=${path.join(tempDir, 'trace.mjs')}`,
      },
    });
  const started = () =>
    fs
      .readFileSync(trace, 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .map(([script, ...rest]) => [path.basename(script), ...rest]);

  it('passes an unquoted ask query through whole, even when it contains other command names', () => {
    expect(cli('ask', 'how', 'do', 'I', 'convert', 'the', 'git', 'ask', 'output').status).toBe(0);

    expect(started()).toEqual([
      ['cm-ask.js', 'how', 'do', 'I', 'convert', 'the', 'git', 'ask', 'output'],
    ]);
  });

  it('routes update and its arguments to the update command', () => {
    expect(cli('update', 'channel', 'insider').status).toBe(0);

    expect(started()).toEqual([['cm-update.js', 'channel', 'insider']]);
  });

  it('leaves --help of the github command to that command', () => {
    expect(cli('github', '--help').status).toBe(0);

    expect(started()).toEqual([['cm-gitingest.js', '--help']]);
  });
});

describe('ctxman without an interactive terminal', () => {
  let project;

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-notty-'));
    fs.writeFileSync(path.join(project, 'a.js'), 'export const a = 1;\n');
  });

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

  const cli = (...args) =>
    spawnSync(process.execPath, [path.join(BIN, 'cli.js'), ...args], {
      cwd: project,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HOME: project, USERPROFILE: project },
    });

  it('falls back from the wizard to the CLI analysis', () => {
    const result = cli();

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Falling back to CLI mode');
    expect(result.stdout).toContain('a.js');
  });

  it('asks for --yes instead of starting the interactive init wizard', () => {
    const result = cli('init');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--yes');
    expect(fs.existsSync(path.join(project, '.contextignore'))).toBe(false);
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

  it('groups files in the project root under one directory entry', () => {
    const calculator = new TokenCalculator(tempDir);

    calculator.analyze();

    expect(Object.keys(calculator.stats.byDirectory).sort()).toEqual(['.', 'src']);
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

describe('ctxman export options', () => {
  let project;

  const cli = (...args) =>
    spawnSync(process.execPath, [path.join(BIN, 'cli.js'), '--cli', ...args], {
      cwd: project,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HOME: project, USERPROFILE: project },
    });

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-export-'));
    fs.mkdirSync(path.join(project, 'src'));
    for (let i = 1; i <= 6; i++) {
      fs.writeFileSync(
        path.join(project, 'src', `m${i}.js`),
        `export function f${i}(a, b) {\n  return a + b + ${i};\n}\n`
      );
    }
  });

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('writes the context as JSON by default', () => {
    expect(cli('--context-export').status).toBe(0);

    const context = JSON.parse(fs.readFileSync(path.join(project, 'llm-context.json'), 'utf-8'));
    expect(context.project.totalFiles).toBeGreaterThanOrEqual(6);
  });

  it('writes the context in the -o format', async () => {
    expect(cli('--context-export', '-o', 'toon').status).toBe(0);

    const { decode } = await import('@toon-format/toon');
    const context = decode(fs.readFileSync(path.join(project, 'llm-context.toon'), 'utf-8'));
    expect(context.project.totalFiles).toBeGreaterThanOrEqual(6);
  });

  it('splits the GitIngest digest into chunk files with --chunk', () => {
    const result = cli('--chunk', '--chunk-size', '60');

    expect(result.status).toBe(0);
    const chunks = fs
      .readdirSync(project)
      .filter((name) => /^digest-chunk-\d+-of-\d+\.txt$/.test(name));
    expect(chunks.length).toBeGreaterThan(1);
    expect(fs.existsSync(path.join(project, 'digest.txt'))).toBe(false);
  });
});
