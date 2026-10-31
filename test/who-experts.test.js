import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findExperts, loadCodeowners, matchCodeowners, WhoError } from '../lib/who/index.js';
import MCPServer from '../lib/api/mcp/server.js';

function git(cwd, args, env = {}) {
  return execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

describe('Expert Finder (`ctxman who` & MCP `find_experts`)', () => {
  let tmpRepo;
  const nowMs = Date.parse('2026-10-31T00:00:00Z');

  beforeAll(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-who-test-'));
    git(tmpRepo, ['init']);

    fs.mkdirSync(path.join(tmpRepo, '.github'), { recursive: true });
    fs.mkdirSync(path.join(tmpRepo, 'src/payments'), { recursive: true });

    fs.writeFileSync(
      path.join(tmpRepo, '.github/CODEOWNERS'),
      '# Billing owners\n/src/payments/ @alice-pay @org/billing\n'
    );

    // Commit 1 (1 year ago) by Bob
    fs.writeFileSync(
      path.join(tmpRepo, 'src/payments/ledger.js'),
      [
        'export function recordInvoice(amount) {',
        '  return { amount, currency: "USD" };',
        '}',
        '',
      ].join('\n')
    );
    git(tmpRepo, ['add', '.']);
    git(tmpRepo, ['commit', '-m', 'feat: initial invoice ledger'], {
      GIT_AUTHOR_NAME: 'Bob Legacy',
      GIT_AUTHOR_EMAIL: 'bob@example.com',
      GIT_COMMITTER_NAME: 'Bob Legacy',
      GIT_COMMITTER_EMAIL: 'bob@example.com',
      GIT_AUTHOR_DATE: '2025-10-01T12:00:00Z',
      GIT_COMMITTER_DATE: '2025-10-01T12:00:00Z',
    });

    // Commit 2 (5 days ago) by Alice (CODEOWNER + active maintainer + majority surviving lines)
    fs.writeFileSync(
      path.join(tmpRepo, 'src/payments/ledger.js'),
      [
        'export function recordInvoice(amount) {',
        '  return { amount, currency: "USD" };',
        '}',
        '',
        'export function reconcileSettlementBatch(invoices) {',
        '  let total = 0;',
        '  for (const inv of invoices) {',
        '    total += inv.amount;',
        '  }',
        '  return { count: invoices.length, total, settled: true };',
        '}',
        '',
      ].join('\n')
    );
    git(tmpRepo, ['add', '.']);
    git(tmpRepo, ['commit', '-m', 'feat(payments): add settlement batch reconciliation'], {
      GIT_AUTHOR_NAME: 'Alice Pay',
      GIT_AUTHOR_EMAIL: 'alice-pay@example.com',
      GIT_COMMITTER_NAME: 'Alice Pay',
      GIT_COMMITTER_EMAIL: 'alice-pay@example.com',
      GIT_AUTHOR_DATE: '2026-10-26T12:00:00Z',
      GIT_COMMITTER_DATE: '2026-10-26T12:00:00Z',
    });
  });

  afterAll(() => {
    if (tmpRepo) {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it('parses and matches CODEOWNERS rules with last-rule-wins semantics', () => {
    const co = loadCodeowners(tmpRepo);
    expect(co.file).toBe('.github/CODEOWNERS');
    expect(matchCodeowners(co, ['src/payments/ledger.js'])).toEqual(['@alice-pay', '@org/billing']);
  });

  it('ranks active maintainer + CODEOWNER higher than stale historical author for file & symbol targets', async () => {
    const res = await findExperts(tmpRepo, 'src/payments/ledger.js', {
      nowMs,
      style: 'markdown',
    });

    expect(res.experts.length).toBe(2);
    expect(res.experts[0].name).toBe('Alice Pay');
    expect(res.experts[0].isCodeOwner).toBe(true);
    expect(res.experts[0].score).toBeGreaterThan(res.experts[1].score);
    expect(res.text).toContain('CODEOWNER');
    expect(res.text).toContain('Alice Pay');

    // Symbol target resolution (`file:symbol`)
    const symRes = await findExperts(tmpRepo, 'src/payments/ledger.js:reconcileSettlementBatch', {
      nowMs,
      style: 'json',
    });
    expect(symRes.data.target.mode).toBe('symbol');
    expect(symRes.experts[0].name).toBe('Alice Pay');
    expect(symRes.experts[0].blameShare).toBe(1);
  });

  it('resolves natural-language topic queries via BM25 code search and supports directory/xml output', async () => {
    const jsonRes = await findExperts(tmpRepo, 'reconcileSettlementBatch settlement', {
      nowMs,
      style: 'json',
    });
    const parsed = JSON.parse(jsonRes.text);
    expect(parsed.target.mode).toBe('topic');
    expect(parsed.target.files).toContain('src/payments/ledger.js');
    expect(parsed.experts[0].name).toBe('Alice Pay');

    const xmlRes = await findExperts(tmpRepo, 'src/payments', {
      nowMs,
      style: 'xml',
    });
    expect(xmlRes.text).toContain('<experts target="src/payments" mode="directory">');
    expect(xmlRes.text).toContain('codeowner="true"');
  });

  it('runs via CLI bin/cm-who.js and throws WhoError outside git repos', async () => {
    const cliOut = execFileSync(
      process.execPath,
      [path.resolve('bin/cm-who.js'), 'src/payments/ledger.js', '--json'],
      { cwd: tmpRepo, encoding: 'utf8' }
    );
    const cliData = JSON.parse(cliOut);
    expect(cliData.experts[0].name).toBe('Alice Pay');

    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-nogit-'));
    try {
      await expect(findExperts(nonGit, 'foo.js')).rejects.toThrow(WhoError);
    } finally {
      fs.rmSync(nonGit, { recursive: true, force: true });
    }
  });

  it('exposes all 18 MCP tools including find_experts, task_context, and diagnose_failure', async () => {
    const mcp = new MCPServer({ root: tmpRepo });
    const listHandler = mcp.server._requestHandlers.get('tools/list');
    const callHandler = mcp.server._requestHandlers.get('tools/call');

    const listed = await listHandler({ method: 'tools/list', params: {} });
    const names = listed.tools.map((t) => t.name);
    expect(names).toContain('find_experts');
    expect(names).toContain('task_context');
    expect(names).toContain('diagnose_failure');
    expect(names.length).toBe(18);

    const called = await callHandler({
      method: 'tools/call',
      params: {
        name: 'find_experts',
        arguments: {
          path: tmpRepo,
          target: 'src/payments/ledger.js',
          style: 'json',
        },
      },
    });
    expect(called.isError).toBeFalsy();
    const payload = JSON.parse(called.content[0].text);
    expect(payload.experts[0].name).toBe('Alice Pay');
  });
});
