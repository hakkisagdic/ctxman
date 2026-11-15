/**
 * F13-3: Database Index Coverage & Slow-Query Advisor
 * Extracts WHERE / JOIN / ORDER BY columns from SQL queries and recommends composite CREATE INDEX DDL.
 */

const SELECT_TABLE_REGEX =
  /\bFROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([^;]+?))?(?:\s+ORDER\s+BY\s+([a-zA-Z0-9_.,\s]+))?(?:;|$)/gi;

function extractColumnsFromPredicate(predicate) {
  if (!predicate) return [];
  const cols = [];
  const colRegex = /\b([a-zA-Z0-9_]+)\s*(?:=|>=|<=|<>|!=|>|<|\bIN\b|\bLIKE\b)/gi;
  let m;
  while ((m = colRegex.exec(predicate)) !== null) {
    const col = m[1].toLowerCase();
    if (!['and', 'or', 'not', 'null', 'true', 'false'].includes(col) && !cols.includes(col)) {
      cols.push(col);
    }
  }
  return cols;
}

/**
 * Recommend missing database indexes by comparing SQL queries against existing index definitions.
 *
 * @param {object} options
 * @param {string[]} [options.queries]
 * @param {Array<{table: string, columns: string[]}>} [options.existingIndexes]
 * @returns {object}
 */
export function recommendMissingIndexes(options = {}) {
  const queries = Array.isArray(options.queries) ? options.queries : [];
  const existingIndexes = Array.isArray(options.existingIndexes) ? options.existingIndexes : [];

  const coveredKeys = new Set(
    existingIndexes.map(
      (idx) =>
        `${String(idx.table).toLowerCase()}:${(idx.columns || []).map((c) => c.toLowerCase()).join(',')}`
    )
  );

  const recommendations = [];
  const seenDdl = new Set();

  for (const sql of queries) {
    SELECT_TABLE_REGEX.lastIndex = 0;
    const match = SELECT_TABLE_REGEX.exec(String(sql || ''));
    if (!match) continue;

    const table = match[1].toLowerCase();
    const whereCols = extractColumnsFromPredicate(match[2] || '');
    const orderCols = (match[3] || '')
      .split(',')
      .map((s) => s.trim().split(/\s+/)[0]?.toLowerCase())
      .filter(Boolean);

    const candidateCols = [...new Set([...whereCols, ...orderCols])];
    if (candidateCols.length === 0) continue;

    const key = `${table}:${candidateCols.join(',')}`;
    const hasPrefixCoverage = [...coveredKeys].some(
      (existing) => existing === key || existing.startsWith(`${key},`)
    );

    if (!hasPrefixCoverage) {
      const indexName = `idx_${table}_${candidateCols.join('_')}`;
      const ddl = `CREATE INDEX CONCURRENTLY ${indexName} ON ${table} (${candidateCols.join(', ')});`;
      if (!seenDdl.has(ddl)) {
        seenDdl.add(ddl);
        recommendations.push({
          table,
          columns: candidateCols,
          indexName,
          ddl,
          query: sql,
        });
      }
    }
  }

  return {
    allCovered: recommendations.length === 0,
    recommendations,
    summary: {
      analyzedQueries: queries.length,
      missingIndexCount: recommendations.length,
    },
  };
}
