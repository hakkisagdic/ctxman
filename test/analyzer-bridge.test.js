import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { queryAnalyzerCitations, resolveAnalyzerDbPath } from '../lib/why/analyzer-bridge.js';
import { explainHistory } from '../lib/why/index.js';
import { runGit } from '../lib/why/git.js';

describe('queryAnalyzerCitations & Institutional Memory Bridge', () => {
  let tmpDir;
  let dbPath;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-analyzer-')));

    // Setup git repo
    runGit(tmpDir, ['init']);
    runGit(tmpDir, ['config', 'user.name', 'Test User']);
    runGit(tmpDir, ['config', 'user.email', 'test@example.com']);

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.plansmith'), { recursive: true });

    // Committed file
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'auth.js'),
      'export function login(user, pass) {\n  return true;\n}\n'
    );
    runGit(tmpDir, ['add', 'src/auth.js']);
    runGit(tmpDir, ['commit', '-m', 'feat: initial auth service (PR #101)']);

    // Create SQLite DB matching plansmith-analyzer documents table schema
    dbPath = path.join(tmpDir, '.plansmith', 'analyzer.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        path TEXT,
        url TEXT,
        author TEXT,
        timestamp TEXT,
        refs TEXT NOT NULL,
        vector TEXT
      )
    `);

    const insert = db.prepare(`
      INSERT INTO documents (id, kind, title, body, path, url, author, timestamp, refs, vector)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      'pr-101',
      'pr',
      'PR #101: Add OAuth2 and session login',
      'We decided in Slack #architecture to deprecate legacy basic auth and use login with JWT tokens.',
      'src/auth.js',
      'https://github.com/org/repo/pull/101',
      'alice',
      '2026-08-14T10:00:00Z',
      JSON.stringify(['#101', 'src/auth.js']),
      null
    );

    insert.run(
      'incident-404',
      'incident',
      'INC-404: Auth token expiration outage',
      'Root cause was improper token expiration handling during token refresh.',
      'src/auth.js',
      'https://linear.app/org/issue/INC-404',
      'bob',
      '2026-09-01T15:30:00Z',
      JSON.stringify(['INC-404', 'src/auth.js']),
      null
    );

    insert.run(
      'doc-arch',
      'doc',
      'ADR 005: Authentication Strategy',
      'Architecture Decision Record: login token security guidelines.',
      'docs/adr/005.md',
      null,
      'charlie',
      '2026-07-20T12:00:00Z',
      JSON.stringify(['src/auth.js']),
      null
    );

    db.close();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('resolveAnalyzerDbPath', () => {
    it('locates analyzer.sqlite under .plansmith directory', () => {
      const found = resolveAnalyzerDbPath(tmpDir);
      expect(found).toBe(dbPath);
    });

    it('returns direct path if .sqlite file is passed', () => {
      const found = resolveAnalyzerDbPath(dbPath);
      expect(found).toBe(dbPath);
    });

    it('returns null if db does not exist', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'));
      expect(resolveAnalyzerDbPath(emptyDir)).toBe(null);
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });
  });

  describe('queryAnalyzerCitations', () => {
    it('finds citations matching target file and symbol', () => {
      const citations = queryAnalyzerCitations(dbPath, {
        file: 'src/auth.js',
        symbol: 'login',
      });

      expect(citations.length).toBeGreaterThanOrEqual(2);
      expect(citations[0].title).toContain('PR #101');
      expect(citations[0].kind).toBe('pr');
      expect(citations[0].url).toBe('https://github.com/org/repo/pull/101');
      expect(citations[0].refs).toContain('#101');
    });

    it('redacts secrets in citations when redact is enabled', () => {
      const secretDb = path.join(tmpDir, 'secret.sqlite');
      const db = new DatabaseSync(secretDb);
      db.exec(`
        CREATE TABLE documents (
          id TEXT PRIMARY KEY, kind TEXT, title TEXT, body TEXT, path TEXT, url TEXT,
          author TEXT, timestamp TEXT, refs TEXT, vector TEXT
        )
      `);
      const key = 'sk-ant-api03-' + 'x'.repeat(40);
      db.prepare(
        `
        INSERT INTO documents VALUES ('sec-1', 'doc', 'Secret Guide', ?, 'src/auth.js', null, null, null, '[]', null)
      `
      ).run(`Contains credentials: ${key}`);
      db.close();

      const citations = queryAnalyzerCitations(secretDb, {
        file: 'src/auth.js',
        redact: true,
      });

      expect(citations.length).toBe(1);
      expect(citations[0].snippet).not.toContain(key);
      expect(citations[0].snippet).toContain('[REDACTED:');
    });
  });

  describe('explainHistory integration', () => {
    it('automatically queries analyzer.sqlite and attaches institutional citations', async () => {
      const result = await explainHistory(tmpDir, 'src/auth.js:login');
      expect(result.data.institutionalCitations).toBeDefined();
      expect(result.data.institutionalCitations.length).toBeGreaterThanOrEqual(1);

      // Markdown output should include the section
      expect(result.text).toContain('## Institutional Citations (Analyzer)');
      expect(result.text).toContain('PR #101');
    });

    it('attaches institutional citations in XML format', async () => {
      const result = await explainHistory(tmpDir, 'src/auth.js', {
        style: 'xml',
      });

      expect(result.text).toContain('<institutional_citations>');
      expect(result.text).toContain('<citation');
      expect(result.text).toContain('PR #101');
    });

    it('attaches institutional citations in JSON format', async () => {
      const result = await explainHistory(tmpDir, 'src/auth.js', {
        style: 'json',
      });

      const parsed = JSON.parse(result.text);
      expect(parsed.institutionalCitations).toBeDefined();
      expect(parsed.institutionalCitations.length).toBeGreaterThan(0);
    });
  });
});
