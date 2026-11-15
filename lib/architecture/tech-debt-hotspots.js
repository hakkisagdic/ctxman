import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BRANCH_PATTERNS = [
  /\bif\s*\(/g,
  /\belse\s+if\s*\(/g,
  /\bfor\s*\(/g,
  /\bwhile\s*\(/g,
  /\bcase\s+[^:]+:/g,
  /\bcatch\s*\(/g,
  /&&|\|\||\?\?/g,
  /\?[^:?]+:/g,
];

/**
 * Computes cyclomatic complexity approximation for source code.
 *
 * @param {string} content
 * @returns {number}
 */
export function computeCyclomaticComplexity(content) {
  const source = String(content || '');
  let complexity = 1;
  for (const pattern of BRANCH_PATTERNS) {
    const matches = source.match(pattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

/**
 * Collects git commit churn per file from repository history if not supplied.
 *
 * @param {string} repoRoot
 * @param {number} [maxCommits=200]
 * @returns {Record<string, number>}
 */
function collectGitChurn(repoRoot, maxCommits = 200) {
  if (!repoRoot || !fs.existsSync(repoRoot)) return {};
  try {
    const out = execFileSync(
      'git',
      ['log', `-n`, String(maxCommits), '--format=format:', '--name-only'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const counts = {};
    for (const rawLine of out.split(/\r?\n/)) {
      const file = rawLine.trim();
      if (!file) continue;
      counts[file] = (counts[file] || 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}

/**
 * Analyzes technical debt hotspots by combining file churn (change frequency)
 * with cyclomatic complexity and lines of code (F8-1).
 *
 * @param {object} options
 * @param {Array<{path: string, content?: string, churn?: number, complexity?: number}>} [options.files=[]]
 * @param {Record<string, number>} [options.churnByFile]
 * @param {string} [options.repoRoot]
 * @param {number} [options.topN=10]
 * @returns {{
 *   hotspots: Array<{
 *     file: string,
 *     churn: number,
 *     complexity: number,
 *     loc: number,
 *     hotspotScore: number,
 *     severity: 'critical' | 'high' | 'medium' | 'low',
 *     recommendation: string
 *   }>,
 *   summary: {
 *     totalFiles: number,
 *     criticalCount: number,
 *     highCount: number,
 *     averageComplexity: number,
 *     maxHotspotScore: number
 *   }
 * }}
 */
export function analyzeTechDebtHotspots(options = {}) {
  const { files = [], churnByFile, repoRoot, topN = 10 } = options;
  const gitChurn = churnByFile || collectGitChurn(repoRoot);

  const evaluated = [];
  let totalComplexity = 0;

  for (const item of files) {
    const filePath = String(item.path || '').replace(/\\/g, '/');
    if (!filePath) continue;

    let content = item.content;
    if (content === undefined && repoRoot) {
      const absPath = path.join(repoRoot, filePath);
      if (fs.existsSync(absPath)) {
        content = fs.readFileSync(absPath, 'utf8');
      }
    }
    const source = String(content || '');
    const loc = source ? source.split(/\r?\n/).length : 0;
    const complexity =
      typeof item.complexity === 'number' && item.complexity > 0
        ? item.complexity
        : computeCyclomaticComplexity(source);
    const churn =
      typeof item.churn === 'number' && item.churn >= 0
        ? item.churn
        : Number(gitChurn[filePath] || 1);

    totalComplexity += complexity;

    // Hotspot score weights change frequency x complexity with mild LOC factor
    const locFactor = 1 + Math.min(2, loc / 500);
    const hotspotScore = Number((churn * complexity * locFactor).toFixed(2));

    let severity = 'low';
    if (hotspotScore >= 120 || (churn >= 8 && complexity >= 15)) {
      severity = 'critical';
    } else if (hotspotScore >= 50 || (churn >= 4 && complexity >= 10)) {
      severity = 'high';
    } else if (hotspotScore >= 20) {
      severity = 'medium';
    }

    const recommendation =
      severity === 'critical' || severity === 'high'
        ? `Extract pure helper functions in ${filePath} (complexity=${complexity}, churn=${churn}) to reduce regression risk.`
        : `Monitor ${filePath} complexity during future edits.`;

    evaluated.push({
      file: filePath,
      churn,
      complexity,
      loc,
      hotspotScore,
      severity,
      recommendation,
    });
  }

  evaluated.sort((a, b) => b.hotspotScore - a.hotspotScore || a.file.localeCompare(b.file));

  const criticalCount = evaluated.filter((e) => e.severity === 'critical').length;
  const highCount = evaluated.filter((e) => e.severity === 'high').length;
  const maxHotspotScore = evaluated.length > 0 ? evaluated[0].hotspotScore : 0;

  return {
    hotspots: evaluated.slice(0, topN),
    summary: {
      totalFiles: evaluated.length,
      criticalCount,
      highCount,
      averageComplexity:
        evaluated.length > 0 ? Number((totalComplexity / evaluated.length).toFixed(2)) : 0,
      maxHotspotScore,
    },
  };
}
