import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  resolveWorkspaceRepos,
  buildWorkspaceGraph,
  mapWorkspace,
  searchWorkspace,
  packWorkspace,
  focusContext,
  buildTaskContext,
  diagnoseFailure,
  PolicyConfigError,
  PolicyViolationError,
} from '../index.js';
import { clearSearchCache } from '../lib/search/bm25.js';
import MCPServer from '../lib/api/mcp/server.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const BIN_DIR = fileURLToPath(new URL('../bin', import.meta.url));
const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

describe('Multi-Repository Workspace (map, search, pack, focus, task, diagnose)', () => {
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

    // Repo 2: checkout-web (imports createInvoice from billing-api across repos!)
    write(
      webRepo,
      'src/CartView.js',
      "import { submitCheckout } from './checkoutClient.js';\nexport function renderCart(items) {\n  return submitCheckout(items);\n}\n"
    );
    write(
      webRepo,
      'src/checkoutClient.js',
      `import { createInvoice } from 'billing-api/src/invoice.js';\nexport function submitCheckout(items) {\n  const token = '${AWS_KEY}';\n  const invoice = createInvoice(items.length * 100);\n  return { count: items.length, invoice, token };\n}\n`
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

  it('builds a unified workspace map across repos with cross-repo import and call edges', () => {
    const graph = buildWorkspaceGraph([apiRepo, webRepo], { history: 0, callGraph: true });
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'checkout-web/src/checkoutClient.js',
          to: 'billing-api/src/invoice.js',
        }),
      ])
    );
    expect(graph.callEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'checkout-web/src/checkoutClient.js',
          caller: 'submitCheckout',
          to: 'billing-api/src/invoice.js',
          callee: 'createInvoice',
        }),
      ])
    );

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

  it('focuses on a target across multiple repositories with cross-repo import and symbol call edges', async () => {
    const focused = await focusContext(
      apiRepo,
      'checkout-web/src/checkoutClient.js:submitCheckout',
      {
        repos: [webRepo],
        depth: 1,
        style: 'markdown',
      }
    );

    expect(focused.repos.map((r) => r.alias)).toEqual(['billing-api', 'checkout-web']);
    expect(focused.focus.target).toBe('checkout-web/src/checkoutClient.js');
    expect(focused.focus.symbol).toBe('submitCheckout');
    const neighborPaths = focused.focus.neighbors.map((n) => n.path);
    expect(neighborPaths).toContain('billing-api/src/invoice.js');
    expect(neighborPaths).toContain('checkout-web/src/CartView.js');
    expect(focused.files[0].path).toBe('checkout-web/src/checkoutClient.js');
    expect(focused.text).not.toContain(AWS_KEY);
    expect(focused.text).toContain('[REDACTED:aws-access-key-id]');

    // Targeting a policy-denied file in billing-api is rejected
    await expect(
      focusContext(apiRepo, 'billing-api/secrets/keys.js', { repos: [webRepo] })
    ).rejects.toThrow(PolicyViolationError);
  });

  it('builds task context across multiple repositories with cross-repo call expansion', async () => {
    const taskRes = await buildTaskContext(
      apiRepo,
      'fix invoice creation during checkout submission',
      {
        repos: [webRepo],
        budget: 4000,
        format: 'markdown',
        searchMode: 'bm25',
      }
    );

    expect(taskRes.repos.map((r) => r.alias)).toEqual(['billing-api', 'checkout-web']);
    const packedPaths = taskRes.files.map((f) => f.path);
    expect(packedPaths).toContain('billing-api/src/invoice.js');
    expect(packedPaths).toContain('checkout-web/src/checkoutClient.js');
    expect(packedPaths).not.toContain('billing-api/secrets/keys.js');
    expect(taskRes.text).toContain('# Workspace repository map');
    expect(taskRes.text).not.toContain(AWS_KEY);
    expect(taskRes.text).toContain('[REDACTED:aws-access-key-id]');

    // Enforces requireRedaction across all workspace repos
    await expect(
      buildTaskContext(apiRepo, 'invoice', { repos: [webRepo], redact: false })
    ).rejects.toThrow(PolicyViolationError);
  });

  it('diagnoses stack traces spanning multiple repositories and collects cross-repo neighbors', async () => {
    const stackTrace = [
      'Error: Invalid invoice amount',
      '    at formatMoney (billing-api/src/currency.js:2:10)',
      '    at createInvoice (billing-api/src/invoice.js:3:10)',
      `    at submitCheckout (${path.join(webRepo, 'src/checkoutClient.js')}:4:19)`,
    ].join('\n');

    const diag = await diagnoseFailure(apiRepo, stackTrace, {
      repos: [webRepo],
      budget: 4000,
      format: 'markdown',
    });

    expect(diag.repos.map((r) => r.alias)).toEqual(['billing-api', 'checkout-web']);
    expect(diag.implicatedFiles).toEqual([
      'billing-api/src/currency.js',
      'billing-api/src/invoice.js',
      'checkout-web/src/checkoutClient.js',
    ]);
    expect(diag.neighbors).toContain('checkout-web/src/CartView.js');
    expect(diag.text).toContain('billing-api/src/invoice.js');
    expect(diag.text).toContain('checkout-web/src/checkoutClient.js');
    expect(diag.text).not.toContain(AWS_KEY);

    // Enforces requireRedaction across all workspace repos
    await expect(
      diagnoseFailure(apiRepo, stackTrace, { repos: [webRepo], redact: false })
    ).rejects.toThrow(PolicyViolationError);
  });

  it('works via CLI `--repo` flags across workspace commands', () => {
    const runSub = (script, args) =>
      spawnSync(process.execPath, [path.join(BIN_DIR, script), ...args], {
        cwd: workspaceDir,
        encoding: 'utf-8',
        timeout: 45000,
      });

    const cliMap = runSub('cm-map.js', [apiRepo, '--repo', webRepo, '--history', '0', '--quiet']);
    expect(cliMap.status).toBe(0);
    expect(cliMap.stdout).toContain('billing-api/src/invoice.js');
    expect(cliMap.stdout).toContain('checkout-web/src/CartView.js');

    const cliSearch = runSub('cm-search.js', [
      'formatMoney',
      '--repo',
      apiRepo,
      '--repo',
      webRepo,
      '--json',
    ]);
    expect(cliSearch.status).toBe(0);
    expect(JSON.parse(cliSearch.stdout).results[0].file).toBe('billing-api/src/currency.js');

    const cliPack = runSub('cm-pack.js', [apiRepo, '--repo', webRepo, '--style', 'plain', '-q']);
    expect(cliPack.status).toBe(0);
    expect(cliPack.stdout).toContain('billing-api/src/invoice.js');
    expect(cliPack.stdout).toContain('checkout-web/src/CartView.js');

    const cliFocus = runSub('cm-focus.js', [
      'checkout-web/src/checkoutClient.js',
      '--root',
      apiRepo,
      '--repo',
      webRepo,
      '--style',
      'json',
      '-q',
    ]);
    expect(cliFocus.status).toBe(0);
    const focusJson = JSON.parse(cliFocus.stdout);
    expect(focusJson.files[0].path).toBe('checkout-web/src/checkoutClient.js');
    expect(focusJson.files.map((f) => f.path)).toContain('billing-api/src/invoice.js');

    const cliTask = runSub('cm-task.js', [
      'invoice checkout submission',
      '--root',
      apiRepo,
      '--repo',
      webRepo,
      '--search-mode',
      'bm25',
      '--format',
      'json',
      '-q',
    ]);
    expect(cliTask.status).toBe(0);
    const taskJson = JSON.parse(cliTask.stdout);
    expect(taskJson.repos.map((r) => r.alias)).toEqual(['billing-api', 'checkout-web']);
    expect(taskJson.files.map((f) => f.path)).toContain('billing-api/src/invoice.js');

    const traceText = 'Error: boom\n    at createInvoice (billing-api/src/invoice.js:2:3)\n';
    const cliDiagnose = runSub('cm-diagnose.js', [
      traceText,
      '--root',
      apiRepo,
      '--repo',
      webRepo,
      '--format',
      'json',
      '-q',
    ]);
    expect(cliDiagnose.status).toBe(0);
    const diagJson = JSON.parse(cliDiagnose.stdout);
    expect(diagJson.implicatedFiles).toContain('billing-api/src/invoice.js');
    expect(diagJson.neighbors).toContain('checkout-web/src/checkoutClient.js');
  });

  it('confines MCP `repos` to the sandbox `--root` across workspace tools', async () => {
    const traceText = 'Error: boom\n    at createInvoice (billing-api/src/invoice.js:2:3)\n';
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

    const okFocus = await handler({
      method: 'tools/call',
      params: {
        name: 'focus_context',
        arguments: {
          path: apiRepo,
          repos: [webRepo],
          target: 'checkout-web/src/checkoutClient.js:submitCheckout',
          style: 'json',
        },
      },
    });
    expect(okFocus.isError).toBeUndefined();
    const mcpFocusObj = JSON.parse(okFocus.content[0].text);
    expect(mcpFocusObj.files.map((f) => f.path)).toContain('billing-api/src/invoice.js');
    expect(okFocus.content[1].text).toContain(
      'Focused target checkout-web/src/checkoutClient.js:submitCheckout'
    );

    const okTask = await handler({
      method: 'tools/call',
      params: {
        name: 'task_context',
        arguments: {
          path: apiRepo,
          repos: [webRepo],
          query: 'invoice checkout',
          searchMode: 'bm25',
          format: 'json',
        },
      },
    });
    expect(okTask.isError).toBeUndefined();
    const mcpTaskObj = JSON.parse(okTask.content[0].text);
    expect(mcpTaskObj.repos).toHaveLength(2);

    const okDiagnose = await handler({
      method: 'tools/call',
      params: {
        name: 'diagnose_failure',
        arguments: {
          path: apiRepo,
          repos: [webRepo],
          trace: traceText,
          format: 'json',
        },
      },
    });
    expect(okDiagnose.isError).toBeUndefined();
    const mcpDiagObj = JSON.parse(okDiagnose.content[0].text);
    expect(mcpDiagObj.neighbors).toContain('checkout-web/src/checkoutClient.js');

    const okSymbol = await handler({
      method: 'tools/call',
      params: {
        name: 'get_symbol',
        arguments: {
          path: apiRepo,
          repos: [webRepo],
          name: 'submitCheckout',
        },
      },
    });
    expect(okSymbol.isError).toBeUndefined();
    const mcpSymObj = JSON.parse(okSymbol.content[0].text);
    expect(mcpSymObj.match).toBe('exact');
    expect(mcpSymObj.symbols[0].file).toBe('checkout-web/src/checkoutClient.js');
    expect(mcpSymObj.symbols[0].source).not.toContain(AWS_KEY);

    // Attempting to include outsideRepo via `repos` is blocked by MCP sandbox for all tools!
    for (const toolCall of [
      { name: 'pack_context', arguments: { path: apiRepo, repos: [outsideRepo] } },
      {
        name: 'focus_context',
        arguments: { path: apiRepo, repos: [outsideRepo], target: 'src/invoice.js' },
      },
      {
        name: 'task_context',
        arguments: { path: apiRepo, repos: [outsideRepo], query: 'invoice' },
      },
      {
        name: 'diagnose_failure',
        arguments: { path: apiRepo, repos: [outsideRepo], trace: traceText },
      },
      {
        name: 'get_symbol',
        arguments: { path: apiRepo, repos: [outsideRepo], name: 'createInvoice' },
      },
      {
        name: 'ask_codebase',
        arguments: { path: apiRepo, repos: [outsideRepo], query: 'invoice' },
      },
      {
        name: 'find_experts',
        arguments: { path: apiRepo, repos: [outsideRepo], target: 'src/invoice.js' },
      },
    ]) {
      const escaped = await handler({
        method: 'tools/call',
        params: toolCall,
      });
      expect(escaped.isError).toBe(true);
      expect(escaped.content[0].text).toContain('outside the MCP root');
    }
  });
});
