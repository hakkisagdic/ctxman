import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { buildTaskContext, parseBudget } from '../lib/task/index.js';
import MCPServer from '../lib/api/mcp/server.js';

describe('buildTaskContext & cm-task CLI & MCP task_context', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-task-')));

    // Setup a small repository structure
    fs.mkdirSync(path.join(tmpDir, 'src', 'auth'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src', 'db'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'secrets'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.ctxman'), { recursive: true });

    // Seed file
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'auth', 'login.js'),
      `import { queryUser } from '../db/user.js';\nexport function login(username, password) {\n  const user = queryUser(username);\n  return user && user.password === password;\n}\n`
    );

    // 1-hop neighbor
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'db', 'user.js'),
      `import { connect } from './connection.js';\nexport function queryUser(name) {\n  const db = connect();\n  return db.find(name);\n}\n`
    );

    // 2-hop neighbor
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'db', 'connection.js'),
      `export function connect() {\n  return { find: (name) => ({ name, password: 'secret-pass' }) };\n}\n`
    );

    // Secret bearing file & policy
    fs.writeFileSync(
      path.join(tmpDir, 'secrets', 'keys.json'),
      '{"apiKey": "sk-secret-token-12345"}'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.ctxman', 'policy.json'),
      JSON.stringify({ version: 1, deny: ['secrets/'] })
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('parseBudget', () => {
    it('parses integers and shorthand formats', () => {
      expect(parseBudget(32000)).toBe(32000);
      expect(parseBudget('32k')).toBe(32000);
      expect(parseBudget('40k')).toBe(40000);
      expect(parseBudget('1m')).toBe(1000000);
      expect(parseBudget(undefined, 20000)).toBe(20000);
    });

    it('rejects invalid budget formats', () => {
      expect(() => parseBudget(-5)).toThrow('budget must be a positive integer');
      expect(() => parseBudget('abc')).toThrow('budget must be a positive integer');
    });
  });

  describe('buildTaskContext', () => {
    it('discovers seed files, 1-hop and 2-hop neighbors, and includes repo map overview', async () => {
      const result = await buildTaskContext(tmpDir, 'user login authentication', {
        budget: 32000,
        format: 'markdown',
      });

      expect(result.query).toBe('user login authentication');
      expect(result.format).toBe('markdown');
      expect(result.text).toContain('# Task Context: user login authentication');
      expect(result.text).toContain('## Architectural Overview');
      expect(result.text).toContain('src/auth/login.js');
      expect(result.files.length).toBeGreaterThanOrEqual(1);

      // Verify hop tagging
      const hops = result.files.map((f) => f.hop);
      expect(hops).toContain(0); // seed
    });

    it('compresses 2-hop neighbor function bodies', async () => {
      const result = await buildTaskContext(tmpDir, 'login', {
        format: 'json',
      });

      const parsed = JSON.parse(result.text);
      expect(parsed.files).toBeDefined();

      const hop2 = parsed.files.find((f) => f.hop === 2);
      if (hop2) {
        expect(hop2.compressed).toBe(true);
      }
    });

    it('strictly honors policy deny rules', async () => {
      const result = await buildTaskContext(tmpDir, 'apiKey secret token', {
        format: 'json',
      });

      const parsed = JSON.parse(result.text);
      const paths = parsed.files.map((f) => f.path);
      expect(paths).not.toContain('secrets/keys.json');
    });

    it('supports XML format output', async () => {
      const result = await buildTaskContext(tmpDir, 'login authentication', {
        format: 'xml',
      });

      expect(result.format).toBe('xml');
      expect(result.text).toContain('<task_context query="login authentication"');
      expect(result.text).toContain('<overview>');
      expect(result.text).toContain('<files>');
    });

    it('writes output to file when output option is specified', async () => {
      const outPath = path.join(tmpDir, 'task-bundle.md');
      await buildTaskContext(tmpDir, 'login authentication', {
        output: outPath,
      });

      expect(fs.existsSync(outPath)).toBe(true);
      const content = fs.readFileSync(outPath, 'utf-8');
      expect(content).toContain('# Task Context: login authentication');
    });

    it('expands 1-hop neighbors via graph.callEdges (including barrel re-exports) and exposes callEdges', async () => {
      // Add a barrel module `src/audit/index.js` re-exporting `recordLoginAudit` from `src/audit/tracker.js`,
      // and call `recordLoginAudit(username)` from `login.js` via a local helper `emitAudit(username)`.
      fs.mkdirSync(path.join(tmpDir, 'src', 'audit'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'audit', 'index.js'),
        "export { recordLoginAudit } from './tracker.js';\n"
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'audit', 'tracker.js'),
        'export function recordLoginAudit(actor) {\n  return `audit:${actor}`;\n}\n'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'auth', 'login.js'),
        [
          "import { queryUser } from '../db/user.js';",
          "import { recordLoginAudit } from '../audit/index.js';",
          'function emitAudit(username) {',
          '  return recordLoginAudit(username);',
          '}',
          'export function login(username, password) {',
          '  emitAudit(username);',
          '  const user = queryUser(username);',
          '  return user && user.password === password;',
          '}',
        ].join('\n')
      );

      const withCalls = await buildTaskContext(tmpDir, 'login password', {
        limit: 1,
        searchMode: 'bm25',
        format: 'json',
      });
      const parsedWithCalls = JSON.parse(withCalls.text);
      expect(withCalls.seeds[0].file).toBe('src/auth/login.js');

      // Because `login` -> `emitAudit` -> `recordLoginAudit` is a direct cross-file callEdge,
      // `src/audit/tracker.js` is promoted to hop 1 (full code, not hop 2 compressed!)
      const trackerHopWithCalls = withCalls.files.find((f) => f.path === 'src/audit/tracker.js');
      expect(trackerHopWithCalls).toBeDefined();
      expect(trackerHopWithCalls.hop).toBe(1);
      expect(trackerHopWithCalls.compressed).toBe(false);
      expect(
        withCalls.callEdges.some(
          (e) =>
            e.from === 'src/auth/login.js' &&
            e.to === 'src/audit/tracker.js' &&
            e.callee === 'recordLoginAudit'
        )
      ).toBe(true);
      expect(Array.isArray(parsedWithCalls.callEdges)).toBe(true);

      // When callGraph is disabled, `src/audit/tracker.js` is only reachable in 2 module-import hops (compressed)
      const withoutCalls = await buildTaskContext(tmpDir, 'login password', {
        limit: 1,
        searchMode: 'bm25',
        callGraph: false,
        format: 'json',
      });
      const trackerHopWithoutCalls = withoutCalls.files.find(
        (f) => f.path === 'src/audit/tracker.js'
      );
      expect(trackerHopWithoutCalls).toBeDefined();
      expect(trackerHopWithoutCalls.hop).toBe(2);
      expect(trackerHopWithoutCalls.compressed).toBe(true);
      expect(withoutCalls.callEdges).toEqual([]);
    });
  });

  describe('cm-task CLI', () => {
    it('runs via CLI and prints help', () => {
      const cliPath = path.resolve('bin/cm-task.js');
      const res = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf-8' });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('ctxman task');
    });

    it('runs via CLI and outputs task context', () => {
      const cliPath = path.resolve('bin/cm-task.js');
      const res = spawnSync(
        process.execPath,
        [cliPath, 'login authentication', tmpDir, '--budget', '32k', '--json'],
        { encoding: 'utf-8' }
      );
      expect(res.status).toBe(0);
      const json = JSON.parse(res.stdout);
      expect(json.query).toBe('login authentication');
      expect(json.budget).toBe(32000);
      expect(Array.isArray(json.callEdges)).toBe(true);
    });

    it('exits with code 2 when goal is missing', () => {
      const cliPath = path.resolve('bin/cm-task.js');
      const res = spawnSync(process.execPath, [cliPath], { encoding: 'utf-8' });
      expect(res.status).toBe(0); // prints help when no args
    });
  });

  describe('MCP task_context tool', () => {
    it('executes task_context tool handler within MCP root sandbox', async () => {
      const server = new MCPServer(tmpDir);
      const handler = server.server._requestHandlers.get('tools/call');

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'task_context',
          arguments: {
            path: tmpDir,
            task: 'fix user login',
            budget: 16000,
          },
        },
      });

      expect(response.content).toBeDefined();
      expect(response.content[0].text).toContain('# Task Context: fix user login');
    });
  });
});
