import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { explainHistory } from '../index.js';
import { fetchDiscussions } from '../lib/why/discussions.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

function git(cwd, args) {
  execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Alice',
      GIT_AUTHOR_EMAIL: 'alice@example.com',
      GIT_COMMITTER_NAME: 'Alice',
      GIT_COMMITTER_EMAIL: 'alice@example.com',
    },
    stdio: 'pipe',
  });
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    json: async () => data,
  };
}

describe('ctxman why --discussions (N1)', () => {
  let repo;

  beforeEach(() => {
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-why-disc-')));
    git(repo, ['init', '-b', 'main']);
    git(repo, ['remote', 'add', 'origin', 'https://github.com/acme/shop.git']);

    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'src', 'cart.js'),
      'export function total(cents) {\n  return Math.round(cents);\n}\n',
      'utf-8'
    );
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'fix(cart): round totals to cents (#12)\n\nFixes #9']);
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('remains 100% offline by default when discussions is not enabled', async () => {
    const spyFetch = vi.fn();
    const res = await explainHistory(repo, 'src/cart.js:total', { fetch: spyFetch });

    expect(spyFetch).not.toHaveBeenCalled();
    expect(res.data.discussions).toEqual([]);
    expect(res.text).toContain('(no network)');
    expect(res.text).not.toContain('## Discussions');
  });

  it('enriches GitHub PR and issue discussions, redacts secrets, and renders Markdown/XML/JSON', async () => {
    const requests = [];
    const mockFetch = async (url, init) => {
      requests.push({ url, headers: init.headers });
      if (url === 'https://api.github.com/repos/acme/shop/issues/12') {
        return jsonResponse({
          number: 12,
          title: 'Round cart totals at checkout boundary',
          state: 'closed',
          pull_request: { merged_at: '2026-02-01T12:00:00Z' },
          user: { login: 'alice' },
          created_at: '2026-02-01T10:00:00Z',
          html_url: 'https://github.com/acme/shop/pull/12',
          labels: [{ name: 'bug' }, { name: 'checkout' }],
          body: `Floating point drift occurred in discount path. Key leaked in reproduction: ${AWS_KEY}`,
          comments: 1,
        });
      }
      if (url.startsWith('https://api.github.com/repos/acme/shop/issues/12/comments')) {
        return jsonResponse([
          {
            user: { login: 'bob' },
            created_at: '2026-02-01T11:00:00Z',
            body: 'Agreed: round only in total() so intermediate discounts keep precision.',
          },
        ]);
      }
      if (url === 'https://api.github.com/repos/acme/shop/issues/9') {
        return jsonResponse({
          number: 9,
          title: 'Customer invoice shows 0.30000000000000004',
          state: 'closed',
          user: { login: 'customer-support' },
          created_at: '2026-01-29T09:00:00Z',
          html_url: 'https://github.com/acme/shop/issues/9',
          labels: ['regression'],
          body: 'Reported on European VAT invoices.',
          comments: 0,
        });
      }
      return jsonResponse({}, 404);
    };

    const md = await explainHistory(repo, 'src/cart.js:total', {
      discussions: true,
      env: { GITHUB_TOKEN: 'gh-test-token' },
      fetch: mockFetch,
    });

    expect(requests[0].headers.Authorization).toBe('Bearer gh-test-token');
    expect(md.data.discussions).toHaveLength(2);
    expect(md.data.discussions[0]).toMatchObject({
      id: '#12',
      kind: 'pr',
      state: 'merged',
      title: 'Round cart totals at checkout boundary',
    });

    // Secret inside remote PR description must be redacted
    expect(md.text).not.toContain(AWS_KEY);
    expect(md.text).toContain('[REDACTED:aws-access-key-id]');
    expect(md.text).toContain('## Discussions');
    expect(md.text).toContain('### Pull request #12: Round cart totals at checkout boundary');
    expect(md.text).toContain('**@bob (2026-02-01):** Agreed: round only in total()');

    const xml = await explainHistory(repo, 'src/cart.js:total', {
      discussions: true,
      style: 'xml',
      fetch: mockFetch,
    });
    expect(xml.text).toContain('<discussions>');
    expect(xml.text).toContain('<discussion id="#12" number="12" repo="acme/shop"');
    expect(xml.text).toContain('<comment author="bob"');

    const json = await explainHistory(repo, 'src/cart.js:total', {
      discussions: true,
      style: 'json',
      fetch: mockFetch,
    });
    const parsed = JSON.parse(json.text);
    expect(parsed.discussions).toHaveLength(2);
    expect(parsed.discussions[0].body).not.toContain(AWS_KEY);
  });

  it('supports GitLab merge requests and issues, ignoring system notes', async () => {
    const requests = [];
    const mockFetch = async (url, init) => {
      requests.push({ url, headers: init.headers });
      if (url === 'https://gitlab.company.io/api/v4/projects/billing%2Fcore/merge_requests/45') {
        return jsonResponse({
          iid: 45,
          title: 'Switch rounding mode to half-even',
          state: 'merged',
          author: { username: 'carol' },
          created_at: '2026-03-10T08:00:00Z',
          web_url: 'https://gitlab.company.io/billing/core/-/merge_requests/45',
          labels: ['finance'],
          description: 'Aligns tax rounding with accounting rules.',
        });
      }
      if (
        url.startsWith(
          'https://gitlab.company.io/api/v4/projects/billing%2Fcore/merge_requests/45/notes'
        )
      ) {
        return jsonResponse([
          { system: true, author: { username: 'gitlab' }, body: 'merged' },
          {
            system: false,
            author: { username: 'dave' },
            created_at: '2026-03-10T09:00:00Z',
            body: 'Verified against Q1 ledger.',
          },
        ]);
      }
      return jsonResponse({}, 404);
    };

    const res = await fetchDiscussions(
      [{ id: '!45', number: 45, repo: null, kind: 'mr', url: null, commits: ['abc1234'] }],
      {
        provider: 'gitlab',
        host: 'gitlab.company.io',
        repoPath: 'billing/core',
        webUrl: 'https://gitlab.company.io/billing/core',
      },
      {
        env: { GITLAB_TOKEN: 'gl-secret' },
        fetch: mockFetch,
      }
    );

    expect(requests[0].headers['PRIVATE-TOKEN']).toBe('gl-secret');
    expect(res.warnings).toEqual([]);
    expect(res.discussions).toHaveLength(1);
    expect(res.discussions[0]).toMatchObject({
      id: '!45',
      provider: 'gitlab',
      kind: 'mr',
      title: 'Switch rounding mode to half-even',
    });
    expect(res.discussions[0].comments).toEqual([
      {
        author: 'dave',
        createdAt: '2026-03-10T09:00:00Z',
        body: 'Verified against Q1 ledger.',
      },
    ]);
  });

  it('degrades gracefully with warnings on HTTP rate limits or network failures and trims discussions under budget', async () => {
    const rateLimited = await explainHistory(repo, 'src/cart.js:total', {
      discussions: true,
      env: {},
      fetch: async () => jsonResponse({ message: 'rate limit' }, 403),
    });

    // Stops after first 403 rate limit and still succeeds with local history
    expect(rateLimited.data.discussions).toEqual([]);
    expect(rateLimited.warnings.some((w) => w.includes('HTTP 403'))).toBe(true);
    expect(rateLimited.text).toContain('fix(cart): round totals to cents (#12)');

    // Budget trimming drops remote discussions before core history
    const verboseFetch = async (url) => {
      if (url.endsWith('/comments?per_page=5')) return jsonResponse([]);
      return jsonResponse({
        number: 12,
        title: 'Verbose architectural RFC discussion',
        state: 'closed',
        user: { login: 'alice' },
        body: 'word '.repeat(300),
        comments: 0,
      });
    };
    const untrimmed = await explainHistory(repo, 'src/cart.js:total', {
      discussions: true,
      fetch: verboseFetch,
    });
    const trimmed = await explainHistory(repo, 'src/cart.js:total', {
      discussions: true,
      budget: untrimmed.tokens - 250,
      fetch: verboseFetch,
    });
    expect(trimmed.tokens).toBeLessThanOrEqual(untrimmed.tokens - 250);
    expect(trimmed.omitted.discussions).toBeGreaterThan(0);

    // CLI --help documents --discussions
    const cliHelp = spawnSync(process.execPath, [CLI, 'why', '--help'], {
      cwd: repo,
      encoding: 'utf-8',
    });
    expect(cliHelp.status).toBe(0);
    expect(cliHelp.stdout).toContain('--discussions');
  });
});
