import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { buildSarifReport, SARIF_SCHEMA, SARIF_VERSION } from '../lib/policy/index.js';
import { APIServer } from '../lib/api/rest/server.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

function httpJson(port, reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, method: 'GET', path: reqPath },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(data) }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('P2-1: Standard SARIF v2.1.0 report output for CI/CD policy & PR gates', () => {
  let tmpDir;
  let server;
  let port;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-sarif-test-'));
    server = new APIServer({ port: 0, host: '127.0.0.1' });
    server.start();
    await new Promise((resolve) => server.server.once('listening', resolve));
    port = server.server.address().port;
  });

  afterAll(async () => {
    if (server?.server) await new Promise((resolve) => server.server.close(resolve));
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('converts policy errors, runtime violations, secret/PII findings, and PR ruleViolations to SARIF v2.1.0', () => {
    const report = buildSarifReport({
      rootPath: '/repo',
      policyResult: {
        valid: false,
        file: '/repo/.ctxman/policy.json',
        errors: ['maxExportTokens must be a positive integer'],
      },
      policyViolations: [
        {
          type: 'max-export-tokens',
          file: '/repo/src/index.js',
          line: 10,
          message: 'Export exceeds maxExportTokens (12000 > 8000)',
        },
      ],
      secretFindings: {
        'kvkk-tckn': 2,
        'bddk-tr-iban': 1,
      },
      ruleViolations: [
        {
          ruleId: 'no-console-in-billing',
          severity: 'error',
          type: 'forbidPattern',
          file: 'lib/billing/index.js',
          line: 42,
          message: 'Forbidden pattern "console.log" in billing module',
        },
      ],
    });

    expect(report.$schema).toBe(SARIF_SCHEMA);
    expect(report.version).toBe(SARIF_VERSION);
    expect(report.runs).toHaveLength(1);

    const run = report.runs[0];
    expect(run.tool.driver.name).toBe('ctxman');
    expect(run.tool.driver.rules.length).toBeGreaterThanOrEqual(5);
    expect(run.results).toHaveLength(5);

    const ruleIds = run.results.map((r) => r.ruleId);
    expect(ruleIds).toContain('ctxman/policy-config-invalid');
    expect(ruleIds).toContain('ctxman/policy-max-export-tokens');
    expect(ruleIds).toContain('ctxman/redaction-kvkk-tckn');
    expect(ruleIds).toContain('ctxman/redaction-bddk-tr-iban');
    expect(ruleIds).toContain('ctxman/pr-rule/no-console-in-billing');
  });

  it('outputs valid SARIF v2.1.0 via ctxman policy check --format sarif and GET /api/v1/policy?format=sarif', async () => {
    // 1. Initialize valid kvkk-bddk policy
    const initRes = spawnSync(process.execPath, [CLI, 'policy', 'init', '--preset', 'kvkk-bddk'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });
    expect(initRes.status).toBe(0);

    const validCli = spawnSync(process.execPath, [CLI, 'policy', 'check', '--format', 'sarif'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });
    expect(validCli.status).toBe(0);
    const validSarif = JSON.parse(validCli.stdout);
    expect(validSarif.version).toBe('2.1.0');
    expect(validSarif.runs[0].results).toEqual([]);
    expect(validSarif.runs[0].properties.valid).toBe(true);
    expect(validSarif.runs[0].properties.compliancePreset).toBe('kvkk-bddk');

    const validRest = await httpJson(
      port,
      `/api/v1/policy?path=${encodeURIComponent(tmpDir)}&format=sarif`
    );
    expect(validRest.status).toBe(200);
    expect(validRest.json.version).toBe('2.1.0');
    expect(validRest.json.runs[0].results).toEqual([]);

    // 2. Write an invalid policy and verify SARIF error results
    fs.writeFileSync(
      path.join(tmpDir, '.ctxman', 'policy.json'),
      JSON.stringify({ version: 99, maxExportTokens: -5 })
    );

    const invalidCli = spawnSync(process.execPath, [CLI, 'policy', 'check', '--format', 'sarif'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });
    expect(invalidCli.status).not.toBe(0);
    const invalidSarif = JSON.parse(invalidCli.stdout);
    expect(invalidSarif.version).toBe('2.1.0');
    expect(invalidSarif.runs[0].results.length).toBeGreaterThanOrEqual(1);
    expect(invalidSarif.runs[0].results[0].ruleId).toBe('ctxman/policy-config-invalid');

    const invalidRest = await httpJson(
      port,
      `/api/v1/policy?path=${encodeURIComponent(tmpDir)}&format=sarif`
    );
    expect(invalidRest.status).toBe(200);
    expect(invalidRest.json.version).toBe('2.1.0');
    expect(invalidRest.json.runs[0].results.length).toBeGreaterThanOrEqual(1);
  });
});
