import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import TokenUtils from '../lib/utils/token-utils.js';
import { renderRepoMap } from '../lib/map/index.js';
import * as API from '../index.js';

/** A small JavaScript project: lib/log.js is imported by everything */
const FILES = {
  'lib/log.js': [
    'export function info(message, meta = {}) {',
    '  return format(message, meta);',
    '}',
    'export function warn(message) {',
    '  return format(message);',
    '}',
    'function format(message, meta) {',
    '  return `${message} ${JSON.stringify(meta)}`;',
    '}',
  ].join('\n'),
  'lib/config.js': [
    "import { info } from './log.js';",
    'export function loadConfig(file) {',
    "  info('loading ' + file);",
    '  return {};',
    '}',
  ].join('\n'),
  'lib/index.js': "export * from './log.js';\nexport * from './config.js';\n",
  'lib/db.cjs.js': [
    "const { warn } = require('./log');",
    'function connect(url) {',
    '  warn(url);',
    '}',
    'module.exports = { connect };',
  ].join('\n'),
  'src/server.js': [
    "import { info, loadConfig } from '../lib/index.js';",
    "import { connect } from '../lib/db.cjs.js';",
    'export async function start(port = 3000) {',
    '  loadConfig(port);',
    '  connect(port);',
    "  info('started');",
    '}',
    'export const stop = (server) => {',
    '  server.close();',
    '};',
  ].join('\n'),
  'src/routes.js': [
    "import { info } from '../lib/log.js';",
    'export function routes(app) {',
    "  app.get('/', () => info('hit'));",
    '}',
  ].join('\n'),
  'scripts/seed.js': [
    "import { connect } from '../lib/db.cjs.js';",
    'function seed() {',
    "  connect('db');",
    '}',
    'seed();',
  ].join('\n'),
};

const count = (text) => TokenUtils.calculate(text, 'map.txt');
/** File paths in the order the text map lists them */
const textPaths = (output) =>
  output
    .split('\n')
    .filter((line) => line && !line.startsWith(' '))
    .map((line) => line.slice(0, line.indexOf(' (score')));

describe('renderRepoMap', () => {
  let root;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-map-render-'));
    for (const [relativePath, content] of Object.entries(FILES)) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), `${content}\n`);
    }
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const render = (options = {}) => renderRepoMap(root, { history: 0, ...options });

  it('lists the best files with headers and one line per function', () => {
    const result = render({ tokens: 4096 });
    const lines = result.output.split('\n');

    expect(result.ranked[0].path).toBe('lib/log.js');
    expect(lines[0]).toMatch(/^lib\/log\.js \(score 1\.000, \d+ tokens\)$/);
    expect(lines[1]).toMatch(/^ {2}1: export function info\(message, meta = \{\}\) \[\d+ tok\]$/);
    expect(textPaths(result.output)).toEqual(result.ranked.map((row) => row.path));
    expect(result.files).toHaveLength(Object.keys(FILES).length);
    expect(result.tokens).toBe(count(result.output));
    // Method tokens cover the whole body, not just the declaration line
    const info = result.files[0].methods.find((method) => method.name === 'info');
    expect(info.tokens).toBe(
      count('export function info(message, meta = {}) {\n  return format(message, meta);\n}')
    );
  });

  it('never exceeds the budget, in text and markdown', () => {
    for (const style of ['text', 'markdown']) {
      for (const tokens of [5, 20, 40, 80, 120, 200, 400, 4096]) {
        const result = render({ tokens, style });

        expect(count(result.output)).toBeLessThanOrEqual(tokens);
        expect(result.tokens).toBe(count(result.output));
        for (const file of result.files) {
          // Whole files only: every function of an included file is listed
          const node = result.graph.nodes.find((n) => n.path === file.path);
          expect(file.methods).toHaveLength(node.methods.length);
        }
      }
    }
  });

  it('fills the budget best rank first and skips files that do not fit', () => {
    const full = render({ tokens: 4096 });
    const blockOf = (file) => {
      const start = full.output.indexOf(`${file} (score`);
      const next = full.output.slice(start + 1).search(/\n[^ ]/);
      return full.output.slice(start, next === -1 ? undefined : start + 1 + next + 1);
    };
    const best = full.ranked[0].path;
    const budget = count(blockOf(best)) + 2;

    const result = render({ tokens: budget });

    expect(result.files[0].path).toBe(best);
    expect(result.skipped).toBe(full.ranked.length - result.files.length);
    expect(render({ tokens: 3 }).warnings).toContain('no file fits in 3 tokens');
  });

  it('puts the most important file last with importantLast, or sorts by path', () => {
    const ranked = render({ tokens: 4096 });
    const last = render({ tokens: 4096, importantLast: true });
    const byPath = render({ tokens: 4096, order: 'path' });

    expect(textPaths(last.output)).toEqual(textPaths(ranked.output).reverse());
    expect(textPaths(last.output).at(-1)).toBe('lib/log.js');
    expect(textPaths(byPath.output)).toEqual([...textPaths(ranked.output)].sort());
    expect(() => render({ importantLast: true, order: 'path' })).toThrow('rank order');
  });

  it('is deterministic', () => {
    for (const style of ['text', 'markdown', 'json', 'dot']) {
      expect(render({ style, tokens: 300 }).output).toBe(render({ style, tokens: 300 }).output);
    }
  });

  it('renders markdown', () => {
    const { output } = render({ style: 'markdown', tokens: 4096 });

    expect(output.startsWith('# Repository map\n\n## lib/log.js\nscore 1.000 · ')).toBe(true);
    expect(output).toMatch(/- L1 `export function info\(message, meta = \{\}\)` \(\d+ tokens\)/);
  });

  it('renders JSON with the map, every node with its scores, and the edges', () => {
    const result = render({ style: 'json', tokens: 120 });
    const document = JSON.parse(result.output);
    const text = render({ tokens: 120 });

    expect(document.budget).toBe(120);
    expect(document.files.map((file) => file.path)).toEqual(text.files.map((file) => file.path));
    expect(document.tokens).toBe(text.tokens);
    expect(document.nodes).toHaveLength(Object.keys(FILES).length);
    expect(document.nodes[0]).toMatchObject({ path: 'lib/log.js', rank: 1, score: 1 });
    expect(document.nodes.filter((node) => node.included).map((node) => node.path)).toEqual(
      document.files.map((file) => file.path)
    );
    expect(document.edges).toContainEqual({
      from: 'src/server.js',
      to: 'lib/index.js',
      weight: 1,
    });
    expect(document.files[0].methods[0]).toEqual({
      line: 1,
      name: 'info',
      signature: 'export function info(message, meta = {})',
      tokens: expect.any(Number),
    });
  });

  it('prints the dependency graph as edges or Graphviz', () => {
    const edges = render({ graph: true }).output.trim().split('\n');
    const dot = render({ style: 'dot' }).output;
    const json = JSON.parse(render({ graph: true, style: 'json' }).output);

    expect(edges).toContain('lib/config.js -> lib/log.js');
    expect(edges).toContain('lib/db.cjs.js -> lib/log.js');
    expect(dot).toMatch(/^digraph repo \{\n/);
    expect(dot).toContain('"lib/config.js" -> "lib/log.js";');
    expect(dot).toContain('"lib/log.js" [label="lib/log.js\\n1.000"];');
    expect(json.edges).toHaveLength(edges.length);
    expect(json.nodes[0]).toEqual({ path: 'lib/log.js', rank: 1, score: 1 });
  });

  it('ranks around focus files and reports focus paths that match nothing', () => {
    const plain = render();
    const focused = render({ focus: ['scripts/seed.js', 'nope.js'] });
    const rankOf = (result, file) => result.ranked.find((row) => row.path === file).rank;

    // seed.js imports db.cjs.js, which imports log.js: the jump to seed.js flows down it
    expect(focused.ranked[0].path).toBe('lib/db.cjs.js');
    expect(rankOf(focused, 'scripts/seed.js')).toBeLessThan(rankOf(plain, 'scripts/seed.js'));
    expect(rankOf(focused, 'src/routes.js')).toBeGreaterThan(rankOf(focused, 'scripts/seed.js'));
    expect(focused.warnings).toContain('focus path matches no mapped file: nope.js');
    expect(() => render({ focus: ['../elsewhere'] })).toThrow('outside the project');
  });

  it('validates its options', () => {
    expect(() => render({ tokens: 0 })).toThrow('tokens');
    expect(() => render({ tokens: 1.5 })).toThrow('tokens');
    expect(() => render({ style: 'html' })).toThrow('style');
    expect(() => render({ order: 'size' })).toThrow('order');
    expect(() => render({ history: -2 })).toThrow('history');
  });

  it('is exported from the package entry point', () => {
    expect(API.renderRepoMap).toBe(renderRepoMap);
    expect(typeof API.buildRepoGraph).toBe('function');
    expect(typeof API.rankFiles).toBe('function');
  });
});

describe('renderRepoMap with git history', () => {
  let root;
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: root,
      stdio: 'ignore',
    });
  const commit = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
    git('add', '-A');
    git('commit', '-q', '-m', `change ${file}`);
  };

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-map-history-'));
    git('init', '-q');
    commit('a.js', 'export function a() {\n  return 1;\n}\n');
    commit('b.js', 'export function b() {\n  return 1;\n}\n');
    for (let i = 2; i <= 5; i++) commit('b.js', `export function b() {\n  return ${i};\n}\n`);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('counts recent commits per file and ranks the busier file first', () => {
    const result = renderRepoMap(root, { tokens: 500 });
    const b = result.ranked.find((row) => row.path === 'b.js');

    expect(result.graph.history).toMatchObject({ available: true, requested: 300, commits: 6 });
    expect(b).toMatchObject({ rank: 1, changes: 5 });
    expect(result.ranked.find((row) => row.path === 'a.js').changes).toBe(1);
  });

  it('looks only at the last N commits and can be switched off', () => {
    const recent = renderRepoMap(root, { history: 2 });
    const off = renderRepoMap(root, { history: 0 });

    expect(recent.graph.history.commits).toBe(2);
    expect(recent.ranked.find((row) => row.path === 'a.js').changes).toBe(0);
    expect(off.graph.history).toMatchObject({ available: false, reason: 'disabled' });
    expect(off.ranked.map((row) => row.score)).toEqual([1, 1]);
  });

  it('warns and ranks without history outside a git repository', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-map-nogit-'));
    try {
      fs.writeFileSync(path.join(plain, 'a.js'), 'export const a = 1;\n');
      const result = renderRepoMap(plain);

      expect(result.graph.history.available).toBe(false);
      expect(result.warnings[0]).toMatch(/^git history unavailable/);
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });
});
