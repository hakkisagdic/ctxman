import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRepoGraph } from '../map/index.js';

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
 * Analyze contributor knowledge concentration and Bus-Factor risk across repository
 * modules (`F5-3`: Knowledge Silo & Bus-Factor Analyzer).
 *
 * Identifies high-centrality modules where >=80% of commits/lines belong to a single
 * contributor ("knowledge silo").
 *
 * @param {string} root - Repository root directory
 * @param {object} [options]
 * @param {number} [options.siloThreshold=0.8] - Ownership share above which a file is a knowledge silo
 * @param {Record<string, Array<{author: string, lines?: number, commits?: number}>>} [options.ownershipByFile] - Optional pre-supplied ownership map
 * @param {object} [options.graph] - Optional prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function analyzeBusFactor(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const siloThreshold = Number(options.siloThreshold) || 0.8;
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });

  const incomingDependents = new Map();
  for (const edge of graph.edges || []) {
    if (!edge || !edge.to || edge.from === edge.to) continue;
    incomingDependents.set(edge.to, (incomingDependents.get(edge.to) || 0) + 1);
  }

  const authorTotals = new Map();
  const fileReports = [];

  for (const node of graph.nodes || []) {
    if (!node || !node.path) continue;
    const filePath = node.path;

    let contributors = [];
    if (options.ownershipByFile && Array.isArray(options.ownershipByFile[filePath])) {
      contributors = options.ownershipByFile[filePath].map((c) => ({
        author: c.author,
        weight: Number(c.lines ?? c.commits ?? 1),
      }));
    } else {
      const shortlog = runGit(absRoot, ['shortlog', '-sne', 'HEAD', '--', filePath]);
      if (shortlog) {
        for (const line of shortlog.split('\n')) {
          const m = line.trim().match(/^(\d+)\s+(.+?)(?:\s+<[^>]+>)?$/);
          if (m) {
            contributors.push({ author: m[2].trim(), weight: Number(m[1]) });
          }
        }
      }
    }

    const totalWeight = contributors.reduce((s, c) => s + c.weight, 0);
    if (totalWeight === 0) continue;

    contributors.sort((a, b) => b.weight - a.weight);
    for (const c of contributors) {
      authorTotals.set(c.author, (authorTotals.get(c.author) || 0) + c.weight);
    }

    const topOwner = contributors[0];
    const topShare = Number((topOwner.weight / totalWeight).toFixed(3));
    const dependents = incomingDependents.get(filePath) || 0;
    const isSilo = topShare >= siloThreshold;

    // File bus factor: minimum number of authors accounting for >= 50% of contributions
    let cumulative = 0;
    let fileBusFactor = 0;
    for (const c of contributors) {
      cumulative += c.weight;
      fileBusFactor += 1;
      if (cumulative >= totalWeight * 0.5) break;
    }

    const riskScore = Math.min(
      100,
      Math.round(
        topShare * 60 + Math.min(40, dependents * 12) + (contributors.length === 1 ? 15 : 0)
      )
    );

    fileReports.push({
      file: filePath,
      busFactor: fileBusFactor,
      contributorCount: contributors.length,
      primaryOwner: topOwner.author,
      primaryShare: topShare,
      dependents,
      isKnowledgeSilo: isSilo,
      riskScore,
    });
  }

  fileReports.sort((a, b) => b.riskScore - a.riskScore);
  const silos = fileReports.filter((f) => f.isKnowledgeSilo);

  // Repo-wide bus factor: minimum number of authors covering >= 50% of total weighted contributions
  const sortedAuthors = [...authorTotals.entries()].sort((a, b) => b[1] - a[1]);
  const grandTotal = sortedAuthors.reduce((s, [, w]) => s + w, 0);
  let repoBusFactor = 0;
  let acc = 0;
  for (const [, weight] of sortedAuthors) {
    acc += weight;
    repoBusFactor += 1;
    if (acc >= grandTotal * 0.5) break;
  }

  return {
    root: absRoot,
    repositoryBusFactor: Math.max(1, repoBusFactor || 1),
    totalAnalyzedFiles: fileReports.length,
    siloCount: silos.length,
    silos,
    files: fileReports,
  };
}
