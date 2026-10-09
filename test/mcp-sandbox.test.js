import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import MCPServer from '../lib/api/mcp/server.js';
import { isInsideRoot, resolveRootDir, resolveSandboxPath } from '../lib/api/mcp/sandbox.js';
import { clearSearchCache } from '../lib/search/bm25.js';

describe('MCP sandbox paths', () => {
  let base;
  let root;

  beforeEach(() => {
    clearSearchCache();
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-sandbox-')));
    root = path.join(base, 'project');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', 'app.js'),
      'export function startServer(port) {\n  return port;\n}\n'
    );
    fs.mkdirSync(path.join(base, 'project-other'));
    fs.writeFileSync(path.join(base, 'project-other', 'secret.js'), 'export const leak = 1;\n');
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  describe('resolveSandboxPath', () => {
    it('only checks that the path exists when there is no root', () => {
      expect(resolveSandboxPath(root)).toBe(root);
      expect(() => resolveSandboxPath(path.join(root, 'missing'))).toThrow('does not exist');
      expect(() => resolveSandboxPath(path.join(root, 'src', 'app.js'))).toThrow('not a directory');
      expect(resolveSandboxPath(path.join(root, 'src', 'app.js'), { expect: 'any' })).toBe(
        path.join(root, 'src', 'app.js')
      );
      expect(() => resolveSandboxPath(undefined)).toThrow('Missing required argument: path');
      expect(() => resolveSandboxPath(42)).toThrow('must be a string');
    });

    it('confines paths to the root, relative paths included', () => {
      const options = { root };

      expect(resolveSandboxPath(undefined, options)).toBe(root);
      expect(resolveSandboxPath('src', options)).toBe(path.join(root, 'src'));
      expect(resolveSandboxPath(path.join(root, 'src'), options)).toBe(path.join(root, 'src'));
      expect(() => resolveSandboxPath('..', options)).toThrow('outside the MCP root');
      expect(() => resolveSandboxPath(path.join(base, 'project-other'), options)).toThrow(
        'outside the MCP root'
      );
      expect(() => resolveSandboxPath(os.tmpdir(), options)).toThrow('outside the MCP root');
    });

    it('follows symlinks before deciding', () => {
      try {
        fs.symlinkSync(path.join(base, 'project-other'), path.join(root, 'escape'), 'dir');
      } catch {
        return; // no symlink permission (Windows without developer mode)
      }

      expect(() => resolveSandboxPath('escape', { root })).toThrow('outside the MCP root');
    });

    it('treats a sibling sharing the prefix as outside', () => {
      expect(isInsideRoot(root, `${root}-other`)).toBe(false);
      expect(isInsideRoot(root, path.join(root, '..notes'))).toBe(true);
      expect(isInsideRoot(root, root)).toBe(true);
    });

    it('requires the root itself to be an existing directory', () => {
      expect(resolveRootDir(root)).toBe(root);
      expect(() => resolveRootDir(path.join(base, 'nope'))).toThrow('not an existing directory');
    });
  });

  describe('MCPServer tools', () => {
    const handler = (server, method) => server.server._requestHandlers.get(method);
    const callTool = (server, name, args) =>
      handler(server, 'tools/call')(
        { method: 'tools/call', params: { name, arguments: args } },
        {}
      );
    const text = (result) => result.content[0].text;

    it('reports a path that does not exist instead of analysing nothing', async () => {
      const result = await callTool(new MCPServer(), 'analyze_codebase', {
        path: path.join(base, 'missing'),
      });

      expect(result.isError).toBe(true);
      expect(text(result)).toContain('does not exist');
    });

    it('keeps tools to the root, and resolves relative paths against it', async () => {
      const server = new MCPServer({ root });

      const outside = await callTool(server, 'search_code', {
        path: path.join(base, 'project-other'),
        query: 'leak',
      });
      expect(outside.isError).toBe(true);
      expect(text(outside)).toContain('outside the MCP root');

      const inside = await callTool(server, 'search_code', { path: 'src', query: 'startServer' });
      expect(inside.isError).toBeFalsy();
      expect(JSON.parse(text(inside)).map((m) => m.file)).toEqual(['app.js']);

      // Without a path the tools work on the root
      const analysis = JSON.parse(text(await callTool(server, 'analyze_codebase', {})));
      expect(analysis.stats.totalFiles).toBe(1);
    });

    it('lets list_methods take a file inside the root only', async () => {
      const server = new MCPServer({ root });

      const file = await callTool(server, 'list_methods', { path: 'src/app.js' });
      expect(JSON.parse(text(file))[0].methods.map((m) => m.name)).toEqual(['startServer']);

      const escape = await callTool(server, 'list_methods', {
        path: path.join(base, 'project-other', 'secret.js'),
      });
      expect(escape.isError).toBe(true);
    });

    it('confines the paths prompts read', async () => {
      const server = new MCPServer({ root });
      const getPrompt = (name, args) =>
        handler(server, 'prompts/get')(
          { method: 'prompts/get', params: { name, arguments: args } },
          {}
        );

      await expect(
        getPrompt('refactor_code', { filePath: path.join(base, 'project-other', 'secret.js') })
      ).rejects.toThrow('outside the MCP root');

      const prompt = await getPrompt('refactor_code', { filePath: 'src/app.js' });
      expect(prompt.messages[0].content.text).toContain('startServer');
    });

    it('serves ranked search and get_symbol', async () => {
      const server = new MCPServer();

      const ranked = await callTool(server, 'search_code', {
        path: root,
        query: 'start server',
        type: 'ranked',
      });
      const symbol = await callTool(server, 'get_symbol', { path: root, name: 'startServer' });

      expect(JSON.parse(text(ranked)).results[0]).toMatchObject({
        file: path.join('src', 'app.js'),
        name: 'startServer',
        startLine: 1,
        endLine: 3,
      });
      expect(JSON.parse(text(symbol)).symbols[0].source).toBe(
        'export function startServer(port) {\n  return port;\n}'
      );
    });
  });
});
