import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hybridSearch, PolicyConfigError } from '../index.js';
import { clearSearchCache } from '../lib/search/bm25.js';
import { ASK_STORE_DIR } from '../lib/rag/ask.js';
import MCPServer from '../lib/api/mcp/server.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

class RankedMemoryStore {
  constructor(semanticOrder = []) {
    this.rows = [];
    this.semanticOrder = semanticOrder;
  }

  async addDocuments(docs) {
    this.rows.push(...docs);
  }

  async search(_query, limit) {
    const byBasename = new Map(this.rows.map((row) => [path.basename(row.metadata.path), row]));
    const ordered = [];
    for (let i = 0; i < this.semanticOrder.length; i++) {
      const doc = byBasename.get(this.semanticOrder[i]);
      if (doc) ordered.push({ ...doc, score: 1 - i * 0.1 });
    }
    return ordered.slice(0, limit);
  }
}

describe('hybridSearch & ctxman search --hybrid (N2)', () => {
  let root;

  const write = (rel, content) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  };

  beforeEach(() => {
    clearSearchCache();
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-hybrid-')));
    write(
      'src/lexicalOnly.js',
      'export function refreshAuthToken(token) {\n  return token.trim();\n}\n'
    );
    write(
      'src/bothMatch.js',
      'export function rotateAuthToken(token) {\n  return `${token}-next`;\n}\n'
    );
    write(
      'src/semanticOnly.js',
      `export function verifyCredentials(principal) {\n  const k = '${AWS_KEY}';\n  return Boolean(principal && k);\n}\n`
    );
  });

  afterEach(() => {
    clearSearchCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fuses BM25 and semantic rankings via RRF and surfaces zero-lexical-overlap semantic chunks', async () => {
    // Semantic store ranks: 1. semanticOnly.js (no "auth token" words!), 2. bothMatch.js
    const store = new RankedMemoryStore(['semanticOnly.js', 'bothMatch.js']);

    const res = await hybridSearch(root, 'auth token', {
      mode: 'hybrid',
      rrfK: 60,
      createStore: () => store,
    });

    expect(res.mode).toBe('hybrid');
    expect(res.effectiveMode).toBe('hybrid');
    expect(res.semanticAvailable).toBe(true);
    expect(res.warnings).toEqual([]);

    // bothMatch.js matched BOTH BM25 and semantic (#2), so its RRF score beats single-signal hits!
    expect(res.results[0].file).toBe(path.join('src', 'bothMatch.js'));
    expect(res.results[0].bm25Rank).not.toBeNull();
    expect(res.results[0].semanticRank).toBe(2);

    // semanticOnly.js had ZERO lexical overlap with "auth token", yet appears via semanticRank #1
    // projected onto its `verifyCredentials` function chunk with secrets redacted!
    const semHit = res.results.find((r) => r.file === path.join('src', 'semanticOnly.js'));
    expect(semHit).toBeDefined();
    expect(semHit.name).toBe('verifyCredentials');
    expect(semHit.bm25Rank).toBeNull();
    expect(semHit.semanticRank).toBe(1);
    expect(semHit.text).not.toContain(AWS_KEY);
    expect(semHit.text).toContain('[REDACTED:aws-access-key-id]');
  });

  it('supports pure bm25 and pure semantic modes and respects maxTokens budget', async () => {
    const store = new RankedMemoryStore(['semanticOnly.js']);

    const bm25Only = await hybridSearch(root, 'auth token', { mode: 'bm25' });
    expect(bm25Only.effectiveMode).toBe('bm25');
    expect(bm25Only.semanticAvailable).toBe(false);
    expect(bm25Only.results.map((r) => path.basename(r.file))).not.toContain('semanticOnly.js');

    const semOnly = await hybridSearch(root, 'conceptual login check', {
      mode: 'semantic',
      maxTokens: 12,
      createStore: () => store,
    });
    expect(semOnly.effectiveMode).toBe('semantic');
    expect(semOnly.results).toHaveLength(1);
    expect(path.basename(semOnly.results[0].file)).toBe('semanticOnly.js');
    expect(semOnly.tokens).toBeLessThanOrEqual(12);
  });

  it('gracefully falls back to BM25 in hybrid mode when vector store fails, but throws in strict semantic mode', async () => {
    // Pre-create store dir so askCodebase runs store.search() directly
    fs.mkdirSync(path.join(root, ASK_STORE_DIR), { recursive: true });
    fs.writeFileSync(path.join(root, ASK_STORE_DIR, 'marker'), '');

    const brokenStore = () => ({
      async search() {
        throw new Error('LanceDB optional dependency missing');
      },
    });

    const fallback = await hybridSearch(root, 'auth token', {
      mode: 'hybrid',
      createStore: brokenStore,
    });
    expect(fallback.semanticAvailable).toBe(false);
    expect(fallback.effectiveMode).toBe('bm25');
    expect(fallback.warnings[0]).toContain('LanceDB optional dependency missing');
    expect(fallback.results.length).toBeGreaterThan(0);

    await expect(
      hybridSearch(root, 'auth token', {
        mode: 'semantic',
        createStore: brokenStore,
      })
    ).rejects.toThrow('LanceDB optional dependency missing');
  });

  it('enforces export policy and never swallows PolicyConfigError', async () => {
    write('.ctxman/policy.json', JSON.stringify({ version: 1, deny: 'not-an-array' }));
    await expect(hybridSearch(root, 'auth token')).rejects.toThrow(PolicyConfigError);

    write('.ctxman/policy.json', JSON.stringify({ version: 1, deny: ['src/semanticOnly.js'] }));
    const store = new RankedMemoryStore(['semanticOnly.js', 'bothMatch.js']);
    const res = await hybridSearch(root, 'auth token', {
      mode: 'hybrid',
      createStore: () => store,
    });
    expect(res.results.map((r) => path.basename(r.file))).not.toContain('semanticOnly.js');
  });

  it('integrates with CLI `ctxman search --mode` and MCP `search_code` (`type: hybrid`)', async () => {
    const cli = spawnSync(
      process.execPath,
      [CLI, 'search', 'auth token', root, '--mode', 'bm25', '--json'],
      { cwd: root, encoding: 'utf-8' }
    );
    expect(cli.status).toBe(0);
    const parsed = JSON.parse(cli.stdout);
    expect(parsed.results.length).toBeGreaterThan(0);

    const conflict = spawnSync(
      process.execPath,
      [CLI, 'search', 'auth', root, '--hybrid', '--mode', 'bm25'],
      { cwd: root, encoding: 'utf-8' }
    );
    expect(conflict.status).toBe(2);

    // Pre-create empty marker + test MCP fallback / execution
    fs.mkdirSync(path.join(root, ASK_STORE_DIR), { recursive: true });
    fs.writeFileSync(path.join(root, ASK_STORE_DIR, 'table'), '');

    const mcp = new MCPServer({ root });
    const handler = mcp.server._requestHandlers.get(CallToolRequestSchema.shape.method.value);
    const mcpRes = await handler({
      method: 'tools/call',
      params: {
        name: 'search_code',
        arguments: {
          path: root,
          query: 'auth token',
          type: 'hybrid',
          limit: 3,
        },
      },
    });
    expect(mcpRes.isError).toBeUndefined();
    const mcpPayload = JSON.parse(mcpRes.content[0].text);
    expect(mcpPayload.mode).toBe('hybrid');
    expect(mcpPayload.results.length).toBeGreaterThan(0);
  });
});
