import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import MCPServer from '../lib/api/mcp/server.js';
import websiteConfig from '../website/.vitepress/config.js';

const ROOT = path.resolve(import.meta.dirname, '..');

describe('Website, ADR & Command Documentation Integrity (Serverless)', () => {
  it('verifies all permanent ADR & Knowledge Graph files exist and are non-empty', () => {
    const adrFiles = [
      'docs/adr/README.md',
      'docs/adr/ADR_CATALOG.md',
      'docs/adr/ADR-001-ctxman-who-and-18-tool-mcp.md',
      'docs/adr/ADR-002-plansmith-analyzer-keysmith-evren-rag.md',
      'docs/adr/ADR-003-plansmith-desktop-43-mcp-and-electron-parity.md',
      'docs/adr/knowledge-graph.md',
    ];

    for (const rel of adrFiles) {
      const full = path.join(ROOT, rel);
      expect(fs.existsSync(full), `Missing ${rel}`).toBe(true);
      const content = fs.readFileSync(full, 'utf8');
      expect(content.trim().length, `Empty ${rel}`).toBeGreaterThan(200);
    }
  });

  it('verifies all CLI command reference docs in docs/commands/ exist', () => {
    const commandDocs = [
      'docs/commands/ci.md',
      'docs/commands/diagnose.md',
      'docs/commands/focus.md',
      'docs/commands/map.md',
      'docs/commands/mcp.md',
      'docs/commands/pack.md',
      'docs/commands/policy.md',
      'docs/commands/pr.md',
      'docs/commands/search.md',
      'docs/commands/task.md',
      'docs/commands/who.md',
      'docs/commands/why.md',
    ];

    for (const rel of commandDocs) {
      const full = path.join(ROOT, rel);
      expect(fs.existsSync(full), `Missing ${rel}`).toBe(true);
      expect(fs.readFileSync(full, 'utf8').trim().length).toBeGreaterThan(200);
    }
  });

  it('verifies VitePress ADR & Knowledge Graph pages and @include targets in EN and TR', () => {
    const pages = [
      'website/adr.md',
      'website/knowledge-graph.md',
      'website/tr/adr.md',
      'website/tr/knowledge-graph.md',
    ];

    const includeRegex = /<!--@include:\s*([^\s>]+)\s*-->/g;
    for (const rel of pages) {
      const pagePath = path.join(ROOT, rel);
      expect(fs.existsSync(pagePath), `Missing ${rel}`).toBe(true);
      const content = fs.readFileSync(pagePath, 'utf8');
      const matches = [...content.matchAll(includeRegex)];
      expect(matches.length, `Expected @include directives in ${rel}`).toBeGreaterThan(0);

      for (const match of matches) {
        const target = path.resolve(path.dirname(pagePath), match[1]);
        expect(fs.existsSync(target), `Broken @include ${match[1]} in ${rel}`).toBe(true);
      }
    }

    const rootNav = JSON.stringify(websiteConfig.locales.root.themeConfig.nav);
    const rootSidebar = JSON.stringify(websiteConfig.locales.root.themeConfig.sidebar);
    expect(rootNav).toContain('"/adr"');
    expect(rootSidebar).toContain('"/adr"');
    expect(rootSidebar).toContain('"/knowledge-graph"');

    const trNav = JSON.stringify(websiteConfig.locales.tr.themeConfig.nav);
    const trSidebar = JSON.stringify(websiteConfig.locales.tr.themeConfig.sidebar);
    expect(trNav).toContain('"/tr/adr"');
    expect(trSidebar).toContain('"/tr/adr"');
    expect(trSidebar).toContain('"/tr/knowledge-graph"');
  });

  it('verifies website changelog, features, and api-reference reflect v3.2.0 in EN and TR', () => {
    for (const rel of ['website/changelog.md', 'website/tr/changelog.md']) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(text).toContain('[3.2.0]');
      expect(text).toContain('SqliteVectorStore');
      expect(text).toContain('ctxman who');
    }

    for (const rel of ['website/api-reference.md', 'website/tr/api-reference.md']) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(text).toContain('find_experts');
      expect(text).toContain('task_context');
      expect(text).toContain('diagnose_failure');
      expect(text).toContain('query_knowledge_graph');
      expect(text).toContain('SqliteVectorStore');
    }
  });

  it('verifies MCPServer exposes all 19 tools and docs/commands/mcp.md documents every tool', async () => {
    const handlers = new Map();
    const mcp = new MCPServer();
    const fakeServer = {
      setRequestHandler: (schema, fn) => {
        handlers.set(schema, fn);
      },
      onerror: null,
    };
    mcp.server = fakeServer;
    mcp.setupHandlers();

    const [listToolsHandler] = [...handlers.values()];
    const { tools } = await listToolsHandler({});
    expect(tools).toHaveLength(19);

    const mcpDoc = fs.readFileSync(path.join(ROOT, 'docs/commands/mcp.md'), 'utf8');
    for (const tool of tools) {
      expect(mcpDoc, `docs/commands/mcp.md missing ${tool.name}`).toContain(`\`${tool.name}\``);
    }

    const explainSchema = tools.find((t) => t.name === 'explain_history').inputSchema.properties;
    expect(explainSchema.analyzer).toBeDefined();
    expect(explainSchema.analyzerDb).toBeDefined();

    // Verify sandbox enforcement on analyzerDb when --root is active
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-mcp-why-root-'));
    try {
      execFileSync('git', ['init'], { cwd: tmpRoot, stdio: 'ignore' });
      const sandboxed = new MCPServer({ root: tmpRoot });
      const sandboxHandlers = [];
      sandboxed.server = {
        setRequestHandler: (_s, fn) => sandboxHandlers.push(fn),
        onerror: null,
      };
      sandboxed.setupHandlers();
      const sandboxCallTool = sandboxHandlers[6];

      const res = await sandboxCallTool({
        params: {
          name: 'explain_history',
          arguments: {
            path: tmpRoot,
            target: 'README.md',
            analyzerDb: '/etc/passwd',
          },
        },
      });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toMatch(/outside the allowed root|analyzerDb/i);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
