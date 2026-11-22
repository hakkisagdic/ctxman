/**
 * GitHub & GitHub Enterprise EvidenceSource (`lib/evidence/sources/github.js`)
 *
 * Follows the commit -> PR -> PR body, review comments (including inline diff comments),
 * reviews, and closed issues chain with SQLite ETag/If-None-Match caching and graceful
 * degradation when offline, unauthenticated, or rate-limited.
 */

import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findRepositoryRoot, literalPathspec, toGitPath, tryGit } from '../../why/git.js';
import {
  DEFAULT_EVIDENCE_CACHE_RELPATH,
  EvidenceHttpCache,
  cachedFetchJson,
  fetchPaginatedJson,
  parseSinceTimestamp,
  scrubSecret,
} from './github-cache.js';

const execFileAsync = promisify(execFile);

export const DEFAULT_MAX_COMMITS = 10;
export const DEFAULT_MAX_PRS = 10;
export const DEFAULT_MAX_COMMENTS = 50;
export const DEFAULT_MAX_CLOSED_ISSUES = 10;
export const DEFAULT_MAX_PAGES = 10;
export const GH_CLI_TIMEOUT_MS = 2000;

/**
 * Resolve the GitHub REST API root for github.com, GitHub Enterprise, or an explicit override.
 *
 * @param {string} host
 * @param {string|null} [explicitApiBase]
 * @returns {string}
 */
export function githubApiBase(host, explicitApiBase = null) {
  if (typeof explicitApiBase === 'string' && explicitApiBase.trim()) {
    return explicitApiBase.trim().replace(/\/+$/, '');
  }
  const normalizedHost = String(host || 'github.com')
    .trim()
    .toLowerCase();
  return normalizedHost === 'github.com'
    ? 'https://api.github.com'
    : `https://${normalizedHost}/api/v3`;
}

/**
 * Extract closed/fixed/resolved issue references (`Fixes #19`, `Closes owner/repo#4`, etc.)
 * from a PR or MR description.
 *
 * @param {string|null|undefined} text
 * @param {string} defaultRepo
 * @param {number|null} [selfNumber]
 * @returns {Array<{repo: string, number: number}>}
 */
export function extractClosingIssues(text, defaultRepo, selfNumber = null) {
  if (!text || typeof text !== 'string') return [];
  const results = [];
  const seen = new Set();

  const addMatch = (repoCandidate, numStr) => {
    const repo = repoCandidate || defaultRepo;
    const number = Number(numStr);
    if (!repo || !Number.isInteger(number) || number <= 0) return;
    if (repo === defaultRepo && selfNumber !== null && number === selfNumber) return;
    const key = `${repo}#${number}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ repo, number });
  };

  for (const match of text.matchAll(
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?::\s*|\s+)(?:([\w.-]+\/[\w.-]+))?#([1-9]\d{0,8})\b/gi
  )) {
    addMatch(match[1], match[2]);
  }

  for (const match of text.matchAll(
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?::\s*|\s+)https?:\/\/[^/\s]+\/([\w.-]+\/[\w.-]+)\/issues\/([1-9]\d{0,8})\b/gi
  )) {
    addMatch(match[1], match[2]);
  }

  return results;
}

/**
 * Read a GitHub token in strict precedence: explicit option -> `GITHUB_TOKEN` -> `GH_TOKEN`
 * -> `gh auth token` (2 s timeout, silent failure). Never persists or logs the token.
 *
 * @param {object} [options]
 * @returns {Promise<string|null>}
 */
export async function resolveGitHubToken(options = {}) {
  if (typeof options.token === 'string' && options.token.trim()) {
    return options.token.trim();
  }

  const hasExplicitEnv = options.env !== undefined && options.env !== null;
  const env = hasExplicitEnv ? options.env : process.env;
  const fromEnv = (env.GITHUB_TOKEN || env.GH_TOKEN || '').trim();
  if (fromEnv) return fromEnv;

  if (options.ghCli === false) return null;

  if (typeof options.resolveGhToken === 'function') {
    try {
      const value = await options.resolveGhToken({ host: options.host, env });
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  }

  // If caller injected an isolated env without PATH (e.g. unit tests with env: {}), skip spawning gh
  if (hasExplicitEnv && !env.PATH && !env.Path) {
    return null;
  }

  const host = String(options.host || 'github.com')
    .trim()
    .toLowerCase();
  const useHostnameFlag =
    host &&
    host !== 'github.com' &&
    host !== 'api.github.com' &&
    host !== '127.0.0.1' &&
    host !== 'localhost';
  const args = useHostnameFlag ? ['auth', 'token', '--hostname', host] : ['auth', 'token'];

  try {
    const { stdout } = await execFileAsync('gh', args, {
      env,
      timeout: GH_CLI_TIMEOUT_MS,
      maxBuffer: 65536,
      windowsHide: true,
    });
    const token = String(stdout ?? '').trim();
    return token || null;
  } catch {
    return null;
  }
}

function resolveCommitShas(options, searchOpts, maxCommits) {
  if (Array.isArray(options.commits) && options.commits.length > 0) {
    return options.commits.filter((s) => typeof s === 'string' && s.trim()).slice(0, maxCommits);
  }
  const root = options.root;
  const targetPath = searchOpts.paths?.[0];
  if (!root || !targetPath) return [];

  try {
    const top = findRepositoryRoot(root);
    const gitPath = toGitPath(path.relative(top, path.resolve(root, targetPath)));
    const args = ['log', '-n', String(maxCommits), '--format=%H'];
    if (searchOpts.since) args.push(`--since=${searchOpts.since}`);
    args.push('--', literalPathspec(gitPath));
    const output = tryGit(top, args);
    if (!output) return [];
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, maxCommits);
  } catch {
    return [];
  }
}

function matchesTargetPath(commentPath, queriedPaths) {
  if (!commentPath || !Array.isArray(queriedPaths) || queriedPaths.length === 0) return false;
  const normComment = String(commentPath).replace(/\\/g, '/').replace(/^\.\//, '');
  return queriedPaths.some((qp) => {
    const normQuery = String(qp).replace(/\\/g, '/').replace(/^\.\//, '');
    return (
      normQuery === normComment ||
      normQuery.endsWith(`/${normComment}`) ||
      normComment.endsWith(`/${normQuery}`)
    );
  });
}

function formatCommentTitle(comment) {
  if (!comment?.path) return undefined;
  const line = comment.line ?? comment.original_line;
  return Number.isInteger(line) && line > 0 ? `${comment.path}:${line}` : comment.path;
}

/**
 * Create a GitHub / GitHub Enterprise `EvidenceSource` (`id: 'github'`).
 *
 * @param {object} [options]
 * @returns {{id: string, available: () => boolean, search: (query: string, searchOpts?: object) => Promise<Array<object>>}}
 */
export function createGitHubEvidenceSource(options = {}) {
  const maxCommits = options.maxCommits ?? DEFAULT_MAX_COMMITS;
  const maxPrs = options.maxPrs ?? DEFAULT_MAX_PRS;
  const maxComments = options.maxComments ?? DEFAULT_MAX_COMMENTS;
  const maxClosedIssues = options.maxClosedIssues ?? DEFAULT_MAX_CLOSED_ISSUES;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const perRequestTimeoutMs = options.timeoutMs ?? 5000;

  const getApiBase = () => {
    const env = options.env ?? process.env;
    const override = options.apiBase ?? env.CTXMAN_GITHUB_API_URL ?? null;
    if (override) return githubApiBase(options.remote?.host, override);
    if (!options.remote) return null;
    return githubApiBase(options.remote.host, null);
  };

  return {
    id: 'github',

    available() {
      const env = options.env ?? process.env;
      const hasOverride = Boolean(options.apiBase ?? env.CTXMAN_GITHUB_API_URL);
      return Boolean(
        options.remote &&
        options.remote.repoPath &&
        (options.remote.provider === 'github' || hasOverride)
      );
    },

    async search(query, searchOpts = {}) {
      const remote = options.remote;
      if (!remote?.repoPath) return [];

      const env = options.env ?? process.env;
      const apiBase = getApiBase();
      if (!apiBase) return [];

      const fetchFn = options.fetch ?? globalThis.fetch;
      if (typeof fetchFn !== 'function') return [];

      const commits = resolveCommitShas(options, searchOpts, maxCommits);
      if (commits.length === 0) return [];

      const emittedWarnings = new Set();
      let activeToken = null;
      const warn = (message) => {
        const cleaned = scrubSecret(message, activeToken).trim();
        if (!cleaned || emittedWarnings.has(cleaned)) return;
        emittedWarnings.add(cleaned);
        const cb = searchOpts.onWarning ?? options.onWarning;
        cb?.(cleaned);
      };

      const signal = searchOpts.signal;
      if (signal?.aborted) {
        warn('GitHub evidence fetch aborted before start; returning partial results.');
        return [];
      }

      activeToken = await resolveGitHubToken({
        token: options.token,
        env,
        host: remote.host,
        ghCli: options.ghCli,
        resolveGhToken: options.resolveGhToken,
      });

      const hasToken = Boolean(activeToken);
      const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ctxman',
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      };

      const useCache = options.cache !== false && Boolean(options.cachePath || options.root);
      const dbPath =
        options.cachePath ||
        (options.root ? path.join(options.root, DEFAULT_EVIDENCE_CACHE_RELPATH) : null);
      const cache = useCache && dbPath ? new EvidenceHttpCache(dbPath, { onWarning: warn }) : null;
      if (cache) cache.open();

      const totalBudgetMs = searchOpts.timeoutMs;
      const deadlineAt =
        typeof totalBudgetMs === 'number' && Number.isFinite(totalBudgetMs) && totalBudgetMs > 0
          ? Date.now() +
            Math.max(50, totalBudgetMs - Math.min(400, Math.floor(totalBudgetMs * 0.15)))
          : null;

      const state = {
        offline: false,
        rateLimited: false,
        offlineCacheTimestamp: null,
        warnedUnreachable: false,
        warnedPartial: false,
        deadlineAt,
      };

      const sinceMs = parseSinceTimestamp(searchOpts.since ?? options.since);
      const cacheHost = remote.host || new URL(apiBase).host;
      const repoPath = remote.repoPath;
      const queriedPaths =
        Array.isArray(searchOpts.paths) && searchOpts.paths.length > 0
          ? searchOpts.paths
          : query
            ? [query]
            : [];

      const commonCtx = {
        cache,
        host: cacheHost,
        repo: repoPath,
        fetchFn,
        headers,
        timeoutMs: perRequestTimeoutMs,
        signal,
        sinceMs,
        token: activeToken,
        hasToken,
        providerLabel: 'GitHub',
        paginationMode: 'github',
        maxPages,
        state,
        warn,
      };

      const items = [];
      const seenPrs = new Set();
      const seenIssues = new Set();
      let closedIssuesRemaining = maxClosedIssues;

      const isBudgetExhausted = () =>
        Boolean(signal?.aborted) || (deadlineAt !== null && Date.now() >= deadlineAt);

      try {
        for (const sha of commits) {
          if (state.rateLimited || seenPrs.size >= maxPrs) break;
          if (isBudgetExhausted()) {
            if (!state.warnedPartial) {
              state.warnedPartial = true;
              warn('GitHub evidence fetch timed out or aborted; returning partial results.');
            }
            break;
          }

          const pullsUrl = `${apiBase}/repos/${repoPath}/commits/${encodeURIComponent(sha)}/pulls?per_page=30`;
          const pullsRes = await fetchPaginatedJson({ ...commonCtx, initialUrl: pullsUrl });

          if (pullsRes.notFound) {
            warn(`GitHub API returned HTTP 404 for commit ${sha.slice(0, 12)} pulls.`);
            continue;
          }

          for (const stubPr of pullsRes.items) {
            if (!stubPr || !Number.isInteger(stubPr.number) || seenPrs.has(stubPr.number)) {
              continue;
            }
            if (seenPrs.size >= maxPrs || state.rateLimited) break;
            if (isBudgetExhausted()) {
              if (!state.warnedPartial) {
                state.warnedPartial = true;
                warn('GitHub evidence fetch timed out or aborted; returning partial results.');
              }
              break;
            }
            seenPrs.add(stubPr.number);

            let pr = stubPr;
            if (pr.body === undefined && pr.title === undefined) {
              const prDetailRes = await cachedFetchJson({
                ...commonCtx,
                url: `${apiBase}/repos/${repoPath}/pulls/${pr.number}`,
              });
              if (prDetailRes.ok && prDetailRes.data && typeof prDetailRes.data === 'object') {
                pr = prDetailRes.data;
              }
            }

            const prUrl =
              pr.html_url || (remote.webUrl ? `${remote.webUrl}/pull/${pr.number}` : null);
            const prTimestamp = pr.merged_at || pr.updated_at || pr.created_at || null;
            const prRef = `${repoPath}#${pr.number}`;

            items.push({
              id: `github:pr:${prRef}`,
              kind: 'pr',
              source: 'github',
              url: prUrl,
              ref: prRef,
              timestamp: prTimestamp,
              author: pr.user?.login || undefined,
              title: pr.title || `PR #${pr.number}`,
              excerpt: pr.body || pr.title || `PR #${pr.number}`,
              score: 0.96,
            });

            let remainingComments = maxComments;
            if (remainingComments > 0 && !state.rateLimited && !isBudgetExhausted()) {
              const commentsUrl = `${apiBase}/repos/${repoPath}/pulls/${pr.number}/comments?per_page=100`;
              const commentsRes = await fetchPaginatedJson({
                ...commonCtx,
                initialUrl: commentsUrl,
              });
              if (commentsRes.notFound) {
                warn(`GitHub API returned HTTP 404 for PR #${pr.number} review comments.`);
              }
              for (let idx = 0; idx < commentsRes.items.length && remainingComments > 0; idx++) {
                const comment = commentsRes.items[idx];
                const body = typeof comment?.body === 'string' ? comment.body.trim() : '';
                if (!body) continue;
                remainingComments--;
                const commentId = comment.id ?? idx + 1;
                items.push({
                  id: `github:review-comment:${prRef}:${commentId}`,
                  kind: 'review-comment',
                  source: 'github',
                  ...(comment.path ? { path: comment.path } : {}),
                  url: comment.html_url || prUrl,
                  ref: `${prRef}#comment-${commentId}`,
                  timestamp: comment.created_at || comment.updated_at || prTimestamp,
                  author: comment.user?.login || undefined,
                  title: formatCommentTitle(comment),
                  excerpt: body,
                  score: matchesTargetPath(comment.path, queriedPaths) ? 0.92 : 0.87,
                });
              }
            }

            if (remainingComments > 0 && !state.rateLimited && !isBudgetExhausted()) {
              const reviewsUrl = `${apiBase}/repos/${repoPath}/pulls/${pr.number}/reviews?per_page=100`;
              const reviewsRes = await fetchPaginatedJson({
                ...commonCtx,
                initialUrl: reviewsUrl,
              });
              for (let idx = 0; idx < reviewsRes.items.length && remainingComments > 0; idx++) {
                const review = reviewsRes.items[idx];
                const body = typeof review?.body === 'string' ? review.body.trim() : '';
                if (!body) continue;
                remainingComments--;
                const reviewId = review.id ?? idx + 1;
                items.push({
                  id: `github:review:${prRef}:${reviewId}`,
                  kind: 'review-comment',
                  source: 'github',
                  url: review.html_url || prUrl,
                  ref: `${prRef}#review-${reviewId}`,
                  timestamp: review.submitted_at || prTimestamp,
                  author: review.user?.login || undefined,
                  title: review.state ? `Review (${review.state})` : 'PR review',
                  excerpt: body,
                  score: 0.88,
                });
              }
            }

            if (closedIssuesRemaining > 0 && !state.rateLimited && !isBudgetExhausted()) {
              const closing = extractClosingIssues(pr.body, repoPath, pr.number);
              for (const ref of closing) {
                if (closedIssuesRemaining <= 0 || state.rateLimited || isBudgetExhausted()) break;
                const issueKey = `${ref.repo}#${ref.number}`;
                if (seenIssues.has(issueKey)) continue;
                seenIssues.add(issueKey);
                closedIssuesRemaining--;

                const issueUrl = `${apiBase}/repos/${ref.repo}/issues/${ref.number}`;
                const issueRes = await cachedFetchJson({
                  ...commonCtx,
                  repo: ref.repo,
                  url: issueUrl,
                });
                if (issueRes.notFound) {
                  warn(`GitHub API returned HTTP 404 for issue ${issueKey}.`);
                  continue;
                }
                if (!issueRes.ok || !issueRes.data || typeof issueRes.data !== 'object') {
                  continue;
                }
                const issue = issueRes.data;
                items.push({
                  id: `github:issue:${issueKey}`,
                  kind: 'issue',
                  source: 'github',
                  url: issue.html_url || null,
                  ref: issueKey,
                  timestamp: issue.closed_at || issue.updated_at || issue.created_at || null,
                  author: issue.user?.login || undefined,
                  title: issue.title || `Issue #${ref.number}`,
                  excerpt: issue.body || issue.title || `Issue #${ref.number}`,
                  score: 0.84,
                });
              }
            }
          }
        }

        if (state.offlineCacheTimestamp) {
          warn(
            `GitHub evidence served from cache (offline), fetched ${state.offlineCacheTimestamp}.`
          );
        }

        return items;
      } finally {
        cache?.close();
      }
    },
  };
}

export default createGitHubEvidenceSource;
