import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import MCPServer from '../lib/api/mcp/server.js';

describe('MCP count_tokens tool', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-count-mcp-'));
    fs.writeFileSync(path.join(root, 'a.js'), 'export const add = (a, b) => a + b;\n'.repeat(20));
    fs.writeFileSync(path.join(root, 'b.js'), 'export const one = 1;\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const callTool = (args, server = new MCPServer()) =>
    server.server._requestHandlers.get('tools/call')(
      { method: 'tools/call', params: { name: 'count_tokens', arguments: args } },
      {}
    );
  const json = (result) => JSON.parse(result.content[0].text);

  it('is listed with path, text, model and top', async () => {
    const { tools } = await new MCPServer().server._requestHandlers.get('tools/list')(
      { method: 'tools/list', params: {} },
      {}
    );
    const tool = tools.find((t) => t.name === 'count_tokens');
    expect(Object.keys(tool.inputSchema.properties)).toEqual(['path', 'text', 'model', 'top']);
  });

  it('counts a project for a model and checks the window', async () => {
    const result = json(await callTool({ path: root, model: 'gpt-5.5', top: 1 }));
    expect(result).toMatchObject({ model: 'gpt-5.5', files: 2, exact: true, fits: true });
    expect(result.encoding).toBe('o200k_base');
    expect(result.largestFiles).toEqual([{ path: 'a.js', tokens: expect.any(Number) }]);
  });

  it('counts a text and resolves old model ids', async () => {
    const result = json(await callTool({ text: 'hello world', model: 'claude-sonnet-4.5' }));
    expect(result).toMatchObject({ model: 'claude-sonnet-4-5', files: 1, exact: false });
    expect(result.contextWindow).toBe(200000);
  });

  it('needs a path or a text, and stays inside --root', async () => {
    expect((await callTool({})).isError).toBe(true);
    const confined = new MCPServer({ root });
    const outside = await callTool({ path: os.tmpdir() }, confined);
    expect(outside.isError).toBe(true);
  });
});
