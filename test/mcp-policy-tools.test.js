import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import MCPServer from '../lib/api/mcp/server.js';

const callTool = (name, args, server = new MCPServer()) =>
  server.server._requestHandlers.get('tools/call')(
    { method: 'tools/call', params: { name, arguments: args } },
    {}
  );
const json = (result) => JSON.parse(result.content[0].text);

describe('MCP policy, audit and ask tools', () => {
  let root;
  const writePolicy = (policy) => {
    fs.mkdirSync(path.join(root, '.ctxman'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctxman', 'policy.json'), JSON.stringify(policy));
  };
  const event = (id, timestamp) => JSON.stringify({ id, timestamp, command: 'pack', files: [] });

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-mcp-policy-')));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists the three tools with their arguments', async () => {
    const { tools } = await new MCPServer().server._requestHandlers.get('tools/list')(
      { method: 'tools/list', params: {} },
      {}
    );
    const args = (name) => Object.keys(tools.find((t) => t.name === name).inputSchema.properties);

    expect(args('check_policy')).toEqual(['path']);
    expect(args('audit_log')).toEqual(['path', 'since', 'limit']);
    expect(args('ask_codebase')).toEqual(['path', 'query', 'limit']);
  });

  describe('check_policy', () => {
    it('reports that no policy applies', async () => {
      const result = json(await callTool('check_policy', { path: root }, new MCPServer()));

      expect(result).toMatchObject({ valid: true, active: false, deny: [] });
    });

    it('returns the effective policy', async () => {
      writePolicy({ version: 1, deny: ['secrets/'], requireRedaction: true });

      const result = json(await callTool('check_policy', { path: root }));

      expect(result.valid).toBe(true);
      expect(result.active).toBe(true);
      expect(result.requireRedaction).toBe(true);
      expect(result.deny[0].patterns).toEqual(['secrets/']);
    });

    it('lists the errors of an invalid policy without failing the call', async () => {
      writePolicy({ version: 1, deny: 'secrets/' });

      const result = await callTool('check_policy', { path: root });

      expect(result.isError).toBeUndefined();
      expect(json(result)).toMatchObject({ valid: false, errors: expect.any(Array) });
      expect(json(result).errors.length).toBeGreaterThan(0);
    });
  });

  describe('audit_log', () => {
    beforeEach(() => {
      writePolicy({ version: 1, deny: [], audit: { enabled: true, path: '.ctxman/audit.log' } });
      fs.writeFileSync(
        path.join(root, '.ctxman', 'audit.log'),
        [
          event('a', '2026-10-01T10:00:00.000Z'),
          'not json',
          event('b', '2026-10-05T10:00:00.000Z'),
          event('c', '2026-10-09T10:00:00.000Z'),
        ].join('\n') + '\n'
      );
    });

    it("reads the policy's log, newest last", async () => {
      const result = json(await callTool('audit_log', { path: root }));

      expect(result.files).toEqual([path.join(root, '.ctxman', 'audit.log')]);
      expect(result.total).toBe(3);
      expect(result.events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
      expect(result.skippedLines).toBe(1);
    });

    it('filters by date and keeps the last events', async () => {
      const since = json(await callTool('audit_log', { path: root, since: '2026-10-04' }));
      const last = json(await callTool('audit_log', { path: root, limit: 1 }));

      expect(since.events.map((e) => e.id)).toEqual(['b', 'c']);
      expect(last.events.map((e) => e.id)).toEqual(['c']);
      expect(last.total).toBe(3);
    });

    it('rejects an invalid date', async () => {
      const result = await callTool('audit_log', { path: root, since: 'yesterday-ish' });

      expect(result.isError).toBe(true);
    });
  });

  describe('ask_codebase', () => {
    it('needs a question', async () => {
      const result = await callTool('ask_codebase', { path: root, query: '  ' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('A question is required');
    });

    it('stays inside --root', async () => {
      const outside = await callTool(
        'ask_codebase',
        { path: os.tmpdir(), query: 'where' },
        new MCPServer({ root })
      );

      expect(outside.isError).toBe(true);
    });
  });
});
