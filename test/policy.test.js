import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadPolicy,
  enforceExport,
  recordExport,
  validatePolicyDocument,
  createStarterPolicy,
  modelGlobToRegex,
  Policy,
  PolicyConfigError,
  PolicyViolationError,
  POLICY_VIOLATION_EXIT_CODE,
} from '../lib/policy/index.js';

describe('export policy', () => {
  let root;
  let orgDir;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-policy-'));
    orgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-policy-org-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(orgDir, { recursive: true, force: true });
  });

  const writeProjectPolicy = (doc) => {
    fs.mkdirSync(path.join(root, '.ctxman'), { recursive: true });
    const file = path.join(root, '.ctxman', 'policy.json');
    fs.writeFileSync(file, typeof doc === 'string' ? doc : JSON.stringify(doc));
    return file;
  };
  const writeOrgPolicy = (doc) => {
    const file = path.join(orgDir, 'org-policy.json');
    fs.writeFileSync(file, JSON.stringify(doc));
    return file;
  };
  const load = (env = {}) => loadPolicy(root, { env });
  const configError = (fn) => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyConfigError);
      return error;
    }
    throw new Error('expected a PolicyConfigError');
  };
  const violation = (fn) => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyViolationError);
      return error;
    }
    throw new Error('expected a PolicyViolationError');
  };

  describe('loading', () => {
    it('is permissive when there is no policy file and no CTXMAN_POLICY', () => {
      const policy = load();

      expect(policy.active).toBe(false);
      expect(policy.isDenied('secrets/key.pem')).toBe(false);
      expect(policy.isModelAllowed('anything')).toBe(true);
      expect(() =>
        enforceExport(policy, { files: ['a.js'], tokens: 1e9, redact: false, targetModel: 'x' })
      ).not.toThrow();
      expect(recordExport(policy, { command: 'test', files: ['a.js'] })).toBeNull();
      expect(fs.existsSync(path.join(root, '.ctxman'))).toBe(false);
    });

    it('normalizes the project policy', () => {
      const file = writeProjectPolicy({
        version: 1,
        deny: ['secrets/**', ' **/*.pem '],
        requireRedaction: true,
        maxExportTokens: 200000,
        allowedTargetModels: ['claude-*', 'gpt-5*'],
        ignoreFiles: ['.cursorignore', '.aiexclude', '.cursorignore'],
        audit: { enabled: true },
      });

      const policy = load();

      expect(policy.active).toBe(true);
      expect(policy.sources).toEqual([{ scope: 'project', file }]);
      expect(policy.toJSON()).toMatchObject({
        deny: [{ scope: 'project', patterns: ['secrets/**', '**/*.pem'] }],
        requireRedaction: true,
        maxExportTokens: 200000,
        allowedTargetModels: [{ scope: 'project', patterns: ['claude-*', 'gpt-5*'] }],
        ignoreFiles: ['.cursorignore', '.aiexclude'],
        audit: { enabled: true, paths: [path.join(root, '.ctxman', 'audit.log')] },
      });
    });

    it('ignores free-form "$" keys such as $comment', () => {
      writeProjectPolicy({ $comment: 'see the docs', $schema: 'x', version: 1 });

      expect(load().active).toBe(true);
    });

    it('expands "all" in ignoreFiles to every known file', () => {
      writeProjectPolicy({ version: 1, ignoreFiles: ['all'] });

      const { ignoreFiles } = load();
      expect(ignoreFiles).toContain('.cursorignore');
      expect(ignoreFiles).toContain('.aiexclude');
      expect(ignoreFiles).toContain('.aiderignore');
    });

    it('accepts the starter policy written by `ctxman policy init`', () => {
      expect(() =>
        validatePolicyDocument(createStarterPolicy(), { file: 'x', scope: 'project', root })
      ).not.toThrow();
    });
  });

  describe('validation', () => {
    it('names the file and the field', () => {
      const file = writeProjectPolicy({ version: 1, maxExportTokens: 'lots' });

      const error = configError(load);

      expect(error.file).toBe(file);
      expect(error.field).toBe('maxExportTokens');
      expect(error.message).toContain(file);
      expect(error.message).toContain('"maxExportTokens" must be a positive integer or null');
      expect(error.exitCode).toBe(2);
    });

    it('reports every problem of a file at once', () => {
      writeProjectPolicy({ version: 2, deny: 'secrets/**', denny: [], requireRedaction: 'yes' });

      const error = configError(load);

      expect(error.errors.map((e) => e.field).sort()).toEqual([
        'denny',
        'deny',
        'requireRedaction',
        'version',
      ]);
    });

    it.each([
      [{}, 'version', 'is required'],
      [{ version: 1, deny: ['ok', 3] }, 'deny[1]', 'must be a non-empty string'],
      [{ version: 1, deny: ['../outside/**'] }, 'deny[0]', 'must not contain ".."'],
      [{ version: 1, deny: ['!'] }, 'deny[0]', 'is not a usable pattern'],
      [{ version: 1, maxExportTokens: -5 }, 'maxExportTokens', 'positive integer'],
      [{ version: 1, maxExportTokens: 1.5 }, 'maxExportTokens', 'positive integer'],
      [{ version: 1, allowedTargetModels: [] }, 'allowedTargetModels', 'at least one'],
      [{ version: 1, allowedTargetModels: 'claude-*' }, 'allowedTargetModels', 'array'],
      [{ version: 1, ignoreFiles: ['../.cursorignore'] }, 'ignoreFiles[0]', 'file name'],
      [{ version: 1, audit: true }, 'audit', 'must be an object'],
      [{ version: 1, audit: { enabled: 'yes' } }, 'audit.enabled', 'true or false'],
      [{ version: 1, audit: { file: 'x' } }, 'audit.file', 'not an audit field'],
      [{ version: 1, audit: { path: '../audit.log' } }, 'audit.path', 'inside the project'],
      [{ version: 1, audit: { path: '/var/log/a.log' } }, 'audit.path', 'must be relative'],
    ])('rejects %j (%s)', (doc, field, message) => {
      writeProjectPolicy(doc);

      const error = configError(load);

      expect(error.errors.map((e) => e.field)).toContain(field);
      expect(error.message).toContain(message);
    });

    it('rejects a file that is not JSON or not an object', () => {
      writeProjectPolicy('{ "version": 1, }');
      expect(configError(load).message).toContain('is not valid JSON');

      writeProjectPolicy('[1]');
      expect(configError(load).message).toContain('must contain a JSON object');
    });

    it('fails when CTXMAN_POLICY names a missing file', () => {
      const missing = path.join(orgDir, 'nope.json');

      const error = configError(() => load({ CTXMAN_POLICY: missing }));

      expect(error.file).toBe(missing);
      expect(error.message).toContain('CTXMAN_POLICY');
    });

    it('lets only the organisation policy use an absolute audit path', () => {
      const logFile = path.join(orgDir, 'central', 'audit.log');
      const org = writeOrgPolicy({ version: 1, audit: { path: logFile } });

      expect(load({ CTXMAN_POLICY: org }).audit.paths).toEqual([logFile]);
    });
  });

  describe('organisation and project policies', () => {
    it('combines them, the stricter value winning', () => {
      const org = writeOrgPolicy({
        version: 1,
        deny: ['secrets/**'],
        maxExportTokens: 100000,
        allowedTargetModels: ['claude-*', 'gpt-5*'],
        ignoreFiles: ['.aiexclude'],
        audit: { enabled: true, path: '.ctxman/org-audit.log' },
      });
      writeProjectPolicy({
        version: 1,
        // The project cannot re-allow what the organisation denies
        deny: ['customer-data/**', '!secrets/public.txt'],
        requireRedaction: true,
        maxExportTokens: 500000,
        allowedTargetModels: ['claude-opus-*', 'gpt-5*'],
        ignoreFiles: ['.cursorignore'],
        audit: { enabled: true },
      });

      const policy = load({ CTXMAN_POLICY: org });

      expect(policy.sources.map((s) => s.scope)).toEqual(['organisation', 'project']);
      expect(policy.isDenied('secrets/public.txt')).toBe(true);
      expect(policy.isDenied('customer-data/a.csv')).toBe(true);
      expect(policy.requireRedaction).toBe(true);
      expect(policy.maxExportTokens).toBe(100000);
      expect(policy.maxExportTokensSource).toBe(org);
      // Allowed by both lists
      expect(policy.isModelAllowed('claude-opus-4')).toBe(true);
      expect(policy.isModelAllowed('gpt-5-mini')).toBe(true);
      // Allowed by the organisation only
      expect(policy.isModelAllowed('claude-sonnet-4.5')).toBe(false);
      expect(policy.ignoreFiles).toEqual(['.aiexclude', '.cursorignore']);
      expect(policy.audit.paths).toEqual([
        path.join(root, '.ctxman', 'org-audit.log'),
        path.join(root, '.ctxman', 'audit.log'),
      ]);
    });

    it('keeps organisation limits a project file does not mention', () => {
      const org = writeOrgPolicy({ version: 1, requireRedaction: true, maxExportTokens: 1000 });
      writeProjectPolicy({ version: 1, requireRedaction: false });

      const policy = load({ CTXMAN_POLICY: org });

      expect(policy.requireRedaction).toBe(true);
      expect(policy.maxExportTokens).toBe(1000);
    });

    it('reads a CTXMAN_POLICY that points at the project file only once', () => {
      const file = writeProjectPolicy({ version: 1, deny: ['x'] });

      expect(load({ CTXMAN_POLICY: file }).sources).toEqual([{ scope: 'organisation', file }]);
    });
  });

  describe('deny rules', () => {
    const policyWith = (deny) => {
      writeProjectPolicy({ version: 1, deny });
      return load();
    };

    it('matches recursive and extension globs at any depth', () => {
      const policy = policyWith(['secrets/**', '**/*.pem', '*.key']);

      expect(policy.isDenied('secrets/db/password.txt')).toBe(true);
      expect(policy.isDenied('certs/server.pem')).toBe(true);
      expect(policy.isDenied('server.pem')).toBe(true);
      expect(policy.isDenied('deep/a/b/tls.key')).toBe(true);
      expect(policy.isDenied('src/secrets.js')).toBe(false);
      expect(policy.isDenied('src/index.js')).toBe(false);
    });

    it('treats "dir/" as everything below that directory', () => {
      const policy = policyWith(['customer-data/']);

      expect(policy.isDenied('customer-data/2024/export.csv')).toBe(true);
      expect(policy.isDenied('customer-data-schema.md')).toBe(false);
    });

    it('lets a later "!" line re-allow a path, the last match winning', () => {
      const policy = policyWith(['secrets/', '!secrets/README.md', '.env.*', '!.env.example']);

      expect(policy.isDenied('secrets/README.md')).toBe(false);
      expect(policy.isDenied('secrets/token.txt')).toBe(true);
      expect(policy.isDenied('.env.production')).toBe(true);
      expect(policy.isDenied('.env.example')).toBe(false);
    });

    it('anchors a pattern that starts with "/" at the project root', () => {
      const policy = policyWith(['/config/prod.json']);

      expect(policy.isDenied('config/prod.json')).toBe(true);
      expect(policy.isDenied('packages/app/config/prod.json')).toBe(false);
    });

    it('normalizes Windows separators and "./" prefixes', () => {
      const policy = policyWith(['secrets/**']);

      expect(policy.isDenied('secrets\\key.txt')).toBe(true);
      expect(policy.isDenied('./secrets/key.txt')).toBe(true);
      expect(policy.isDenied('')).toBe(false);
    });

    it('splits file lists with filterFiles()', () => {
      const policy = policyWith(['**/*.pem']);

      const { kept, removed } = policy.filterFiles([
        'a.js',
        { relativePath: 'certs/a.pem', tokens: 3 },
        { path: 'b.pem' },
      ]);

      expect(kept).toEqual(['a.js']);
      expect(removed).toHaveLength(2);
    });
  });

  describe('enforceExport', () => {
    it('refuses --no-redact when redaction is required', () => {
      const file = writeProjectPolicy({ version: 1, requireRedaction: true });
      const policy = load();

      const error = violation(() => enforceExport(policy, { files: ['a.js'], redact: false }));

      expect(error.violations.map((v) => v.rule)).toEqual(['requireRedaction']);
      expect(error.message).toContain('--no-redact is refused');
      expect(error.message).toContain(file);
      expect(error.statusCode).toBe(403);
      expect(error.exitCode).toBe(POLICY_VIOLATION_EXIT_CODE);
      expect(() => enforceExport(policy, { files: ['a.js'], redact: true })).not.toThrow();
    });

    it('fails exports above maxExportTokens', () => {
      writeProjectPolicy({ version: 1, maxExportTokens: 1000 });
      const policy = load();

      const error = violation(() => enforceExport(policy, { files: ['a.js'], tokens: 1001 }));

      expect(error.violations[0].rule).toBe('maxExportTokens');
      expect(error.message).toContain('1,001 tokens, over the limit of 1,000');
      expect(() => enforceExport(policy, { files: ['a.js'], tokens: 1000 })).not.toThrow();
    });

    it('adds up file tokens when no total is given', () => {
      writeProjectPolicy({ version: 1, maxExportTokens: 10 });

      expect(() =>
        enforceExport(load(), {
          files: [
            { relativePath: 'a.js', tokens: 6 },
            { relativePath: 'b.js', tokens: 6 },
          ],
        })
      ).toThrow(PolicyViolationError);
    });

    it('refuses target models outside allowedTargetModels', () => {
      writeProjectPolicy({ version: 1, allowedTargetModels: ['claude-*', 'gpt-5*'] });
      const policy = load();

      const error = violation(() => enforceExport(policy, { targetModel: 'gemini-2.5-pro' }));

      expect(error.violations[0].rule).toBe('allowedTargetModels');
      expect(error.message).toContain(
        '"gemini-2.5-pro" is not allowed (allowed: claude-*, gpt-5*)'
      );
      for (const model of ['claude-sonnet-4.5', 'Claude-Opus-4', 'gpt-5', 'gpt-5-mini', null]) {
        expect(() => enforceExport(policy, { targetModel: model })).not.toThrow();
      }
    });

    it('reports a denied file that reached the export, without naming it', () => {
      writeProjectPolicy({ version: 1, deny: ['secrets/**'] });

      const error = violation(() =>
        enforceExport(load(), { files: ['a.js', 'secrets/prod-db-password.txt'] })
      );

      expect(error.violations[0].rule).toBe('deny');
      expect(error.message).toContain('1 file in the export matches');
      expect(error.message).not.toContain('prod-db-password');
    });

    it('lists every broken rule in one error', () => {
      writeProjectPolicy({
        version: 1,
        deny: ['*.pem'],
        requireRedaction: true,
        maxExportTokens: 5,
        allowedTargetModels: ['claude-*'],
      });

      const error = violation(() =>
        enforceExport(load(), {
          files: ['a.pem'],
          tokens: 6,
          redact: false,
          targetModel: 'gpt-4o',
        })
      );

      expect(error.violations.map((v) => v.rule)).toEqual([
        'deny',
        'requireRedaction',
        'maxExportTokens',
        'allowedTargetModels',
      ]);
    });
  });

  it('compiles model globs case-insensitively and anchored', () => {
    expect(modelGlobToRegex('gpt-5*').test('GPT-5-mini')).toBe(true);
    expect(modelGlobToRegex('gpt-5*').test('my-gpt-5')).toBe(false);
    expect(modelGlobToRegex('claude-?').test('claude-4')).toBe(true);
    expect(modelGlobToRegex('a.b').test('axb')).toBe(false);
  });

  it('builds an empty policy from no sources', () => {
    const policy = new Policy({ root });

    expect(policy.active).toBe(false);
    expect(policy.audit).toEqual({ enabled: false, paths: [] });
  });
});
