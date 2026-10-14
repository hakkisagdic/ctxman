import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { extractCodeUnits } from '../lib/search/code-units.js';
import { clearSearchCache } from '../lib/search/bm25.js';
import { editDistance, getSymbol, parseSymbolQuery } from '../lib/search/symbols.js';

describe('extractCodeUnits', () => {
  it('finds classes with their methods and top-level functions in JavaScript', () => {
    const content = [
      'export class SessionStore extends Base {',
      '  constructor(options = {}) {',
      '    super(options);',
      '  }',
      '',
      '  save(session) {',
      '    return session;',
      '  }',
      '}',
      '',
      'export function createStore() {',
      '  return new SessionStore();',
      '}',
    ].join('\n');

    expect(extractCodeUnits(content, 'store.js')).toEqual([
      { name: 'SessionStore', kind: 'class', startLine: 1, endLine: 9, container: true },
      { name: 'constructor', kind: 'method', startLine: 2, endLine: 4, parent: 'SessionStore' },
      { name: 'save', kind: 'method', startLine: 6, endLine: 8, parent: 'SessionStore' },
      { name: 'createStore', kind: 'function', startLine: 11, endLine: 13 },
    ]);
  });

  it('uses indentation for Python classes and the receiver for Go methods', () => {
    const python = extractCodeUnits(
      'class Cache:\n    def get(self, key):\n        return self.data[key]\n\ndef helper():\n    pass\n',
      'cache.py'
    );
    const go = extractCodeUnits(
      'package cache\n\ntype Cache struct {\n\tdata map[string]string\n}\n\nfunc (c *Cache) Get(key string) string {\n\treturn c.data[key]\n}\n',
      'cache.go'
    );

    expect(python.map((u) => [u.name, u.kind, u.startLine, u.endLine, u.parent])).toEqual([
      ['Cache', 'class', 1, 3, undefined],
      ['get', 'method', 2, 3, 'Cache'],
      ['helper', 'function', 5, 6, undefined],
    ]);
    expect(go.map((u) => [u.name, u.kind, u.startLine, u.endLine, u.parent])).toEqual([
      ['Cache', 'struct', 3, 5, undefined],
      ['Get', 'method', 7, 9, 'Cache'],
    ]);
  });

  it('does not let a class without a body take the next one', () => {
    const units = extractCodeUnits(
      'case class Point(x: Int, y: Int)\nclass Shape {\n  def area(): Int = 0\n}\n',
      'shapes.scala'
    );

    expect(units.find((u) => u.name === 'Point')).toMatchObject({ startLine: 1, endLine: 1 });
    expect(units.find((u) => u.name === 'Shape')).toMatchObject({ startLine: 2, endLine: 4 });
  });

  it('ignores files the method analyzers do not handle, and minified code', () => {
    expect(extractCodeUnits('function looksLikeCode() {}\n', 'notes.md')).toEqual([]);
    expect(extractCodeUnits(`function a(){${'x;'.repeat(500)}}`, 'bundle.min.js')).toEqual([]);
  });
});

describe('symbol query helpers', () => {
  it('splits qualified names', () => {
    expect(parseSymbolQuery('Store.save')).toEqual({ parent: 'Store', name: 'save' });
    expect(parseSymbolQuery('Store::save')).toEqual({ parent: 'Store', name: 'save' });
    expect(parseSymbolQuery('Store#save')).toEqual({ parent: 'Store', name: 'save' });
    expect(parseSymbolQuery('save')).toEqual({ parent: null, name: 'save' });
  });

  it('computes edit distances with an early cut-off', () => {
    expect(editDistance('getusername', 'getusrname')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('a', 'abcdef', 2)).toBe(3);
  });
});

describe('getSymbol', () => {
  let root;

  const write = (relativePath, content) => {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    clearSearchCache();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-symbols-'));
    write(
      'src/store.js',
      [
        'export class SessionStore {',
        '  save(session) {',
        "    const key = 'AKIAABCDEFGHIJKLMNOP';",
        '    return { key, session };',
        '  }',
        '}',
        '',
        'export function getUserName(id) {',
        '  return id;',
        '}',
        '',
      ].join('\n')
    );
    write('src/other.js', 'export function save(item) {\n  return item;\n}\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns the full source of an exact match with file and line range', () => {
    const result = getSymbol(root, 'getUserName');

    expect(result).toEqual({
      query: 'getUserName',
      match: 'exact',
      total: 1,
      symbols: [
        {
          name: 'getUserName',
          kind: 'function',
          file: path.join('src', 'store.js'),
          startLine: 8,
          endLine: 10,
          tokens: expect.any(Number),
          source: 'export function getUserName(id) {\n  return id;\n}',
        },
      ],
    });
  });

  it('lists every match, and narrows them with Class.method or file', () => {
    expect(getSymbol(root, 'save').symbols.map((s) => s.file)).toEqual([
      path.join('src', 'other.js'),
      path.join('src', 'store.js'),
    ]);
    expect(getSymbol(root, 'SessionStore.save').symbols).toMatchObject([
      { name: 'save', parent: 'SessionStore', startLine: 2, endLine: 5 },
    ]);
    expect(getSymbol(root, 'save', { file: 'src/other.js' }).symbols).toHaveLength(1);
  });

  it('returns a whole class', () => {
    const [symbol] = getSymbol(root, 'SessionStore').symbols;

    expect(symbol).toMatchObject({ kind: 'class', startLine: 1, endLine: 6 });
    expect(symbol.source.split('\n')).toHaveLength(6);
  });

  it('redacts secrets in the source unless asked not to', () => {
    const redacted = getSymbol(root, 'SessionStore.save').symbols[0].source;
    const raw = getSymbol(root, 'SessionStore.save', { redact: false }).symbols[0].source;

    expect(redacted).toContain('[REDACTED:aws-access-key-id]');
    expect(raw).toContain('AKIAABCDEFGHIJKLMNOP');
  });

  it('falls back to a case-insensitive match', () => {
    const result = getSymbol(root, 'getusername');

    expect(result.match).toBe('case-insensitive');
    expect(result.symbols[0].name).toBe('getUserName');
  });

  it('suggests similar names when nothing matches', () => {
    const result = getSymbol(root, 'getUsrName');

    expect(result.match).toBe('none');
    expect(result.symbols).toEqual([]);
    expect(result.suggestions[0]).toEqual({
      name: 'getUserName',
      kind: 'function',
      file: path.join('src', 'store.js'),
      startLine: 8,
    });
    expect(getSymbol(root, 'Session').suggestions.map((s) => s.name)).toContain('SessionStore');
  });

  it('cuts sources at the token budget', () => {
    const result = getSymbol(root, 'save', { maxTokens: 8 });

    expect(result.symbols.some((s) => s.truncated)).toBe(true);
    expect(result.symbols.reduce((sum, s) => sum + s.tokens, 0)).toBeLessThanOrEqual(8);
  });

  it('rejects an empty name and a file outside the project', () => {
    expect(() => getSymbol(root, ' ')).toThrow('empty');
    expect(() => getSymbol(root, 'save', { file: '../store.js' })).toThrow(
      'File not found in project'
    );
  });
});
