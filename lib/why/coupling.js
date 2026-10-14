/**
 * Co-change coupling: files that changed in the same commits as the target. A file that
 * nearly always changes with the target is usually part of the same decision (a test, a
 * schema, a caller, the docs), which makes it a strong "what else" signal
 */

import { literalPathspec, runGit } from './git.js';

const RS = '\x1e';

/**
 * Split `git log --format=<RS>%H --name-only` output into commits and their files
 * @param {string} output
 * @returns {Array<{sha: string, files: string[]}>}
 */
function parseNameOnly(output) {
  return output
    .split(RS)
    .map((record) => record.split('\n').filter((line) => line !== ''))
    .filter((lines) => lines.length > 0)
    .map(([sha, ...files]) => ({ sha: sha.trim(), files }));
}

/**
 * @param {string} top - Work tree root
 * @param {object} query
 * @param {string} query.path - Forward-slash path relative to `top`
 * @param {number} query.window - Commits of the target to examine
 * @param {number} [query.maxFilesPerCommit] - Larger commits are skipped as noise (default 50)
 * @param {string} [query.rev]
 * @param {(gitPath: string) => boolean} [query.keep] - Filter on candidate paths
 * @returns {{window: number, targetChanges: number, skippedLargeCommits: number,
 *   files: Array<{path: string, count: number, confidence: number}>}}
 */
export function collectCoupling(top, query) {
  const maxFiles = query.maxFilesPerCommit ?? 50;
  const args = ['log', '--follow', '--no-merges', '-n', String(query.window)];
  args.push(`--format=${RS}%H`, '--name-only');
  if (query.rev) args.push(query.rev);
  args.push('--', literalPathspec(query.path));

  // With a pathspec, --name-only lists only the target, under its name at that commit
  const touches = parseNameOnly(runGit(top, args));
  const aliases = new Set([query.path, ...touches.flatMap((commit) => commit.files)]);

  let commits = [];
  if (touches.length > 0) {
    const input = touches.map((commit) => commit.sha).join('\n') + '\n';
    commits = parseNameOnly(
      runGit(top, ['log', '--no-walk=unsorted', '--stdin', `--format=${RS}%H`, '--name-only'], {
        input,
      })
    );
  }

  const counts = new Map();
  let considered = 0;
  let skipped = 0;
  for (const commit of commits) {
    if (commit.files.length > maxFiles) {
      skipped++;
      continue;
    }
    considered++;
    for (const file of new Set(commit.files)) {
      if (aliases.has(file)) continue;
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
  }

  const files = [...counts.entries()]
    .filter(([file]) => !query.keep || query.keep(file))
    .map(([file, count]) => ({
      path: file,
      count,
      confidence: considered ? Math.round((count / considered) * 1000) / 1000 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

  return { window: query.window, targetChanges: considered, skippedLargeCommits: skipped, files };
}
