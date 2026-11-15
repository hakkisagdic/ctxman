import fs from 'node:fs';
import path from 'node:path';
import { buildRepoGraph } from '../map/index.js';

const LOOP_HEADER_RE =
  /\b(?:for\s*\(|while\s*\(|forEach\s*\(|\.(?:map|filter|reduce|flatMap)\s*\()/;
const DB_OR_IO_QUERY_RE =
  /\b(?:await\s+)?(?:db|prisma|knex|sequelize|pool|client|connection|collection|repo|repository|store|stmt|statement)\s*\.\s*(?:query|execute|get|all|run|find|findOne|findUnique|findMany|findFirst|select|insert|update|delete|upsert|fetch)\s*\(|\bawait\s+fetch\s*\(/;
const SELECT_STAR_WITHOUT_LIMIT_RE =
  /\bSELECT\s+\*\s+FROM\s+[A-Za-z0-9_"`[\]]+(?!\s+[\s\S]{0,80}\bLIMIT\b)/i;

/**
 * Detect N+1 loop queries and unbounded `SELECT *` patterns across repository files
 * (`F5-4`: N+1 & Unindexed Query Bottleneck Hunter).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options]
 * @param {object} [options.graph] - Optional prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function findQueryBottlenecks(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });

  const bottlenecks = [];

  for (const node of graph.nodes || []) {
    if (!node || !node.path) continue;
    const fullPath = path.join(absRoot, node.path);
    if (!fs.existsSync(fullPath)) continue;

    let src = '';
    try {
      src = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const lines = src.split('\n');
    let loopBraceDepth = 0;
    const loopStack = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const lineNum = idx + 1;

      if (LOOP_HEADER_RE.test(line)) {
        loopStack.push({ startLine: lineNum, baseDepth: loopBraceDepth });
      }

      for (let c = 0; c < line.length; c++) {
        if (line[c] === '{') loopBraceDepth += 1;
        else if (line[c] === '}') {
          loopBraceDepth = Math.max(0, loopBraceDepth - 1);
          while (
            loopStack.length > 0 &&
            loopBraceDepth <= loopStack[loopStack.length - 1].baseDepth
          ) {
            loopStack.pop();
          }
        }
      }

      if (loopStack.length > 0 && DB_OR_IO_QUERY_RE.test(line)) {
        bottlenecks.push({
          ruleId: 'ctxman/perf/n-plus-one-query',
          severity: 'warning',
          file: node.path,
          line: lineNum,
          loopStartLine: loopStack[loopStack.length - 1].startLine,
          snippet: line.trim(),
          message: `Potential N+1 query or I/O call inside loop (loop at L${loopStack[loopStack.length - 1].startLine}): batch with WHERE IN / Promise.all / prepared bulk query.`,
        });
      }

      if (SELECT_STAR_WITHOUT_LIMIT_RE.test(line)) {
        bottlenecks.push({
          ruleId: 'ctxman/perf/unbounded-select-star',
          severity: 'note',
          file: node.path,
          line: lineNum,
          loopStartLine: null,
          snippet: line.trim(),
          message: `Unbounded 'SELECT * FROM' query without explicit column list or LIMIT clause.`,
        });
      }
    }
  }

  return {
    root: absRoot,
    scannedFiles: (graph.nodes || []).length,
    bottleneckCount: bottlenecks.length,
    bottlenecks,
  };
}
