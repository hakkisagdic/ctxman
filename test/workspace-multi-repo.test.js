import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  resolveWorkspaceRepos,
  mapWorkspace,
  searchWorkspace,
  packWorkspace,
  PolicyConfigError,
  PolicyViolationError,
} from '../index.js';
import { clearSearchCache } from '../lib/search/bm25.js';
import MCPServer from '../lib/api/mcp/server.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

describe('Multi-Repository Workspace (N3: map, search, pack)', () => {
  let workspaceDir;
  let apiRepo;
  let webRepo;
  let outsideRepo;

  const write = (base, rel, content) => {
    const full = path.join(base, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  };

  beforeEach(() => {
    clearSearchCache();
    workspaceDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-ws-')));
    outsideRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-outside-')));
    apiRepo = path.join(workspaceDir, 'billing-api');
    webRepo = path.join(workspaceDir, 'checkout-web');
    fs.mkdirSync(apiRepo, { recursive: true });
    fs.mkdirSync(webRepo, { recursive: true });

    // Repo 1: billing-api
    write(
      apiRepo,
      'src/invoice.js',
      "import { formatMoney } from './currency.js';\nexport function createInvoice(cents) {\n  return formatMoney(cents);\n}\n"
    );
    write(
      apiRepo,
      'src/currency.js',
      'export function formatMoney(cents) {\n  return `$${(cents / 100).toFixed(2)}`;\n}\n'
    );
    write(apiRepo, 'secrets/keys.js', `export const secret = '${AWS_KEY}';\n`);
    write(
      apiRepo,
      '.ctxman/policy.json',
      JSON.stringify({ version: 1, deny: ['secrets/**'], requireRedaction: true })
    );

    // Repo 2: checkout-web
    write(
      webRepo,
      'src/CartView.js',
      "import { submitCheckout } from './checkoutClient.js';\nexport function renderCart(items) {\n  return submitCheckout(items);\n}\n"
    );
    write(
      webRepo,
      'src/checkoutClient.js',
      `export function submitCheckout(items) {\n  const token = '${AWS_KEY}';\n  return { count: items.length, token };\n}\n`
    );

    // Outside repo (for MCP sandbox test)
    write(outsideRepo, 'leak.js', 'export const leak = true;\n');
  });

  afterEach(() => {
    clearSearchCache();
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    fs.rmSync(outsideRepo, { recursive: true, force: true });
  });

  it('disambiguates colliding repository basenames and deduplicates identical roots', () => {
    const svcA = path.join(workspaceDir, 'team-a', 'app');
    const svcB = path.join(workspaceDir, 'team-b', 'app');
    fs.mkdirSync(svcA, { recursive: true });
    fs.mkdirSync(svcB, { recursive: true });

    const resolved = resolveWorkspaceRepos([svcA, svcB, svcA]);
    expect(resolved).toHaveLength(2);
    expect(resolved.map((r) => r.alias)).toEqual(['team-a-app', 'team-b-app']);
  });

  it('builds a unified workspace map across repos within a shared token budget', () => {
    const map = mapWorkspace([apiRepo, webRepo], {
      tokens: 512,
      history: 0,
      focus: ['checkout-web/src/CartView.js'],
    });

    expect(map.repos.map((r) => r.alias)).toEqual(['billing-api', 'checkout-web']);
    expect(map.tokens).toBeLessThanOrEqual(512);
    const paths = map.files.map((f) => f.path);
    expect(paths).toContain('billing-api/src/invoice.js');
    expect(paths).toContain('checkout-web/src/CartView.js');
    // Denied file in billing-api is never mapped
    expect(paths).not.toContain('billing-api/secrets/keys.js');
  });

  it('searches chunks across multiple repositories under one token budget with redaction', () => {
    const res = searchWorkspace([apiRepo, webRepo], 'createInvoice submitCheckout', {
      limit: 5,
      maxTokens: 500,
    });

    expect(res.repos).toHaveLength(2);
    const files = res.results.map((r) => r.file);
    expect(files).toContain('billing-api/src/invoice.js');
    expect(files).toContain('checkout-web/src/checkoutClient.js');
    expect(files).not.toContain('billing-api/secrets/keys.js');

    const clientHit = res.results.find((r) => r.file === 'checkout-web/src/checkoutClient.js');
    expect(clientHit.repo).toBe('checkout-web');
    expect(clientHit.text).not.toContain(AWS_KEY);
    expect(clientHit.text).toContain('[REDACTED:aws-access-key-id]');
  });

  it('packs multiple repositories into one document under a shared budget and enforces all policies', async () => {
    const full = await packWorkspace([apiRepo, webRepo], { style: 'markdown' });
    expect(full.files.map((f) => f.path)).not.toContain('billing-api/secrets/keys.js');
    expect(full.files.map((f) => f.path)).toEqual([
      'billing-api/.ctxman/policy.json',
      'billing-api/src/currency.js',
      'billing-api/src/invoice.js',
      'checkout-web/src/CartView.js',
      'checkout-web/src/checkoutClient.js',
    ]);
    expect(full.text).not.toContain(AWS_KEY);
    expect(full.text).toContain('[REDACTED:aws-access-key-id]');

    // Tight budget trims across the combined workspace
    const budgeted = await packWorkspace([apiRepo, webRepo], {
      style: 'plain',
      budget: 140,
    });
    expect(budgeted.totalTokens).toBeLessThanOrEqual(140);
    expect(budgeted.omitted.length).toBeGreaterThan(0);

    // billing-api requires redaction -> --no-redact across workspace is refused!
    await expect(packWorkspace([apiRepo, webRepo], { redact: false })).rejects.toThrow(
      PolicyViolationError
    );

    // Invalid policy in any repo fails immediately
    write(webRepo, '.ctxman/policy.json', '{ "version": 1, "maxExportTokens": "bad" }');
    await expect(packWorkspace([apiRepo, webRepo])).rejects.toThrow(PolicyConfigError);
  });

  it('works via CLI `--repo` flags and confines MCP `repos` to the sandbox `--root`', async () => {
    const cliMap = spawnSync(
      process.execPath,
      [CLI, 'map', apiRepo, '--repo', webRepo, '--history', '0', '--quiet'],
      { cwd: workspaceDir, encoding: 'utf-8' }
    );
    expect(cliMap.status).toBe(0);
    expect(cliMap.stdout).toContain('billing-api/src/invoice.js');
    expect(cliMap.stdout).toContain('checkout-web/src/CartView.js');

    const cliSearch = spawnSync(
      process.execPath,
      [CLI, 'search', 'formatMoney', '--repo', apiRepo, '--repo', webRepo, '--json'],
      { cwd: workspaceDir, encoding: 'utf-8' }
    );
    expect(cliSearch.status).toBe(0);
    expect(JSON.parse(cliSearch.stdout).results[0].file).toBe('billing-api/src/currency.js');

    const cliPack = spawnSync(
      process.execPath,
      [CLI, 'pack', apiRepo, '--repo', webRepo, '--style', 'plain', '-q'],
      { cwd: workspaceDir, encoding: 'utf-8' }
    );
    expect(cliPack.status).toBe(0);
    expect(cliPack.stdout).toContain('billing-api/src/invoice.js');
    expect(cliPack.stdout).toContain('checkout-web/src/CartView.js');

    // MCP tools with sandbox root = workspaceDir
    const mcp = new MCPServer({ root: workspaceDir });
    const handler = mcp.server._requestHandlers.get(CallToolRequestSchema.shape.method.value);

    const okPack = await handler({
      method: 'tools/call',
      params: {
        name: 'pack_context',
        arguments: { path: apiRepo, repos: [webRepo], style: 'plain' },
      },
    });
    expect(okPack.isError).toBeUndefined();
    expect(okPack.content[0].text).toContain('billing-api/src/invoice.js');
    expect(okPack.content[0].text).toContain('checkout-web/src/CartView.js');

    // Attempting to include outsideRepo via `repos` is blocked by MCP sandbox!
    const escaped = await handler({
      method: 'tools/call',
      params: {
        name: 'pack_context',
        arguments: { path: apiRepo, repos: [outsideRepo] },
      },
    });
    expect(escaped.isError).toBe(true);
    expect(escaped.content[0].text).toContain('outside the MCP root');
  });
});
