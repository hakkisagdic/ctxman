import fs from 'node:fs';
import path from 'node:path';
import { buildRepoGraph } from '../map/index.js';

const BUILTIN_ENV_VARS = new Set([
  'NODE_ENV',
  'PORT',
  'HOST',
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'PWD',
  'TMPDIR',
  'TMP',
  'TEMP',
  'CI',
  'GITHUB_ACTIONS',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'TZ',
  'LANG',
  'LC_ALL',
  'NO_COLOR',
  'FORCE_COLOR',
  'DEBUG',
]);

/**
 * Parse a `.env` or `.env.example` text into a set of declared variable keys.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function parseEnvTemplateKeys(text) {
  const keys = new Set();
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && m[1]) {
      keys.add(m[1]);
    }
  }
  return keys;
}

/**
 * Scan the repository for `process.env.*` / `import.meta.env.*` accesses and compare
 * them against `.env.example` / `.env.sample` / `.env.template` to detect undocumented
 * environment variables without fallback defaults and stale template keys (`F6-1`).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options]
 * @param {string} [options.envExampleContent] - Optional explicit `.env.example` content
 * @param {object} [options.graph] - Optional prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function checkEnvConfigDrift(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });

  let templateFile = null;
  let templateText = options.envExampleContent ?? null;

  if (templateText == null) {
    for (const candidate of ['.env.example', '.env.sample', '.env.template']) {
      const full = path.join(absRoot, candidate);
      if (fs.existsSync(full)) {
        templateFile = candidate;
        try {
          templateText = fs.readFileSync(full, 'utf8');
        } catch {
          templateText = '';
        }
        break;
      }
    }
  } else {
    templateFile = '.env.example';
  }

  const declaredKeys = parseEnvTemplateKeys(templateText || '');
  const usedVars = new Map();

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
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      const envRe =
        /(?:process\.env|import\.meta\.env)(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\])(\s*(?:\|\||\?\?))?/g;
      let m;
      while ((m = envRe.exec(line)) !== null) {
        const varName = m[1] || m[2];
        const hasFallback = Boolean(m[3]);
        if (!varName || BUILTIN_ENV_VARS.has(varName)) continue;

        if (!usedVars.has(varName)) {
          usedVars.set(varName, {
            name: varName,
            hasFallback,
            documented: declaredKeys.has(varName),
            locations: [],
          });
        } else if (hasFallback) {
          usedVars.get(varName).hasFallback = true;
        }
        usedVars.get(varName).locations.push({ file: node.path, line: lineNum });
      }
    }
  }

  const undocumentedVars = [];
  const requiredWithoutFallback = [];

  for (const entry of usedVars.values()) {
    if (!entry.documented) {
      undocumentedVars.push(entry);
      if (!entry.hasFallback) {
        requiredWithoutFallback.push(entry);
      }
    }
  }

  const unusedTemplateVars = [...declaredKeys].filter(
    (k) => !usedVars.has(k) && !BUILTIN_ENV_VARS.has(k)
  );

  return {
    root: absRoot,
    templateFile,
    passed: undocumentedVars.length === 0,
    declaredCount: declaredKeys.size,
    usedCount: usedVars.size,
    undocumentedVars,
    requiredWithoutFallback,
    unusedTemplateVars,
  };
}
