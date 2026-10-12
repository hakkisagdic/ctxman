import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import MCPServer from '../lib/api/mcp/server.js';

// Capture the request handlers instead of starting a transport
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class {
    constructor() {
      this.setRequestHandler = vi.fn();
      this.connect = vi.fn();
      this.onerror = null;
    }
  },
}));

describe('MCP tools under an export policy', () => {
  let root;
  let callTool;
  let savedEnv;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-policy-mcp-'));
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, 'secrets'));
    fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export const app = 1;\n');
    fs.writeFileSync(path.join(root, 'secrets', 'token.txt'), 'hunter2\n');
    savedEnv = process.env.CTXMAN_POLICY;
    delete process.env.CTXMAN_POLICY;

    const server = new MCPServer();
    // The CallTool handler is registered last
    callTool = (name, args) =>
      server.server.setRequestHandler.mock.calls.at(-1)[1]({ params: { name, arguments: args } });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (savedEnv === undefined) delete process.env.CTXMAN_POLICY;
    else process.env.CTXMAN_POLICY = savedEnv;
  });

  const writePolicy = (doc) => {
    fs.mkdirSync(path.join(root, '.ctxman'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctxman', 'policy.json'), JSON.stringify(doc));
  };
  const auditLog = () =>
    fs
      .readFileSync(path.join(root, '.ctxman', 'audit.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

  it('generate_context leaves denied files out and logs the export', async () => {
    writePolicy({ version: 1, deny: ['secrets/'], audit: { enabled: true } });

    const result = await callTool('generate_context', { path: root });

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('app.js');
    expect(text).not.toContain('token.txt');
    const [event] = auditLog();
    expect(event).toMatchObject({
      command: 'mcp generate_context',
      destination: 'mcp',
      outcome: 'exported',
      sha256: crypto.createHash('sha256').update(text).digest('hex'),
    });
  });

  it('generate_context returns an error result when the policy refuses the export', async () => {
    writePolicy({ version: 1, maxExportTokens: 1, audit: { enabled: true } });

    const result = await callTool('generate_context', { path: root });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Export refused by the ctxman policy');
    expect(result.content[0].text).toContain('over the limit of 1');
    expect(auditLog()[0]).toMatchObject({ outcome: 'refused', destination: 'mcp' });
  });

  it('other tools see the project without denied files', async () => {
    writePolicy({ version: 1, deny: ['secrets/'] });

    const result = await callTool('search_code', { path: root, query: 'hunter2' });

    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });

  it('refuses to read a denied file as a resource', async () => {
    writePolicy({ version: 1, deny: ['secrets/'] });
    const resources = new MCPServer().resourceProvider;
    resources.projectPath = root;

    await expect(resources.readResource('file://codebase/secrets/token.txt')).rejects.toThrow(
      'the export policy denies this file'
    );
    const allowed = await resources.readResource('file://codebase/src/app.js');
    expect(allowed.contents[0].text).toContain('app');
  });

  it('generate_context is unchanged without a policy', async () => {
    const result = await callTool('generate_context', { path: root });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('token.txt');
    expect(fs.existsSync(path.join(root, '.ctxman'))).toBe(false);
  });
});
