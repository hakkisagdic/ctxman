import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'vitest';
import {
  redactSecrets,
  redactPII,
  isValidTCKN,
  isValidLuhn,
} from '../lib/utils/secret-redactor.js';
import { createPolicyTemplate, loadPolicy, POLICY_FILE } from '../lib/policy/index.js';
import { packContext } from '../lib/pack/index.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-kvkk-'));
}

describe('P0-2: KVKK / BDDK PII Redaction & kvkk-bddk Policy Preset', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates Turkish TCKN with official mod-10/mod-11 checksum and rejects random 11-digit numbers', () => {
    assert.equal(isValidTCKN('10000000146'), true);
    assert.equal(isValidTCKN('11111111110'), true);
    // Leading zero is never valid
    assert.equal(isValidTCKN('00000000146'), false);
    // Random 11-digit number / timestamp is rejected (prevents false positives in code)
    assert.equal(isValidTCKN('17000000000'), false);
    assert.equal(isValidTCKN('12345678901'), false);
  });

  it('validates credit card numbers with Luhn checksum and rejects non-Luhn numbers', () => {
    assert.equal(isValidLuhn('4532 0151 1283 0366'), true);
    assert.equal(isValidLuhn('5549600000000004'), true);
    assert.equal(isValidLuhn('4532 0151 1283 0367'), false);
    assert.equal(isValidLuhn('0000000000000000'), false);
  });

  it('redacts TCKN, TR IBAN, Credit Card, Email, and TR Phone when redactPII is enabled', () => {
    const sample = [
      'const tckn = "10000000146";',
      'const timestamp = 17000000000;',
      'const iban = "TR33 0006 1005 1978 6457 8413 26";',
      'const card = "4532 0151 1283 0366";',
      'const phone = "+90 (532) 123 45 67";',
      'const email = "musteri@banka.com.tr";',
    ].join('\n');

    // Default redactSecrets(sample) without redactPII leaves PII untouched
    const withoutPII = redactSecrets(sample);
    assert.equal(withoutPII.findings.length, 0);
    assert.ok(withoutPII.text.includes('10000000146'));

    // With redactPII: true, all 5 regulated PII types are masked while timestamp stays intact
    const withPII = redactSecrets(sample, { redactPII: true });
    assert.ok(withPII.text.includes('[REDACTED:TCKN]'));
    assert.ok(withPII.text.includes('17000000000'));
    assert.ok(withPII.text.includes('[REDACTED:TR_IBAN]'));
    assert.ok(withPII.text.includes('[REDACTED:CREDIT_CARD]'));
    assert.ok(withPII.text.includes('[REDACTED:TR_PHONE]'));
    assert.ok(withPII.text.includes('[REDACTED:EMAIL]'));
    assert.deepEqual(withPII.findings.sort(), [
      'CREDIT_CARD',
      'EMAIL',
      'TCKN',
      'TR_IBAN',
      'TR_PHONE',
    ]);

    const direct = redactPII(sample);
    assert.equal(direct.findings.length, 5);
  });

  it('supports createPolicyTemplate("kvkk-bddk"), CLI policy init --preset kvkk-bddk, and automatic PII redaction in packContext', async () => {
    const template = createPolicyTemplate('kvkk-bddk');
    assert.equal(template.compliancePreset, 'kvkk-bddk');
    assert.equal(template.requireRedaction, true);
    assert.equal(template.redactPII, true);

    // Run `ctxman policy init --preset kvkk-bddk` in tmpDir
    const cliPath = path.resolve(process.cwd(), 'bin/cm-policy.js');
    execFileSync(process.execPath, [cliPath, 'init', '--preset', 'kvkk-bddk'], {
      cwd: tmpDir,
      stdio: 'pipe',
    });

    const policyFile = path.join(tmpDir, POLICY_FILE);
    assert.equal(fs.existsSync(policyFile), true);

    const loaded = loadPolicy(tmpDir);
    assert.equal(loaded.active, true);
    assert.equal(loaded.compliancePreset, 'kvkk-bddk');
    assert.equal(loaded.requireRedaction, true);
    assert.equal(loaded.redactPII, true);

    // Create a source file containing a valid TCKN and TR IBAN
    fs.writeFileSync(
      path.join(tmpDir, 'customer-service.js'),
      'export const testCustomer = { tckn: "10000000146", iban: "TR330006100519786457841326" };\n'
    );

    // packContext automatically honours policy.redactPII from .ctxman/policy.json
    const packed = await packContext(tmpDir, { style: 'plain' });
    assert.ok(packed.text.includes('[REDACTED:TCKN]'));
    assert.ok(packed.text.includes('[REDACTED:TR_IBAN]'));
    assert.ok(!packed.text.includes('10000000146'));
    assert.equal(packed.redactions.byType.TCKN, 1);
    assert.equal(packed.redactions.byType.TR_IBAN, 1);
  });
});
