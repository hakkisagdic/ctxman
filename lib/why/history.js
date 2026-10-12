/**
 * Commit history of a target: `git log -L` for a line range (or git's own funcname
 * matching as a fallback), `git log --follow` for a whole file
 */

import { literalPathspec, runGit, utcDate } from './git.js';

// Record separator, field separator, end of header: the patch (if any) follows the header
const RS = '\x1e';
const FS = '\x1f';
const EOH = '\x1d';
const FORMAT = `--format=${RS}%H${FS}%h${FS}%aI${FS}%an${FS}%ae${FS}%P${FS}%s${FS}%b${EOH}`;

/**
 * @typedef {object} HistoryCommit
 * @property {string} sha
 * @property {string} shortSha
 * @property {string} date - Author date, ISO 8601 in UTC (2024-01-02T10:00:00Z)
 * @property {string} author
 * @property {string} email
 * @property {boolean} merge
 * @property {string} subject
 * @property {string} body
 * @property {string} [patch] - Diff for the target (only when patches were requested)
 */

/**
 * Parse `git log` output written with FORMAT
 * @param {string} output
 * @param {boolean} keepPatches
 * @returns {HistoryCommit[]}
 */
export function parseLog(output, keepPatches) {
  const commits = [];
  for (const record of output.split(RS)) {
    const end = record.indexOf(EOH);
    if (end === -1) continue;
    const fields = record.slice(0, end).split(FS);
    if (fields.length < 8) continue;
    const [sha, shortSha, date, author, email, parents, subject, ...body] = fields;
    const commit = {
      sha,
      shortSha,
      date: utcDate(date) ?? date,
      author,
      email,
      merge: parents.trim().split(/\s+/).length > 1,
      subject,
      body: body.join(FS).trim(),
    };
    if (keepPatches) {
      const patch = record
        .slice(end + 1)
        .replace(/^\n+/, '')
        .trimEnd();
      if (patch) commit.patch = patch;
    }
    commits.push(commit);
  }
  return commits;
}

/**
 * Commits that touched the target, newest first
 * @param {string} top - Work tree root (git runs here)
 * @param {object} query
 * @param {string} query.path - Forward-slash path relative to `top`
 * @param {'range'|'funcname'|'file'} query.mode
 * @param {number} [query.startLine] - For 'range' (lines of `rev`)
 * @param {number} [query.endLine]
 * @param {string} [query.funcname] - For 'funcname': a basic regular expression
 * @param {string} [query.rev] - Revision to start from (validated by the caller)
 * @param {number} query.limit
 * @param {string} [query.since]
 * @param {boolean} [query.patches]
 * @returns {HistoryCommit[]}
 */
export function collectHistory(top, query) {
  const args = ['log', FORMAT, '-n', String(query.limit), '--no-ext-diff', '--no-color'];
  if (query.since) args.push(`--since=${query.since}`);

  if (query.mode === 'file') {
    args.push('--follow');
    if (query.patches) args.push('-p');
    if (query.rev) args.push(query.rev);
    args.push('--', literalPathspec(query.path));
  } else {
    const range =
      query.mode === 'range'
        ? `${query.startLine},${query.endLine}:${query.path}`
        : `:${query.funcname}:${query.path}`;
    args.push('-L', range);
    // Older git versions ignore -s with -L; parseLog drops the patch text either way
    if (!query.patches) args.push('-s');
    if (query.rev) args.push(query.rev);
  }

  return parseLog(runGit(top, args), Boolean(query.patches));
}

/**
 * Escape a symbol for git's `-L :<funcname>:<file>` (a POSIX basic regular expression)
 * @param {string} name
 * @returns {string}
 */
export function funcnamePattern(name) {
  return name.replace(/[.[\]*^$\\]/g, '\\$&');
}
