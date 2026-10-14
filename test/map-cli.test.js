import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import TokenUtils from '../lib/utils/token-utils.js';
import MCPServer from '../lib/api/mcp/server.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const MAP = fileURLToPath(new URL('../bin/cm-map.js', import.meta.url));

const FILES = {
  'core/store.js': 'export function getItem(key) {\n  return key;\n}\n',
  'core/index.js': "export * from './store.js';\n",
  'api/handler.js': [
    "import { getItem } from '../core/index.js';",
    'export function handle(req) {',
    '  return getItem(req.id);',
    '}',
  ].join('\n'),
  'api/auth.py': 'def check(token):\n    return token\n',
  'cli.js': "const { handle } = require('./api/handler');\nhandle({ id: 1 });\n",
};

describe('ctxman map (CLI)', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-map-cli-'));
    for (const [relativePath, content] of Object.entries(FILES)) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), content);
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const run = (args) =>
    spawnSync(process.execPath, args, {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, HOME: root, USERPROFILE: root },
    });
  // Through the ctxman entry point, and the subcommand script alone (faster to start)
  const ctxman = (...args) => run([CLI, 'map', ...args]);
  const map = (...args) => run([MAP, ...args]);

  it('prints only the map on stdout and a summary on stderr', () => {
    const result = ctxman('--tokens', '200');

    expect(result.status).toBe(0);
    expect(result.stdout.split('\n')[0]).toMatch(/^core\/store\.js \(score 1\.000, \d+ tokens\)$/);
    expect(result.stdout).toContain('  1: export function getItem(key) [');
    expect(TokenUtils.calculate(result.stdout, 'map.txt')).toBeLessThanOrEqual(200);
    expect(result.stderr).toMatch(/ctxman map: 5 of 5 files · \d+\/200 tokens · 3 import edges/);
  });

  it('writes no log files into the project', () => {
    expect(map('-q').status).toBe(0);
    expect(fs.existsSync(path.join(root, '.ctxman'))).toBe(false);
  });

  it('maps another directory, writes a file and stays quiet with -q', () => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-map-cwd-'));
    try {
      const output = path.join(elsewhere, 'map.md');
      const result = spawnSync(
        process.execPath,
        [CLI, 'map', root, '--style', 'markdown', '-o', output, '-q', '--history=0'],
        { cwd: elsewhere, encoding: 'utf-8' }
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(fs.readFileSync(output, 'utf-8')).toMatch(/^# Repository map\n\n## core\/store\.js/);
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('prints JSON with nodes, edges and scores', () => {
    const result = map('--json', '--focus', 'api/auth.py');
    const document = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(document.nodes[0]).toMatchObject({ path: 'api/auth.py', rank: 1, focus: true });
    expect(document.edges).toEqual([
      { from: 'api/handler.js', to: 'core/index.js', weight: 1 },
      { from: 'cli.js', to: 'api/handler.js', weight: 1 },
      { from: 'core/index.js', to: 'core/store.js', weight: 1 },
    ]);
    expect(document.files.length).toBeGreaterThan(0);
  });

  it('prints the graph and important files last', () => {
    const graph = map('--graph', '-q');
    const dot = map('--style', 'dot', '-q');
    const last = map('--important-last', '-q');

    expect(graph.stdout).toBe(
      'api/handler.js -> core/index.js\ncli.js -> api/handler.js\ncore/index.js -> core/store.js\n'
    );
    expect(dot.stdout).toContain('"cli.js" -> "api/handler.js";');
    const headers = last.stdout.split('\n').filter((line) => /^\S/.test(line));
    expect(headers.at(-1)).toMatch(/^core\/store\.js /);
  });

  it('prints its own help through ctxman map --help', () => {
    const result = ctxman('--help');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: ctxman map [path] [options]');
    expect(result.stdout).toContain('--important-last');
  });

  it('rejects bad arguments with exit code 1', { timeout: 30000 }, () => {
    const cases = [
      [['--bogus'], 'Unknown option: --bogus'],
      [['--tokens', 'lots'], '--tokens needs an integer >= 1'],
      [['--tokens', '0'], '--tokens needs an integer >= 1'],
      [['--style', 'html'], '--style must be one of'],
      [['--important-last', '--order', 'path'], 'cannot be combined'],
      [['--focus', '../outside.js'], 'outside the project'],
      [['missing-dir'], 'Not a directory'],
      [['--focus'], '--focus needs a value'],
    ];
    for (const [args, message] of cases) {
      const result = map(...args);

      expect(result.status, args.join(' ')).toBe(1);
      expect(result.stderr).toContain(message);
      expect(result.stdout).toBe('');
    }
  });
});

describe('MCP repo_map tool', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-map-mcp-'));
    for (const [relativePath, content] of Object.entries(FILES)) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), content);
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const server = () => new MCPServer().server;
  const callTool = (args) =>
    server()._requestHandlers.get('tools/call')(
      { method: 'tools/call', params: { name: 'repo_map', arguments: args } },
      {}
    );

  it('is listed with path, tokens and focus', async () => {
    const { tools } = await server()._requestHandlers.get('tools/list')(
      { method: 'tools/list', params: {} },
      {}
    );
    const tool = tools.find((t) => t.name === 'repo_map');

    expect(Object.keys(tool.inputSchema.properties)).toEqual(['path', 'tokens', 'focus']);
    expect(tool.inputSchema.required).toEqual(['path']);
  });

  it('returns the map within the budget, focused on the given files', async () => {
    const result = await callTool({ path: root, tokens: 60, focus: ['api/auth.py'] });
    const text = result.content[0].text;

    expect(result.isError).toBeUndefined();
    expect(text.split('\n')[0]).toMatch(/^api\/auth\.py \(score \d\.\d{3}, \d+ tokens\)$/);
    expect(TokenUtils.calculate(text.split('\n\nNote:')[0], 'map.txt')).toBeLessThanOrEqual(60);
  });

  it('reports invalid arguments as tool errors', async () => {
    const outside = await callTool({ path: root, focus: ['../x'] });
    const badBudget = await callTool({ path: root, tokens: -5 });

    expect(outside.isError).toBe(true);
    expect(outside.content[0].text).toContain('outside the project');
    expect(badBudget.isError).toBe(true);
    expect(badBudget.content[0].text).toContain('tokens must be a positive integer');
  });
});
