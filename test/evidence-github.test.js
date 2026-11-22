import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import TokenUtils from '../lib/utils/token-utils.js';
import { explainHistory } from '../lib/why/index.js';
import {
  createGitHubEvidenceSource,
  githubApiBase,
  resolveGitHubToken,
} from '../lib/evidence/sources/github.js';
import { createGitLabEvidenceSource } from '../lib/evidence/sources/gitlab.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const WHY_CLI = fileURLToPath(new URL('../bin/cm-why.js', import.meta.url));
const require = createRequire(import.meta.url);

// Synthetic secret-shaped strings assembled at runtime (never literal in source)
const SYNTH_GH_TOKEN = ['ghp_', 'TestLeak0123456789', 'AbCdEfGhIjKlMnOpQr'].join('');
const SYNTH_GH_ALT_TOKEN = ['ghp_', 'AltPrecedence012345', 'ZyXwVuTsRqPoNmLk'].join('');
const SYNTH_GH_CLI_TOKEN = ['ghp_', 'CliFallback01234567', 'MnOpQrStUvWxYzAb'].join('');
const SYNTH_GL_TOKEN = ['glpat-', 'TestGitLabLeak0123456789'].join('');
const SYNTH_AWS_SECRET = ['AKIA', 'TEST9876', '5432EXMP'].join('');

function openRawSqlite(dbPath) {
  const origEmitWarning = process.emitWarning;
  process.emitWarning = function (warning, ...args) {
    const msg = typeof warning === 'string' ? warning : warning?.message || '';
    if (/SQLite is an experimental feature/i.test(msg)) return;
    return origEmitWarning.call(this, warning, ...args);
  };
  try {
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(dbPath);
  } finally {
    process.emitWarning = origEmitWarning;
  }
}

function git(cwd, args, envExtra = {}) {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Alice',
      GIT_AUTHOR_EMAIL: 'alice@example.com',
      GIT_COMMITTER_NAME: 'Alice',
      GIT_COMMITTER_EMAIL: 'alice@example.com',
      ...envExtra,
    },
    stdio: 'pipe',
  }).trim();
}

function runCli(cwd, args, envOverrides = {}, { viaRootCli = false } = {}) {
  const entry = viaRootCli ? CLI : WHY_CLI;
  const spawnArgs = viaRootCli ? args : args[0] === 'why' ? args.slice(1) : args;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...spawnArgs], {
      cwd,
      env: {
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR || os.tmpdir(),
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('close', (status) => {
      resolve({
        status,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      });
    });
  });
}

async function startFakeServer(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    requests.push({
      method: req.method,
      path: urlObj.pathname,
      search: urlObj.search,
      fullPath: req.url,
      headers: { ...req.headers },
    });
    try {
      await handler(req, res, urlObj, requests);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message: error.message }));
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const close = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
    });

  return { server, baseUrl, requests, close };
}

async function getUnusedLocalPortUrl() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return `http://127.0.0.1:${port}`;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  res.end(payload === null ? '' : JSON.stringify(payload));
}

function createTempGitRepo(remoteUrl = 'https://github.com/acme/pay.git') {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-ev-gh-')));
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['remote', 'add', 'origin', remoteUrl]);
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'src', 'pay.js'),
    'export function pay(cents) {\n  return Math.round(cents);\n}\n',
    'utf-8'
  );
  git(repo, ['add', '.']);
  git(repo, ['commit', '-qm', 'feat(pay): round checkout amount'], {
    GIT_AUTHOR_DATE: '2026-02-10T10:00:00Z',
    GIT_COMMITTER_DATE: '2026-02-10T10:00:00Z',
  });
  const sha = git(repo, ['rev-parse', 'HEAD']);
  return { repo, sha };
}

describe('U-02 GitHub & GitLab evidence source with ETag SQLite cache', () => {
  const tempDirs = [];
  const activeServers = [];

  function trackDir(dir) {
    tempDirs.push(dir);
    return dir;
  }

  function makeSanitizedEnv(extra = {}) {
    const tmpHome = trackDir(
      fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-home-')))
    );
    return {
      HOME: tmpHome,
      GH_CONFIG_DIR: path.join(tmpHome, 'gh-empty'),
      ...extra,
    };
  }

  async function trackServer(handler) {
    const srv = await startFakeServer(handler);
    activeServers.push(srv);
    return srv;
  }

  beforeEach(() => {
    tempDirs.length = 0;
    activeServers.length = 0;
  });

  afterEach(async () => {
    while (activeServers.length > 0) {
      const srv = activeServers.pop();
      await srv.close();
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Check 1 & Check 4: fetches commit->PR->review comments->closed issue via CLI, caches in sqlite, and reuses on 304', async () => {
    const { repo, sha } = createTempGitRepo('https://github.com/acme/pay.git');
    trackDir(repo);

    let mode = 'full';
    const srv = await trackServer((req, res, urlObj) => {
      const p = urlObj.pathname;
      if (mode === '304') {
        if (req.headers['if-none-match']) {
          res.statusCode = 304;
          res.end();
          return;
        }
        sendJson(res, 400, { message: 'Expected If-None-Match header' });
        return;
      }

      if (p === `/repos/acme/pay/commits/${sha}/pulls`) {
        sendJson(
          res,
          200,
          [
            {
              number: 42,
              title: 'Harden checkout rounding boundary',
              state: 'closed',
              merged_at: '2026-02-10T12:00:00Z',
              created_at: '2026-02-10T11:00:00Z',
              updated_at: '2026-02-10T12:00:00Z',
              html_url: 'https://github.com/acme/pay/pull/42',
              user: { login: 'alice' },
              body: 'Fixes #19\nRounds fractional cents at checkout.',
            },
          ],
          { ETag: '"pulls-42"', 'Last-Modified': 'Tue, 10 Feb 2026 12:00:00 GMT' }
        );
        return;
      }
      if (p === '/repos/acme/pay/pulls/42/comments') {
        sendJson(
          res,
          200,
          [
            {
              id: 701,
              user: { login: 'bob' },
              path: 'src/pay.js',
              line: 2,
              created_at: '2026-02-10T11:20:00Z',
              html_url: 'https://github.com/acme/pay/pull/42#discussion_r701',
              body: 'Keep Math.round only at the payment boundary.',
            },
          ],
          { ETag: '"comments-42"' }
        );
        return;
      }
      if (p === '/repos/acme/pay/pulls/42/reviews') {
        sendJson(
          res,
          200,
          [
            {
              id: 801,
              user: { login: 'carol' },
              state: 'APPROVED',
              submitted_at: '2026-02-10T11:45:00Z',
              html_url: 'https://github.com/acme/pay/pull/42#pullrequestreview-801',
              body: 'Verified rounding invariants.',
            },
          ],
          { ETag: '"reviews-42"' }
        );
        return;
      }
      if (p === '/repos/acme/pay/issues/19') {
        sendJson(
          res,
          200,
          {
            number: 19,
            title: 'Fractional cents leak into gateway payload',
            state: 'closed',
            created_at: '2026-02-09T09:00:00Z',
            closed_at: '2026-02-10T12:00:00Z',
            html_url: 'https://github.com/acme/pay/issues/19',
            user: { login: 'support' },
            body: 'Payment processor rejected 199.99999999999997.',
          },
          { ETag: '"issue-19"' }
        );
        return;
      }
      sendJson(res, 404, { message: 'Not Found' });
    });

    const env = makeSanitizedEnv({ CTXMAN_GITHUB_API_URL: srv.baseUrl });
    const run1 = await runCli(repo, ['why', 'src/pay.js', '--discussions', '--json'], env, {
      viaRootCli: true,
    });
    expect(run1.status).toBe(0);
    const parsed1 = JSON.parse(run1.stdout);
    expect(parsed1.warnings).toEqual([]);

    const kinds1 = parsed1.citations.map((c) => c.kind);
    expect(kinds1).toContain('commit');
    expect(kinds1).toContain('pr');
    expect(kinds1).toContain('review-comment');
    expect(kinds1).toContain('issue');

    const inlineComment = parsed1.citations.find(
      (c) => c.kind === 'review-comment' && c.excerpt.includes('payment boundary')
    );
    expect(inlineComment).toBeDefined();
    expect(inlineComment.source).toBe('github');

    const reviewEntry = parsed1.citations.find(
      (c) => c.kind === 'review-comment' && c.excerpt.includes('rounding invariants')
    );
    expect(reviewEntry).toBeDefined();

    const closedIssue = parsed1.citations.find((c) => c.kind === 'issue' && c.ref.includes('#19'));
    expect(closedIssue).toBeDefined();

    const cacheDbPath = path.join(repo, '.ctxman', 'evidence', 'github.sqlite');
    expect(fs.existsSync(cacheDbPath)).toBe(true);
    expect(srv.requests).toHaveLength(4);

    // Run 2: ETag 304 Not Modified
    mode = '304';
    srv.requests.length = 0;
    const run2 = await runCli(repo, ['why', 'src/pay.js', '--discussions', '--json'], env);
    expect(run2.status).toBe(0);
    const parsed2 = JSON.parse(run2.stdout);
    expect(parsed2.warnings).toEqual([]);
    expect(parsed2.citations).toEqual(parsed1.citations);
    expect(srv.requests).toHaveLength(4);
    expect(srv.requests.map((r) => r.headers['if-none-match'])).toEqual([
      '"pulls-42"',
      '"comments-42"',
      '"reviews-42"',
      '"issue-19"',
    ]);
  });

  it('Check 2: serves cached citations offline with warning when server stops, and honours since refresh', async () => {
    const { repo, sha } = createTempGitRepo('https://github.com/acme/pay.git');
    trackDir(repo);

    let hits = 0;
    const srv = await trackServer((req, res, urlObj) => {
      hits++;
      const p = urlObj.pathname;
      if (p === `/repos/acme/pay/commits/${sha}/pulls`) {
        sendJson(
          res,
          200,
          [
            {
              number: 42,
              title: 'Cacheable PR',
              state: 'closed',
              created_at: '2026-02-10T11:00:00Z',
              html_url: 'https://github.com/acme/pay/pull/42',
              user: { login: 'alice' },
              body: 'Fixes #19',
            },
          ],
          { ETag: '"etag-pulls"' }
        );
        return;
      }
      if (p === '/repos/acme/pay/pulls/42/comments') {
        sendJson(
          res,
          200,
          [
            {
              id: 1,
              user: { login: 'bob' },
              path: 'src/pay.js',
              line: 2,
              created_at: '2026-02-10T11:30:00Z',
              html_url: 'https://github.com/acme/pay/pull/42#discussion_r1',
              body: 'Offline-resilient inline comment.',
            },
          ],
          { ETag: '"etag-comments"' }
        );
        return;
      }
      if (p === '/repos/acme/pay/pulls/42/reviews') {
        sendJson(res, 200, [], { ETag: '"etag-reviews"' });
        return;
      }
      if (p === '/repos/acme/pay/issues/19') {
        sendJson(
          res,
          200,
          {
            number: 19,
            title: 'Issue 19',
            state: 'closed',
            created_at: '2026-02-09T09:00:00Z',
            html_url: 'https://github.com/acme/pay/issues/19',
            user: { login: 'support' },
            body: 'Closed issue body.',
          },
          { ETag: '"etag-issue"' }
        );
        return;
      }
      sendJson(res, 404, {});
    });

    const env = makeSanitizedEnv({ CTXMAN_GITHUB_API_URL: srv.baseUrl });
    const onlineRes = await runCli(repo, ['why', 'src/pay.js', '--discussions', '--json'], env);
    expect(onlineRes.status).toBe(0);
    const parsedOnline = JSON.parse(onlineRes.stdout);
    expect(parsedOnline.warnings).toEqual([]);
    expect(hits).toBe(4);

    // Since check 1: when fetched_at >= since, no HTTP call is made and no warning emitted
    hits = 0;
    const freshSinceRes = await explainHistory(repo, 'src/pay.js', {
      discussions: true,
      since: '2026-02-01T00:00:00Z',
      style: 'json',
      githubApiBase: srv.baseUrl,
      env: makeSanitizedEnv(),
    });
    const parsedFreshSince = JSON.parse(freshSinceRes.text);
    expect(hits).toBe(0);
    expect(parsedFreshSince.warnings).toEqual([]);
    expect(parsedFreshSince.citations).toEqual(parsedOnline.citations);

    // Since check 2: backdate fetched_at older than since -> forces network refresh with If-None-Match
    const dbPath = path.join(repo, '.ctxman', 'evidence', 'github.sqlite');
    const rawDb = openRawSqlite(dbPath);
    rawDb.prepare("UPDATE http_cache SET fetched_at = '2026-01-15T00:00:00Z'").run();
    rawDb.close();

    srv.requests.length = 0;
    hits = 0;
    const staleSinceRes = await explainHistory(repo, 'src/pay.js', {
      discussions: true,
      since: '2026-02-01T00:00:00Z',
      style: 'json',
      githubApiBase: srv.baseUrl,
      env: makeSanitizedEnv(),
    });
    expect(hits).toBe(4);
    expect(srv.requests.every((r) => Boolean(r.headers['if-none-match']))).toBe(true);
    expect(JSON.parse(staleSinceRes.text).warnings).toEqual([]);

    // Stop server -> offline fallback serves cached citations with warning
    await srv.close();
    const offlineRes = await runCli(repo, ['why', 'src/pay.js', '--discussions', '--json'], env);
    expect(offlineRes.status).toBe(0);
    const parsedOffline = JSON.parse(offlineRes.stdout);
    expect(parsedOffline.citations).toEqual(parsedOnline.citations);
    expect(
      parsedOffline.warnings.some((w) => /served from cache \(offline\), fetched /i.test(w))
    ).toBe(true);
  });

  it('Check 3: cold cache with no token and unreachable server exits 0 with non-empty warnings', async () => {
    const { repo } = createTempGitRepo('https://github.com/acme/pay.git');
    trackDir(repo);
    const deadUrl = await getUnusedLocalPortUrl();
    const env = makeSanitizedEnv({ CTXMAN_GITHUB_API_URL: deadUrl });

    const res = await runCli(repo, ['why', 'src/pay.js', '--discussions', '--json'], env);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.citations.some((c) => c.kind === 'commit')).toBe(true);
  });

  it('Check 5: HTTP 403 with rate-limit headers yields partial results plus warning and stops querying', async () => {
    const { repo, sha } = createTempGitRepo('https://github.com/acme/pay.git');
    trackDir(repo);

    fs.writeFileSync(
      path.join(repo, 'src', 'pay.js'),
      'export function pay(cents) {\n  return Math.round(Number(cents));\n}\n',
      'utf-8'
    );
    git(repo, ['add', '.']);
    git(repo, ['commit', '-qm', 'fix(pay): coerce input'], {
      GIT_AUTHOR_DATE: '2026-02-11T10:00:00Z',
      GIT_COMMITTER_DATE: '2026-02-11T10:00:00Z',
    });
    const sha2 = git(repo, ['rev-parse', 'HEAD']);

    const srv = await trackServer((req, res, urlObj) => {
      const p = urlObj.pathname;
      if (p === `/repos/acme/pay/commits/${sha2}/pulls`) {
        sendJson(res, 200, [
          {
            number: 55,
            title: 'Coerce numeric input',
            state: 'closed',
            created_at: '2026-02-11T11:00:00Z',
            html_url: 'https://github.com/acme/pay/pull/55',
            user: { login: 'alice' },
            body: 'Fixes #88',
          },
        ]);
        return;
      }
      if (p === '/repos/acme/pay/pulls/55/comments') {
        sendJson(res, 200, [
          {
            id: 501,
            user: { login: 'bob' },
            path: 'src/pay.js',
            line: 2,
            created_at: '2026-02-11T11:15:00Z',
            html_url: 'https://github.com/acme/pay/pull/55#discussion_r501',
            body: 'Good defensive Number() cast.',
          },
        ]);
        return;
      }
      if (p === '/repos/acme/pay/pulls/55/reviews') {
        sendJson(res, 200, []);
        return;
      }
      if (p === '/repos/acme/pay/issues/88') {
        sendJson(
          res,
          403,
          { message: 'API rate limit exceeded' },
          {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': '1770800000',
          }
        );
        return;
      }
      if (p === `/repos/acme/pay/commits/${sha}/pulls`) {
        sendJson(res, 200, []);
        return;
      }
      sendJson(res, 404, {});
    });

    const env = makeSanitizedEnv({ CTXMAN_GITHUB_API_URL: srv.baseUrl });
    const res = await runCli(repo, ['why', 'src/pay.js', '--discussions', '--json'], env);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);

    expect(parsed.citations.some((c) => c.kind === 'pr' && c.ref.includes('#55'))).toBe(true);
    expect(parsed.citations.some((c) => c.kind === 'review-comment')).toBe(true);
    expect(parsed.warnings.some((w) => /403|rate limit/i.test(w))).toBe(true);
    // Once 403 rate limit hit on issue #88, commit `sha` pulls must not be requested
    expect(srv.requests.some((r) => r.path.includes(sha))).toBe(false);
  });

  it('Check 6: --budget 500 stays within 500 tokens in JSON output', async () => {
    const { repo, sha } = createTempGitRepo('https://github.com/acme/pay.git');
    trackDir(repo);

    const longWords = 'architecture invariant boundary rounding checksum validation '.repeat(40);
    const srv = await trackServer((req, res, urlObj) => {
      const p = urlObj.pathname;
      if (p === `/repos/acme/pay/commits/${sha}/pulls`) {
        sendJson(res, 200, [
          {
            number: 42,
            title: 'Verbose architectural change for checkout rounding',
            state: 'closed',
            created_at: '2026-02-10T11:00:00Z',
            html_url: 'https://github.com/acme/pay/pull/42',
            user: { login: 'alice' },
            body: `Fixes #19\n${longWords}`,
          },
        ]);
        return;
      }
      if (p === '/repos/acme/pay/pulls/42/comments') {
        sendJson(
          res,
          200,
          [1, 2, 3].map((idx) => ({
            id: idx,
            user: { login: `reviewer${idx}` },
            path: 'src/pay.js',
            line: 2,
            created_at: `2026-02-10T11:2${idx}:00Z`,
            html_url: `https://github.com/acme/pay/pull/42#discussion_r${idx}`,
            body: `Comment ${idx}: ${longWords}`,
          }))
        );
        return;
      }
      if (p === '/repos/acme/pay/pulls/42/reviews') {
        sendJson(res, 200, []);
        return;
      }
      if (p === '/repos/acme/pay/issues/19') {
        sendJson(res, 200, {
          number: 19,
          title: 'Long issue description',
          state: 'closed',
          created_at: '2026-02-09T09:00:00Z',
          html_url: 'https://github.com/acme/pay/issues/19',
          user: { login: 'support' },
          body: longWords,
        });
        return;
      }
      sendJson(res, 404, {});
    });

    const env = makeSanitizedEnv({ CTXMAN_GITHUB_API_URL: srv.baseUrl });
    const res = await runCli(
      repo,
      ['why', 'src/pay.js', '--discussions', '--json', '--budget', '500'],
      env
    );
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.trimmed).not.toBeNull();
    expect(parsed.trimmed.budget).toBe(500);
    expect(TokenUtils.calculate(res.stdout, 'why.json')).toBeLessThanOrEqual(500);
  });

  it('Check 7: never leaks token or server-echoed secrets into stdout, stderr, warnings, or sqlite bytes', async () => {
    const { repo, sha } = createTempGitRepo('https://github.com/acme/pay.git');
    trackDir(repo);

    let mode = 'ok';
    const srv = await trackServer((req, res, urlObj) => {
      const p = urlObj.pathname;
      if (mode === '403') {
        sendJson(
          res,
          403,
          { message: `Forbidden for token ${SYNTH_GH_TOKEN}` },
          { 'X-RateLimit-Remaining': '0' }
        );
        return;
      }
      if (p === `/repos/acme/pay/commits/${sha}/pulls`) {
        sendJson(res, 200, [
          {
            number: 42,
            title: 'Security review PR',
            state: 'closed',
            created_at: '2026-02-10T11:00:00Z',
            html_url: 'https://github.com/acme/pay/pull/42',
            user: { login: 'alice' },
            body: `Echoed token ${SYNTH_GH_TOKEN} and key ${SYNTH_AWS_SECRET}`,
          },
        ]);
        return;
      }
      if (p === '/repos/acme/pay/pulls/42/comments') {
        sendJson(res, 200, [
          {
            id: 1,
            user: { login: 'bob' },
            path: 'src/pay.js',
            line: 2,
            created_at: '2026-02-10T11:30:00Z',
            html_url: 'https://github.com/acme/pay/pull/42#discussion_r1',
            body: `Do not hardcode ${SYNTH_GH_TOKEN} or ${SYNTH_AWS_SECRET}`,
          },
        ]);
        return;
      }
      if (p === '/repos/acme/pay/pulls/42/reviews') {
        sendJson(res, 200, []);
        return;
      }
      sendJson(res, 404, {});
    });

    const env = makeSanitizedEnv({
      CTXMAN_GITHUB_API_URL: srv.baseUrl,
      GITHUB_TOKEN: SYNTH_GH_TOKEN,
    });
    const res1 = await runCli(repo, ['why', 'src/pay.js', '--discussions', '--json'], env);
    expect(res1.status).toBe(0);
    expect(srv.requests[0].headers.authorization).toBe(`Bearer ${SYNTH_GH_TOKEN}`);

    // Verify zero leaks on 403/offline too
    mode = '403';
    const res2 = await runCli(repo, ['why', 'src/pay.js', '--discussions', '--json'], env);

    const dbBytes = fs.readFileSync(path.join(repo, '.ctxman', 'evidence', 'github.sqlite'));
    const dbText = dbBytes.toString('utf-8');
    const allTexts = [res1.stdout, res1.stderr, res2.stdout, res2.stderr, dbText];

    for (const secret of [SYNTH_GH_TOKEN, SYNTH_AWS_SECRET]) {
      expect(dbBytes.includes(Buffer.from(secret))).toBe(false);
      for (const blob of allTexts) {
        expect(blob).not.toContain(secret);
      }
    }
  });

  it('Check 8: supports GitHub Enterprise /api/v3 root and GitLab MRs (including self-hosted non-gitlab host)', async () => {
    // Default GHE URL helper check
    expect(githubApiBase('github.com')).toBe('https://api.github.com');
    expect(githubApiBase('ghe.example.com')).toBe('https://ghe.example.com/api/v3');

    // 8a. GHE mounted under /api/v3
    const { repo: gheRepo, sha: gheSha } = createTempGitRepo(
      'https://ghe.example.com/corp/ledger.git'
    );
    trackDir(gheRepo);

    const gheSrv = await trackServer((req, res, urlObj) => {
      const p = urlObj.pathname;
      if (p === `/api/v3/repos/corp/ledger/commits/${gheSha}/pulls`) {
        sendJson(res, 200, [
          {
            number: 9,
            title: 'GHE pull request',
            state: 'closed',
            created_at: '2026-02-10T11:00:00Z',
            html_url: 'https://ghe.example.com/corp/ledger/pull/9',
            user: { login: 'ghe-dev' },
            body: 'Enterprise rounding change',
          },
        ]);
        return;
      }
      if (p === '/api/v3/repos/corp/ledger/pulls/9/comments') {
        sendJson(res, 200, [
          {
            id: 91,
            user: { login: 'ghe-rev' },
            path: 'src/pay.js',
            line: 2,
            created_at: '2026-02-10T11:15:00Z',
            html_url: 'https://ghe.example.com/corp/ledger/pull/9#discussion_r91',
            body: 'GHE inline review note.',
          },
        ]);
        return;
      }
      if (p === '/api/v3/repos/corp/ledger/pulls/9/reviews') {
        sendJson(res, 200, []);
        return;
      }
      sendJson(res, 404, {});
    });

    const gheRes = await runCli(
      gheRepo,
      ['why', 'src/pay.js', '--discussions', '--json'],
      makeSanitizedEnv({ CTXMAN_GITHUB_API_URL: `${gheSrv.baseUrl}/api/v3` })
    );
    expect(gheRes.status).toBe(0);
    const parsedGhe = JSON.parse(gheRes.stdout);
    expect(parsedGhe.warnings).toEqual([]);
    expect(parsedGhe.citations.some((c) => c.kind === 'pr' && c.title === 'GHE pull request')).toBe(
      true
    );
    expect(
      parsedGhe.citations.some(
        (c) => c.kind === 'review-comment' && c.excerpt.includes('GHE inline review note')
      )
    ).toBe(true);

    // 8b. GitLab standard host + self-hosted non-"gitlab" host with --provider gitlab
    const { repo: glRepo, sha: glSha } = createTempGitRepo(
      'https://code.example.com/team/service.git'
    );
    trackDir(glRepo);

    let glMode = 'ok';
    const glSrv = await trackServer((req, res, urlObj) => {
      if (glMode === '304') {
        if (req.headers['if-none-match']) {
          res.statusCode = 304;
          res.end();
          return;
        }
        sendJson(res, 400, { message: 'Missing If-None-Match' });
        return;
      }
      const rawPath = urlObj.pathname;
      if (
        rawPath === `/api/v4/projects/team%2Fservice/repository/commits/${glSha}/merge_requests`
      ) {
        sendJson(
          res,
          200,
          [
            {
              iid: 77,
              title: 'Self-hosted GitLab MR',
              state: 'merged',
              created_at: '2026-02-10T11:00:00Z',
              web_url: 'https://code.example.com/team/service/-/merge_requests/77',
              author: { username: 'gl-author' },
              description: 'Fixes #31\nEnsure integer cents.',
            },
          ],
          { ETag: '"gl-mr-77"' }
        );
        return;
      }
      if (rawPath === '/api/v4/projects/team%2Fservice/merge_requests/77/notes') {
        sendJson(
          res,
          200,
          [
            {
              id: 1,
              system: true,
              author: { username: 'gitlab-bot' },
              body: 'merged commit',
            },
            {
              id: 2,
              system: false,
              type: 'DiffNote',
              author: { username: 'gl-reviewer' },
              created_at: '2026-02-10T11:25:00Z',
              position: { new_path: 'src/pay.js', new_line: 2 },
              body: `Check overflow edge case (never store ${SYNTH_GL_TOKEN})`,
            },
          ],
          { ETag: '"gl-notes-77"' }
        );
        return;
      }
      if (rawPath === '/api/v4/projects/team%2Fservice/merge_requests/77/closes_issues') {
        sendJson(
          res,
          200,
          [
            {
              iid: 31,
              title: 'Rounding discrepancy on refund',
              state: 'closed',
              created_at: '2026-02-08T08:00:00Z',
              web_url: 'https://code.example.com/team/service/-/issues/31',
              author: { username: 'qa' },
              description: 'Refund off by 1 cent.',
            },
          ],
          { ETag: '"gl-issues-77"' }
        );
        return;
      }
      sendJson(res, 404, {});
    });

    const glEnv = makeSanitizedEnv({
      CTXMAN_GITLAB_API_URL: `${glSrv.baseUrl}/api/v4`,
      GITLAB_TOKEN: SYNTH_GL_TOKEN,
    });
    const glRun1 = await runCli(
      glRepo,
      ['why', 'src/pay.js', '--discussions', '--provider', 'gitlab', '--json'],
      glEnv
    );
    expect(glRun1.status).toBe(0);
    expect(glSrv.requests[0].headers['private-token']).toBe(SYNTH_GL_TOKEN);
    const parsedGl1 = JSON.parse(glRun1.stdout);
    expect(parsedGl1.warnings).toEqual([]);
    expect(parsedGl1.citations.some((c) => c.kind === 'pr' && c.source === 'gitlab')).toBe(true);
    expect(
      parsedGl1.citations.some(
        (c) => c.kind === 'review-comment' && c.excerpt.includes('overflow edge case')
      )
    ).toBe(true);
    expect(
      parsedGl1.citations.some(
        (c) => c.kind === 'review-comment' && c.excerpt.includes('merged commit')
      )
    ).toBe(false);
    expect(parsedGl1.citations.some((c) => c.kind === 'issue' && c.source === 'gitlab')).toBe(true);

    // GitLab ETag 304 reuse
    glMode = '304';
    glSrv.requests.length = 0;
    const glRun2 = await runCli(
      glRepo,
      ['why', 'src/pay.js', '--discussions', '--provider', 'gitlab', '--json'],
      glEnv
    );
    expect(glRun2.status).toBe(0);
    expect(JSON.parse(glRun2.stdout).citations).toEqual(parsedGl1.citations);
    expect(glSrv.requests.map((r) => r.headers['if-none-match'])).toEqual([
      '"gl-mr-77"',
      '"gl-notes-77"',
      '"gl-issues-77"',
    ]);

    // GitLab offline fallback + leak scan
    await glSrv.close();
    const glOffline = await runCli(
      glRepo,
      ['why', 'src/pay.js', '--discussions', '--provider', 'gitlab', '--json'],
      glEnv
    );
    expect(glOffline.status).toBe(0);
    const parsedGlOff = JSON.parse(glOffline.stdout);
    expect(parsedGlOff.citations).toEqual(parsedGl1.citations);
    expect(parsedGlOff.warnings.some((w) => /served from cache \(offline\)/i.test(w))).toBe(true);

    const glDbBytes = fs.readFileSync(path.join(glRepo, '.ctxman', 'evidence', 'github.sqlite'));
    expect(glDbBytes.includes(Buffer.from(SYNTH_GL_TOKEN))).toBe(false);
    expect(glRun1.stdout).not.toContain(SYNTH_GL_TOKEN);
    expect(glOffline.stdout).not.toContain(SYNTH_GL_TOKEN);

    // GitLab host detected automatically by hostname containing "gitlab"
    const { repo: glAutoRepo, sha: glAutoSha } = createTempGitRepo(
      'https://gitlab.example.com/team/service.git'
    );
    trackDir(glAutoRepo);
    const glAutoSource = createGitLabEvidenceSource({
      root: glAutoRepo,
      remote: {
        provider: 'gitlab',
        host: 'gitlab.example.com',
        repoPath: 'team/service',
        webUrl: 'https://gitlab.example.com/team/service',
      },
      commits: [glAutoSha],
      apiBase: 'https://gitlab.example.com/api/v4',
      fetch: async (url) => {
        if (url.includes('/merge_requests?')) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            json: async () => [
              {
                iid: 12,
                title: 'Auto GitLab MR',
                state: 'merged',
                created_at: '2026-02-10T11:00:00Z',
                web_url: 'https://gitlab.example.com/team/service/-/merge_requests/12',
                author: { username: 'alice' },
                description: 'Plain MR',
              },
            ],
          };
        }
        return { ok: true, status: 200, headers: new Map(), json: async () => [] };
      },
      env: {},
    });
    expect(glAutoSource.available()).toBe(true);
    const autoItems = await glAutoSource.search('src/pay.js', { paths: ['src/pay.js'] });
    expect(autoItems.some((item) => item.kind === 'pr' && item.source === 'gitlab')).toBe(true);
  });

  it('Edge cases: pagination + AbortSignal partial, 404 warnings, corrupt sqlite fallback, token precedence, offline default', async () => {
    // 1. Pagination across 2 pages + 304 + offline + AbortSignal mid-pagination
    const { repo, sha } = createTempGitRepo('https://github.com/acme/pay.git');
    trackDir(repo);

    let srvMode = 'paged';
    const srv = await trackServer((req, res, urlObj) => {
      const p = urlObj.pathname;
      const page = urlObj.searchParams.get('page') || '1';
      if (srvMode === '304') {
        res.statusCode = 304;
        res.end();
        return;
      }
      if (p === `/repos/acme/pay/commits/${sha}/pulls`) {
        sendJson(
          res,
          200,
          [
            {
              number: 42,
              title: 'Paginated PR',
              state: 'closed',
              created_at: '2026-02-10T11:00:00Z',
              html_url: 'https://github.com/acme/pay/pull/42',
              user: { login: 'alice' },
              body: 'Fixes #999',
            },
          ],
          { ETag: '"p-pulls"' }
        );
        return;
      }
      if (p === '/repos/acme/pay/pulls/42/comments') {
        if (page === '1') {
          sendJson(
            res,
            200,
            [
              {
                id: 1,
                user: { login: 'u1' },
                path: 'src/pay.js',
                line: 1,
                created_at: '2026-02-10T11:10:00Z',
                html_url: 'https://github.com/acme/pay/pull/42#discussion_r1',
                body: 'Page 1 comment',
              },
            ],
            {
              ETag: '"p-c1"',
              Link: `<${srv.baseUrl}/repos/acme/pay/pulls/42/comments?per_page=100&page=2>; rel="next"`,
            }
          );
          return;
        }
        sendJson(
          res,
          200,
          [
            {
              id: 2,
              user: { login: 'u2' },
              path: 'src/pay.js',
              line: 2,
              created_at: '2026-02-10T11:20:00Z',
              html_url: 'https://github.com/acme/pay/pull/42#discussion_r2',
              body: 'Page 2 comment',
            },
          ],
          { ETag: '"p-c2"' }
        );
        return;
      }
      if (p === '/repos/acme/pay/pulls/42/reviews') {
        sendJson(res, 200, [], { ETag: '"p-rev"' });
        return;
      }
      sendJson(res, 404, { message: 'Not Found' });
    });

    // Offline default untouched even when CTXMAN_GITHUB_API_URL is set
    const offlineDefault = await runCli(
      repo,
      ['why', 'src/pay.js', '--json'],
      makeSanitizedEnv({ CTXMAN_GITHUB_API_URL: srv.baseUrl })
    );
    expect(offlineDefault.status).toBe(0);
    expect(srv.requests).toHaveLength(0);

    // Paged fetch + 404 on #999
    const pagedRes = await runCli(
      repo,
      ['why', 'src/pay.js', '--discussions', '--json'],
      makeSanitizedEnv({ CTXMAN_GITHUB_API_URL: srv.baseUrl })
    );
    expect(pagedRes.status).toBe(0);
    const parsedPaged = JSON.parse(pagedRes.stdout);
    expect(
      parsedPaged.citations.filter((c) => c.kind === 'review-comment').map((c) => c.excerpt)
    ).toEqual(expect.arrayContaining(['Page 1 comment', 'Page 2 comment']));
    expect(parsedPaged.warnings.some((w) => /404/.test(w))).toBe(true);

    // 304 across both pages
    srvMode = '304';
    srv.requests.length = 0;
    const paged304 = await runCli(
      repo,
      ['why', 'src/pay.js', '--discussions', '--json'],
      makeSanitizedEnv({ CTXMAN_GITHUB_API_URL: srv.baseUrl })
    );
    expect(paged304.status).toBe(0);
    expect(JSON.parse(paged304.stdout).citations).toEqual(parsedPaged.citations);
    expect(srv.requests.filter((r) => r.path.endsWith('/comments'))).toHaveLength(2);

    // Corrupt SQLite DB -> emits warning and still succeeds uncached
    const dbPath = path.join(repo, '.ctxman', 'evidence', 'github.sqlite');
    fs.writeFileSync(dbPath, 'this is not a sqlite database', 'utf-8');
    srvMode = 'paged';
    const corruptRes = await runCli(
      repo,
      ['why', 'src/pay.js', '--discussions', '--json'],
      makeSanitizedEnv({ CTXMAN_GITHUB_API_URL: srv.baseUrl })
    );
    expect(corruptRes.status).toBe(0);
    const parsedCorrupt = JSON.parse(corruptRes.stdout);
    expect(parsedCorrupt.warnings.some((w) => /cache/i.test(w))).toBe(true);
    expect(
      parsedCorrupt.citations.some(
        (c) => c.kind === 'review-comment' && c.excerpt === 'Page 2 comment'
      )
    ).toBe(true);

    // AbortSignal mid-pagination returns partial results + warning
    const abortCtrl = new AbortController();
    const abortWarnings = [];
    const pagedAbortedSource = createGitHubEvidenceSource({
      root: repo,
      remote: {
        provider: 'github',
        host: 'github.com',
        repoPath: 'acme/pay',
        webUrl: 'https://github.com/acme/pay',
      },
      commits: [sha],
      cache: false,
      fetch: async (url) => {
        if (url.includes(`/commits/${sha}/pulls`)) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            json: async () => [
              {
                number: 42,
                title: 'Abort test PR',
                state: 'closed',
                created_at: '2026-02-10T11:00:00Z',
                html_url: 'https://github.com/acme/pay/pull/42',
                user: { login: 'alice' },
                body: 'Body',
              },
            ],
          };
        }
        if (url.includes('/pulls/42/comments') && !url.includes('page=2')) {
          abortCtrl.abort();
          return {
            ok: true,
            status: 200,
            headers: new Map([
              [
                'link',
                '<https://api.github.com/repos/acme/pay/pulls/42/comments?page=2>; rel="next"',
              ],
            ]),
            json: async () => [
              {
                id: 10,
                user: { login: 'u1' },
                path: 'src/pay.js',
                line: 1,
                created_at: '2026-02-10T11:10:00Z',
                html_url: 'https://github.com/acme/pay/pull/42#discussion_r10',
                body: 'Partial page 1 before abort',
              },
            ],
          };
        }
        throw new Error('Should not fetch page 2 after abort');
      },
      env: {},
    });
    const partialItems = await pagedAbortedSource.search('src/pay.js', {
      paths: ['src/pay.js'],
      signal: abortCtrl.signal,
      onWarning: (w) => abortWarnings.push(w),
    });
    expect(partialItems.some((i) => i.excerpt.includes('Partial page 1'))).toBe(true);
    expect(abortWarnings.some((w) => /partial|abort|time/i.test(w))).toBe(true);

    // Token precedence: GITHUB_TOKEN > GH_TOKEN > gh auth token (silent failure)
    expect(
      await resolveGitHubToken({
        env: { GITHUB_TOKEN: SYNTH_GH_TOKEN, GH_TOKEN: SYNTH_GH_ALT_TOKEN },
        resolveGhToken: async () => SYNTH_GH_CLI_TOKEN,
      })
    ).toBe(SYNTH_GH_TOKEN);

    expect(
      await resolveGitHubToken({
        env: { GH_TOKEN: SYNTH_GH_ALT_TOKEN },
        resolveGhToken: async () => SYNTH_GH_CLI_TOKEN,
      })
    ).toBe(SYNTH_GH_ALT_TOKEN);

    expect(
      await resolveGitHubToken({
        env: {},
        resolveGhToken: async () => SYNTH_GH_CLI_TOKEN,
      })
    ).toBe(SYNTH_GH_CLI_TOKEN);

    expect(
      await resolveGitHubToken({
        env: {},
        resolveGhToken: async () => {
          throw new Error('gh not installed');
        },
      })
    ).toBeNull();
  });
});
