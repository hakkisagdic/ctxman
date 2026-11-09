import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { askCodebase, ASK_STORE_DIR } from '../lib/rag/ask.js';

const FAKE_KEY = `sk-ant-api03-${'x'.repeat(40)}`;

// In-memory store: every document matches, in the order it was added
class MemoryStore {
  constructor(rows = []) {
    this.rows = rows;
  }

  async addDocuments(docs) {
    this.rows.push(...docs);
  }

  async search(_query, limit) {
    return this.rows.slice(0, limit).map((doc, idx) => ({ ...doc, score: 0.9 - idx * 0.1 }));
  }
}

describe('askCodebase', () => {
  let root;
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  const indexed = (store) => store.rows.map((doc) => path.relative(root, doc.metadata.path));

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-ask-')));
    write('src/app.js', `export const key = '${FAKE_KEY}';\n`);
    write('docs/guide.md', '# Guide\n' + 'text '.repeat(100));
    write('secrets/db.json', '{"password": "hunter2"}\n');
    write('build/out.js', 'generated\n');
    write('.gitignore', 'build/\n');
    write('.ctxman/policy.json', JSON.stringify({ version: 1, deny: ['secrets/'] }));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('indexes on first use without ignored or denied files', async () => {
    const store = new MemoryStore();
    const events = [];

    const result = await askCodebase(root, 'where is the key', {
      createStore: () => store,
      onProgress: (event) => events.push(event),
    });

    expect(events).toEqual(['indexing', 'indexed']);
    expect(result.indexed).toBe(true);
    expect(indexed(store).sort()).toEqual(['docs/guide.md', 'src/app.js']);
  });

  it('returns project-relative files with secrets redacted', async () => {
    const result = await askCodebase(root, 'where is the key', {
      createStore: () => new MemoryStore(),
    });

    const app = result.results.find((r) => r.file === 'src/app.js');
    expect(app.text).not.toContain(FAKE_KEY);
    expect(result.redactions).toBeGreaterThan(0);
  });

  it('drops denied files found in an index built before the policy', async () => {
    fs.mkdirSync(path.join(root, ASK_STORE_DIR), { recursive: true });
    fs.writeFileSync(path.join(root, ASK_STORE_DIR, 'table'), '');
    const store = new MemoryStore([
      { text: '{"password": "hunter2"}', metadata: { path: path.join(root, 'secrets/db.json') } },
      { text: 'export const a = 1;', metadata: { path: path.join(root, 'src/app.js') } },
      { text: 'elsewhere', metadata: { path: path.join(os.tmpdir(), 'other.js') } },
    ]);

    const result = await askCodebase(root, 'password', { createStore: () => store });

    expect(result.indexed).toBe(false);
    expect(result.removedByPolicy).toBe(1);
    expect(result.results.map((r) => r.file)).toEqual(['src/app.js']);
  });

  it('keeps to the limit and cuts long snippets', async () => {
    const result = await askCodebase(root, 'guide', {
      createStore: () => new MemoryStore(),
      limit: 1,
      maxChars: 20,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].text).toHaveLength(20);
    expect(result.results[0].truncated).toBe(true);
  });

  it('needs a question', async () => {
    await expect(askCodebase(root, '   ')).rejects.toThrow('A question is required');
  });

  it('searches across multiple repositories with <alias>/<path> prefixes and enforces per-repo policies', async () => {
    const wsRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-ask-ws-')));
    const repoA = path.join(wsRoot, 'auth-svc');
    const repoB = path.join(wsRoot, 'web-app');

    fs.mkdirSync(path.join(repoA, 'src'), { recursive: true });
    fs.mkdirSync(path.join(repoB, 'src'), { recursive: true });
    fs.mkdirSync(path.join(repoB, 'private'), { recursive: true });
    fs.mkdirSync(path.join(repoB, '.ctxman'), { recursive: true });

    fs.writeFileSync(path.join(repoA, 'src/token.js'), `export const secret = '${FAKE_KEY}';\n`);
    fs.writeFileSync(
      path.join(repoB, 'src/login.js'),
      'export function login() { return true; }\n'
    );
    fs.writeFileSync(path.join(repoB, 'private/keys.js'), 'export const p = "denied";\n');
    fs.writeFileSync(
      path.join(repoB, '.ctxman/policy.json'),
      JSON.stringify({ version: 1, deny: ['private/'] })
    );

    try {
      const stores = new Map();
      const result = await askCodebase(wsRoot, 'where is authentication handled', {
        repos: [repoA, repoB],
        createStore: (storePath) => {
          const s = new MemoryStore();
          stores.set(storePath, s);
          return s;
        },
      });

      expect(result.indexed).toBe(true);
      expect(result.repos.map((r) => r.alias)).toEqual(['auth-svc', 'web-app']);
      expect(result.results.map((r) => r.file).sort()).toEqual([
        'auth-svc/src/token.js',
        'web-app/src/login.js',
      ]);
      expect(result.results.find((r) => r.file === 'auth-svc/src/token.js').repo).toBe('auth-svc');
      expect(result.results.find((r) => r.file === 'auth-svc/src/token.js').text).not.toContain(
        FAKE_KEY
      );
      expect(result.redactions).toBeGreaterThan(0);
    } finally {
      fs.rmSync(wsRoot, { recursive: true, force: true });
    }
  });
});
