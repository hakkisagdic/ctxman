import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadPolicy,
  recordExport,
  guardExport,
  readAuditLog,
  filterAuditEvents,
  formatAuditTable,
  parseSince,
  PolicyViolationError,
} from '../lib/policy/index.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const SECRET_TEXT = 'const password = "hunter2-do-not-log";';

const isolatedEnv = (home) => {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.CTXMAN_POLICY;
  return env;
};

describe('audit log', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-audit-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const writePolicy = (doc) => {
    fs.mkdirSync(path.join(root, '.ctxman'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctxman', 'policy.json'), JSON.stringify(doc));
    return loadPolicy(root, { env: {} });
  };
  const logLines = (file = path.join(root, '.ctxman', 'audit.log')) =>
    fs
      .readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

  describe('recordExport', () => {
    it('appends one JSON line per export with a hash of the text, never the text', () => {
      const policy = writePolicy({ version: 1, audit: { enabled: true } });

      const record = recordExport(policy, {
        command: 'cli --context-export',
        destination: path.join(root, 'llm-context.json'),
        format: 'toon',
        targetModel: 'claude-sonnet-4.5',
        files: [
          { relativePath: 'src/a.js', tokens: 10 },
          { relativePath: 'src\\b.js', tokens: 5 },
        ],
        redactions: { 'aws-access-key-id': 2, 'private-key': 1 },
        removedByPolicy: 4,
        text: SECRET_TEXT,
      });
      recordExport(policy, { command: 'second', destination: 'stdout', text: 'x' });

      const lines = logLines();
      expect(lines).toHaveLength(2);
      expect(lines[0]).toEqual(record);
      expect(record).toMatchObject({
        outcome: 'exported',
        command: 'cli --context-export',
        root,
        user: os.userInfo().username,
        host: os.hostname(),
        gitHead: null,
        targetModel: 'claude-sonnet-4.5',
        format: 'toon',
        destination: path.join(root, 'llm-context.json'),
        fileCount: 2,
        totalTokens: 15,
        redactions: 3,
        removedByPolicy: 4,
        files: ['src/a.js', 'src/b.js'],
        sha256: crypto.createHash('sha256').update(SECRET_TEXT).digest('hex'),
      });
      expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
      expect(fs.readFileSync(path.join(root, '.ctxman', 'audit.log'), 'utf8')).not.toContain(
        'hunter2'
      );
    });

    it('records the commit checked out in a git repository', () => {
      const git = (...args) =>
        spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
          cwd: root,
          encoding: 'utf8',
        });
      git('init', '-q');
      fs.writeFileSync(path.join(root, 'a.js'), 'a\n');
      git('add', 'a.js');
      git('commit', '-qm', 'init', '--no-gpg-sign');
      const head = git('rev-parse', 'HEAD').stdout.trim();
      const policy = writePolicy({ version: 1, audit: { enabled: true } });

      expect(recordExport(policy, { command: 'x', files: ['a.js'] }).gitHead).toBe(head);
    });

    it('hashes multi-part output (digest chunks) as one text', () => {
      const policy = writePolicy({ version: 1, audit: { enabled: true } });

      const record = recordExport(policy, { command: 'x', text: ['ab', Buffer.from('c')] });

      expect(record.sha256).toBe(crypto.createHash('sha256').update('abc').digest('hex'));
    });

    it('writes nothing while audit is off', () => {
      const policy = writePolicy({ version: 1, deny: ['x'] });

      expect(recordExport(policy, { command: 'x', text: 'y' })).toBeNull();
      expect(fs.existsSync(path.join(root, '.ctxman', 'audit.log'))).toBe(false);
    });

    it('creates missing directories for a custom path', () => {
      const policy = writePolicy({ version: 1, audit: { path: 'logs/ai/exports.jsonl' } });

      recordExport(policy, { command: 'x' });

      expect(logLines(path.join(root, 'logs', 'ai', 'exports.jsonl'))).toHaveLength(1);
    });

    it('warns instead of throwing when the log cannot be written', () => {
      const policy = writePolicy({ version: 1, audit: { path: 'blocked/audit.log' } });
      // A file where the directory should be
      fs.writeFileSync(path.join(root, 'blocked'), '');
      const warn = vi.fn();

      expect(() => recordExport(policy, { command: 'x' }, { warn })).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not write'));
    });
  });

  describe('guardExport', () => {
    it('logs a refused export without a hash and re-throws', () => {
      const policy = writePolicy({ version: 1, maxExportTokens: 5, audit: { enabled: true } });

      expect(() =>
        guardExport(policy, { command: 'mcp generate_context', tokens: 6, text: SECRET_TEXT })
      ).toThrow(PolicyViolationError);

      const [event] = logLines();
      expect(event.outcome).toBe('refused');
      expect(event.sha256).toBeNull();
      expect(event.violations).toEqual([
        { rule: 'maxExportTokens', message: expect.stringContaining('over the limit of 5') },
      ]);
    });

    it('logs an allowed export', () => {
      const policy = writePolicy({ version: 1, maxExportTokens: 5, audit: { enabled: true } });

      const record = guardExport(policy, { command: 'x', destination: 'rest', tokens: 5 });

      expect(record.outcome).toBe('exported');
      expect(logLines()).toHaveLength(1);
    });
  });

  describe('reading', () => {
    const event = (id, timestamp, extra = {}) => ({ id, timestamp, command: 'x', ...extra });

    it('skips malformed lines, merges logs and lists shared events once', () => {
      const a = path.join(root, 'a.log');
      const b = path.join(root, 'b.log');
      fs.writeFileSync(
        a,
        [
          JSON.stringify(event('1', '2026-10-02T00:00:00.000Z')),
          'not json',
          '[1,2]',
          JSON.stringify(event('3', '2026-10-01T00:00:00.000Z')),
          '',
        ].join('\n')
      );
      fs.writeFileSync(b, `${JSON.stringify(event('1', '2026-10-02T00:00:00.000Z'))}\n`);

      const { events, skipped, missing } = readAuditLog([a, b, path.join(root, 'none.log')]);

      expect(events.map((e) => e.id)).toEqual(['3', '1']);
      expect(skipped).toBe(2);
      expect(missing).toEqual([path.join(root, 'none.log')]);
    });

    it('filters by time and keeps the most recent events', () => {
      const events = ['01', '02', '03', '04'].map((day) =>
        event(day, `2026-10-${day}T12:00:00.000Z`)
      );

      expect(filterAuditEvents(events, { since: new Date('2026-10-02') }).map((e) => e.id)).toEqual(
        ['02', '03', '04']
      );
      expect(filterAuditEvents(events, { limit: 2 }).map((e) => e.id)).toEqual(['03', '04']);
      expect(filterAuditEvents(events, { limit: 0 })).toHaveLength(4);
    });

    it('parses dates and ages for --since', () => {
      const now = new Date('2026-10-09T12:00:00.000Z');

      expect(parseSince('2026-10-01', now).toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(parseSince('7d', now).toISOString()).toBe('2026-10-02T12:00:00.000Z');
      expect(parseSince('12h', now).toISOString()).toBe('2026-10-09T00:00:00.000Z');
      expect(() => parseSince('last tuesday', now)).toThrow('Invalid --since value');
    });

    it('formats a table with the short hash and the destination inside the project', () => {
      const table = formatAuditTable([
        event('1', '2026-10-02T03:04:05.678Z', {
          outcome: 'exported',
          user: 'alice',
          root: '/repo',
          destination: '/repo/llm-context.json',
          fileCount: 3,
          totalTokens: 1200,
          redactions: 1,
          sha256: 'abcdef0123456789',
        }),
      ]);

      const [header, , row] = table.split('\n');
      expect(header).toMatch(/^TIME \(UTC\)\s+RESULT\s+USER/);
      expect(row).toContain('2026-10-02T03:04:05Z');
      expect(row).toContain('alice');
      expect(row).toContain('llm-context.json');
      expect(row).not.toContain('/repo/llm-context.json');
      expect(row).toContain('abcdef012345');
      expect(row).not.toContain('abcdef0123456789');
    });
  });

  describe('ctxman audit', () => {
    const cli = (...args) =>
      spawnSync(process.execPath, [CLI, ...args], {
        cwd: root,
        encoding: 'utf8',
        env: isolatedEnv(root),
      });

    beforeEach(() => {
      const policy = writePolicy({ version: 1, audit: { enabled: true } });
      const lines = [
        { id: 'a', timestamp: '2026-09-01T10:00:00.000Z', command: 'cli --gitingest' },
        { id: 'b', timestamp: '2026-10-01T10:00:00.000Z', command: 'mcp generate_context' },
        { id: 'c', timestamp: '2026-10-05T10:00:00.000Z', command: 'rest POST /api/v1/context' },
      ].map((e) => ({ outcome: 'exported', user: 'alice', fileCount: 1, ...e }));
      fs.writeFileSync(policy.audit.paths[0], lines.map((l) => JSON.stringify(l)).join('\n'));
    });

    it('prints the log as a table', () => {
      const result = cli('audit');

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('TIME (UTC)');
      expect(result.stdout).toContain('cli --gitingest');
      expect(result.stdout).toContain('rest POST /api/v1/context');
      expect(result.stdout).toContain('3 events from');
    });

    it('filters with --since and --limit, and prints JSON with --json', () => {
      const since = JSON.parse(cli('audit', '--since', '2026-09-15', '--json').stdout);
      expect(since.map((e) => e.id)).toEqual(['b', 'c']);

      const limited = JSON.parse(cli('audit', '--limit', '1', '--json').stdout);
      expect(limited.map((e) => e.id)).toEqual(['c']);

      const table = cli('audit', '--limit', '2').stdout;
      expect(table).toContain('Showing the last 2 of 3 events');
      expect(table).not.toContain('cli --gitingest');
    });

    it('reads another log with --file', () => {
      const other = path.join(root, 'other.log');
      fs.writeFileSync(
        other,
        `${JSON.stringify({ id: 'z', timestamp: '2026-10-08T00:00:00Z' })}\n`
      );

      expect(JSON.parse(cli('audit', '--file', other, '--json').stdout)).toEqual([
        { id: 'z', timestamp: '2026-10-08T00:00:00Z' },
      ]);
    });

    it('rejects a bad --since or --limit', () => {
      for (const args of [
        ['--since', 'someday'],
        ['--limit', '-3'],
        ['--limit', 'many'],
      ]) {
        const result = cli('audit', ...args);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('Invalid');
      }
    });

    it('explains how to turn the log on when there is none', () => {
      fs.rmSync(path.join(root, '.ctxman'), { recursive: true });

      const result = cli('audit');

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No audit log found');
    });

    it('prints its own help', () => {
      const result = cli('audit', '--help');

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage: ctxman audit');
    });
  });

  describe('ctxman policy', () => {
    const cli = (args, env = isolatedEnv(root)) =>
      spawnSync(process.execPath, [CLI, 'policy', ...args], { cwd: root, encoding: 'utf8', env });

    it('reports that there is no policy', () => {
      const result = cli(['check']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No export policy');
    });

    it('writes a starter policy that passes check, and keeps an existing one', () => {
      expect(cli(['init']).status).toBe(0);
      const file = path.join(root, '.ctxman', 'policy.json');
      const starter = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(starter.version).toBe(1);
      expect(starter.$comment).toContain('docs/commands/policy.md');

      const again = cli(['init']);
      expect(again.status).toBe(1);
      expect(again.stderr).toContain('--force');
      expect(cli(['init', '--force']).status).toBe(0);

      const check = cli(['check']);
      expect(check.status).toBe(0);
      expect(check.stdout).toContain('Policy is valid');
      expect(check.stdout).toContain('**/*.pem');
      expect(check.stdout).toContain('yes (--no-redact is refused)');
    });

    it('prints the merged policy as JSON', () => {
      const org = path.join(root, 'org.json');
      fs.writeFileSync(org, JSON.stringify({ version: 1, maxExportTokens: 1000, deny: ['a/'] }));
      writePolicy({ version: 1, maxExportTokens: 5000, deny: ['b/'] });

      const result = cli(['check', '--json'], { ...isolatedEnv(root), CTXMAN_POLICY: org });
      const output = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(output).toMatchObject({
        valid: true,
        maxExportTokens: 1000,
        deny: [
          { scope: 'organisation', patterns: ['a/'] },
          { scope: 'project', patterns: ['b/'] },
        ],
      });
    });

    it('fails with exit code 2 on an invalid policy, naming the file and field', () => {
      writePolicy({ version: 1 });
      fs.writeFileSync(
        path.join(root, '.ctxman', 'policy.json'),
        JSON.stringify({ version: 1, allowedTargetModels: 'claude' })
      );

      const result = cli(['check']);

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(path.join('.ctxman', 'policy.json'));
      expect(result.stderr).toContain('"allowedTargetModels" must be an array');

      const json = cli(['check', '--json']);
      expect(json.status).toBe(2);
      expect(JSON.parse(json.stdout).errors[0].field).toBe('allowedTargetModels');
    });

    it('prints its own help', () => {
      const result = cli(['--help']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage: ctxman policy');
    });
  });
});
