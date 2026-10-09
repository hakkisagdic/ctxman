import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  BM25Index,
  chunkFile,
  clearSearchCache,
  getProjectIndex,
  normalizeTerm,
  searchProject,
  tokenize,
} from '../lib/search/bm25.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

describe('tokenize', () => {
  it('splits camelCase, snake_case and kebab-case identifiers into the same words', () => {
    const words = ['get', 'user', 'name', 'getusername'];

    expect(tokenize('getUserName')).toEqual(words);
    expect(tokenize('get_user_name')).toEqual(words);
    expect(tokenize('get-user-name')).toEqual(words);
    expect(tokenize('GET_USER_NAME')).toEqual(words);
  });

  it('keeps acronyms together and lowercases everything', () => {
    expect(tokenize('HTTPServer')).toEqual(['http', 'server', 'httpserver']);
    expect(tokenize('parseJSON')).toEqual(['parse', 'json', 'parsejson']);
    expect(tokenize('Base64 encode')).toEqual(['base', '64', 'base64', 'encode']);
  });

  it('drops single characters and punctuation', () => {
    expect(tokenize('x = y + 1; // ok')).toEqual(['ok']);
  });

  it('folds plurals without mangling words that end in s', () => {
    expect(normalizeTerm('users')).toBe('user');
    expect(normalizeTerm('classes')).toBe('class');
    expect(normalizeTerm('entries')).toBe('entry');
    expect(normalizeTerm('status')).toBe('status');
    expect(normalizeTerm('class')).toBe('class');
    expect(normalizeTerm('analysis')).toBe('analysis');
    expect(tokenize('loadUsers')).toEqual(['load', 'user', 'loaduser']);
  });
});

describe('BM25Index', () => {
  it('weights rare terms above common ones', () => {
    const index = new BM25Index();
    index.add('common only', ['common', 'pad1', 'pad2']);
    index.add('rare only', ['rare', 'pad3', 'pad4']);
    index.add('more common', ['common', 'pad5', 'pad6']);
    index.add('still common', ['common', 'pad7', 'pad8']);

    expect(index.idf('rare')).toBeGreaterThan(index.idf('common'));
    // Same length, one query term each: the rarer term wins
    expect(index.search(['common', 'rare']).map((hit) => hit.doc)).toEqual([
      'rare only',
      'common only',
      'more common',
      'still common',
    ]);
  });

  it('prefers the document where the term weighs more, then the shorter one', () => {
    const index = new BM25Index();
    index.add('long', ['token', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']);
    index.add('short', ['token', 'b1']);
    index.add('twice', ['token', 'token', 'c1', 'c2']);
    index.add('none', ['d1', 'd2']);

    const ranked = index.search('token').map((hit) => hit.doc);

    expect(ranked).toEqual(['twice', 'short', 'long']);
  });

  it('breaks ties by insertion order, the same way every time', () => {
    const index = new BM25Index();
    for (const name of ['first', 'second', 'third']) index.add(name, ['same', 'words']);

    const runs = [1, 2, 3].map(() => index.search('same words').map((hit) => hit.doc));

    expect(runs).toEqual([
      ['first', 'second', 'third'],
      ['first', 'second', 'third'],
      ['first', 'second', 'third'],
    ]);
  });

  it('returns nothing for unknown words, an empty query or an empty index', () => {
    const index = new BM25Index();
    expect(index.search('anything')).toEqual([]);
    index.add('a', ['alpha']);

    expect(index.search('beta')).toEqual([]);
    expect(index.search('  ')).toEqual([]);
    expect(index.search('alpha', { limit: 0 })).toEqual([]);
  });
});

describe('chunkFile', () => {
  it('makes one chunk per function and windows for the code around them', () => {
    const content = [
      "import fs from 'fs';",
      '',
      'export function readConfig(file) {',
      '  return fs.readFileSync(file);',
      '}',
      '',
      'export const VERSION = 3;',
      '',
    ].join('\n');

    const chunks = chunkFile(content, 'config.js');

    expect(chunks).toEqual([
      { name: null, kind: 'window', startLine: 1, endLine: 1 },
      { name: 'readConfig', kind: 'function', startLine: 3, endLine: 5 },
      { name: null, kind: 'window', startLine: 7, endLine: 7 },
    ]);
  });

  it('cuts files without methods into windows of 40 lines', () => {
    const content = Array.from({ length: 100 }, (_, i) => `line number ${i + 1}`).join('\n');

    const chunks = chunkFile(content, 'notes.md');

    expect(chunks.map((c) => [c.startLine, c.endLine])).toEqual([
      [1, 40],
      [41, 80],
      [81, 100],
    ]);
  });
});

describe('searchProject', () => {
  let root;

  const write = (relativePath, content) => {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    clearSearchCache();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-bm25-'));
    write(
      'src/users.js',
      [
        'export function getUserName(id) {',
        '  return users.get(id).name;',
        '}',
        '',
        'export function deleteSession(session) {',
        '  sessions.delete(session.id);',
        '}',
        '',
      ].join('\n')
    );
    write(
      'src/math.js',
      'export function addNumbers(a, b) {\n  return a + b;\n}\n\nexport function average(list) {\n  return list.reduce(addNumbers, 0) / list.length;\n}\n'
    );
    write('docs/guide.md', '# Guide\n\nHow sessions expire.\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('ranks the function whose name matches the query words first', () => {
    for (const query of ['user name', 'getUserName', 'get_user_name']) {
      const { results } = searchProject(root, query);

      expect(results[0]).toMatchObject({
        file: path.join('src', 'users.js'),
        name: 'getUserName',
        kind: 'function',
        startLine: 1,
        endLine: 3,
      });
      expect(results[0].text).toBe(
        'export function getUserName(id) {\n  return users.get(id).name;\n}'
      );
    }
  });

  it('reports files, chunks, scores and token counts', () => {
    const result = searchProject(root, 'session');

    expect(result.files).toBe(3);
    expect(result.chunks).toBeGreaterThanOrEqual(5);
    expect(result.results.map((r) => r.file)).toEqual([
      path.join('src', 'users.js'),
      path.join('docs', 'guide.md'),
    ]);
    expect(result.results[0].score).toBeGreaterThan(result.results[1].score);
    expect(result.tokens).toBe(result.results.reduce((sum, r) => sum + r.tokens, 0));
  });

  it('honours the result limit', () => {
    expect(searchProject(root, 'export function', { limit: 2 }).results).toHaveLength(2);
  });

  it('keeps the returned code within the token budget', () => {
    const result = searchProject(root, 'export function', { maxTokens: 12 });

    expect(result.tokens).toBeLessThanOrEqual(12);
    expect(result.results.some((r) => r.truncated)).toBe(true);
    // Chunks past the budget are still listed, without their code
    expect(result.results.at(-1)).toMatchObject({ text: null, truncated: true, tokens: 0 });
  });

  it('redacts secrets in the returned code unless asked not to', () => {
    write('src/aws.js', "export function awsClient() {\n  return 'AKIAABCDEFGHIJKLMNOP';\n}\n");

    const redacted = searchProject(root, 'aws client').results[0];
    const raw = searchProject(root, 'aws client', { redact: false }).results[0];

    expect(redacted.text).toContain('[REDACTED:aws-access-key-id]');
    expect(redacted.text).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(raw.text).toContain('AKIAABCDEFGHIJKLMNOP');
  });

  it('cannot be used to find a secret by its value', () => {
    write('src/aws.js', "export const key = 'AKIAABCDEFGHIJKLMNOP';\n");

    expect(searchProject(root, 'AKIAABCDEFGHIJKLMNOP').results).toEqual([]);
  });

  it('respects .gitignore and .contextignore', () => {
    write('.gitignore', 'build/\n');
    write('.contextignore', 'docs/**\n');
    write('build/users.js', 'export function getUserName() {}\n');

    const files = searchProject(root, 'user name session').results.map((r) => r.file);

    expect(files).not.toContain(path.join('build', 'users.js'));
    expect(files).not.toContain(path.join('docs', 'guide.md'));
  });

  it('orders equal scores by file path, whatever order the files were created in', () => {
    write('z/same.js', 'export const marker = "zebra";\n');
    write('a/same.js', 'export const marker = "zebra";\n');

    const files = searchProject(root, 'zebra marker').results.map((r) => r.file);

    expect(files).toEqual([path.join('a', 'same.js'), path.join('z', 'same.js')]);
  });

  it('reuses the index until a file changes, is added or is removed', () => {
    expect(getProjectIndex(root).reused).toBe(false);
    expect(getProjectIndex(root).reused).toBe(true);

    write('src/math.js', 'export function multiplyMatrices(a, b) {\n  return [];\n}\n');
    expect(getProjectIndex(root).reused).toBe(false);
    expect(searchProject(root, 'multiply matrices').results[0].name).toBe('multiplyMatrices');
    expect(searchProject(root, 'add numbers').results).toEqual([]);

    fs.rmSync(path.join(root, 'src', 'math.js'));
    expect(searchProject(root, 'multiply matrices').results).toEqual([]);
  });

  it('rejects an empty query and a missing directory', () => {
    expect(() => searchProject(root, '  ')).toThrow('empty');
    expect(() => searchProject(path.join(root, 'missing'), 'x')).toThrow('Not a directory');
  });
});

describe('ctxman search', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-search-cli-'));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'src', 'users.js'),
      'export function getUserName(id) {\n  return users.get(id).name;\n}\n'
    );
    fs.writeFileSync(path.join(root, 'notes.md'), 'Unrelated notes about deployment.\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const run = (args, cwd = root) =>
    spawnSync(process.execPath, [CLI, 'search', ...args], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, HOME: root, USERPROFILE: root },
    });

  it('prints ranked results with their code', () => {
    const result = run(['user', 'name']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `1. ${path.join('src', 'users.js')}:1-3  getUserName (function)  score`
    );
    expect(result.stdout).toContain('1 | export function getUserName(id) {');
    expect(result.stdout).not.toContain('Starting scan');
  });

  it('prints JSON with --json and takes the project from a trailing directory argument', () => {
    const elsewhere = os.tmpdir();
    const result = run(['getUserName', root, '--json', '--limit', '1'], elsewhere);

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.root).toBe(root);
    expect(json.query).toBe('getUserName');
    expect(json.results).toHaveLength(1);
    expect(json.results[0]).toMatchObject({ name: 'getUserName', startLine: 1, endLine: 3 });
  });

  it('writes the output to a file with -o', () => {
    const out = path.join(root, 'out.json');

    const result = run(['user', '--json', '-o', out]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(JSON.parse(fs.readFileSync(out, 'utf-8')).results[0].name).toBe('getUserName');
  });

  it('says so when nothing matches', () => {
    const result = run(['kubernetes']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No matches.');
  });

  it('prints its own help and rejects bad usage', () => {
    expect(run(['--help']).stdout).toContain('ctxman search "<query>" [path] [options]');

    const missing = run([]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('Missing query');

    const badLimit = run(['user', '--limit', '0']);
    expect(badLimit.status).toBe(2);
    expect(badLimit.stderr).toContain('--limit must be a positive integer');

    expect(run(['user', '--bogus']).status).toBe(2);
  });
});
