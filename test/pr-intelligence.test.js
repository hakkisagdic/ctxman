import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { buildPrContext } from '../lib/pr/pr-context.js';
import {
  analyzePrIntelligence,
  evaluatePrRules,
  calculatePrRiskAndConfidence,
  buildPrMermaidDiagram,
} from '../lib/pr/pr-intelligence.js';
import { createPrRepo } from './fixtures/pr-repo.js';

describe('P1-2: PR review risk/confidence score, scoped rules & Mermaid flowchart', () => {
  let repo;

  beforeAll(() => {
    repo = createPrRepo();
  });

  afterAll(() => {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  });

  it('computes deterministic riskScore (0-100), confidenceScore (1-5), riskFactors, and mermaidDiagram in buildPrContext', async () => {
    const mdResult = await buildPrContext(repo.dir, { base: 'main', head: 'feature' });

    expect(mdResult.riskScore).toBeGreaterThanOrEqual(0);
    expect(mdResult.riskScore).toBeLessThanOrEqual(100);
    expect(mdResult.confidenceScore).toBeGreaterThanOrEqual(1);
    expect(mdResult.confidenceScore).toBeLessThanOrEqual(5);
    expect(Array.isArray(mdResult.riskFactors)).toBe(true);
    expect(mdResult.riskFactors.length).toBeGreaterThan(0);

    // Mermaid diagram is returned and embedded in Markdown output
    expect(mdResult.mermaidDiagram).toContain('flowchart LR');
    expect(mdResult.mermaidDiagram).toContain('src/calc.js');
    expect(mdResult.mermaidDiagram).toContain('add()');
    expect(mdResult.output).toContain('```mermaid\nflowchart LR');
    expect(mdResult.output).toContain(
      `- Risk & confidence: risk ${mdResult.riskScore}/100, confidence ${mdResult.confidenceScore}/5`
    );

    // XML output includes <mermaid_diagram>
    const xmlResult = await buildPrContext(repo.dir, {
      base: 'main',
      head: 'feature',
      style: 'xml',
    });
    expect(xmlResult.output).toContain('<mermaid_diagram>\nflowchart LR');

    // JSON output includes riskScore, confidenceScore, riskFactors, ruleViolations, mermaidDiagram
    const jsonResult = await buildPrContext(repo.dir, {
      base: 'main',
      head: 'feature',
      style: 'json',
    });
    const parsed = JSON.parse(jsonResult.output);
    expect(parsed.summary.riskScore).toBe(mdResult.riskScore);
    expect(parsed.summary.confidenceScore).toBe(mdResult.confidenceScore);
    expect(parsed.summary.mermaidDiagram).toContain('flowchart LR');
    expect(Array.isArray(parsed.summary.ruleViolations)).toBe(true);
  });

  it('evaluates .ctxman/rules.json and options.rules (pathPattern, forbidPattern, requireTest, maxFileAdditions)', async () => {
    const rulesDir = path.join(repo.dir, '.ctxman');
    fs.mkdirSync(rulesDir, { recursive: true });
    const rulesFile = path.join(rulesDir, 'rules.json');
    fs.writeFileSync(
      rulesFile,
      JSON.stringify(
        {
          rules: [
            {
              id: 'no-typeerror-in-calc',
              severity: 'error',
              pathPattern: 'src/*.js',
              forbidPattern: 'TypeError',
              requireTest: true,
              maxFileAdditions: 2,
            },
          ],
        },
        null,
        2
      )
    );

    try {
      const res = await buildPrContext(repo.dir, { base: 'main', head: 'feature' });

      expect(res.ruleViolations.length).toBeGreaterThanOrEqual(3);
      const types = res.ruleViolations.map((v) => v.type);
      expect(types).toContain('forbidPattern');
      expect(types).toContain('maxFileAdditions');
      expect(types).toContain('requireTest');
      expect(res.output).toContain('- Rule violations:');
    } finally {
      fs.rmSync(rulesDir, { recursive: true, force: true });
    }
  });

  it('assigns higher riskScore and lower confidenceScore for sensitive paths and missing tests', () => {
    const lowRisk = calculatePrRiskAndConfidence({
      files: [
        { status: 'M', path: 'src/util.js', additions: 4, deletions: 1 },
        { status: 'M', path: 'test/util.test.js', additions: 6, deletions: 0 },
      ],
      methods: [{ file: 'src/util.js', name: 'formatText', change: 'modified' }],
      deletedMethods: [],
      tests: [{ path: 'test/util.test.js', changed: true, reasons: ['imports src/util.js'] }],
      stats: { additions: 10, deletions: 1 },
      ruleViolations: [],
    });

    const highRisk = calculatePrRiskAndConfidence({
      files: [
        { status: 'M', path: 'lib/auth/token.js', additions: 320, deletions: 90 },
        { status: 'M', path: 'lib/billing/invoice.js', additions: 210, deletions: 40 },
      ],
      methods: [
        { file: 'lib/auth/token.js', name: 'verifyJwt', change: 'modified' },
        { file: 'lib/billing/invoice.js', name: 'chargeCustomer', change: 'modified' },
      ],
      deletedMethods: [{ file: 'lib/auth/token.js', name: 'verifyLegacySession' }],
      tests: [],
      stats: { additions: 530, deletions: 130 },
      ruleViolations: [
        {
          ruleId: 'auth-require-test',
          severity: 'error',
          type: 'requireTest',
          file: 'lib/auth/token.js',
        },
      ],
    });

    expect(lowRisk.riskScore).toBeLessThan(20);
    expect(lowRisk.confidenceScore).toBeGreaterThanOrEqual(4);

    expect(highRisk.riskScore).toBeGreaterThanOrEqual(75);
    expect(highRisk.confidenceScore).toBeLessThanOrEqual(2);
    expect(highRisk.riskFactors.join(' | ')).toContain('Sensitive module(s) touched');
  });
});
