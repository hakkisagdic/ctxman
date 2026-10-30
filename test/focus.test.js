import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { focusContext, describeFocus, FocusError, PolicyViolationError } from '../index.js';
import MCPServer from '../lib/api/mcp/server.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

/**
 * Sample project import graph:
 *   app.js -> service.js -> db.js -> driver.js
 *   service.js -> logger.js
 *   unrelated.js -> logger.js   (sibling consumer of shared hub logger.js!)
 *   service.test.js -> service.js
 */
const FIXTURE = {
  'src/app.js':
    "import { runService } from './service.js';\nexport const start = () => runService();\n",
  'src/service.js':
    "import { queryDb } from './db.js';\nimport { log } from './logger.js';\nexport function runService() {\n  log('run');\n  return queryDb();\n}\n",
  'src/db.js':
    "import { openDriver } from './driver.js';\nexport const queryDb = () => openDriver();\n",
  'src/driver.js': "export function openDriver() {\n  return 'ok';\n}\n",
  'src/logger.js': 'export function log(msg) {\n  return msg;\n}\n',
  'src/unrelated.js': "import { log } from './logger.js';\nexport const other = () => log('x');\n",
  'test/service.test.js':
    "import { runService } from '../src/service.js';\nexport const t = () => runService();\n",
};

describe('focusContext & ctxman focus (P12)', () => {
  let root;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-focus-')));
    for (const [rel, content] of Object.entries(FIXTURE)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf-8');
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('collects target, direct imports, and direct importers at depth 1 (target first)', async () => {
    const res = await focusContext(root, 'src/service.js');

    expect(res.focus.target).toBe('src/service.js');
    expect(res.focus.depth).toBe(1);
    expect(res.files[0].path).toBe('src/service.js');

    const packedPaths = res.files.map((f) => f.path);
    expect(packedPaths).toContain('src/db.js'); // outgoing depth 1
    expect(packedPaths).toContain('src/logger.js'); // outgoing depth 1
    expect(packedPaths).toContain('src/app.js'); // incoming depth 1
    expect(packedPaths).toContain('test/service.test.js'); // incoming depth 1
    expect(packedPaths).not.toContain('src/driver.js'); // depth 2
    expect(packedPaths).not.toContain('src/unrelated.js');
    expect(describeFocus(res)).toContain('Focused target src/service.js');
  });

  it('uses directional traversal at depth 2 so shared utility hubs do not pull in unrelated callers', async () => {
    const res = await focusContext(root, 'src/service.js', {
      depth: 2,
      includeTests: false,
    });

    const packedPaths = res.files.map((f) => f.path);
    expect(packedPaths).toContain('src/driver.js'); // depth 2 outgoing via db.js
    expect(packedPaths).not.toContain('src/unrelated.js'); // sibling caller of logger.js excluded!
    expect(packedPaths).not.toContain('test/service.test.js'); // excluded via includeTests: false
  });

  it('supports imports-only, importers-only, and depth 0', async () => {
    const onlyImports = await focusContext(root, 'src/service.js', {
      direction: 'imports',
      depth: 1,
    });
    expect(onlyImports.files.map((f) => f.path)).toEqual([
      'src/service.js',
      ...onlyImports.focus.neighbors.map((n) => n.path),
    ]);
    expect(onlyImports.files.map((f) => f.path)).not.toContain('src/app.js');

    const onlyImporters = await focusContext(root, 'src/service.js', {
      direction: 'importers',
      depth: 1,
      includeTests: false,
    });
    expect(onlyImporters.files.map((f) => f.path)).toEqual(['src/service.js', 'src/app.js']);

    const zero = await focusContext(root, 'src/service.js', { depth: 0 });
    expect(zero.files.map((f) => f.path)).toEqual(['src/service.js']);
  });

  it('keeps target prioritized first when trimming to a tight token budget', async () => {
    const targetOnly = await focusContext(root, 'src/service.js', { depth: 0, style: 'plain' });
    // Room for target + omitted summary + ~2 direct neighbors, leaving deeper hops omitted
    const budget = targetOnly.totalTokens + 95;
    const res = await focusContext(root, 'src/service.js', {
      depth: 2,
      style: 'plain',
      budget,
    });

    expect(res.files[0].path).toBe('src/service.js');
    expect(res.omitted.length).toBeGreaterThan(0);
    expect(res.omitted.map((o) => o.path)).toContain('src/driver.js');
    expect(res.totalTokens).toBeLessThanOrEqual(budget);
  });

  it('enforces export policy (refuses denied target file and omits denied neighbors)', async () => {
    fs.mkdirSync(path.join(root, '.ctxman'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.ctxman', 'policy.json'),
      JSON.stringify({ version: 1, deny: ['src/db.js'] }),
      'utf-8'
    );

    // Focusing a denied target is refused by policy
    await expect(focusContext(root, 'src/db.js')).rejects.toThrow(PolicyViolationError);

    // Focusing service.js drops denied neighbor src/db.js cleanly
    const res = await focusContext(root, 'src/service.js');
    expect(res.files.map((f) => f.path)).not.toContain('src/db.js');
  });

  it('rejects paths outside the project root', async () => {
    await expect(focusContext(root, '../outside.js')).rejects.toThrow(FocusError);
  });

  it('works via CLI subcommand `ctxman focus` and MCP `focus_context` tool', async () => {
    const cli = spawnSync(
      process.execPath,
      [CLI, 'focus', 'src/service.js', '--no-tests', '--style', 'markdown'],
      { cwd: root, encoding: 'utf-8' }
    );
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain('src/service.js');
    expect(cli.stdout).toContain('runService');
    expect(cli.stderr).toContain('ctxman focus: src/service.js');

    const mcp = new MCPServer({ root });
    const handler = mcp.server._requestHandlers.get(CallToolRequestSchema.shape.method.value);
    const toolRes = await handler({
      method: 'tools/call',
      params: {
        name: 'focus_context',
        arguments: {
          path: root,
          file: 'src/service.js',
          depth: 1,
          includeTests: false,
          style: 'markdown',
        },
      },
    });
    expect(toolRes.isError).toBeUndefined();
    expect(toolRes.content[0].text).toContain('src/service.js');
    expect(toolRes.content[1].text).toContain('Focused target src/service.js');
  });
});
