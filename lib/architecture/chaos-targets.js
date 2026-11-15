const IO_PATTERNS = [
  {
    kind: 'http-client',
    regex: /\b(?:fetch|axios\.(?:get|post|put|delete|request)|http\.request|https\.request)\s*\(/,
  },
  {
    kind: 'database-query',
    regex: /\b(?:db|pool|client|knex|prisma)\s*\.\s*(?:query|execute|prepare|transaction)\s*\(/,
  },
  {
    kind: 'queue-or-cache',
    regex: /\b(?:redis|producer|channel)\s*\.\s*(?:publish|sendToQueue|get|set|xadd)\s*\(/,
  },
];

/**
 * Recommends high-value chaos engineering and fault-injection targets based on
 * external I/O boundaries and dependency fan-in centrality (F9-5).
 *
 * @param {object} options
 * @param {Array<{path: string, content: string}>} [options.files=[]]
 * @param {Array<{from: string, to: string}>} [options.edges=[]]
 * @param {number} [options.topN=10]
 * @returns {{
 *   targets: Array<{
 *     file: string,
 *     line: number,
 *     ioKind: string,
 *     fanIn: number,
 *     priorityScore: number,
 *     faultScenario: string,
 *     hypothesis: string
 *   }>,
 *   summary: {
 *     scannedFiles: number,
 *     totalTargets: number,
 *     byKind: Record<string, number>
 *   }
 * }}
 */
export function suggestChaosTargets(options = {}) {
  const { files = [], edges = [], topN = 10 } = options;

  // Compute incoming dependency count (fan-in) per file
  const fanInByFile = new Map();
  for (const edge of edges) {
    const to = String(edge.to || '').replace(/\\/g, '/');
    if (to) fanInByFile.set(to, (fanInByFile.get(to) || 0) + 1);
  }

  const targets = [];
  const byKind = {};

  for (const fileObj of files) {
    const file = String(fileObj.path || '').replace(/\\/g, '/');
    const content = String(fileObj.content || '');
    if (!file || !content) continue;

    const fanIn = fanInByFile.get(file) || 1;
    const lines = content.split(/\r?\n/);

    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx].trim();
      if (!lineText || lineText.startsWith('//')) continue;

      for (const io of IO_PATTERNS) {
        if (io.regex.test(lineText)) {
          byKind[io.kind] = (byKind[io.kind] || 0) + 1;
          const priorityScore = Number(((fanIn + 1) * 15).toFixed(1));
          const faultScenario =
            io.kind === 'http-client'
              ? 'Inject 2500ms latency spike and HTTP 503 / ECONNRESET response'
              : io.kind === 'database-query'
                ? 'Simulate SQLITE_BUSY / connection pool exhaustion timeout'
                : 'Simulate broker disconnect and message redelivery duplicate';

          targets.push({
            file,
            line: idx + 1,
            ioKind: io.kind,
            fanIn,
            priorityScore,
            faultScenario,
            hypothesis: `If ${file}:${idx + 1} (${io.kind}) experiences a transient failure, upstream callers (${fanIn} dependent module(s)) degrade gracefully without unhandled crashes.`,
          });
          break;
        }
      }
    }
  }

  targets.sort((a, b) => b.priorityScore - a.priorityScore || a.file.localeCompare(b.file));

  return {
    targets: targets.slice(0, topN),
    summary: {
      scannedFiles: files.length,
      totalTargets: targets.length,
      byKind,
    },
  };
}
