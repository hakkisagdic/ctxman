import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import path from 'path';
import MCPServer from '../lib/api/mcp/server.js';
import { createPrRepo, FAKE_AWS_KEY } from './fixtures/pr-repo.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

describe('ctxman pr (CLI)', () => {
  let repo;

  beforeAll(() => {
    repo = createPrRepo();
  });

  afterAll(() => {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  });

  const run = (...args) =>
    spawnSync(process.execPath, [CLI, 'pr', ...args], {
      cwd: repo.dir,
      encoding: 'utf-8',
      env: { ...process.env, HOME: repo.dir, USERPROFILE: repo.dir },
    });

  it('prints its own help', () => {
    const result = run('--help');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: ctxman pr [options] [path]');
    expect(result.stdout).toContain('--budget TOKENS');
  });

  it('is listed in the main help', () => {
    const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf-8' });

    expect(result.stdout).toContain('pr [--base REF] [--head REF] [path]');
  });

  it('writes only the context to stdout and the summary to stderr', () => {
    fs.writeFileSync(path.join(repo.dir, '.contextignore'), 'docs/\n');
    try {
      const result = run('--base', 'main');

      expect(result.status).toBe(0);
      expect(result.stdout.startsWith('# Pull request context: `feature` into `main`')).toBe(true);
      expect(result.stdout).toContain('### `src/calc.js`: `add` (lines 1-6, modified)');
      expect(result.stdout).not.toContain('Context ignore rules loaded');
      expect(result.stdout).not.toContain(FAKE_AWS_KEY);
      expect(result.stderr).toContain('ctxman pr: feature into main (merge base');
      expect(result.stderr).toContain('4 changed method(s), 1 deleted, 3 related test(s)');
      expect(result.stderr).toContain('Redacted 1 secret(s): 1 aws-access-key-id');
    } finally {
      fs.rmSync(path.join(repo.dir, '.contextignore'));
    }
  });

  it('writes a file with -o and keeps stdout empty', () => {
    const output = path.join(repo.dir, 'out', 'review.xml');
    const result = run('--style', 'xml', '-o', output, '--quiet');

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(fs.readFileSync(output, 'utf8')).toMatch(/^<pr_context>\n<summary>/);
    fs.rmSync(path.join(repo.dir, 'out'), { recursive: true });
  });

  it('prints JSON with --json', () => {
    const result = run('--json', '--no-diff', '-q');
    const data = JSON.parse(result.stdout);

    expect(data.summary.base.ref).toBe('main');
    expect(data.diff).toBeUndefined();
    expect(data.methods.changed.map((m) => m.name)).toContain('HandleRequest');
  });

  it('appends instructions and the question last, and accepts --opt=value', () => {
    const instructions = path.join(repo.dir, 'review-instructions.md');
    fs.writeFileSync(instructions, 'Focus on error handling.\n');
    try {
      const result = run('--base=main', `--instructions=${instructions}`, '--ask', 'Ship it?');

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(
        /## Instructions\n\nFocus on error handling\.\n\n## Question\n\nShip it\?\n$/
      );
    } finally {
      fs.rmSync(instructions);
    }
  });

  it('keeps the output under --budget and says what it dropped', () => {
    const result = run('--with-files', '--with-tests', '--budget', '0.8k');

    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/Budget 800: within budget\n\s+dropped full contents of/);
    expect(result.stdout).toContain('- Budget: 800 tokens; dropped: full contents of');
  });

  it('includes secrets with --no-redact', () => {
    const result = run('--no-redact', '-q');

    expect(result.stdout).toContain(FAKE_AWS_KEY);
  });

  it.each([['--output=/tmp/ctxman-pr-cli-x'], ['$(touch pwned)'], ['main;touch pwned']])(
    'rejects the base %j without running anything',
    (ref) => {
      const result = run('--base', ref);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Invalid git reference for base');
      expect(fs.existsSync(path.join(repo.dir, 'pwned'))).toBe(false);
      expect(fs.existsSync('/tmp/ctxman-pr-cli-x')).toBe(false);
    }
  );

  it('rejects unknown options, bad numbers and missing values', () => {
    expect(run('--frobnicate').stderr).toContain('Unknown option: --frobnicate');
    expect(run('--budget', 'lots').stderr).toContain('Invalid --budget: lots');
    expect(run('--unified', '-1').stderr).toContain('Invalid --unified: -1');
    expect(run('--base').stderr).toContain('--base needs a value');
    expect(run('--base').status).toBe(1);
  });

  it('runs on a path argument from another directory', () => {
    const result = spawnSync(
      process.execPath,
      [CLI, 'pr', '--base', 'main', '-q', path.join(repo.dir, 'server')],
      { encoding: 'utf-8', cwd: path.dirname(repo.dir) }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('- Scope: server');
    expect(result.stdout).toContain('`HandleRequest`');
    expect(result.stdout).not.toContain('src/calc.js');
  });
});

describe('pr_context MCP tool', () => {
  let repo;

  beforeAll(() => {
    repo = createPrRepo();
  });

  afterAll(() => {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  });

  const server = new MCPServer();
  const callTool = (args) =>
    server.server._requestHandlers.get('tools/call')(
      { method: 'tools/call', params: { name: 'pr_context', arguments: args } },
      {}
    );

  it('is listed with its input schema', async () => {
    const { tools } = await server.server._requestHandlers.get('tools/list')(
      { method: 'tools/list', params: {} },
      {}
    );
    const tool = tools.find((t) => t.name === 'pr_context');

    expect(Object.keys(tool.inputSchema.properties)).toEqual([
      'path',
      'base',
      'head',
      'budget',
      'style',
    ]);
    expect(tool.inputSchema.required).toEqual(['path']);
  });

  it('returns the review context for a branch', async () => {
    const result = await callTool({ path: repo.dir, base: 'main', head: 'feature', style: 'xml' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('<changed_methods count="4">');
    expect(result.content[0].text).not.toContain(FAKE_AWS_KEY);
  });

  it('applies the budget', async () => {
    const result = await callTool({ path: repo.dir, base: 'main', budget: 400 });

    expect(result.content[0].text).toContain('- Budget: 400 tokens; dropped:');
  });

  it('reports invalid refs as tool errors', async () => {
    const result = await callTool({ path: repo.dir, base: '--output=/tmp/x' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid git reference for base');
  });
});
