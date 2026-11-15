import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRepoGraph } from '../map/index.js';

/**
 * Run a git command safely inside `cwd`.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
function runGit(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Build a regression bisect context pack between a known-good revision and a known-bad
 * revision (`F4-4`: Git Bisect Regression Context Pack).
 *
 * Ranks candidate culprit commits by centrality of touched files (`buildRepoGraph`) and
 * overlap with an optional failing target file or symbol.
 *
 * @param {string} root - Git repository root path
 * @param {string} goodRev - Known good git revision
 * @param {string} [badRev='HEAD'] - Known bad git revision
 * @param {object} [options]
 * @param {string} [options.target] - Optional failing file or symbol name to weight commits
 * @param {Array<{sha: string, subject: string, author?: string, date?: string, files?: string[]}>} [options.commits] - Optional pre-supplied commit list (for non-git test fixtures)
 * @param {object} [options.graph] - Optional prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function buildBisectContextPack(root, goodRev, badRev = 'HEAD', options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });
  const targetQuery = options.target ? String(options.target).trim().toLowerCase() : null;

  const incomingCount = new Map();
  for (const edge of graph.edges || []) {
    if (!edge || !edge.to || edge.from === edge.to) continue;
    incomingCount.set(edge.to, (incomingCount.get(edge.to) || 0) + 1);
  }

  let rawCommits = [];
  if (Array.isArray(options.commits)) {
    rawCommits = options.commits;
  } else {
    const logOut = runGit(absRoot, [
      'log',
      '--no-merges',
      '--pretty=format:%H%x09%h%x09%an%x09%ad%x09%s',
      '--date=iso-strict',
      `${goodRev}..${badRev}`,
    ]);
    if (logOut) {
      for (const line of logOut.split('\n')) {
        const [sha, shortSha, author, date, subject] = line.split('\t');
        if (!sha) continue;
        const filesOut = runGit(absRoot, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha]);
        const files = filesOut
          ? filesOut
              .split('\n')
              .map((f) => f.trim())
              .filter(Boolean)
          : [];
        rawCommits.push({
          sha,
          shortSha: shortSha || sha.slice(0, 7),
          author,
          date,
          subject,
          files,
        });
      }
    }
  }

  const scoredCommits = rawCommits.map((c) => {
    const files = Array.isArray(c.files) ? c.files : [];
    let suspicionScore = 10;
    const reasons = [];

    // Weight by incoming dependents of touched files
    let depSum = 0;
    for (const f of files) {
      depSum += incomingCount.get(f) || 0;
    }
    if (depSum > 0) {
      suspicionScore += Math.min(40, depSum * 8);
      reasons.push(`Touches high-centrality module(s) with ${depSum} dependent importer(s)`);
    }

    // Weight by target match
    if (targetQuery) {
      const matchesTargetFile = files.some((f) => f.toLowerCase().includes(targetQuery));
      const matchesSubject = String(c.subject || '')
        .toLowerCase()
        .includes(targetQuery);
      if (matchesTargetFile) {
        suspicionScore += 45;
        reasons.push(`Directly modifies target '${options.target}'`);
      } else if (matchesSubject) {
        suspicionScore += 20;
        reasons.push(`Commit subject mentions '${options.target}'`);
      }
    }

    return {
      sha: c.sha,
      shortSha: c.shortSha || String(c.sha).slice(0, 7),
      author: c.author || 'unknown',
      date: c.date || null,
      subject: c.subject || '',
      files,
      suspicionScore: Math.min(100, suspicionScore),
      reasons,
    };
  });

  scoredCommits.sort((a, b) => b.suspicionScore - a.suspicionScore);

  const midpointIndex = Math.floor(rawCommits.length / 2);
  const nextBisectCommit = rawCommits[midpointIndex] || null;
  const estimatedSteps =
    rawCommits.length > 0 ? Math.max(1, Math.ceil(Math.log2(rawCommits.length))) : 0;

  return {
    root: absRoot,
    goodRev,
    badRev,
    target: options.target || null,
    totalCommitsInRange: rawCommits.length,
    estimatedBisectSteps: estimatedSteps,
    nextBisectCommit: nextBisectCommit
      ? {
          sha: nextBisectCommit.sha,
          shortSha: nextBisectCommit.shortSha || String(nextBisectCommit.sha).slice(0, 7),
          subject: nextBisectCommit.subject,
        }
      : null,
    topSuspects: scoredCommits.slice(0, 5),
    commits: scoredCommits,
  };
}
