import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import MCPServer from '../lib/api/mcp/server.js';

describe('MCP count_tokens and 19-tool multi-repo workspace parity', () => {
  let root;
  let siblingRoot;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-count-mcp-'));
    fs.writeFileSync(path.join(root, 'a.js'), 'export const add = (a, b) => a + b;\n'.repeat(20));
    fs.writeFileSync(path.join(root, 'b.js'), 'export const one = 1;\n');

    siblingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-count-mcp-sibling-'));
    fs.writeFileSync(
      path.join(siblingRoot, 'shared.js'),
      'export function sharedHelper(x) {\n  return x * 2;\n}\n'
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(siblingRoot, { recursive: true, force: true });
  });

  const callToolByName = (name, args, server = new MCPServer()) =>
    server.server._requestHandlers.get('tools/call')({
      method: 'tools/call',
      params: { name, arguments: args },
    });

  const callTool = (args, server = new MCPServer()) => callToolByName('count_tokens', args, server);
  const json = (result) => JSON.parse(result.content[0].text);

  it('lists count_tokens with path, text, model, top, and repos, and exposes repos on all 19 MCP tools', async () => {
    const { tools } = await new MCPServer().server._requestHandlers.get('tools/list')(
      { method: 'tools/list', params: {} },
      {}
    );
    expect(tools).toHaveLength(19);
    const tool = tools.find((t) => t.name === 'count_tokens');
    expect(Object.keys(tool.inputSchema.properties)).toEqual([
      'path',
      'text',
      'model',
      'top',
      'repos',
    ]);
    for (const t of tools) {
      expect(t.inputSchema.properties).toHaveProperty('repos');
    }
  });

  it('counts a project for a model and checks the window', async () => {
    const result = json(await callTool({ path: root, model: 'gpt-5.5', top: 1 }));
    expect(result).toMatchObject({ model: 'gpt-5.5', files: 2, exact: true, fits: true });
    expect(result.encoding).toBe('o200k_base');
    expect(result.largestFiles).toEqual([{ path: 'a.js', tokens: expect.any(Number) }]);
  });

  it('counts across a multi-repository workspace when repos is passed', async () => {
    const result = json(
      await callTool({ path: root, repos: [siblingRoot], model: 'gpt-5.5', top: 5 })
    );
    expect(result).toMatchObject({ model: 'gpt-5.5', files: 3, exact: true, fits: true });
    expect(result.repos).toHaveLength(2);
    const siblingAlias = path.basename(siblingRoot);
    expect(result.largestFiles.some((f) => f.path === `${siblingAlias}/shared.js`)).toBe(true);
  });

  it('counts a text and resolves old model ids', async () => {
    const result = json(await callTool({ text: 'hello world', model: 'claude-sonnet-4.5' }));
    expect(result).toMatchObject({ model: 'claude-sonnet-4-5', files: 1, exact: false });
    expect(result.contextWindow).toBe(200000);
  });

  it('needs a path or a text, and stays inside --root (including repos)', async () => {
    expect((await callTool({})).isError).toBe(true);
    const confined = new MCPServer({ root });
    const outside = await callTool({ path: os.tmpdir() }, confined);
    expect(outside.isError).toBe(true);
    const outsideRepo = await callTool({ path: root, repos: [siblingRoot] }, confined);
    expect(outsideRepo.isError).toBe(true);
  });

  it('supports repos in analyze_codebase, generate_context, list_methods, and regex/substring search_code', async () => {
    const server = new MCPServer();
    const siblingAlias = path.basename(siblingRoot);

    const analysis = json(
      await callToolByName('analyze_codebase', { path: root, repos: [siblingRoot] }, server)
    );
    expect(analysis.stats.totalFiles).toBe(3);
    expect(analysis.repos).toHaveLength(2);
    expect(analysis.files.some((f) => f.relativePath === `${siblingAlias}/shared.js`)).toBe(true);

    const context = json(
      await callToolByName(
        'generate_context',
        { path: root, repos: [siblingRoot], template: 'feature' },
        server
      )
    );
    expect(context.repos).toHaveLength(2);
    expect(context.metadata.totalFiles).toBe(3);

    const methods = json(
      await callToolByName('list_methods', { path: root, repos: [siblingRoot] }, server)
    );
    expect(methods.some((m) => m.file === `${siblingAlias}/shared.js`)).toBe(true);

    const hits = json(
      await callToolByName(
        'search_code',
        { path: root, repos: [siblingRoot], query: 'sharedHelper', type: 'substring' },
        server
      )
    );
    expect(hits).toEqual([
      expect.objectContaining({
        file: `${siblingAlias}/shared.js`,
        line: 1,
      }),
    ]);
  });
});
