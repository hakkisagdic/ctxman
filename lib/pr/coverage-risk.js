import path from 'node:path';
import { buildRepoGraph } from '../map/index.js';

function normalizeRel(filePath, rootPath) {
  let p = String(filePath || '').trim();
  if (rootPath && path.isAbsolute(p)) {
    const rel = path.relative(rootPath, p);
    if (rel && !rel.startsWith('..')) p = rel;
  }
  return p.replace(/\\/g, '/').replace(/^\.?\//, '');
}

/**
 * Parses standard LCOV tracefile content into per-file line execution counts (`F3-4`).
 *
 * @param {string} lcovText - Raw LCOV content (`SF:...`, `DA:line,hits`, `end_of_record`)
 * @param {string} [rootPath] - Optional root path to relativize absolute `SF:` paths
 */
export function parseLcovReport(lcovText = '', rootPath = null) {
  const files = new Map();
  let currentFile = null;

  for (const rawLine of String(lcovText || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('SF:')) {
      currentFile = normalizeRel(line.slice(3), rootPath);
      if (!files.has(currentFile)) {
        files.set(currentFile, {
          file: currentFile,
          coveredLines: new Set(),
          uncoveredLines: new Set(),
        });
      }
    } else if (line.startsWith('DA:') && currentFile) {
      const [lineNumStr, hitsStr] = line.slice(3).split(',');
      const lineNum = Number(lineNumStr);
      const hits = Number(hitsStr);
      if (Number.isInteger(lineNum) && lineNum > 0) {
        const entry = files.get(currentFile);
        if (hits > 0) entry.coveredLines.add(lineNum);
        else entry.uncoveredLines.add(lineNum);
      }
    } else if (line === 'end_of_record') {
      currentFile = null;
    }
  }

  return files;
}

/**
 * Maps LCOV uncovered lines onto AST methods (`buildRepoGraph`) to pinpoint untested
 * or partially tested functions (`F3-4`).
 *
 * @param {string} root - Repository root directory
 * @param {string} lcovText - LCOV report content
 * @param {string[]} [changedFiles] - Optional filter of changed files
 */
export function analyzeUncoveredRisk(root, lcovText = '', changedFiles = null) {
  const absRoot = path.resolve(root || process.cwd());
  const coverageMap = parseLcovReport(lcovText, absRoot);
  const graph = buildRepoGraph(absRoot, { history: 0, redact: true });
  const filterSet = Array.isArray(changedFiles)
    ? new Set(changedFiles.map((f) => normalizeRel(f, absRoot)))
    : null;

  const riskyMethods = [];

  for (const node of graph.nodes || []) {
    if (!node || !node.path) continue;
    if (filterSet && !filterSet.has(node.path)) continue;
    const cov = coverageMap.get(node.path);
    if (!cov) continue;

    const methods = [...(node.methods || [])].sort((a, b) => (a.line || 1) - (b.line || 1));
    for (let i = 0; i < methods.length; i++) {
      const m = methods[i];
      const startLine = m.line || 1;
      const endLine =
        m.endLine ||
        (methods[i + 1]
          ? Math.max(startLine, (methods[i + 1].line || startLine) - 1)
          : startLine + 25);

      const uncoveredInMethod = [];
      let coveredCount = 0;
      for (let ln = startLine; ln <= endLine; ln++) {
        if (cov.uncoveredLines.has(ln)) uncoveredInMethod.push(ln);
        if (cov.coveredLines.has(ln)) coveredCount += 1;
      }

      if (uncoveredInMethod.length > 0) {
        const totalTracked = coveredCount + uncoveredInMethod.length;
        const coveragePct =
          totalTracked > 0 ? Math.round((coveredCount / totalTracked) * 1000) / 10 : 0;
        riskyMethods.push({
          file: node.path,
          method: m.name,
          startLine,
          endLine,
          uncoveredLines: uncoveredInMethod,
          coveragePct,
          severity: coveragePct === 0 ? 'high' : 'medium',
        });
      }
    }
  }

  return {
    trackedFiles: coverageMap.size,
    riskyMethodCount: riskyMethods.length,
    riskyMethods,
  };
}
