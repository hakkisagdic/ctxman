/**
 * Ownership of a target from `git blame --line-porcelain`: who wrote which share of the
 * lines, and when each author last touched them
 */

import fs from 'fs';
import path from 'path';
import { GitClient } from '../integrations/git/GitClient.js';
import { tryGit, utcDate } from './git.js';

const UNCOMMITTED = /^0+$/;

/**
 * Blame summary for a line range (or the whole file)
 * @param {string} top - Work tree root
 * @param {object} query
 * @param {string} query.path - Forward-slash path relative to `top`
 * @param {number} [query.startLine]
 * @param {number} [query.endLine]
 * @param {string} [query.rev] - Blame this revision instead of the working tree
 * @returns {{startLine: number|null, endLine: number|null, totalLines: number,
 *   lastChanged: string|null, authors: Array<{name: string, lines: number, share: number,
 *   commits: number, lastTouched: string|null}>}|null} null when blame fails
 */
export function collectOwnership(top, query) {
  const args = ['blame', '--line-porcelain', '-w'];
  if (query.startLine) args.push('-L', `${query.startLine},${query.endLine}`);
  if (query.rev) args.push(query.rev);
  args.push('--', query.path);

  // Honour the conventional list of formatting-only commits, when the project has one
  const ignoreRevs = path.join(top, '.git-blame-ignore-revs');
  let output = null;
  if (fs.existsSync(ignoreRevs)) {
    output = tryGit(top, [
      args[0],
      '--ignore-revs-file',
      '.git-blame-ignore-revs',
      ...args.slice(1),
    ]);
  }
  output ??= tryGit(top, args);
  if (output === null) return null;

  // GitClient knows the porcelain format: one entry per line with commit, author, time
  const lines = GitClient.prototype.parseBlameOutput.call(null, output);
  const authors = new Map();
  let lastChanged = 0;

  for (const line of lines) {
    const uncommitted = UNCOMMITTED.test(line.commit ?? '');
    const name = uncommitted ? '(uncommitted)' : line.author || '(unknown)';
    const entry = authors.get(name) ?? { name, lines: 0, commits: new Set(), lastTouched: 0 };
    entry.lines++;
    if (!uncommitted) {
      entry.commits.add(line.commit);
      entry.lastTouched = Math.max(entry.lastTouched, line.timestamp || 0);
      lastChanged = Math.max(lastChanged, line.timestamp || 0);
    }
    authors.set(name, entry);
  }

  const total = lines.length;
  return {
    startLine: query.startLine ?? null,
    endLine: query.endLine ?? null,
    totalLines: total,
    lastChanged: utcDate(lastChanged),
    authors: [...authors.values()]
      .map((entry) => ({
        name: entry.name,
        lines: entry.lines,
        share: total ? Math.round((entry.lines / total) * 1000) / 1000 : 0,
        commits: entry.commits.size,
        lastTouched: utcDate(entry.lastTouched),
      }))
      .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name)),
  };
}
