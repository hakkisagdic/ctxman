import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { redactSecrets, formatRedactionSummary } from '../lib/utils/secret-redactor.js';
import GitIngestFormatter from '../lib/formatters/gitingest-formatter.js';

// Fake credentials are assembled at runtime so no literal token sits in the repo
const fake = {
  aws: 'AKIA' + 'Q3EXAMPLE7KEY2ID',
  github: 'ghp_' + 'a1B2c3D4e5'.repeat(4).slice(0, 36),
  githubPat: 'github_pat_' + '11ABCDEFG0'.repeat(3),
  gitlab: 'glpat-' + 'x'.repeat(20),
  slack: 'xoxb-' + '1234567890-abcdefghij',
  stripe: 'sk_' + 'live_' + 'Z'.repeat(24),
  google: 'AIza' + 'S'.repeat(35),
  anthropic: 'sk-' + 'ant-api03-' + 'q'.repeat(40),
  openai: 'sk-' + 'proj-' + 'A'.repeat(24) + 'T3Blbk' + 'FJ' + 'B'.repeat(24),
  npm: 'npm_' + 'N'.repeat(36),
  privateKey: [
    '-----BEGIN ' + 'RSA PRIVATE KEY-----',
    'MIIEowIBAAKCAQEAx9b',
    '-----END ' + 'RSA PRIVATE KEY-----',
  ].join('\n'),
};

describe('redactSecrets', () => {
  it.each([
    ['aws-access-key-id', fake.aws],
    ['github-token', fake.github],
    ['github-token', fake.githubPat],
    ['gitlab-token', fake.gitlab],
    ['slack-token', fake.slack],
    ['stripe-secret-key', fake.stripe],
    ['google-api-key', fake.google],
    ['anthropic-api-key', fake.anthropic],
    ['openai-api-key', fake.openai],
    ['npm-token', fake.npm],
    ['private-key', fake.privateKey],
  ])('masks a %s', (type, secret) => {
    const source = `const value = "${secret}";\n`;

    const { text, findings } = redactSecrets(source);

    expect(text).toBe(`const value = "[REDACTED:${type}]";\n`);
    expect(findings).toEqual([type]);
  });

  it('leaves ordinary code untouched', () => {
    const source = [
      'const apiKey = process.env.OPENAI_API_KEY; // sk-your-key-here',
      "const region = 'AKIA'; const prefix = 'ghp_';",
      'const pem = "-----BEGIN PUBLIC KEY-----";',
      'function skip_live_tests() { return true; }',
    ].join('\n');

    expect(redactSecrets(source)).toEqual({ text: source, findings: [] });
  });

  it('counts every match', () => {
    const { findings } = redactSecrets(`${fake.aws}\n${fake.aws}\n${fake.github}`);

    expect(findings).toEqual(['aws-access-key-id', 'aws-access-key-id', 'github-token']);
  });

  it('formats a summary of counts', () => {
    expect(formatRedactionSummary({ 'aws-access-key-id': 2, 'private-key': 1 })).toBe(
      '2 aws-access-key-id, 1 private-key'
    );
  });
});

describe('GitIngestFormatter secret redaction', () => {
  let tempDir;
  let analysisResults;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-redact-'));
    const filePath = path.join(tempDir, 'config.js');
    fs.writeFileSync(filePath, `export const awsKey = '${fake.aws}';\n`);
    analysisResults = [{ path: filePath, relativePath: 'config.js', tokens: 12, lines: 1 }];
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const stats = { totalFiles: 1, totalTokens: 12, totalBytes: 40, totalLines: 1 };

  it('masks secrets in file contents by default and records them', () => {
    const formatter = new GitIngestFormatter(tempDir, stats, analysisResults);

    const digest = formatter.generateDigest();

    expect(digest).toContain("export const awsKey = '[REDACTED:aws-access-key-id]';");
    expect(digest).not.toContain(fake.aws);
    expect(formatter.redactions).toEqual({ 'aws-access-key-id': 1 });
  });

  it('keeps contents unchanged with redactSecrets: false', () => {
    const formatter = new GitIngestFormatter(tempDir, stats, analysisResults, {
      redactSecrets: false,
    });

    expect(formatter.generateDigest()).toContain(fake.aws);
    expect(formatter.redactions).toEqual({});
  });

  it('masks secrets in chunked digests too', () => {
    const formatter = new GitIngestFormatter(tempDir, stats, analysisResults, {
      chunking: { enabled: true, maxTokensPerChunk: 1000 },
    });

    const chunks = formatter.generateDigest();
    const content = chunks.map((chunk) => chunk.content).join('\n');

    expect(content).toContain('[REDACTED:aws-access-key-id]');
    expect(content).not.toContain(fake.aws);
  });
});
