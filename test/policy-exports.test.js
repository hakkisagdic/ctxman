import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { Scanner } from '../lib/core/Scanner.js';
import { APIServer } from '../lib/api/rest/server.js';
import GitUtils from '../lib/utils/git-utils.js';
import { loadPolicy, PolicyConfigError, PolicyViolationError } from '../lib/policy/index.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

const PROJECT = {
  'src/app.js': 'export function main() {\n  return 1;\n}\n',
  'src/config.js': `export function connect() {\n  return '${AWS_KEY}';\n}\n`,
  'secrets/db-password.txt': 'hunter2\n',
  'customer-data/clients.json': '[{"name": "Ada", "email": "ada@example.com"}]\n',
};

describe('policy enforcement on exports', () => {
  let root;
  let savedEnv;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-policy-exports-'));
    for (const [file, content] of Object.entries(PROJECT)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), content);
    }
    savedEnv = process.env.CTXMAN_POLICY;
    delete process.env.CTXMAN_POLICY;
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (savedEnv === undefined) delete process.env.CTXMAN_POLICY;
    else process.env.CTXMAN_POLICY = savedEnv;
  });

  const writePolicy = (doc) => {
    fs.mkdirSync(path.join(root, '.ctxman'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.ctxman', 'policy.json'),
      typeof doc === 'string' ? doc : JSON.stringify(doc)
    );
  };
  const basePolicy = (extra = {}) =>
    writePolicy({
      version: 1,
      deny: ['secrets/**', 'customer-data/'],
      audit: { enabled: true },
      ...extra,
    });
  const auditLog = () => {
    const file = path.join(root, '.ctxman', 'audit.log');
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  };
  const posix = (file) => file.split(path.sep).join('/');

  describe('Scanner', () => {
    const scan = (options) => new Scanner(root, options);

    it('loads the project policy and drops denied files', () => {
      basePolicy();
      const scanner = scan();

      const files = scanner.scan().map((f) => posix(f.relativePath));

      expect(files).toContain('src/app.js');
      expect(files).not.toContain('secrets/db-password.txt');
      expect(files).not.toContain('customer-data/clients.json');
      expect(scanner.getStats().filesDenied).toBe(2);
    });

    it('never lists the audit log itself', () => {
      basePolicy();
      fs.writeFileSync(path.join(root, '.ctxman', 'audit.log'), '{}\n');

      const files = scan()
        .scan()
        .map((f) => posix(f.relativePath));

      expect(files).not.toContain('.ctxman/audit.log');
    });

    it('applies an organisation policy from CTXMAN_POLICY', () => {
      const org = path.join(root, 'org-policy.json');
      fs.writeFileSync(org, JSON.stringify({ version: 1, deny: ['**/clients.json'] }));

      const files = scan({ env: { CTXMAN_POLICY: org } })
        .scan()
        .map((f) => posix(f.relativePath));

      expect(files).not.toContain('customer-data/clients.json');
      expect(files).toContain('secrets/db-password.txt');
    });

    it('is unchanged without a policy, or with policy: false', () => {
      const all = scan().scan();
      expect(all.map((f) => posix(f.relativePath))).toContain('secrets/db-password.txt');

      basePolicy();
      const scanner = scan({ policy: false });
      expect(scanner.scan()).toHaveLength(all.length + 1); // + .ctxman/policy.json
      expect(scanner.getStats().filesDenied).toBe(0);
    });

    it('fails on an invalid policy instead of scanning without it', () => {
      writePolicy({ version: 1, deny: 'secrets/**' });

      expect(() => scan().scan()).toThrow(PolicyConfigError);
    });
  });

  describe('ctxman --cli', () => {
    const cli = (args, extraEnv = {}) => {
      const env = { ...process.env, HOME: root, USERPROFILE: root, ...extraEnv };
      if (!('CTXMAN_POLICY' in extraEnv)) delete env.CTXMAN_POLICY;
      return spawnSync(process.execPath, [CLI, '--cli', '--simple', ...args], {
        cwd: root,
        encoding: 'utf8',
        env,
      });
    };

    it('leaves exports alone without a policy', () => {
      const result = cli(['--context-export']);

      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('Export policy');
      expect(fs.readFileSync(path.join(root, 'llm-context.json'), 'utf8')).toContain(
        'db-password.txt'
      );
      expect(fs.existsSync(path.join(root, '.ctxman', 'audit.log'))).toBe(false);
    });

    it('removes denied files, says how many without naming them, and logs the export', () => {
      basePolicy();

      const result = cli(['--context-export', '--verbose']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Export policy: .ctxman/policy.json');
      expect(result.stdout).toContain('Removed 2 files denied by the export policy');
      expect(result.stdout).not.toContain('db-password');
      expect(result.stdout).not.toContain('clients.json');

      const contextFile = path.join(root, 'llm-context.json');
      const context = fs.readFileSync(contextFile, 'utf8');
      expect(context).not.toContain('db-password');
      expect(context).toContain('app.js');

      const [event] = auditLog();
      expect(event).toMatchObject({
        outcome: 'exported',
        command: 'cli --context-export',
        root,
        destination: contextFile,
        format: 'json',
        removedByPolicy: 2,
        sha256: sha256(context),
      });
      expect(event.files).toContain('src/app.js');
      expect(event.files).not.toContain('secrets/db-password.txt');
    });

    it('applies the organisation policy named by CTXMAN_POLICY', () => {
      const org = path.join(os.tmpdir(), `ctxman-org-${process.pid}-${Date.now()}.json`);
      fs.writeFileSync(org, JSON.stringify({ version: 1, deny: ['src/config.js'] }));
      try {
        const result = cli(['--context-export'], { CTXMAN_POLICY: org });

        expect(result.status).toBe(0);
        expect(result.stdout).toContain(`Export policy: ${org}`);
        expect(fs.readFileSync(path.join(root, 'llm-context.json'), 'utf8')).not.toContain(
          'config.js'
        );
      } finally {
        fs.rmSync(org, { force: true });
      }
    });

    it('writes a redacted digest without denied files and logs its hash', () => {
      basePolicy({ requireRedaction: true });

      const result = cli(['--gitingest']);

      expect(result.status).toBe(0);
      const digest = fs.readFileSync(path.join(root, 'digest.txt'), 'utf8');
      expect(digest).not.toContain('hunter2');
      expect(digest).not.toContain('ada@example.com');
      expect(digest).not.toContain(AWS_KEY);
      expect(digest).toContain('[REDACTED:aws-access-key-id]');

      const [event] = auditLog();
      expect(event).toMatchObject({
        command: 'cli --gitingest',
        format: 'gitingest',
        redactions: 1,
        sha256: sha256(digest),
      });
      expect(JSON.stringify(event)).not.toContain('hunter2');
    });

    it('refuses --no-redact under requireRedaction with exit code 3 and writes nothing', () => {
      basePolicy({ requireRedaction: true });

      const result = cli(['--gitingest', '--no-redact']);

      expect(result.status).toBe(3);
      expect(result.stderr).toContain('Export refused by the ctxman policy');
      expect(result.stderr).toContain('--no-redact is refused');
      expect(fs.existsSync(path.join(root, 'digest.txt'))).toBe(false);
      const [event] = auditLog();
      expect(event).toMatchObject({ outcome: 'refused', command: 'cli --gitingest', sha256: null });
      expect(event.violations[0].rule).toBe('requireRedaction');
    });

    it('fails exports above maxExportTokens', () => {
      basePolicy({ maxExportTokens: 5 });

      const result = cli(['--context-export', '--save-report']);

      expect(result.status).toBe(3);
      expect(result.stderr).toContain('over the limit of 5');
      expect(fs.existsSync(path.join(root, 'llm-context.json'))).toBe(false);
      expect(fs.existsSync(path.join(root, 'token-analysis-report.json'))).toBe(false);
      expect(auditLog()[0].command).toBe('cli --context-export --save-report');
    });

    it('allows only the target models the policy lists', () => {
      basePolicy({ allowedTargetModels: ['claude-*'] });

      const refused = cli(['--context-export', '--target-model', 'gpt-4o']);
      expect(refused.status).toBe(3);
      expect(refused.stderr).toContain('target model "gpt-4o" is not allowed (allowed: claude-*)');

      const allowed = cli(['--context-export', '--target-model', 'claude-sonnet-4.5']);
      expect(allowed.status).toBe(0);
      expect(auditLog().map((e) => [e.outcome, e.targetModel])).toEqual([
        ['refused', 'gpt-4o'],
        ['exported', 'claude-sonnet-4.5'],
      ]);
    });

    it('masks secrets in method source of a report when redaction is required', () => {
      basePolicy({ requireRedaction: true });

      const result = cli(['--save-report', '--method-level']);

      expect(result.status).toBe(0);
      const report = fs.readFileSync(path.join(root, 'token-analysis-report.json'), 'utf8');
      expect(report).toContain('[REDACTED:aws-access-key-id]');
      expect(report).not.toContain(AWS_KEY);
      expect(report).not.toContain('db-password');
      expect(auditLog()[0]).toMatchObject({ command: 'cli --save-report', redactions: 1 });
    });

    it('applies the policy to a digest built from an older report', () => {
      expect(cli(['--save-report']).status).toBe(0);
      basePolicy();

      const result = spawnSync(process.execPath, [CLI, '--gitingest-from-report'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, HOME: root, CTXMAN_POLICY: '' },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Removed 2 file(s) denied by the export policy');
      const digest = fs.readFileSync(path.join(root, 'digest.txt'), 'utf8');
      expect(digest).not.toContain('hunter2');
      expect(auditLog()[0].command).toBe('cli --gitingest-from-report');
    });

    it('stops with exit code 2 on an invalid policy, naming file and field', () => {
      writePolicy({ version: 1, maxExportTokens: 'unlimited' });

      const result = cli(['--context-export']);

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(path.join(root, '.ctxman', 'policy.json'));
      expect(result.stderr).toContain('"maxExportTokens"');
      expect(fs.existsSync(path.join(root, 'llm-context.json'))).toBe(false);
    });
  });

  describe('ctxman github digest', () => {
    // The "clone" is the temp project itself, kept after the run
    const generate = (outputFile) => {
      const utils = new GitUtils({ outputDir: root });
      vi.spyOn(utils, 'cloneRepository').mockReturnValue(root);
      return utils.generateFromGitHub('owner/repo', {
        outputFile,
        cleanup: false,
        policy: loadPolicy(root, { env: {} }),
      });
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('leaves denied files out of the digest and logs it', async () => {
      basePolicy();
      const outputFile = path.join(root, 'out', 'digest.txt');

      await generate(outputFile);

      const digest = fs.readFileSync(outputFile, 'utf8');
      expect(digest).not.toContain('hunter2');
      expect(digest).toContain('app.js');
      expect(auditLog()[0]).toMatchObject({
        command: 'github',
        root: 'https://github.com/owner/repo',
        destination: outputFile,
        removedByPolicy: 2,
        sha256: sha256(digest),
      });
    });

    it('refuses a digest the policy does not allow', async () => {
      basePolicy({ maxExportTokens: 1 });
      const outputFile = path.join(root, 'out', 'digest.txt');

      await expect(generate(outputFile)).rejects.toThrow(PolicyViolationError);

      expect(fs.existsSync(outputFile)).toBe(false);
      expect(auditLog()[0]).toMatchObject({ command: 'github', outcome: 'refused' });
    });
  });

  describe('REST POST /api/v1/context', () => {
    const post = (body) =>
      request((req, res) => new APIServer().handleRequest(req, res))
        .post('/api/v1/context')
        .send({ path: root, ...body });

    it('is unchanged without a policy', async () => {
      const response = await post({});

      expect(response.status).toBe(200);
      expect(response.body.metadata).not.toHaveProperty('removedByPolicy');
      expect(JSON.stringify(response.body.files)).toContain('db-password.txt');
    });

    it('drops denied files and logs the response hash', async () => {
      basePolicy();

      const response = await post({});

      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body.files)).not.toContain('db-password');
      expect(response.body.metadata.removedByPolicy).toBe(2);
      const [event] = auditLog();
      expect(event).toMatchObject({
        command: 'rest POST /api/v1/context',
        destination: 'rest',
        removedByPolicy: 2,
        sha256: sha256(response.text),
      });
    });

    it('answers 403 with the violations when the policy refuses the export', async () => {
      basePolicy({ maxExportTokens: 1, allowedTargetModels: ['claude-*'] });

      const response = await post({ targetModel: 'gpt-4o' });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        statusCode: 403,
        error: expect.stringContaining('Export refused by the ctxman policy'),
      });
      expect(response.body.violations.map((v) => v.rule)).toEqual([
        'maxExportTokens',
        'allowedTargetModels',
      ]);
      expect(auditLog()[0]).toMatchObject({ outcome: 'refused', destination: 'rest' });
    });

    it('answers 500 naming the field when the policy file is invalid', async () => {
      writePolicy({ version: 1, audit: { path: '../outside.log' } });

      const response = await post({});

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('"audit.path" must stay inside the project root');
    });
  });
});
