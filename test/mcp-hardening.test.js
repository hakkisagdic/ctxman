import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ResourceProvider } from '../lib/api/mcp/resources.js';
import MCPServer from '../lib/api/mcp/server.js';
import { Analyzer } from '../lib/core/Analyzer.js';
import { Scanner } from '../lib/core/Scanner.js';

// Real files on disk, real MCP server: the tool handler is the one registered for tools/call
describe('MCP server on a real project', () => {
  let root;

  const write = (relativePath, content) => {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-mcp-'));
    write('src/a.js', 'export function alpha() {\n  return 1;\n}\n');
    write('src/b.js', 'export function beta() {\n  return 2;\n}\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(`${root}-other`, { recursive: true, force: true });
  });

  const callTool = (name, args) => {
    const server = new MCPServer();
    const handler = server.server._requestHandlers.get('tools/call');
    return handler({ method: 'tools/call', params: { name, arguments: args } }, {});
  };

  describe('file resources', () => {
    const read = (provider, relativePath) =>
      provider.readResource(`file://codebase/${relativePath}`);

    it('reads a project file', async () => {
      const result = await read(new ResourceProvider(root), 'src/a.js');

      expect(result.contents[0].text).toContain('alpha');
    });

    it('refuses a sibling directory that shares the project prefix', async () => {
      fs.mkdirSync(`${root}-other`);
      fs.writeFileSync(`${root}-other/secret.js`, 'export const leaked = true;\n');

      await expect(
        read(new ResourceProvider(root), `../${path.basename(root)}-other/secret.js`)
      ).rejects.toThrow('outside project');
    });

    it('refuses files the scanner never exposes, such as .env', async () => {
      write('.env', 'TOKEN=abc\n');

      await expect(read(new ResourceProvider(root), '.env')).rejects.toThrow(
        'not a text source file'
      );
    });

    it('redacts secrets like the exporters do', async () => {
      write('src/config.js', "export const key = 'AKIAABCDEFGHIJKLMNOP';\n");

      const result = await read(new ResourceProvider(root), 'src/config.js');

      expect(result.contents[0].text).not.toContain('AKIAABCDEFGHIJKLMNOP');
      expect(result.contents[0].text).toContain('[REDACTED:aws-access-key-id]');
    });

    it('lists the files of the current project after a project switch', async () => {
      const other = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-mcp-b-'));
      fs.writeFileSync(path.join(other, 'only-here.js'), 'export const x = 1;\n');
      try {
        const provider = new ResourceProvider(root);
        await provider.listResources();

        provider.projectPath = other;
        const { resources } = await provider.listResources();

        expect(resources.map((r) => r.uri)).toEqual(['file://codebase/only-here.js']);
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }
    });
  });

  describe('tools', () => {
    it('list_methods limits the result to the requested file', async () => {
      const result = await callTool('list_methods', { path: root, file: 'src/b.js' });

      const files = JSON.parse(result.content[0].text);
      expect(files.map((entry) => entry.file)).toEqual([path.join('src', 'b.js')]);
      expect(files[0].methods.map((method) => method.name)).toEqual(['beta']);
    });

    it('list_methods accepts the path of a single file', async () => {
      const result = await callTool('list_methods', { path: path.join(root, 'src', 'a.js') });

      const files = JSON.parse(result.content[0].text);
      expect(files.map((entry) => entry.methods.map((method) => method.name))).toEqual([['alpha']]);
    });

    it('list_methods reports a file outside the project as an error', async () => {
      const result = await callTool('list_methods', { path: root, file: 'src/missing.js' });

      expect(result.isError).toBe(true);
    });

    it('search_code reports an invalid regular expression instead of matching nothing', async () => {
      const result = await callTool('search_code', { path: root, query: 'alpha(' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid regular expression');
    });

    it('search_code defaults to a regular expression search', async () => {
      const result = await callTool('search_code', { path: root, query: 'al.ha' });

      const matches = JSON.parse(result.content[0].text);
      expect(matches.map((m) => m.file)).toEqual([path.join('src', 'a.js')]);
    });
  });

  it('Analyzer reports the total line count', async () => {
    const { stats } = await new Analyzer().analyze(new Scanner(root).scan());

    expect(stats.totalLines).toBe(8); // 3 lines + trailing newline in each file
  });
});
