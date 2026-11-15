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
  checkArchitectureDrift,
  createPackManifest,
  packDeltaContext,
  analyzeTaintFlows,
  findDeadSymbols,
  checkDocDrift,
  splitPrIntoAtomicGroups,
  analyzeUncoveredRisk,
  recommendModelRoute,
  classifyTaskComplexity,
  verifyPatchGrounding,
  findCircularDependencies,
  checkLicenseCompliance,
  buildSarifReport,
} from '../index.js';
import { APIServer } from '../lib/api/rest/server.js';

describe('Creative Features (C-1..C-5 & F3-1..F3-5)', () => {
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

  describe('C-3: Architecture Drift & Layer Violation Detector', () => {
    it('detects forbidden cross-layer imports from .ctxman/architecture.json and emits SARIF', () => {
      fs.mkdirSync(path.join(tmpDir, '.ctxman'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.ctxman', 'architecture.json'),
        JSON.stringify(
          {
            rules: [
              {
                id: 'NO-SERVICE-TO-CORE',
                description: 'Services must not directly import core validator in this test rule',
                from: ['lib/services/**'],
                cannotImport: ['lib/core/**'],
                severity: 'error',
              },
            ],
          },
          null,
          2
        )
      );

      const drift = checkArchitectureDrift(tmpDir);
      expect(drift.passed).toBe(false);
      expect(drift.violations.length).toBeGreaterThanOrEqual(1);
      expect(drift.violations[0].ruleId).toBe('NO-SERVICE-TO-CORE');
      expect(drift.violations[0].sourceFile).toBe('lib/services/checkout.js');
      expect(drift.violations[0].targetFile).toBe('lib/core/validator.js');

      const sarif = buildSarifReport({
        rootPath: tmpDir,
        architectureViolations: drift.violations,
      });
      expect(sarif.runs[0].results.some((r) => r.ruleId === 'ctxman/arch/NO-SERVICE-TO-CORE')).toBe(
        true
      );
    });
  });

  describe('C-4: Session Delta Pack (Multi-Turn Token Diffing)', () => {
    it('replaces unchanged files with [UNCHANGED] stubs and packs modified/added files in full', async () => {
      const initialPack = await packContext(tmpDir);
      const manifest = createPackManifest(initialPack, tmpDir);

      // Modify only lib/services/checkout.js
      fs.writeFileSync(
        path.join(tmpDir, 'lib', 'services', 'checkout.js'),
        `import { validateOrder } from '../core/validator.js';\nexport function processCheckout(order) { return validateOrder(order); }\n`
      );

      const delta = await packDeltaContext(tmpDir, manifest);
      expect(delta.summary.unchangedCount).toBeGreaterThanOrEqual(3);
      expect(delta.summary.modifiedCount).toBe(1);
      expect(delta.savedTokens).toBeGreaterThan(0);
      expect(delta.text).toContain('[UNCHANGED sha256=');
      expect(delta.text).toContain('status="modified"');
    });
  });

  describe('C-5: Sensitive Data Taint Path Tracker', () => {
    it('flags unredacted sensitive PII/secret variables flowing into console or network sinks', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'lib', 'services', 'leaky.js'),
        `export function logCustomer(req) {
  const customerTckn = req.body.tckn;
  console.log('Processing TCKN:', customerTckn);
}
`
      );

      const taint = analyzeTaintFlows(tmpDir);
      expect(taint.passed).toBe(false);
      expect(taint.flows.length).toBe(1);
      expect(taint.flows[0].file).toBe('lib/services/leaky.js');
      expect(taint.flows[0].variable).toBe('customerTckn');
      expect(taint.flows[0].sinkType).toBe('console_sink');

      const sarif = buildSarifReport({
        rootPath: tmpDir,
        taintFlows: taint.flows,
      });
      expect(
        sarif.runs[0].results.some((r) => r.ruleId === 'ctxman/taint/TAINT-UNREDACTED-SINK')
      ).toBe(true);
    });
  });

  describe('F3-1: Semantic Dead-Symbol & Orphan Export Hunter', () => {
    it('identifies unreferenced orphan modules and dead symbols in the repository graph', () => {
      const dead = findDeadSymbols(tmpDir);
      expect(dead.orphanModules.some((m) => m.file === 'lib/services/invoice.js')).toBe(true);
      expect(
        dead.deadSymbols.some(
          (s) => s.file === 'lib/services/invoice.js' && s.name === 'issueInvoice'
        )
      ).toBe(true);
    });
  });

  describe('F3-2: Multi-LLM Token & Cost Arbitrage Router', () => {
    it('classifies task complexity and recommends the most cost-effective model with cache savings', () => {
      expect(classifyTaskComplexity('fix typo in readme', 2000)).toBe('fast');
      expect(
        classifyTaskComplexity('audit security taint flow and architecture drift', 15000)
      ).toBe('reasoning');

      const route = recommendModelRoute({
        task: 'audit security taint flow and architecture drift',
        inputTokens: 20000,
        outputTokens: 1500,
        turns: 6,
        cacheableRatio: 0.8,
      });
      expect(route.taskComplexity).toBe('reasoning');
      expect(route.recommended).toBeDefined();
      expect(route.recommended.cachedSessionUsd).toBeLessThan(route.recommended.uncachedSessionUsd);
      expect(route.recommended.savingsPct).toBeGreaterThan(20);
    });
  });

  describe('F3-3: Atomic PR Splitter', () => {
    it('partitions disconnected changed files into separate reviewable sub-PR groups', () => {
      fs.mkdirSync(path.join(tmpDir, 'lib', '独立'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'lib', '独立', 'standalone.js'),
        `export function ping() { return 'pong'; }\n`
      );

      const split = splitPrIntoAtomicGroups(tmpDir, [
        'lib/core/validator.js',
        'lib/services/checkout.js',
        'test/validator.test.js',
        'lib/独立/standalone.js',
      ]);
      expect(split.groupCount).toBe(2);
      expect(split.groups.some((g) => g.files.includes('lib/独立/standalone.js'))).toBe(true);
    });
  });

  describe('F3-4: LCOV-to-AST Uncovered Risk Mapper', () => {
    it('intersects LCOV uncovered lines with AST methods to flag untested functions', () => {
      const lcov = [
        'SF:lib/core/validator.js',
        'DA:1,1',
        'DA:2,1',
        'DA:3,0',
        'DA:8,0',
        'DA:9,0',
        'end_of_record',
      ].join('\n');

      const risk = analyzeUncoveredRisk(tmpDir, lcov);
      expect(risk.riskyMethodCount).toBeGreaterThanOrEqual(2);
      expect(
        risk.riskyMethods.some(
          (m) => m.file === 'lib/core/validator.js' && m.method === 'normalizeCurrency'
        )
      ).toBe(true);
    });
  });

  describe('F3-5: ADR & Runbook Documentation Drift Checker', () => {
    it('flags markdown docs referencing modified code files or symbols when the doc was not updated', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'docs', 'ARCH.md'),
        `# Architecture\n\nOrder validation is handled by \`validateOrder\` in \`lib/core/validator.js\`.\n`
      );

      const drift = checkDocDrift(tmpDir, ['lib/core/validator.js']);
      expect(drift.passed).toBe(false);
      expect(drift.staleDocs.length).toBe(1);
      expect(drift.staleDocs[0].docFile).toBe('docs/ARCH.md');
    });
  });

  describe('F4-1: LLM Patch Grounding & Hallucination Verifier', () => {
    it('detects hallucinated relative imports and non-existent exported symbols while passing grounded patches', () => {
      const groundedPatch = [
        '+++ b/lib/services/checkout.js',
        "+import { validateOrder } from '../core/validator.js';",
        '+export function runCheckout(order) { return validateOrder(order); }',
      ].join('\n');
      const ok = verifyPatchGrounding(tmpDir, groundedPatch);
      expect(ok.grounded).toBe(true);
      expect(ok.confidenceScore).toBe(100);
      expect(ok.hallucinatedImports).toHaveLength(0);
      expect(ok.hallucinatedSymbols).toHaveLength(0);

      const badPatch = [
        '+++ b/lib/services/checkout.js',
        "+import { validateOrder, nonExistentHelper } from '../core/validator.js';",
        "+import { ghostFn } from '../core/phantom-module.js';",
        '+export function runCheckout(order) { return ghostCall(order); }',
      ].join('\n');
      const bad = verifyPatchGrounding(tmpDir, badPatch);
      expect(bad.grounded).toBe(false);
      expect(bad.hallucinatedImports.some((i) => i.specifier === '../core/phantom-module.js')).toBe(
        true
      );
      expect(bad.hallucinatedSymbols.some((s) => s.symbol === 'nonExistentHelper')).toBe(true);
      expect(bad.hallucinatedSymbols.some((s) => s.symbol === 'ghostCall')).toBe(true);
    });
  });

  describe('F4-2: Circular Dependency Unwinder (Tarjan SCC)', () => {
    it('detects import cycles and recommends the minimum-coupling edge to break each cycle', () => {
      fs.mkdirSync(path.join(tmpDir, 'lib', 'cycle'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'lib', 'cycle', 'a.js'),
        "import { stepB } from './b.js';\nexport function stepA() { return stepB(); }\n"
      );
      fs.writeFileSync(
        path.join(tmpDir, 'lib', 'cycle', 'b.js'),
        "import { stepA } from './a.js';\nexport function stepB() { return 42; }\n"
      );

      const report = findCircularDependencies(tmpDir);
      expect(report.cycleCount).toBe(1);
      expect(report.cycles[0].files).toEqual(['lib/cycle/a.js', 'lib/cycle/b.js']);
      expect(report.cycles[0].recommendedBreakEdge).toBeDefined();
      expect(report.mermaidDiagram).toContain('flowchart LR');
    });
  });

  describe('F4-5: Enterprise SBOM & License Policy Gate', () => {
    it('flags copyleft/denied licenses and passes permissive SPDX licenses', () => {
      const clean = checkLicenseCompliance(tmpDir, {
        packages: [
          { name: 'commander', version: '12.0.0', license: 'MIT' },
          { name: 'tiktoken', version: '1.0.15', license: 'MIT' },
        ],
      });
      expect(clean.compliant).toBe(true);
      expect(clean.violations).toHaveLength(0);

      const copyleft = checkLicenseCompliance(tmpDir, {
        packages: [
          { name: 'commander', version: '12.0.0', license: 'MIT' },
          { name: 'viral-lib', version: '2.1.0', license: 'AGPL-3.0-only' },
        ],
      });
      expect(copyleft.compliant).toBe(false);
      expect(copyleft.violations).toHaveLength(1);
      expect(copyleft.violations[0].package).toBe('viral-lib');
    });
  });
});
