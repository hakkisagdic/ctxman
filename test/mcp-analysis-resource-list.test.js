import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import MCPServer from '../lib/api/mcp/server.js';
import { ResourceProvider } from '../lib/api/mcp/resources.js';

describe('MCP analysis resources are discoverable', () => {
  let projectDir;
  let client;

  beforeEach(async () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-mcp-analysis-'));
    fs.writeFileSync(path.join(projectDir, 'app.js'), 'function main() {\n  return 1;\n}\n');

    const server = new MCPServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.start(serverTransport);
    client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('lists the analysis cached by analyze_codebase and serves it by that uri', async () => {
    const result = await client.callTool({
      name: 'analyze_codebase',
      arguments: { path: projectDir },
    });
    const analysis = JSON.parse(result.content[0].text);

    const { resources } = await client.listResources();
    const listed = resources.filter((r) => r.uri.startsWith('analysis://recent/'));
    expect(listed).toHaveLength(1);
    expect(listed[0].mimeType).toBe('application/json');

    const read = await client.readResource({ uri: listed[0].uri });
    expect(JSON.parse(read.contents[0].text).stats).toEqual(analysis.stats);
  });
});

describe('ResourceProvider.listResources with cached analyses', () => {
  it('lists cached analyses on the first page only, also without a project', async () => {
    const provider = new ResourceProvider();
    provider.cacheAnalysis('42', { stats: {} });
    provider.cacheContext('bug-fix', '{}');

    const first = await provider.listResources();
    expect(first.resources.map((r) => r.uri)).toEqual(['analysis://recent/42']);

    const later = await provider.listResources('100');
    expect(later.resources).toEqual([]);
  });
});
