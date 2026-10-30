/**
 * Remote issue / pull-request / merge-request discussions enrichment for `ctxman why --discussions`
 *
 * Opt-in only (`discussions: true`). Fetches titles, states, descriptions, labels, and top
 * comments from GitHub (REST v3, including GitHub Enterprise) or GitLab (REST v4, including
 * self-hosted instances) for references mined from commit history.
 *
 * Network failures, missing tokens, 404s, and rate limits never abort `explainHistory()`:
 * they are recorded as human-readable warnings while local git history still renders.
 */

export const DEFAULT_MAX_DISCUSSIONS = 10;
export const DEFAULT_MAX_COMMENTS = 5;
export const DEFAULT_DISCUSSION_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BODY_CHARS = 2000;
const DEFAULT_MAX_COMMENT_CHARS = 800;

function truncateText(text, maxChars) {
  if (!text || typeof text !== 'string') return '';
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}…`;
}

async function fetchJson(fetchFn, url, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    let payload = null;
    if (response.ok) {
      payload = await response.json();
    }
    return { ok: response.ok, status: response.status, headers: response.headers, data: payload };
  } finally {
    clearTimeout(timer);
  }
}

function githubApiBase(host) {
  return host === 'github.com' ? 'https://api.github.com' : `https://${host}/api/v3`;
}

function gitlabApiBase(host) {
  return `https://${host}/api/v4`;
}

function resolveAuthToken(provider, options) {
  if (options.token) return String(options.token).trim();
  const env = options.env ?? process.env;
  if (provider === 'github') {
    return (env.GITHUB_TOKEN || env.GH_TOKEN || '').trim() || null;
  }
  if (provider === 'gitlab') {
    return (env.GITLAB_TOKEN || env.GL_TOKEN || '').trim() || null;
  }
  return null;
}

async function fetchGitHubDiscussion(issue, remote, ctx) {
  const repoPath = issue.repo || remote.repoPath;
  const base = githubApiBase(remote.host);
  const issueUrl = `${base}/repos/${repoPath}/issues/${issue.number}`;
  const res = await fetchJson(ctx.fetchFn, issueUrl, ctx.headers, ctx.timeoutMs);

  if (!res.ok) {
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      const authHint = ctx.hasToken
        ? ''
        : ' (set GITHUB_TOKEN or GH_TOKEN for private repositories and higher rate limits)';
      return {
        rateLimited: res.status === 403 || res.status === 429,
        warning: `GitHub API returned HTTP ${res.status} for ${issue.id}${authHint}.`,
      };
    }
    if (res.status === 404) {
      return { warning: `Discussion ${issue.id} was not found on GitHub (HTTP 404).` };
    }
    return { warning: `GitHub API returned HTTP ${res.status} for ${issue.id}.` };
  }

  const item = res.data ?? {};
  const isPr = Boolean(item.pull_request) || issue.kind === 'pr';
  const merged = Boolean(item.pull_request?.merged_at);
  const state = merged ? 'merged' : String(item.state || 'unknown');
  const labels = Array.isArray(item.labels)
    ? item.labels.map((label) => (typeof label === 'string' ? label : label?.name)).filter(Boolean)
    : [];

  const comments = [];
  const remoteCommentCount = typeof item.comments === 'number' ? item.comments : 1;
  if (ctx.maxComments > 0 && remoteCommentCount > 0) {
    const commentsUrl = `${issueUrl}/comments?per_page=${ctx.maxComments}`;
    try {
      const commentsRes = await fetchJson(ctx.fetchFn, commentsUrl, ctx.headers, ctx.timeoutMs);
      if (commentsRes.ok && Array.isArray(commentsRes.data)) {
        for (const comment of commentsRes.data.slice(0, ctx.maxComments)) {
          const body = truncateText(comment?.body, ctx.maxCommentChars);
          if (!body) continue;
          comments.push({
            author: String(comment?.user?.login || 'unknown'),
            createdAt: comment?.created_at || null,
            body,
          });
        }
      }
    } catch (_err) {
      // Non-fatal: keep main issue/PR discussion even if comments endpoint times out
    }
  }

  return {
    discussion: {
      id: issue.id,
      number: issue.number,
      repo: repoPath,
      provider: 'github',
      kind: isPr ? 'pr' : 'issue',
      title: String(item.title || ''),
      state,
      author: String(item.user?.login || 'unknown'),
      createdAt: item.created_at || null,
      url: item.html_url || issue.url || null,
      labels,
      body: truncateText(item.body, ctx.maxBodyChars),
      commits: issue.commits ?? [],
      comments,
    },
  };
}

async function fetchGitLabDiscussion(issue, remote, ctx) {
  const repoPath = issue.repo || remote.repoPath;
  const encodedRepo = encodeURIComponent(repoPath);
  const base = gitlabApiBase(remote.host);

  const resourceOrder =
    issue.kind === 'mr' ? ['merge_requests', 'issues'] : ['issues', 'merge_requests'];

  let chosenResource = null;
  let res = null;
  for (const resource of resourceOrder) {
    const candidateUrl = `${base}/projects/${encodedRepo}/${resource}/${issue.number}`;
    res = await fetchJson(ctx.fetchFn, candidateUrl, ctx.headers, ctx.timeoutMs);
    if (res.ok) {
      chosenResource = resource;
      break;
    }
    // Only try fallback resource on 404 when kind wasn't explicitly mr
    if (res.status !== 404 || issue.kind === 'mr') break;
  }

  if (!res?.ok || !chosenResource) {
    const status = res?.status ?? 'error';
    if (status === 401 || status === 403 || status === 429) {
      const authHint = ctx.hasToken
        ? ''
        : ' (set GITLAB_TOKEN for private projects and higher rate limits)';
      return {
        rateLimited: status === 429,
        warning: `GitLab API returned HTTP ${status} for ${issue.id}${authHint}.`,
      };
    }
    if (status === 404) {
      return { warning: `Discussion ${issue.id} was not found on GitLab (HTTP 404).` };
    }
    return { warning: `GitLab API returned HTTP ${status} for ${issue.id}.` };
  }

  const item = res.data ?? {};
  const isMr = chosenResource === 'merge_requests';
  const labels = Array.isArray(item.labels)
    ? item.labels.map((label) => (typeof label === 'string' ? label : label?.name)).filter(Boolean)
    : [];

  const comments = [];
  if (ctx.maxComments > 0) {
    const notesUrl = `${base}/projects/${encodedRepo}/${chosenResource}/${issue.number}/notes?sort=asc&per_page=${ctx.maxComments * 2}`;
    try {
      const notesRes = await fetchJson(ctx.fetchFn, notesUrl, ctx.headers, ctx.timeoutMs);
      if (notesRes.ok && Array.isArray(notesRes.data)) {
        for (const note of notesRes.data) {
          if (note?.system) continue;
          const body = truncateText(note?.body, ctx.maxCommentChars);
          if (!body) continue;
          comments.push({
            author: String(note?.author?.username || note?.author?.name || 'unknown'),
            createdAt: note?.created_at || null,
            body,
          });
          if (comments.length >= ctx.maxComments) break;
        }
      }
    } catch (_err) {
      // Non-fatal: keep main issue/MR discussion
    }
  }

  return {
    discussion: {
      id: issue.id,
      number: issue.number,
      repo: repoPath,
      provider: 'gitlab',
      kind: isMr ? 'mr' : 'issue',
      title: String(item.title || ''),
      state: String(item.state || 'unknown'),
      author: String(item.author?.username || item.author?.name || 'unknown'),
      createdAt: item.created_at || null,
      url: item.web_url || issue.url || null,
      labels,
      body: truncateText(item.description, ctx.maxBodyChars),
      commits: issue.commits ?? [],
      comments,
    },
  };
}

/**
 * Fetch remote issue / PR / MR discussions for mined commit references.
 *
 * @param {Array<{id: string, number: number, repo: string|null, kind: string, url: string|null, commits: string[]}>} issues
 * @param {{provider: string|null, host: string, repoPath: string, webUrl: string}|null} remote
 * @param {object} [options]
 * @param {number} [options.maxDiscussions=10]
 * @param {number} [options.maxComments=5]
 * @param {number} [options.timeoutMs=5000]
 * @param {number} [options.maxBodyChars=2000]
 * @param {number} [options.maxCommentChars=800]
 * @param {string} [options.token]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {typeof globalThis.fetch} [options.fetch]
 * @returns {Promise<{discussions: object[], warnings: string[]}>}
 */
export async function fetchDiscussions(issues, remote, options = {}) {
  const warnings = [];
  if (!Array.isArray(issues) || issues.length === 0) {
    return { discussions: [], warnings };
  }

  if (!remote || !remote.provider) {
    warnings.push(
      'Cannot fetch discussions: repository has no supported GitHub or GitLab remote URL.'
    );
    return { discussions: [], warnings };
  }

  if (remote.provider !== 'github' && remote.provider !== 'gitlab') {
    warnings.push(
      `Discussions enrichment is not supported for provider "${remote.provider}" (supported: github, gitlab).`
    );
    return { discussions: [], warnings };
  }

  const fetchFn = options.fetch ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    warnings.push('Cannot fetch discussions: fetch API is unavailable in this Node.js runtime.');
    return { discussions: [], warnings };
  }

  const maxDiscussions = options.maxDiscussions ?? DEFAULT_MAX_DISCUSSIONS;
  if (maxDiscussions <= 0) return { discussions: [], warnings };

  const token = resolveAuthToken(remote.provider, options);
  const headers =
    remote.provider === 'github'
      ? {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ctxman',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        }
      : {
          Accept: 'application/json',
          'User-Agent': 'ctxman',
          ...(token ? { 'PRIVATE-TOKEN': token } : {}),
        };

  const ctx = {
    fetchFn,
    headers,
    hasToken: Boolean(token),
    maxComments: options.maxComments ?? DEFAULT_MAX_COMMENTS,
    timeoutMs: options.timeoutMs ?? DEFAULT_DISCUSSION_TIMEOUT_MS,
    maxBodyChars: options.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS,
    maxCommentChars: options.maxCommentChars ?? DEFAULT_MAX_COMMENT_CHARS,
  };

  const candidates = issues.slice(0, maxDiscussions);
  const discussions = [];

  for (const issue of candidates) {
    try {
      const outcome =
        remote.provider === 'github'
          ? await fetchGitHubDiscussion(issue, remote, ctx)
          : await fetchGitLabDiscussion(issue, remote, ctx);

      if (outcome.warning) warnings.push(outcome.warning);
      if (outcome.discussion) discussions.push(outcome.discussion);
      if (outcome.rateLimited) break;
    } catch (error) {
      const msg = error?.name === 'AbortError' ? 'request timed out' : error?.message || 'error';
      warnings.push(`Failed to fetch discussion ${issue.id}: ${msg}.`);
    }
  }

  return { discussions, warnings };
}

export default fetchDiscussions;
