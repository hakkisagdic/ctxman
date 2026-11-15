import path from 'node:path';
import { buildRepoGraph } from '../map/index.js';

/**
 * Classify a relative file path into an execution phase so foundation/schema changes
 * are scheduled before service logic, API/CLI wiring, and verification tests.
 *
 * @param {string} filePath
 * @returns {{ phase: number, phaseName: string }}
 */
function classifyExecutionPhase(filePath) {
  const norm = String(filePath || '').replace(/\\/g, '/');
  if (/(?:^|\/)(?:test|tests|__tests__)\/|\.(?:test|spec)\.[a-z0-9]+$/i.test(norm)) {
    return { phase: 4, phaseName: 'verification_tests' };
  }
  if (
    /^bin\/|(?:^|\/)(?:cli|server|routes|api|mcp)\b/i.test(norm) ||
    norm === 'index.js' ||
    norm === 'index.d.ts'
  ) {
    return { phase: 3, phaseName: 'interface_and_api_wiring' };
  }
  if (/(?:^|\/)(?:services|controllers|handlers|pr|pack|focus|search|why|who)\b/i.test(norm)) {
    return { phase: 2, phaseName: 'domain_and_service_logic' };
  }
  return { phase: 1, phaseName: 'core_foundation_and_models' };
}

/**
 * Decompose a natural-language engineering task into ordered, dependency-aware
 * execution steps across the repository (`F7-5`: Agent Task Plan & Sub-Task Decomposer).
 *
 * @param {string} root - Repository root directory
 * @param {string} taskQuery - Natural language task description
 * @param {object} [options]
 * @param {string[]} [options.targetFiles] - Optional explicit list of candidate files
 * @param {object} [options.graph] - Optional prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function decomposeTaskIntoSteps(root, taskQuery, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const query = String(taskQuery || '').trim();
  const keywords = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length >= 3);

  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });

  let matchedFiles = [];
  if (Array.isArray(options.targetFiles) && options.targetFiles.length > 0) {
    matchedFiles = [...options.targetFiles];
  } else {
    const scored = [];
    for (const node of graph.nodes || []) {
      if (!node || !node.path) continue;
      const lowerPath = node.path.toLowerCase();
      const methodNames = (node.methods || [])
        .map((m) => (typeof m === 'string' ? m : m?.name || '').toLowerCase())
        .join(' ');
      let hits = 0;
      for (const kw of keywords) {
        if (lowerPath.includes(kw)) hits += 3;
        if (methodNames.includes(kw)) hits += 2;
      }
      if (hits > 0) {
        scored.push({ path: node.path, hits });
      }
    }
    scored.sort((a, b) => b.hits - a.hits || a.path.localeCompare(b.path));
    matchedFiles = scored.slice(0, 8).map((s) => s.path);
  }

  const buckets = new Map([
    [
      1,
      {
        phase: 1,
        phaseName: 'core_foundation_and_models',
        title: 'Update core models & foundational utilities',
        files: [],
      },
    ],
    [
      2,
      {
        phase: 2,
        phaseName: 'domain_and_service_logic',
        title: 'Implement domain & service layer logic',
        files: [],
      },
    ],
    [
      3,
      {
        phase: 3,
        phaseName: 'interface_and_api_wiring',
        title: 'Wire public exports, CLI flags & REST/MCP endpoints',
        files: [],
      },
    ],
    [
      4,
      {
        phase: 4,
        phaseName: 'verification_tests',
        title: 'Add unit/integration tests & verify regressions',
        files: [],
      },
    ],
  ]);

  for (const f of matchedFiles) {
    const { phase } = classifyExecutionPhase(f);
    buckets.get(phase).files.push(f);
  }

  // Always include a verification step even if no test file matched directly
  if (buckets.get(4).files.length === 0) {
    buckets.get(4).files.push('test/');
  }

  const steps = [...buckets.values()]
    .filter((b) => b.files.length > 0)
    .map((b, idx) => ({
      stepNumber: idx + 1,
      phase: b.phaseName,
      title: b.title,
      files: b.files,
      dependsOnStep: idx > 0 ? idx : null,
    }));

  return {
    root: absRoot,
    task: query,
    matchedFileCount: matchedFiles.length,
    stepCount: steps.length,
    steps,
  };
}
