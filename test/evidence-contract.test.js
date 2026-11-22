import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EVIDENCE_KINDS,
  MAX_EXCERPT_CHARS,
  DEFAULT_SOURCE_TIMEOUT_MS,
  EvidenceError,
  normalizeEvidence,
  runSources,
  buildCitations,
  renderCitations,
} from '../lib/evidence/index.js';
import { explainHistory } from '../lib/why/index.js';
import { readAuditLog, sha256 } from '../lib/policy/audit.js';
import * as API from '../index.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

// Synthetic secret-shaped fixtures assembled at runtime (never literal in source)
const SYNTH_AWS_KEY = ['AKIA', '12345678', 'ABCDEFGH'].join('');
const SYNTH_GH_TOKEN = ['ghp_', 'a1b2c3d4e5f6g7h8i9j0', 'k1l2m3n4o5p6q7r8'].join('');
const SYNTH_STRIPE_KEY = ['sk', '_live_', '0123456789abcdefghij0123'].join('');

function initTempGitRepo(dir) {
  const git = (...args) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
      cwd: dir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test Author');
  git('config', 'user.email', 'author@test.invalid');
  git('remote', 'add', 'origin', 'https://github.com/acme-test/widget.git');
  return git;
}

describe('lib/evidence contract, sources, and citations', () => {
  describe('normalizeEvidence schema validation, redaction, and 800-char cap', () => {
    it('accepts every valid EvidenceKind and computes tokens', () => {
      expect(EVIDENCE_KINDS).toEqual([
        'commit',
        'pr',
        'review-comment',
        'issue',
        'chat',
        'decision',
        'doc',
        'ci-log',
        'code',
      ]);
      expect(MAX_EXCERPT_CHARS).toBe(800);

      for (const kind of EVIDENCE_KINDS) {
        const item = normalizeEvidence({
          id: `ev-${kind}`,
          kind,
          source: 'unit-source',
          ref: `ref:${kind}`,
          timestamp: '2026-03-15T12:00:00Z',
          author: 'tester',
          title: `Title for ${kind}`,
          excerpt: `Sample evidence excerpt for ${kind}.`,
          score: 0.75,
        });

        expect(item).toMatchObject({
          id: `ev-${kind}`,
          kind,
          source: 'unit-source',
          url: null,
          ref: `ref:${kind}`,
          timestamp: '2026-03-15T12:00:00Z',
          author: 'tester',
          title: `Title for ${kind}`,
          excerpt: `Sample evidence excerpt for ${kind}.`,
          score: 0.75,
        });
        expect(item.tokens).toBeGreaterThan(0);
        expect(Number.isInteger(item.tokens)).toBe(true);
      }
    });

    it('rejects bad kinds and missing required fields', () => {
      const base = {
        id: 'ev-1',
        kind: 'commit',
        source: 'git',
        ref: 'abc1234',
        timestamp: '2026-03-15T12:00:00Z',
        excerpt: 'Valid excerpt',
        score: 0.5,
      };

      expect(() => normalizeEvidence(null)).toThrow(EvidenceError);
      expect(() => normalizeEvidence({ ...base, kind: 'unknown-kind' })).toThrow(EvidenceError);
      expect(() => normalizeEvidence({ ...base, kind: '' })).toThrow(EvidenceError);
      expect(() => normalizeEvidence({ ...base, id: '   ' })).toThrow(EvidenceError);
      expect(() => normalizeEvidence({ ...base, source: '' })).toThrow(EvidenceError);
      expect(() => normalizeEvidence({ ...base, url: null, ref: '' })).toThrow(EvidenceError);
      expect(() => normalizeEvidence({ ...base, timestamp: 'not-a-timestamp' })).toThrow(
        EvidenceError
      );
      expect(() => normalizeEvidence({ ...base, score: -0.1 })).toThrow(EvidenceError);
      expect(() => normalizeEvidence({ ...base, score: Number.NaN })).toThrow(EvidenceError);
    });

    it('redacts synthetic secrets and caps excerpt length to <= 800 chars (including boundary secrets)', () => {
      const longWithSecrets = `${'x'.repeat(300)} ${SYNTH_AWS_KEY} ${'y'.repeat(480)} ${SYNTH_GH_TOKEN} ${'z'.repeat(200)}`;
      const ev = normalizeEvidence({
        id: 'ev-redact-1',
        kind: 'ci-log',
        source: 'ci',
        url: 'https://ci.test.invalid/runs/42',
        timestamp: '2026-03-15T12:00:00Z',
        title: `Leak in header ${SYNTH_STRIPE_KEY}`,
        excerpt: longWithSecrets,
        score: 0.8,
      });

      expect(ev.excerpt.length).toBeLessThanOrEqual(800);
      expect(ev.excerpt).not.toContain(SYNTH_AWS_KEY);
      expect(ev.excerpt).not.toContain(SYNTH_GH_TOKEN);
      expect(ev.excerpt).toContain('[REDACTED:aws-access-key-id]');
      expect(ev.title).not.toContain(SYNTH_STRIPE_KEY);
      expect(ev.title).toContain('[REDACTED:stripe-secret-key]');

      // Secret spanning across the 800-char boundary must be redacted first, never half-leaked
      const boundarySecret = `${'a'.repeat(785)} ${SYNTH_GH_TOKEN} trailing`;
      const boundaryEv = normalizeEvidence({
        id: 'ev-redact-boundary',
        kind: 'chat',
        source: 'chat-archive',
        ref: 'thread-9',
        timestamp: '2026-03-15T12:00:00Z',
        excerpt: boundarySecret,
        score: 0.6,
      });
      expect(boundaryEv.excerpt.length).toBeLessThanOrEqual(800);
      expect(boundaryEv.excerpt).not.toContain('ghp_');
    });
  });

  describe('runSources timeout, error handling, policy filtering, and determinism', () => {
    it('enforces a 5 s default timeout and records warnings when a 6 s source times out', async () => {
      expect(DEFAULT_SOURCE_TIMEOUT_MS).toBe(5000);

      const sixSecondSource = {
        id: 'six-second-sleeper',
        available: () => true,
        search: () =>
          new Promise((resolve) => {
            const timer = setTimeout(() => resolve([]), 6000);
            timer.unref();
          }),
      };

      const fastSource = {
        id: 'fast-local',
        available: () => true,
        search: async () => [
          {
            id: 'commit:1111111',
            kind: 'commit',
            source: 'git',
            ref: '1111111',
            timestamp: '2026-03-15T10:00:00Z',
            excerpt: 'Fast result',
            score: 0.9,
          },
        ],
      };

      const { evidence, warnings } = await runSources([sixSecondSource, fastSource], 'target', {
        timeoutMs: 50,
      });

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('six-second-sleeper') && /timed out/i.test(w))).toBe(
        true
      );
      expect(evidence).toHaveLength(1);
      expect(evidence[0].id).toBe('commit:1111111');
    });

    it('exits 0 in a child node process with non-empty warnings when a source sleeps 6 s', () => {
      const moduleUrl = new URL('../lib/evidence/index.js', import.meta.url).href;
      const script = `
        import(${JSON.stringify(moduleUrl)}).then(async ({ runSources }) => {
          const slow = {
            id: 'sleep-6s',
            available: () => true,
            search: (_q, { signal }) => new Promise((resolve) => {
              const t = setTimeout(() => resolve([]), 6000);
              t.unref();
              signal?.addEventListener('abort', () => clearTimeout(t), { once: true });
            }),
          };
          const out = await runSources([slow], 'q', { timeoutMs: 50 });
          if (!Array.isArray(out.warnings) || out.warnings.length === 0) process.exit(1);
        });
      `;
      const proc = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf-8',
      });
      expect(proc.status).toBe(0);
    });

    it('swallows connector exceptions in available() and search() into warnings[]', async () => {
      const brokenAvailable = {
        id: 'broken-avail',
        available: () => {
          throw new Error('auth socket missing');
        },
        search: async () => [],
      };
      const brokenSearch = {
        id: 'broken-search',
        available: () => true,
        search: async () => {
          throw new Error('rate limit exceeded');
        },
      };
      const unavailableSource = {
        id: 'disabled-source',
        available: () => false,
        search: async () => {
          throw new Error('must not be called');
        },
      };

      const { evidence, warnings } = await runSources(
        [brokenAvailable, brokenSearch, unavailableSource],
        'query'
      );
      expect(evidence).toEqual([]);
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain('broken-avail');
      expect(warnings[1]).toContain('broken-search');
    });

    it('drops evidence whose path, source, or ref is denied by policy', async () => {
      const isDenied = (p) => p.startsWith('secrets/') || p === '.env.production';
      const connector = {
        id: 'mixed-connector',
        available: () => true,
        search: async () => [
          {
            id: 'denied-by-source',
            kind: 'doc',
            source: 'secrets/runbook.md',
            ref: 'doc-1',
            timestamp: '2026-03-15T10:00:00Z',
            excerpt: 'Internal runbook',
            score: 0.99,
          },
          {
            id: 'denied-by-ref',
            kind: 'code',
            source: 'local-code',
            ref: 'secrets/keys.js#L10-L20',
            timestamp: '2026-03-15T10:00:00Z',
            excerpt: 'Key loader',
            score: 0.95,
          },
          {
            id: 'denied-by-colon-ref',
            kind: 'code',
            source: 'local-code',
            ref: '.env.production:4',
            timestamp: '2026-03-15T10:00:00Z',
            excerpt: 'Env line',
            score: 0.92,
          },
          {
            id: 'allowed-doc',
            kind: 'decision',
            source: 'docs/adr/0001.md',
            ref: 'docs/adr/0001.md#L5',
            timestamp: '2026-03-15T10:00:00Z',
            excerpt: 'Use integer cents.',
            score: 0.8,
          },
        ],
      };

      const { evidence, warnings } = await runSources([connector], 'cents', { isDenied });
      expect(warnings).toEqual([]);
      expect(evidence.map((e) => e.id)).toEqual(['allowed-doc']);
      for (const item of evidence) {
        expect(item.source).not.toContain('secrets/');
        expect(item.ref).not.toContain('secrets/');
        expect(item.ref).not.toContain('.env.production');
      }
    });

    it('sorts deterministically by (score desc, timestamp desc, id asc)', async () => {
      const rawItems = [
        {
          id: 'item-b',
          kind: 'doc',
          source: 'docs',
          ref: 'docs/b.md',
          timestamp: '2026-02-01T00:00:00Z',
          excerpt: 'B',
          score: 0.8,
        },
        {
          id: 'item-a',
          kind: 'doc',
          source: 'docs',
          ref: 'docs/a.md',
          timestamp: '2026-02-01T00:00:00Z',
          excerpt: 'A',
          score: 0.8,
        },
        {
          id: 'item-newer',
          kind: 'pr',
          source: 'github',
          url: 'https://github.com/acme-test/widget/pull/2',
          timestamp: '2026-03-01T00:00:00Z',
          excerpt: 'Newer same score',
          score: 0.8,
        },
        {
          id: 'item-top',
          kind: 'commit',
          source: 'git',
          ref: 'deadbeef',
          timestamp: '2026-01-01T00:00:00Z',
          excerpt: 'Highest score',
          score: 0.95,
        },
      ];

      const runOrderA = await runSources(
        [{ id: 's1', available: () => true, search: async () => rawItems }],
        'q'
      );
      const runOrderB = await runSources(
        [{ id: 's1', available: () => true, search: async () => [...rawItems].reverse() }],
        'q'
      );

      expect(runOrderA.evidence.map((e) => e.id)).toEqual([
        'item-top',
        'item-newer',
        'item-a',
        'item-b',
      ]);
      expect(JSON.stringify(runOrderA.evidence)).toBe(JSON.stringify(runOrderB.evidence));
    });
  });

  describe('citations building and [n] rendering', () => {
    it('builds citations[] and renders [n] lines with a trailing Sources list', () => {
      const citations = buildCitations([
        {
          id: 'c-2',
          kind: 'pr',
          source: 'github',
          url: 'https://github.com/acme-test/widget/pull/19',
          ref: '#19',
          timestamp: '2026-03-12T09:00:00Z',
          author: 'alice',
          title: 'Harden retry backoff',
          excerpt: 'Capped exponential jitter at 30 seconds.',
          score: 0.95,
        },
        {
          id: 'c-1',
          kind: 'commit',
          source: 'git',
          ref: 'a1b2c3d4',
          timestamp: '2026-03-10T08:00:00Z',
          author: 'Bob',
          title: 'feat: initial retry helper',
          excerpt: 'Added base retry loop.',
          score: 0.8,
        },
      ]);

      expect(citations).toHaveLength(2);
      expect(citations[0].id).toBe('c-2');
      expect(citations[1].id).toBe('c-1');

      const rendered = renderCitations(citations);
      expect(rendered).toContain('[1] Harden retry backoff');
      expect(rendered).toContain('[2] feat: initial retry helper');
      expect(rendered).toContain('Sources:');
      expect(rendered).toContain(
        '- [1] pr (github) · 2026-03-12 · alice · https://github.com/acme-test/widget/pull/19 (#19)'
      );
      expect(rendered).toContain('- [2] commit (git) · 2026-03-10 · Bob · a1b2c3d4');
      expect(renderCitations([])).toBe('');
    });

    it('exports evidence helpers from the root package entry point', () => {
      expect(API.normalizeEvidence).toBe(normalizeEvidence);
      expect(API.runSources).toBe(runSources);
      expect(API.EVIDENCE_KINDS).toBe(EVIDENCE_KINDS);
      expect(API.buildCitations).toBe(buildCitations);
      expect(API.renderCitations).toBe(renderCitations);
    });
  });

  describe('ctxman why integration (offline commits, policy block, discussions, determinism)', () => {
    let repo;

    beforeAll(() => {
      repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-evidence-why-')));
      const git = initTempGitRepo(repo);

      fs.mkdirSync(path.join(repo, '.ctxman'), { recursive: true });
      fs.writeFileSync(
        path.join(repo, '.ctxman', 'policy.json'),
        JSON.stringify({ version: 1, deny: ['secrets/**'] }),
        'utf-8'
      );

      fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'secrets'), { recursive: true });
      fs.writeFileSync(
        path.join(repo, 'src', 'calc.js'),
        'export function compute(x) {\n  return x * 2;\n}\n',
        'utf-8'
      );
      fs.writeFileSync(path.join(repo, 'secrets', 'vault.txt'), 'restricted-material\n', 'utf-8');
      git('add', '-A');
      execFileSync(
        'git',
        [
          '-c',
          'commit.gpgsign=false',
          'commit',
          '-qm',
          `feat: add compute (#7)\n\nRotated ${SYNTH_AWS_KEY} during migration.`,
        ],
        {
          cwd: repo,
          env: {
            ...process.env,
            GIT_AUTHOR_DATE: '2026-02-10T10:00:00Z',
            GIT_COMMITTER_DATE: '2026-02-10T10:00:00Z',
          },
        }
      );

      fs.writeFileSync(
        path.join(repo, 'src', 'calc.js'),
        'export function compute(x) {\n  return Math.round(x * 2);\n}\n',
        'utf-8'
      );
      fs.writeFileSync(path.join(repo, 'secrets', 'vault.txt'), 'restricted-v2\n', 'utf-8');
      git('add', '-A');
      execFileSync(
        'git',
        ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'fix: round compute output (#11)'],
        {
          cwd: repo,
          env: {
            ...process.env,
            GIT_AUTHOR_DATE: '2026-02-11T10:00:00Z',
            GIT_COMMITTER_DATE: '2026-02-11T10:00:00Z',
          },
        }
      );
    });

    afterAll(() => {
      fs.rmSync(repo, { recursive: true, force: true });
    });

    it('populates citations[] offline with fetch stubbed to throw and keeps denied paths out', async () => {
      const throwingFetch = () => {
        throw new Error('Unexpected network call');
      };

      const leakAttemptSource = {
        id: 'leak-attempt',
        available: () => true,
        search: async () => [
          {
            id: 'denied-1',
            kind: 'doc',
            source: 'secrets/vault.txt',
            ref: 'secrets/vault.txt#L1',
            timestamp: '2026-02-12T00:00:00Z',
            excerpt: 'Denied excerpt',
            score: 1.0,
          },
          {
            id: 'denied-2',
            kind: 'code',
            source: 'scanner',
            ref: 'secrets/vault.txt:2',
            timestamp: '2026-02-12T00:00:00Z',
            excerpt: 'Denied ref',
            score: 0.99,
          },
        ],
      };

      const res = await explainHistory(repo, 'src/calc.js:compute', {
        style: 'json',
        fetch: throwingFetch,
        evidenceSources: [leakAttemptSource],
      });

      const parsed = JSON.parse(res.text);
      expect(Array.isArray(parsed.citations)).toBe(true);
      expect(parsed.citations.length).toBe(2);
      expect(parsed.citations.every((c) => c.kind === 'commit')).toBe(true);
      expect(Array.isArray(parsed.warnings)).toBe(true);

      for (const citation of parsed.citations) {
        expect(citation.source).not.toContain('secrets/');
        expect(citation.ref ?? '').not.toContain('secrets/');
        expect(citation.excerpt).not.toContain(SYNTH_AWS_KEY);
        expect(citation.excerpt.length).toBeLessThanOrEqual(800);
      }

      // Direct target on denied path still fails with POLICY_DENIED (CLI exit 3)
      const deniedCli = spawnSync(process.execPath, [CLI, 'why', 'secrets/vault.txt', '--json'], {
        cwd: repo,
        encoding: 'utf-8',
      });
      expect(deniedCli.status).toBe(3);
    });

    function createMockPrFetch() {
      return async (url) => {
        if (url === 'https://api.github.com/repos/acme-test/widget/issues/11') {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            json: async () => ({
              number: 11,
              title: 'Round compute output',
              state: 'closed',
              pull_request: { merged_at: '2026-02-11T12:00:00Z' },
              user: { login: 'reviewer1' },
              created_at: '2026-02-11T11:00:00Z',
              html_url: 'https://github.com/acme-test/widget/pull/11',
              labels: [],
              body: 'Ensures integer rounding.',
              comments: 1,
            }),
          };
        }
        if (url.startsWith('https://api.github.com/repos/acme-test/widget/issues/11/comments')) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            json: async () => [
              {
                user: { login: 'reviewer2' },
                created_at: '2026-02-11T11:30:00Z',
                body: 'LGTM, verified edge cases.',
              },
            ],
          };
        }
        return { ok: false, status: 404, headers: new Map(), json: async () => ({}) };
      };
    }

    it('maps remote discussions and comments to pr/issue/review-comment Evidence when opted in', async () => {
      const res = await explainHistory(repo, 'src/calc.js:compute', {
        style: 'json',
        discussions: true,
        fetch: createMockPrFetch(),
        env: {},
      });
      const parsed = JSON.parse(res.text);
      const kinds = new Set(parsed.citations.map((c) => c.kind));
      expect(kinds.has('commit')).toBe(true);
      expect(kinds.has('pr')).toBe(true);
      expect(kinds.has('review-comment')).toBe(true);
    });

    it('produces byte-identical JSON across two runs on the same input (determinism)', async () => {
      const run1 = spawnSync(process.execPath, [CLI, 'why', 'src/calc.js:compute', '--json'], {
        cwd: repo,
        encoding: 'utf-8',
      });
      const run2 = spawnSync(process.execPath, [CLI, 'why', 'src/calc.js:compute', '--json'], {
        cwd: repo,
        encoding: 'utf-8',
      });

      expect(run1.status).toBe(0);
      expect(run2.status).toBe(0);
      expect(run1.stdout).toBe(run2.stdout);

      const parsed = JSON.parse(run1.stdout);
      expect(Array.isArray(parsed.citations)).toBe(true);
      expect(parsed.citations.length).toBeGreaterThan(0);
    });

    it('emits [n] markers and trailing Sources/<sources> in Markdown and XML resolving to citations[]', async () => {
      const mockFetch = createMockPrFetch();
      const jsonRes = await explainHistory(repo, 'src/calc.js:compute', {
        style: 'json',
        discussions: true,
        fetch: mockFetch,
        env: {},
      });
      const mdRes = await explainHistory(repo, 'src/calc.js:compute', {
        style: 'markdown',
        discussions: true,
        fetch: mockFetch,
        env: {},
        ask: 'Why round?',
      });
      const xmlRes = await explainHistory(repo, 'src/calc.js:compute', {
        style: 'xml',
        discussions: true,
        fetch: mockFetch,
        env: {},
        ask: 'Why round?',
      });

      const parsed = JSON.parse(jsonRes.text);
      expect(parsed.citations.length).toBe(4);

      // Every finding in JSON carries citation + citationId pointing to citations[n - 1]
      for (const commit of parsed.history.commits) {
        expect(commit.citation).toBeGreaterThanOrEqual(1);
        expect(commit.citation).toBeLessThanOrEqual(parsed.citations.length);
        const entry = parsed.citations[commit.citation - 1];
        expect(entry.id).toBe(commit.citationId);
        expect(entry.ref).toBe(commit.sha);
      }
      for (const disc of parsed.discussions) {
        expect(disc.citation).toBeGreaterThanOrEqual(1);
        const discEntry = parsed.citations[disc.citation - 1];
        expect(discEntry.id).toBe(disc.citationId);
        expect(discEntry.kind).toBe('pr');
        for (const comment of disc.comments) {
          expect(comment.citation).toBeGreaterThanOrEqual(1);
          const commentEntry = parsed.citations[comment.citation - 1];
          expect(commentEntry.id).toBe(comment.citationId);
          expect(commentEntry.kind).toBe('review-comment');
        }
      }

      // Markdown: inline [n] markers on commits/discussions/comments + trailing Sources: before ## Question
      const sourcesIdx = mdRes.text.indexOf('\nSources:\n');
      const questionIdx = mdRes.text.indexOf('\n## Question\n');
      expect(sourcesIdx).toBeGreaterThan(-1);
      expect(questionIdx).toBeGreaterThan(sourcesIdx);

      const inlineMd = mdRes.text.slice(0, sourcesIdx);
      const sourcesMd = mdRes.text.slice(sourcesIdx, questionIdx);
      const inlineMdNums = [
        ...[...inlineMd.matchAll(/^### .+? \[(\d+)\]$/gm)].map((m) => Number(m[1])),
        ...[...inlineMd.matchAll(/^- \*\*[^*]+\*\* .* \[(\d+)\]$/gm)].map((m) => Number(m[1])),
      ];
      const sourceLines = [...sourcesMd.matchAll(/^- \[(\d+)\] (.+)$/gm)];
      expect(inlineMdNums.length).toBe(4);
      expect(sourceLines.length).toBe(parsed.citations.length);

      for (const n of inlineMdNums) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(parsed.citations.length);
      }
      for (const match of sourceLines) {
        const n = Number(match[1]);
        const lineText = match[2];
        const entry = parsed.citations[n - 1];
        expect(entry).toBeDefined();
        expect(lineText).toContain(`${entry.kind} (${entry.source})`);
        expect(lineText).toContain(entry.url || entry.ref);
      }

      // XML: citation="[n]" on commit/discussion/comment and <sources><evidence marker="[n]"> before <question>
      expect(xmlRes.text).toMatch(/<sources>[\s\S]*<\/sources>\n<question>/);
      const xmlCitations = [...xmlRes.text.matchAll(/citation="\[(\d+)\]"/g)].map((m) =>
        Number(m[1])
      );
      const xmlEvidence = [
        ...xmlRes.text.matchAll(/<evidence[^>]*marker="\[(\d+)\]" id="([^"]+)"/g),
      ];
      expect(xmlCitations.length).toBe(4);
      expect(xmlEvidence.length).toBe(parsed.citations.length);

      for (const n of xmlCitations) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(parsed.citations.length);
      }
      for (const match of xmlEvidence) {
        const n = Number(match[1]);
        const id = match[2];
        expect(parsed.citations[n - 1].id).toBe(id);
      }
    });

    it('uses omitted.evidence under budget trimming without leaving dangling [n] markers', async () => {
      const fullJson = await explainHistory(repo, 'src/calc.js:compute', { style: 'json' });
      const trimmedJson = await explainHistory(repo, 'src/calc.js:compute', {
        style: 'json',
        budget: fullJson.tokens - 40,
      });
      const parsedTrimmed = JSON.parse(trimmedJson.text);
      expect(trimmedJson.tokens).toBeLessThanOrEqual(fullJson.tokens - 40);
      expect(parsedTrimmed.trimmed).not.toBeNull();
      expect(parsedTrimmed.trimmed.omitted.citations).toBeUndefined();
      expect(parsedTrimmed.trimmed.omitted.evidence).toBeGreaterThan(0);

      for (const commit of parsedTrimmed.history.commits) {
        if (commit.citation !== undefined) {
          expect(commit.citation).toBeLessThanOrEqual(parsedTrimmed.citations.length);
          expect(parsedTrimmed.citations[commit.citation - 1].id).toBe(commit.citationId);
        }
      }

      // Markdown & XML budget trimming that drops all evidence leaves zero dangling markers or Sources/<sources>
      const fullMd = await explainHistory(repo, 'src/calc.js:compute', { style: 'markdown' });
      const trimmedMd = await explainHistory(repo, 'src/calc.js:compute', {
        style: 'markdown',
        budget: fullMd.tokens - 20,
      });
      expect(trimmedMd.omitted.evidence).toBeGreaterThan(0);
      const keptMdSources = [...trimmedMd.text.matchAll(/^- \[(\d+)\] /gm)].map((m) =>
        Number(m[1])
      );
      const inlineMdMarkers = [...trimmedMd.text.matchAll(/^### .+? \[(\d+)\]$/gm)].map((m) =>
        Number(m[1])
      );
      for (const n of inlineMdMarkers) {
        expect(n).toBeLessThanOrEqual(keptMdSources.length);
      }
      if (keptMdSources.length === 0) {
        expect(trimmedMd.text).not.toContain('\nSources:\n');
      }

      const fullXml = await explainHistory(repo, 'src/calc.js:compute', { style: 'xml' });
      const trimmedXml = await explainHistory(repo, 'src/calc.js:compute', {
        style: 'xml',
        budget: fullXml.tokens - 40,
      });
      expect(trimmedXml.omitted.evidence).toBeGreaterThan(0);
      const xmlEvidenceCount = [...trimmedXml.text.matchAll(/<evidence[^>]*marker="\[(\d+)\]"/g)]
        .length;
      const xmlAttrCitations = [...trimmedXml.text.matchAll(/citation="\[(\d+)\]"/g)].map((m) =>
        Number(m[1])
      );
      for (const n of xmlAttrCitations) {
        expect(n).toBeLessThanOrEqual(xmlEvidenceCount);
      }
      if (xmlEvidenceCount === 0) {
        expect(trimmedXml.text).not.toContain('<sources>');
      }
    });

    it('supports node bin/cli.js why <file> --json, preserves pre-existing keys, and resolves CLI Markdown/XML markers', () => {
      const jsonProc = spawnSync(process.execPath, [CLI, 'why', 'src/calc.js', '--json'], {
        cwd: repo,
        encoding: 'utf-8',
      });
      expect(jsonProc.status).toBe(0);
      const parsed = JSON.parse(jsonProc.stdout);

      expect(Array.isArray(parsed.citations)).toBe(true);
      expect(parsed.citations.length).toBeGreaterThan(0);
      expect(Array.isArray(parsed.warnings)).toBe(true);

      const expectedKeys = [
        'generator',
        'target',
        'repository',
        'history',
        'references',
        'discussions',
        'institutionalCitations',
        'citations',
        'ownership',
        'coupling',
        'related',
        'notes',
        'tests',
        'warnings',
        'trimmed',
        'question',
      ];
      for (const key of expectedKeys) {
        expect(Object.hasOwn(parsed, key), `Missing JSON key: ${key}`).toBe(true);
      }
      expect(parsed.generator).toBe('ctxman why');
      expect(typeof parsed.target).toBe('object');
      expect(typeof parsed.repository).toBe('object');
      expect(typeof parsed.history).toBe('object');
      expect(typeof parsed.references).toBe('object');
      expect(Array.isArray(parsed.discussions)).toBe(true);
      expect(Array.isArray(parsed.institutionalCitations)).toBe(true);
      expect(Array.isArray(parsed.related)).toBe(true);
      expect(Array.isArray(parsed.notes)).toBe(true);
      expect(Array.isArray(parsed.tests)).toBe(true);

      const mdProc = spawnSync(process.execPath, [CLI, 'why', 'src/calc.js'], {
        cwd: repo,
        encoding: 'utf-8',
      });
      expect(mdProc.status).toBe(0);
      expect(mdProc.stdout).toContain('\nSources:\n');
      const mdHeadingMarkers = [...mdProc.stdout.matchAll(/^### \d+\..+? \[(\d+)\]$/gm)].map((m) =>
        Number(m[1])
      );
      expect(mdHeadingMarkers.length).toBe(parsed.history.commits.length);
      for (const n of mdHeadingMarkers) {
        expect(parsed.citations[n - 1]).toBeDefined();
      }

      const xmlProc = spawnSync(process.execPath, [CLI, 'why', 'src/calc.js', '--style', 'xml'], {
        cwd: repo,
        encoding: 'utf-8',
      });
      expect(xmlProc.status).toBe(0);
      expect(xmlProc.stdout).toContain('<sources>');
      const xmlMarkers = [...xmlProc.stdout.matchAll(/citation="\[(\d+)\]"/g)].map((m) =>
        Number(m[1])
      );
      expect(xmlMarkers.length).toBe(parsed.history.commits.length);
      for (const n of xmlMarkers) {
        expect(parsed.citations[n - 1]).toBeDefined();
      }
    });

    it('records one audit event when policy audit is enabled and writes nothing when disabled', async () => {
      const auditRepo = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-evidence-audit-'))
      );
      try {
        const git = initTempGitRepo(auditRepo);
        fs.mkdirSync(path.join(auditRepo, '.ctxman'), { recursive: true });
        fs.mkdirSync(path.join(auditRepo, 'src'), { recursive: true });
        fs.writeFileSync(path.join(auditRepo, 'src', 'item.js'), 'export const v = 1;\n', 'utf-8');
        const auditPath = path.join(auditRepo, '.ctxman', 'audit.log');
        const policyPath = path.join(auditRepo, '.ctxman', 'policy.json');

        fs.writeFileSync(
          policyPath,
          JSON.stringify({ version: 1, audit: { enabled: false } }),
          'utf-8'
        );
        git('add', '-A');
        execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'feat: add item'], {
          cwd: auditRepo,
        });

        await explainHistory(auditRepo, 'src/item.js', { style: 'json' });
        const disabledCli = spawnSync(process.execPath, [CLI, 'why', 'src/item.js', '--json'], {
          cwd: auditRepo,
          encoding: 'utf-8',
        });
        expect(disabledCli.status).toBe(0);
        expect(fs.existsSync(auditPath)).toBe(false);

        fs.writeFileSync(
          policyPath,
          JSON.stringify({ version: 1, audit: { enabled: true, path: '.ctxman/audit.log' } }),
          'utf-8'
        );

        const apiRes = await explainHistory(auditRepo, 'src/item.js', { style: 'json' });
        expect(fs.existsSync(auditPath)).toBe(true);
        const firstRead = readAuditLog([auditPath]);
        expect(firstRead.events).toHaveLength(1);
        expect(firstRead.events[0]).toMatchObject({
          outcome: 'exported',
          command: 'why',
          root: auditRepo,
          format: 'json',
          destination: 'stdout',
          totalTokens: apiRes.tokens,
          sha256: sha256(apiRes.text),
        });
        expect(firstRead.events[0].files).toContain('src/item.js');

        const cliRes = spawnSync(process.execPath, [CLI, 'why', 'src/item.js', '--json'], {
          cwd: auditRepo,
          encoding: 'utf-8',
        });
        expect(cliRes.status).toBe(0);
        const secondRead = readAuditLog([auditPath]);
        expect(secondRead.events).toHaveLength(2);
        expect(secondRead.events[1]).toMatchObject({
          outcome: 'exported',
          command: 'why',
          format: 'json',
          destination: 'stdout',
          sha256: sha256(cliRes.stdout),
        });
      } finally {
        fs.rmSync(auditRepo, { recursive: true, force: true });
      }
    });
  });
});
