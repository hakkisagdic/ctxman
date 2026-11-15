import fs from 'node:fs';
import path from 'node:path';
import { buildRepoGraph } from '../map/index.js';

const FLAG_CALL_RE =
  /(?:\b(?:isFeatureEnabled|hasFeature|getFeatureFlag|useFeatureFlag|checkFlag|featureEnabled)\s*\(\s*['"]([A-Za-z0-9_.-]+)['"]\s*\)|\b(?:flags|features|featureFlags)\.([A-Za-z_][A-Za-z0-9_]*)|\bprocess\.env\.(FEATURE_[A-Za-z0-9_]+|FF_[A-Za-z0-9_]+))/g;

/**
 * Scan repository files for feature flag checks (`isFeatureEnabled('...')`,
 * `flags.newCheckout`, `process.env.FEATURE_*`) and identify stale, dead, or permanently
 * hardcoded flags (`F7-1`: Feature Flag Lifecycle & Stale Flag Hunter).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options]
 * @param {Record<string, { status?: 'active' | 'launched' | 'deprecated', permanentValue?: boolean }>} [options.registry]
 * @param {object} [options.graph] - Optional prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function findStaleFeatureFlags(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });
  const registry = options.registry || {};

  const flagMap = new Map();

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
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const lineNum = idx + 1;

      FLAG_CALL_RE.lastIndex = 0;
      let m;
      while ((m = FLAG_CALL_RE.exec(line)) !== null) {
        const flagName = m[1] || m[2] || m[3];
        if (!flagName) continue;

        if (!flagMap.has(flagName)) {
          const regEntry = registry[flagName] || null;
          const status = regEntry?.status || (regEntry ? 'active' : 'unregistered');
          flagMap.set(flagName, {
            name: flagName,
            status,
            permanentValue:
              typeof regEntry?.permanentValue === 'boolean' ? regEntry.permanentValue : null,
            references: [],
          });
        }
        flagMap.get(flagName).references.push({
          file: node.path,
          line: lineNum,
          snippet: line.trim(),
        });
      }
    }
  }

  const allFlags = [...flagMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const staleFlags = allFlags
    .filter(
      (f) => f.status === 'launched' || f.status === 'deprecated' || f.permanentValue !== null
    )
    .map((f) => ({
      ...f,
      recommendation:
        f.permanentValue === true
          ? `Inline truthy branch for '${f.name}' across ${f.references.length} location(s) and remove dead else branch.`
          : f.permanentValue === false
            ? `Remove dead feature branch for '${f.name}' across ${f.references.length} location(s).`
            : `Clean up ${f.status} flag '${f.name}' across ${f.references.length} location(s).`,
    }));

  const unregisteredFlags = allFlags.filter((f) => f.status === 'unregistered');

  return {
    root: absRoot,
    totalFlags: allFlags.length,
    staleFlagCount: staleFlags.length,
    unregisteredFlagCount: unregisteredFlags.length,
    staleFlags,
    unregisteredFlags,
    flags: allFlags,
  };
}
