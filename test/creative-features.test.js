import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  packContext,
  classifyCacheTier,
  orderEntriesForPromptCache,
  buildPromptCachePlan,
  analyzeBlastRadius,
} from '../index.js';
import { APIServer } from '../lib/api/rest/server.js';

describe('Creative Features (C-1 Prompt Cache Optimizer & C-2 Blast Radius Simulator)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-creative-'));
    fs.mkdirSync(path.join(tmpDir, 'lib', 'core'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'lib', 'services'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true });

    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'demo-app', version: '1.0.0', type: 'module' }, null, 2)
    );

    fs.writeFileSync(
      path.join(tmpDir, 'lib', 'core', 'validator.js'),
      `export function validateOrder(order) {
  if (!order || typeof order.amount !== 'number') {
    throw new Error('Invalid order');
  }
  return order.amount > 0;
}

export function normalizeCurrency(code) {
  return String(code || 'TRY').toUpperCase();
}
`
    );

    fs.writeFileSync(
      path.join(tmpDir, 'lib', 'services', 'checkout.js'),
      `import { validateOrder, normalizeCurrency } from '../core/validator.js';

export function processCheckout(order) {
  const ok = validateOrder(order);
  const currency = normalizeCurrency(order.currency);
  return { ok, currency, total: order.amount };
}
`
    );

    fs.writeFileSync(
      path.join(tmpDir, 'lib', 'services', 'invoice.js'),
      `import { processCheckout } from './checkout.js';

export function issueInvoice(order) {
  const res = processCheckout(order);
  return { invoiceId: 'INV-1', ...res };
}
`
    );

    fs.writeFileSync(
      path.join(tmpDir, 'test', 'validator.test.js'),
      `import { validateOrder } from '../lib/core/validator.js';
import { processCheckout } from '../lib/services/checkout.js';

export function testSuite() {
  validateOrder({ amount: 100 });
  processCheckout({ amount: 50, currency: 'try' });
}
`
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('C-1: Prompt Cache Optimizer & Deterministic Prefix Pinning', () => {
    it('classifies files into static_core, semi_stable, and volatile_tail tiers', () => {
      expect(classifyCacheTier({ path: 'package.json' }).tierName).toBe('static_core');
      expect(classifyCacheTier({ path: 'lib/core/validator.js' }).tierName).toBe('static_core');
      expect(classifyCacheTier({ path: 'lib/services/checkout.js' }).tierName).toBe('semi_stable');
      expect(classifyCacheTier({ path: 'test/validator.test.js' }).tierName).toBe('volatile_tail');
    });

    it('orders entries deterministically with static_core first and volatile_tail last', () => {
      const unordered = [
        { path: 'test/validator.test.js', tokens: 120 },
        { path: 'lib/services/invoice.js', tokens: 200 },
        { path: 'package.json', tokens: 50 },
        { path: 'lib/core/validator.js', tokens: 300 },
      ];
      const ordered = orderEntriesForPromptCache(unordered);
      expect(ordered.map((e) => e.path)).toEqual([
        'lib/core/validator.js',
        'package.json',
        'lib/services/invoice.js',
        'test/validator.test.js',
      ]);
      expect(ordered[0].cacheTier).toBe('static_core');
      expect(ordered[3].cacheTier).toBe('volatile_tail');
    });

    it('attaches cachePlan and Anthropic ephemeral cache breakpoints in packContext()', async () => {
      const packed = await packContext(tmpDir, {
        cacheControl: 'anthropic',
        header: 'Repository Reference Context',
        instructions: 'Refactor checkout flow without breaking invoice generation.',
      });

      expect(packed.cachePlan).toBeDefined();
      expect(packed.cachePlan.provider).toBe('anthropic');
      expect(packed.cachePlan.staticPrefixTokens).toBeGreaterThan(0);
      expect(packed.cachePlan.cacheableRatio).toBeGreaterThan(0.5);
      expect(packed.cachePlan.anthropic.breakpoints.length).toBeGreaterThanOrEqual(2);
      expect(packed.cachePlan.anthropic.systemBlocks.length).toBeGreaterThanOrEqual(2);
      expect(packed.cachePlan.anthropic.systemBlocks[0].cache_control).toEqual({
        type: 'ephemeral',
      });
      expect(packed.cachePlan.estimatedSavings.anthropicSavingsPct).toBeGreaterThan(30);

      // Verify volatile test file is placed at the end of packed.files
      const lastFile = packed.files[packed.files.length - 1];
      expect(lastFile.path).toBe('test/validator.test.js');
      expect(lastFile.cacheTier).toBe('volatile_tail');
    });

    it('computes OpenAI 1024-token prefix eligibility in buildPromptCachePlan()', () => {
      const plan = buildPromptCachePlan({
        entries: [
          { path: 'lib/core/validator.js', tokens: 900, cacheTier: 'static_core', content: 'a' },
          { path: 'lib/services/checkout.js', tokens: 400, cacheTier: 'semi_stable', content: 'b' },
          { path: 'test/validator.test.js', tokens: 150, cacheTier: 'volatile_tail', content: 'c' },
        ],
        totalTokens: 1450,
        cacheControl: 'openai',
      });

      expect(plan.openai.eligible).toBe(true);
      expect(plan.openai.alignedPrefixTokens).toBe(1280);
      expect(plan.estimatedSavings.openaiSavingsPct).toBeGreaterThan(35);
    });
  });

  describe('C-2: Pre-Change Blast Radius & Symbol Contract Simulator', () => {
    it('computes 1-hop importers, 2-hop transitive dependents, AST callers, affected tests, and Mermaid diagram', () => {
      const report = analyzeBlastRadius(tmpDir, 'lib/core/validator.js:validateOrder', {
        includeReviewers: false,
      });

      expect(report.target.file).toBe('lib/core/validator.js');
      expect(report.target.symbol).toBe('validateOrder');
      expect(report.directImporters).toContain('lib/services/checkout.js');
      expect(report.transitiveImporters).toContain('lib/services/invoice.js');
      expect(report.directCallers.length).toBeGreaterThanOrEqual(2);
      expect(
        report.directCallers.some(
          (c) => c.from === 'lib/services/checkout.js' && c.caller === 'processCheckout'
        )
      ).toBe(true);
      expect(report.affectedTests).toContain('test/validator.test.js');
      expect(report.recommendedTestCommand).toContain('npx vitest run test/validator.test.js');
      expect(report.blastScore).toBeGreaterThan(20);
      expect(['low', 'medium', 'high', 'critical']).toContain(report.severity);
      expect(report.mermaidDiagram).toContain('flowchart LR');
      expect(report.markdown).toContain(
        '# Blast Radius Analysis: `lib/core/validator.js:validateOrder`'
      );
    });

    it('runs via CLI `ctxman impact <target> --json`', () => {
      const cliPath = path.resolve('bin/cli.js');
      const run = spawnSync(
        process.execPath,
        [
          cliPath,
          'impact',
          'lib/core/validator.js:validateOrder',
          tmpDir,
          '--json',
          '--no-reviewers',
        ],
        { encoding: 'utf8' }
      );
      expect(run.status).toBe(0);
      const parsed = JSON.parse(run.stdout);
      expect(parsed.target.file).toBe('lib/core/validator.js');
      expect(parsed.target.symbol).toBe('validateOrder');
      expect(parsed.affectedTests).toContain('test/validator.test.js');
    });

    it('serves GET /api/v1/impact and POST /api/v1/pack with cacheControl over REST API', async () => {
      const api = new APIServer({ port: 0, host: '127.0.0.1' });
      await new Promise((resolve) => {
        api.server = api.server || null;
        api.start();
        api.server.once('listening', resolve);
      });
      const port = api.server.address().port;

      try {
        const impactRes = await fetch(
          `http://127.0.0.1:${port}/api/v1/impact?path=${encodeURIComponent(tmpDir)}&target=lib/core/validator.js:validateOrder&reviewers=false`
        );
        expect(impactRes.status).toBe(200);
        const impactJson = await impactRes.json();
        expect(impactJson.target.file).toBe('lib/core/validator.js');
        expect(impactJson.directImporters).toContain('lib/services/checkout.js');

        const packRes = await fetch(`http://127.0.0.1:${port}/api/v1/pack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: tmpDir,
            cacheControl: 'anthropic',
          }),
        });
        expect(packRes.status).toBe(200);
        const packJson = await packRes.json();
        expect(packJson.cachePlan).toBeDefined();
        expect(packJson.cachePlan.provider).toBe('anthropic');
      } finally {
        api.stop();
      }
    });
  });
});
