/**
 * GitLab & Self-Hosted GitLab EvidenceSource (`lib/evidence/sources/gitlab.js`)
 *
 * Follows the commit -> MR -> MR notes (excluding system notes; preserving DiffNote paths)
 * -> closed issues chain with shared SQLite ETag/If-None-Match caching and graceful offline /
 * rate-limit degradation.
 */

import path from 'node:path';
import { findRepositoryRoot, literalPathspec, toGitPath, tryGit } from '../../why/git.js';
import { extractClosingIssues } from './github.js';
import {
  DEFAULT_EVIDENCE_CACHE_RELPATH,
  EvidenceHttpCache,
  cachedFetchJson,
  fetchPaginatedJson,
  parseSinceTimestamp,
  scrubSecret,
} from './github-cache.js';

export const DEFAULT_MAX_COMMITS = 10;
export const DEFAULT_MAX_MRS = 10;
export const DEFAULT_MAX_NOTES = 50;
export const DEFAULT_MAX_CLOSED_ISSUES = 10;
export const DEFAULT_MAX_PAGES = 10;

/**
 * Resolve the GitLab REST API v4 root for gitlab.com, self-hosted instances, or an explicit override.
 *
 * @param {string} host
 * @param {string|null} [explicitApiBase]
 * @returns {string}
 */
export function gitlabApiBase(host, explicitApiBase = null) {
  if (typeof explicitApiBase === 'string' && explicitApiBase.trim()) {
    return explicitApiBase.trim().replace(/\/+$/, '');
  }
  const normalizedHost = String(host || 'gitlab.com')
    .trim()
    .toLowerCase();
  return `https://${normalizedHost}/api/v4`;
}

/**
 * Read a GitLab token in strict precedence: explicit option -> `GITLAB_TOKEN` -> `GL_TOKEN`.
 * Never persists or logs the token.
 *
 * @param {object} [options]
 * @returns {string|null}
 */
export function resolveGitLabToken(options = {}) {
  if (typeof options.token === 'string' && options.token.trim()) {
    return options.token.trim();
  }
  const env = options.env ?? process.env;
  const token = (env.GITLAB_TOKEN || env.GL_TOKEN || '').trim();
  return token || null;
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

function matchesTargetPath(notePath, queriedPaths) {
  if (!notePath || !Array.isArray(queriedPaths) || queriedPaths.length === 0) return false;
  const normNote = String(notePath).replace(/\\/g, '/').replace(/^\.\//, '');
  return queriedPaths.some((qp) => {
    const normQuery = String(qp).replace(/\\/g, '/').replace(/^\.\//, '');
    return (
      normQuery === normNote ||
      normQuery.endsWith(`/${normNote}`) ||
      normNote.endsWith(`/${normQuery}`)
    );
  });
}

function formatNoteTitle(notePath, noteLine) {
  if (!notePath) return undefined;
  return Number.isInteger(noteLine) && noteLine > 0 ? `${notePath}:${noteLine}` : notePath;
}

/**
 * Create a GitLab / self-hosted GitLab `EvidenceSource` (`id: 'gitlab'`).
 *
 * @param {object} [options]
 * @returns {{id: string, available: () => boolean, search: (query: string, searchOpts?: object) => Promise<Array<object>>}}
 */
export function createGitLabEvidenceSource(options = {}) {
  const maxCommits = options.maxCommits ?? DEFAULT_MAX_COMMITS;
  const maxMrs = options.maxMrs ?? DEFAULT_MAX_MRS;
  const maxNotes = options.maxNotes ?? DEFAULT_MAX_NOTES;
  const maxClosedIssues = options.maxClosedIssues ?? DEFAULT_MAX_CLOSED_ISSUES;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const perRequestTimeoutMs = options.timeoutMs ?? 5000;

  const getApiBase = () => {
    const env = options.env ?? process.env;
    const override = options.apiBase ?? env.CTXMAN_GITLAB_API_URL ?? null;
    if (override) return gitlabApiBase(options.remote?.host, override);
    if (!options.remote) return null;
    return gitlabApiBase(options.remote.host, null);
  };

  return {
    id: 'gitlab',

    available() {
      const env = options.env ?? process.env;
      const hasOverride = Boolean(options.apiBase ?? env.CTXMAN_GITLAB_API_URL);
      return Boolean(
        options.remote &&
        options.remote.repoPath &&
        (options.remote.provider === 'gitlab' || hasOverride)
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
      const activeToken = resolveGitLabToken({ token: options.token, env });
      const warn = (message) => {
        const cleaned = scrubSecret(message, activeToken).trim();
        if (!cleaned || emittedWarnings.has(cleaned)) return;
        emittedWarnings.add(cleaned);
        const cb = searchOpts.onWarning ?? options.onWarning;
        cb?.(cleaned);
      };

      const signal = searchOpts.signal;
      if (signal?.aborted) {
        warn('GitLab evidence fetch aborted before start; returning partial results.');
        return [];
      }

      const hasToken = Boolean(activeToken);
      const headers = {
        Accept: 'application/json',
        'User-Agent': 'ctxman',
        ...(activeToken ? { 'PRIVATE-TOKEN': activeToken } : {}),
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
      const encodedRepo = encodeURIComponent(repoPath);
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
        providerLabel: 'GitLab',
        paginationMode: 'gitlab',
        maxPages,
        state,
        warn,
      };

      const items = [];
      const seenMrs = new Set();
      const seenIssues = new Set();
      let closedIssuesRemaining = maxClosedIssues;

      const isBudgetExhausted = () =>
        Boolean(signal?.aborted) || (deadlineAt !== null && Date.now() >= deadlineAt);

      const pushIssue = (issue) => {
        const iid = issue?.iid ?? issue?.id;
        if (!Number.isInteger(iid) || iid <= 0) return;
        const issueKey = `${repoPath}#${iid}`;
        if (seenIssues.has(issueKey) || closedIssuesRemaining <= 0) return;
        seenIssues.add(issueKey);
        closedIssuesRemaining--;

        items.push({
          id: `gitlab:issue:${issueKey}`,
          kind: 'issue',
          source: 'gitlab',
          url: issue.web_url || (remote.webUrl ? `${remote.webUrl}/-/issues/${iid}` : null),
          ref: issueKey,
          timestamp: issue.closed_at || issue.updated_at || issue.created_at || null,
          author: issue.author?.username || issue.author?.name || undefined,
          title: issue.title || `Issue #${iid}`,
          excerpt: issue.description || issue.title || `Issue #${iid}`,
          score: 0.84,
        });
      };

      try {
        for (const sha of commits) {
          if (state.rateLimited || seenMrs.size >= maxMrs) break;
          if (isBudgetExhausted()) {
            if (!state.warnedPartial) {
              state.warnedPartial = true;
              warn('GitLab evidence fetch timed out or aborted; returning partial results.');
            }
            break;
          }

          const mrsUrl = `${apiBase}/projects/${encodedRepo}/repository/commits/${encodeURIComponent(sha)}/merge_requests?per_page=30`;
          const mrsRes = await fetchPaginatedJson({ ...commonCtx, initialUrl: mrsUrl });
          if (mrsRes.notFound) {
            warn(`GitLab API returned HTTP 404 for commit ${sha.slice(0, 12)} merge requests.`);
            continue;
          }

          for (const mr of mrsRes.items) {
            if (!mr || !Number.isInteger(mr.iid) || seenMrs.has(mr.iid)) continue;
            if (seenMrs.size >= maxMrs || state.rateLimited) break;
            if (isBudgetExhausted()) {
              if (!state.warnedPartial) {
                state.warnedPartial = true;
                warn('GitLab evidence fetch timed out or aborted; returning partial results.');
              }
              break;
            }
            seenMrs.add(mr.iid);

            const mrRef = `${repoPath}!${mr.iid}`;
            const mrUrl =
              mr.web_url || (remote.webUrl ? `${remote.webUrl}/-/merge_requests/${mr.iid}` : null);
            const mrTimestamp = mr.merged_at || mr.updated_at || mr.created_at || null;

            items.push({
              id: `gitlab:mr:${mrRef}`,
              kind: 'pr',
              source: 'gitlab',
              url: mrUrl,
              ref: mrRef,
              timestamp: mrTimestamp,
              author: mr.author?.username || mr.author?.name || undefined,
              title: mr.title || `MR !${mr.iid}`,
              excerpt: mr.description || mr.title || `MR !${mr.iid}`,
              score: 0.96,
            });

            if (maxNotes > 0 && !state.rateLimited && !isBudgetExhausted()) {
              const notesUrl = `${apiBase}/projects/${encodedRepo}/merge_requests/${mr.iid}/notes?sort=asc&per_page=100`;
              const notesRes = await fetchPaginatedJson({ ...commonCtx, initialUrl: notesUrl });
              if (notesRes.notFound) {
                warn(`GitLab API returned HTTP 404 for MR !${mr.iid} notes.`);
              }

              let keptNotes = 0;
              for (let idx = 0; idx < notesRes.items.length && keptNotes < maxNotes; idx++) {
                const note = notesRes.items[idx];
                if (note?.system) continue;
                const body = typeof note?.body === 'string' ? note.body.trim() : '';
                if (!body) continue;
                keptNotes++;

                const noteId = note.id ?? idx + 1;
                const notePath = note.position?.new_path || note.position?.old_path || undefined;
                const noteLine = note.position?.new_line || note.position?.old_line || null;
                items.push({
                  id: `gitlab:note:${mrRef}:${noteId}`,
                  kind: 'review-comment',
                  source: 'gitlab',
                  ...(notePath ? { path: notePath } : {}),
                  url: mrUrl ? `${mrUrl}#note_${noteId}` : null,
                  ref: `${mrRef}#note-${noteId}`,
                  timestamp: note.created_at || note.updated_at || mrTimestamp,
                  author: note.author?.username || note.author?.name || undefined,
                  title: formatNoteTitle(notePath, noteLine),
                  excerpt: body,
                  score: matchesTargetPath(notePath, queriedPaths) ? 0.92 : 0.87,
                });
              }
            }

            if (closedIssuesRemaining > 0 && !state.rateLimited && !isBudgetExhausted()) {
              const closesUrl = `${apiBase}/projects/${encodedRepo}/merge_requests/${mr.iid}/closes_issues?per_page=100`;
              const closesRes = await fetchPaginatedJson({ ...commonCtx, initialUrl: closesUrl });
              if (closesRes.ok && closesRes.items.length > 0) {
                for (const issue of closesRes.items) {
                  if (closedIssuesRemaining <= 0) break;
                  pushIssue(issue);
                }
              } else if (!state.rateLimited && !isBudgetExhausted()) {
                const closing = extractClosingIssues(mr.description, repoPath, mr.iid);
                for (const ref of closing) {
                  if (ref.repo !== repoPath) continue;
                  if (closedIssuesRemaining <= 0 || state.rateLimited || isBudgetExhausted()) break;
                  if (seenIssues.has(`${repoPath}#${ref.number}`)) continue;
                  const issueRes = await cachedFetchJson({
                    ...commonCtx,
                    url: `${apiBase}/projects/${encodedRepo}/issues/${ref.number}`,
                  });
                  if (issueRes.notFound) {
                    warn(`GitLab API returned HTTP 404 for issue ${repoPath}#${ref.number}.`);
                    continue;
                  }
                  if (issueRes.ok && issueRes.data && typeof issueRes.data === 'object') {
                    pushIssue(issueRes.data);
                  }
                }
              }
            }
          }
        }

        if (state.offlineCacheTimestamp) {
          warn(
            `GitLab evidence served from cache (offline), fetched ${state.offlineCacheTimestamp}.`
          );
        }

        return items;
      } finally {
        cache?.close();
      }
    },
  };
}

export default createGitLabEvidenceSource;
