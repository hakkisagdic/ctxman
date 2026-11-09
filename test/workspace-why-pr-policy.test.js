import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as API from '../index.js';
import MCPServer from '../lib/api/mcp/server.js';
import { PolicyViolationError } from '../lib/policy/index.js';
import TokenUtils from '../lib/utils/token-utils.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

function gitIn(dir, ...args) {
  return execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function writeIn(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function commitIn(dir, message, isoDate, author = 'Alice <alice@example.com>') {
  gitIn(dir, 'add', '-A');
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Dev',
      '-c',
      'user.email=dev@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '--author',
      author,
      '-m',
      message,
    ],
    {
      cwd: dir,
      env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
    }
  );
}

function runCli(subcommand, args, cwd, env = {}) {
  return spawnSync(process.execPath, [CLI, subcommand, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CEILING_DIRECTORIES: path.dirname(cwd),
      ...env,
    },
  });
}

const callMcpTool = (name, args, server = new MCPServer()) =>
  server.server._requestHandlers.get('tools/call')(
    { method: 'tools/call', params: { name, arguments: args } },
    {}
  );

describe('Multi-repository workspace support for why, pr, policy and audit', () => {
  let wsRoot;
  let apiRepo;
  let webRepo;
  let sharedRepo;
  let outsideDir;

  beforeAll(() => {
    wsRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-ws-suite-')));
    outsideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-ws-outside-')));
    apiRepo = path.join(wsRoot, 'api');
    webRepo = path.join(wsRoot, 'web');
    sharedRepo = path.join(wsRoot, 'shared');
    fs.mkdirSync(apiRepo, { recursive: true });
    fs.mkdirSync(webRepo, { recursive: true });
    fs.mkdirSync(sharedRepo, { recursive: true });

    // 1. Setup apiRepo (main + feature)
    gitIn(apiRepo, 'init', '-q', '-b', 'main');
    writeIn(apiRepo, 'src/tax.js', 'export function applyTax(cents) {\n  return cents * 1.2;\n}\n');
    writeIn(
      apiRepo,
      'src/billing.js',
      [
        "import { applyTax } from './tax.js';",
        '',
        'export function computeInvoiceTotal(items) {',
        '  const subtotal = items.reduce((sum, i) => sum + i.cents * i.qty, 0);',
        '  return applyTax(subtotal);',
        '}',
        '',
      ].join('\n')
    );
    commitIn(apiRepo, 'feat(api): add invoice total calculation', '2026-02-01T10:00:00Z');

    writeIn(
      apiRepo,
      'src/tax.js',
      'export function applyTax(cents) {\n  return cents * 1.18;\n}\n'
    );
    writeIn(
      apiRepo,
      'src/billing.js',
      [
        "import { applyTax } from './tax.js';",
        '',
        'export function computeInvoiceTotal(items) {',
        '  // TODO: support tax-exempt organizations',
        '  const subtotal = items.reduce((sum, i) => sum + i.cents * i.qty, 0);',
        '  return Math.round(applyTax(subtotal));',
        '}',
        '',
      ].join('\n')
    );
    writeIn(
      apiRepo,
      'test/billing.test.js',
      [
        "import { computeInvoiceTotal } from '../src/billing.js';",
        '',
        "test('computeInvoiceTotal rounds cents', () => {",
        '  expect(computeInvoiceTotal([{ cents: 10, qty: 1 }])).toBe(12);',
        '});',
        '',
      ].join('\n')
    );
    commitIn(
      apiRepo,
      'fix(api): round computeInvoiceTotal to integer cents (#101)',
      '2026-02-02T10:00:00Z'
    );

    gitIn(apiRepo, 'checkout', '-q', '-b', 'feature');
    writeIn(
      apiRepo,
      'src/billing.js',
      [
        "import { applyTax } from './tax.js';",
        '',
        'export function computeInvoiceTotal(items) {',
        '  // TODO: support tax-exempt organizations',
        '  if (!Array.isArray(items) || items.length === 0) return 0;',
        '  const subtotal = items.reduce((sum, i) => sum + i.cents * i.qty, 0);',
        '  return Math.round(applyTax(subtotal));',
        '}',
        '',
      ].join('\n')
    );
    commitIn(
      apiRepo,
      'feat(api): guard empty item list in computeInvoiceTotal',
      '2026-02-05T10:00:00Z',
      'Alice <alice@example.com>'
    );

    // 2. Setup webRepo (main + feature, holding cross-repo ADR, comment, and E2E test)
    gitIn(webRepo, 'init', '-q', '-b', 'main');
    writeIn(
      webRepo,
      'docs/adr/0007-invoice-rounding.md',
      [
        '# ADR 7: Server-side Invoice Rounding',
        '',
        '## Decision',
        '',
        'The web client never rounds totals; `computeInvoiceTotal` in `api` is authoritative.',
        '',
      ].join('\n')
    );
    writeIn(
      webRepo,
      'src/checkout.js',
      [
        '// Expects integer cents returned by computeInvoiceTotal in api/src/billing.js',
        'export function formatInvoiceBanner(cents) {',
        '  return `Total: $${(cents / 100).toFixed(2)}`;',
        '}',
        '',
      ].join('\n')
    );
    writeIn(
      webRepo,
      'test/checkout.test.js',
      [
        "import { formatInvoiceBanner } from '../src/checkout.js';",
        '',
        "test('renders computeInvoiceTotal output cleanly', () => {",
        "  expect(formatInvoiceBanner(1200)).toBe('Total: $12.00');",
        '});',
        '',
      ].join('\n')
    );
    commitIn(
      webRepo,
      'docs(web): document computeInvoiceTotal rounding contract',
      '2026-02-03T10:00:00Z',
      'Bob <bob@example.com>'
    );

    gitIn(webRepo, 'checkout', '-q', '-b', 'feature');
    writeIn(
      webRepo,
      'src/checkout.js',
      [
        '// Expects integer cents returned by computeInvoiceTotal in api/src/billing.js',
        'export function formatInvoiceBanner(cents) {',
        "  if (cents <= 0) return 'No charge';",
        '  return `Total: $${(cents / 100).toFixed(2)}`;',
        '}',
        '',
      ].join('\n')
    );
    commitIn(
      webRepo,
      'feat(web): handle zero-cent invoices in formatInvoiceBanner',
      '2026-02-06T12:00:00Z',
      'Bob <bob@example.com>'
    );

    // 3. Setup sharedRepo (main only — no `feature` branch)
    gitIn(sharedRepo, 'init', '-q', '-b', 'main');
    writeIn(sharedRepo, 'src/currency.js', 'export const DEFAULT_CURRENCY = "USD";\n');
    commitIn(sharedRepo, 'feat(shared): add currency constant', '2026-02-01T08:00:00Z');
  });

  afterAll(() => {
    fs.rmSync(wsRoot, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  describe('Step 1: why / explainHistory / explain_history', () => {
    it('discovers cross-repo ADRs, comments, tests and prefixes target/coupling paths', async () => {
      const result = await API.explainHistory(apiRepo, 'src/billing.js:computeInvoiceTotal', {
        repos: [webRepo],
      });

      expect(result.repos).toEqual([
        { alias: 'api', root: apiRepo },
        { alias: 'web', root: webRepo },
      ]);
      expect(result.data.target.path).toBe('api/src/billing.js');
      expect(result.data.target.symbol).toBe('computeInvoiceTotal');
      expect(result.data.coupling.files.map((f) => f.path)).toContain('api/src/tax.js');

      const relatedPaths = result.data.related.map((r) => r.path);
      expect(relatedPaths).toContain('web/docs/adr/0007-invoice-rounding.md');
      expect(relatedPaths).toContain('web/src/checkout.js');

      const testPaths = result.data.tests.map((t) => t.path);
      expect(testPaths).toContain('api/test/billing.test.js');
      expect(testPaths).toContain('web/test/checkout.test.js');

      expect(result.text).toContain('# Why: `computeInvoiceTotal` in `api/src/billing.js`');
      expect(result.text).toContain('- Workspace repositories: `api`, `web`');

      const xml = await API.explainHistory(wsRoot, 'api/src/billing.js:computeInvoiceTotal', {
        repos: [apiRepo, webRepo],
        style: 'xml',
      });
      expect(xml.text).toContain('<repositories>');
      expect(xml.text).toContain('alias="api"');
      expect(xml.text).toContain('alias="web"');
    });

    it('supports CLI --repo from both a repo and a non-git workspace container directory', () => {
      const fromContainer = runCli(
        'why',
        ['api/src/billing.js:computeInvoiceTotal', '--repo', apiRepo, '--repo', webRepo, '--json'],
        wsRoot
      );
      expect(fromContainer.status).toBe(0);
      const parsed = JSON.parse(fromContainer.stdout);
      expect(parsed.repos.map((r) => r.alias)).toEqual(['api', 'web']);
      expect(parsed.target.path).toBe('api/src/billing.js');
      expect(parsed.related.map((r) => r.path)).toContain('web/docs/adr/0007-invoice-rounding.md');
    });

    it('enforces per-repo export policies in multi-repo why', async () => {
      const policyDir = path.join(webRepo, '.ctxman');
      fs.mkdirSync(policyDir, { recursive: true });
      fs.writeFileSync(
        path.join(policyDir, 'policy.json'),
        JSON.stringify({ version: 1, deny: ['docs/adr/**'] })
      );
      try {
        await expect(
          API.explainHistory(apiRepo, 'web/docs/adr/0007-invoice-rounding.md', {
            repos: [webRepo],
          })
        ).rejects.toMatchObject({ code: 'POLICY_DENIED' });

        const allowed = await API.explainHistory(apiRepo, 'src/billing.js:computeInvoiceTotal', {
          repos: [webRepo],
        });
        expect(allowed.data.related.map((r) => r.path)).not.toContain(
          'web/docs/adr/0007-invoice-rounding.md'
        );
      } finally {
        fs.rmSync(policyDir, { recursive: true, force: true });
      }
    });

    it('serves multi-repo explain_history via MCP and enforces --root sandbox', async () => {
      const ok = await callMcpTool(
        'explain_history',
        {
          path: apiRepo,
          target: 'web/src/checkout.js:formatInvoiceBanner',
          repos: [webRepo],
        },
        new MCPServer({ root: wsRoot })
      );
      expect(ok.isError).toBeUndefined();
      expect(ok.content[0].text).toContain('# Why: `formatInvoiceBanner` in `web/src/checkout.js`');

      const escaped = await callMcpTool(
        'explain_history',
        {
          path: apiRepo,
          target: 'src/billing.js',
          repos: [outsideDir],
        },
        new MCPServer({ root: wsRoot })
      );
      expect(escaped.isError).toBe(true);
      expect(escaped.content[0].text).toContain('outside the MCP root');
    });
  });

  describe('Step 2: pr / buildPrContext / pr_context', () => {
    it('merges commits, changed methods, unified diffs and related tests across repos under a shared budget', async () => {
      const result = await API.buildPrContext(apiRepo, {
        base: 'main',
        head: 'feature',
        repos: [webRepo],
      });

      expect(result.repos).toEqual([
        { alias: 'api', root: apiRepo },
        { alias: 'web', root: webRepo },
      ]);
      expect(result.commits.map((c) => c.repo)).toEqual(['api', 'web']);
      expect(result.files.map((f) => f.path)).toEqual([
        'api/src/billing.js',
        'web/src/checkout.js',
      ]);
      expect(result.methods.changed.map((m) => `${m.file}:${m.name}`)).toEqual([
        'api/src/billing.js:computeInvoiceTotal',
        'web/src/checkout.js:formatInvoiceBanner',
      ]);
      expect(result.relatedTests.map((t) => t.path)).toEqual(
        expect.arrayContaining(['api/test/billing.test.js', 'web/test/checkout.test.js'])
      );
      expect(result.output).toContain('- Repositories: api, web');
      expect(result.output).toContain('[web]');
      expect(result.output).toContain('[api]');
      expect(result.output).toContain('diff --git a/api/src/billing.js b/api/src/billing.js');
      expect(result.output).toContain('diff --git a/web/src/checkout.js b/web/src/checkout.js');

      const budgeted = await API.buildPrContext(apiRepo, {
        base: 'main',
        head: 'feature',
        repos: [webRepo],
        withFiles: true,
        withTests: true,
        budget: 450,
      });
      expect(TokenUtils.calculate(budgeted.output, 'pr.md')).toBeLessThanOrEqual(450);
    });

    it('skips sibling repos missing the target branch with a warning instead of failing', async () => {
      const result = await API.buildPrContext(apiRepo, {
        base: 'main',
        head: 'feature',
        repos: [webRepo, sharedRepo],
      });

      expect(result.files.map((f) => f.path)).toEqual([
        'api/src/billing.js',
        'web/src/checkout.js',
      ]);
      expect(result.warnings.some((w) => w.startsWith('shared: skipped'))).toBe(true);
    });

    it('enforces sibling policy rules in multi-repo buildPrContext', async () => {
      const policyDir = path.join(webRepo, '.ctxman');
      fs.mkdirSync(policyDir, { recursive: true });
      fs.writeFileSync(
        path.join(policyDir, 'policy.json'),
        JSON.stringify({ version: 1, requireRedaction: true })
      );
      try {
        await expect(
          API.buildPrContext(apiRepo, {
            base: 'main',
            head: 'feature',
            repos: [webRepo],
            redact: false,
          })
        ).rejects.toBeInstanceOf(PolicyViolationError);
      } finally {
        fs.rmSync(policyDir, { recursive: true, force: true });
      }
    });

    it('supports CLI ctxman pr --repo and MCP pr_context with repos', async () => {
      const cliRun = runCli(
        'pr',
        ['--base', 'main', '--head', 'feature', `--repo=${webRepo}`, '--json', '-q'],
        apiRepo
      );
      expect(cliRun.status).toBe(0);
      const jsonData = JSON.parse(cliRun.stdout);
      expect(jsonData.summary.repos.map((r) => r.alias)).toEqual(['api', 'web']);
      expect(jsonData.commits.map((c) => c.repo)).toEqual(['api', 'web']);

      const mcpRes = await callMcpTool(
        'pr_context',
        {
          path: apiRepo,
          base: 'main',
          head: 'feature',
          style: 'xml',
          repos: [webRepo],
        },
        new MCPServer({ root: wsRoot })
      );
      expect(mcpRes.isError).toBeUndefined();
      expect(mcpRes.content[0].text).toContain('repo="api"');
      expect(mcpRes.content[0].text).toContain('repo="web"');
    });
  });

  describe('Step 3: policy check & audit across multi-repository workspaces', () => {
    let policyWs;
    let svcA;
    let svcB;

    beforeAll(() => {
      policyWs = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-ws-policy-')));
      svcA = path.join(policyWs, 'svc-a');
      svcB = path.join(policyWs, 'svc-b');
      fs.mkdirSync(path.join(svcA, '.ctxman'), { recursive: true });
      fs.mkdirSync(path.join(svcB, '.ctxman'), { recursive: true });
    });

    afterAll(() => {
      fs.rmSync(policyWs, { recursive: true, force: true });
    });

    it('validates and summarizes policies across repos, reporting all invalid repos without early abort', async () => {
      fs.writeFileSync(
        path.join(svcA, '.ctxman', 'policy.json'),
        JSON.stringify({
          version: 1,
          deny: ['secrets/**'],
          requireRedaction: true,
          maxExportTokens: 12000,
          allowedTargetModels: ['claude-*'],
          ignoreFiles: ['.cursorignore'],
          audit: { enabled: true, path: '.ctxman/audit.log' },
        })
      );
      fs.writeFileSync(
        path.join(svcB, '.ctxman', 'policy.json'),
        JSON.stringify({
          version: 1,
          deny: ['.env*'],
          maxExportTokens: 8000,
          ignoreFiles: ['.aiexclude'],
          audit: { enabled: true, path: '.ctxman/audit.log' },
        })
      );

      const summary = API.checkWorkspacePolicies(svcA, [svcB]);
      expect(summary.valid).toBe(true);
      expect(summary.active).toBe(true);
      expect(summary.requireRedaction).toBe(true);
      expect(summary.maxExportTokens).toBe(8000);
      expect(summary.ignoreFiles).toEqual(['.cursorignore', '.aiexclude']);
      expect(summary.repos.map((r) => r.alias)).toEqual(['svc-a', 'svc-b']);

      const cliOk = runCli('policy', ['check', '--repo', svcB], svcA);
      expect(cliOk.status).toBe(0);
      expect(cliOk.stdout).toContain('All workspace policies are valid.');

      // Break svcB policy and verify both CLI and MCP report both repos without throwing
      fs.writeFileSync(
        path.join(svcB, '.ctxman', 'policy.json'),
        JSON.stringify({ version: 1, deny: 'must-be-an-array' })
      );

      const cliBroken = runCli('policy', ['check', '--repo', svcB, '--json'], svcA);
      expect(cliBroken.status).toBe(2);
      const brokenJson = JSON.parse(cliBroken.stdout);
      expect(brokenJson.valid).toBe(false);
      expect(brokenJson.repos).toHaveLength(2);
      expect(brokenJson.repos[0]).toMatchObject({ alias: 'svc-a', valid: true });
      expect(brokenJson.repos[1]).toMatchObject({
        alias: 'svc-b',
        valid: false,
        errors: expect.any(Array),
      });

      const mcpBroken = await callMcpTool(
        'check_policy',
        { path: svcA, repos: [svcB] },
        new MCPServer({ root: policyWs })
      );
      expect(mcpBroken.isError).toBeUndefined();
      const mcpParsed = JSON.parse(mcpBroken.content[0].text);
      expect(mcpParsed.valid).toBe(false);
      expect(mcpParsed.repos[1].valid).toBe(false);
    });

    it('merges audit logs chronologically with repo tags across CLI and MCP', async () => {
      fs.writeFileSync(
        path.join(svcB, '.ctxman', 'policy.json'),
        JSON.stringify({
          version: 1,
          deny: [],
          audit: { enabled: true, path: '.ctxman/audit.log' },
        })
      );

      fs.writeFileSync(
        path.join(svcA, '.ctxman', 'audit.log'),
        [
          JSON.stringify({
            id: 'evt-1',
            timestamp: '2026-10-01T09:00:00.000Z',
            command: 'pack',
            destination: 'stdout',
            tokens: 400,
            fileCount: 2,
            files: ['src/a.js'],
          }),
          JSON.stringify({
            id: 'evt-3',
            timestamp: '2026-10-03T15:00:00.000Z',
            command: 'why',
            destination: 'mcp',
            tokens: 900,
            fileCount: 1,
            files: ['src/b.js'],
          }),
        ].join('\n') + '\n'
      );

      fs.writeFileSync(
        path.join(svcB, '.ctxman', 'audit.log'),
        [
          JSON.stringify({
            id: 'evt-2',
            timestamp: '2026-10-02T11:30:00.000Z',
            command: 'pr',
            destination: 'stdout',
            tokens: 650,
            fileCount: 3,
            files: ['src/c.js'],
          }),
          // Duplicate id across logs is deduplicated
          JSON.stringify({
            id: 'evt-1',
            timestamp: '2026-10-01T09:00:00.000Z',
            command: 'pack',
            destination: 'stdout',
            tokens: 400,
            fileCount: 2,
            files: ['src/a.js'],
          }),
        ].join('\n') + '\n'
      );

      const merged = API.readWorkspaceAuditLogs(svcA, [svcB]);
      expect(merged.total).toBe(3);
      expect(merged.events.map((e) => [e.id, e.repo])).toEqual([
        ['evt-1', 'svc-a'],
        ['evt-2', 'svc-b'],
        ['evt-3', 'svc-a'],
      ]);

      const cliTable = runCli('audit', ['--repo', svcB], svcA);
      expect(cliTable.status).toBe(0);
      expect(cliTable.stdout).toContain('REPO');
      expect(cliTable.stdout).toContain('svc-a');
      expect(cliTable.stdout).toContain('svc-b');
      expect(cliTable.stdout).toContain('3 events across 2 repositories');

      const cliConflict = runCli('audit', ['--file', 'x.log', '--repo', svcB], svcA);
      expect(cliConflict.status).toBe(2);
      expect(cliConflict.stderr).toContain('Cannot combine --file and --repo');

      const mcpAudit = await callMcpTool(
        'audit_log',
        { path: svcA, repos: [svcB], since: '2026-10-02', limit: 2 },
        new MCPServer({ root: policyWs })
      );
      expect(mcpAudit.isError).toBeUndefined();
      const mcpJson = JSON.parse(mcpAudit.content[0].text);
      expect(mcpJson.total).toBe(2);
      expect(mcpJson.events.map((e) => [e.id, e.repo])).toEqual([
        ['evt-2', 'svc-b'],
        ['evt-3', 'svc-a'],
      ]);
    });
  });
});
