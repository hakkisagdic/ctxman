import fs from 'node:fs';
import path from 'node:path';
import { buildRepoGraph } from '../map/index.js';

function globToRegExp(glob) {
  const normalized = String(glob || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');
  let regexStr = '^';
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '*' && normalized[i + 1] === '*') {
      if (normalized[i + 2] === '/') {
        regexStr += '(?:.+/)?';
        i += 2;
      } else {
        regexStr += '.*';
        i += 1;
      }
    } else if (ch === '*') {
      regexStr += '[^/]*';
    } else if (ch === '?') {
      regexStr += '[^/]';
    } else if ('+^$?.()|[]{}\\'.includes(ch)) {
      regexStr += `\\${ch}`;
    } else {
      regexStr += ch;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr);
}

export function matchesPattern(filePath, pattern) {
  if (!pattern) return false;
  const rel = String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  return patterns.some((p) => globToRegExp(p).test(rel));
}

export function loadArchitectureConfig(root, customConfig) {
  if (customConfig && typeof customConfig === 'object') {
    return customConfig;
  }
  const candidates = [
    path.join(root, '.ctxman', 'architecture.json'),
    path.join(root, 'architecture.ctxman.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        return JSON.parse(fs.readFileSync(candidate, 'utf8'));
      } catch {
        // ignore invalid json and continue
      }
    }
  }
  return {
    rules: [
      {
        id: 'ARCH-UI-TO-BILLING',
        description: 'UI layer must not directly import internal billing storage modules',
        from: ['lib/ui/**', 'public/**'],
        cannotImport: ['lib/billing/**'],
        severity: 'error',
      },
      {
        id: 'ARCH-TOKENIZER-ISOLATION',
        description:
          'Tokenizer/count layer must remain pure and not depend on server/API/UI layers',
        from: ['lib/count/**'],
        cannotImport: ['lib/api/**', 'lib/ui/**', 'lib/mcp/**'],
        severity: 'error',
      },
    ],
  };
}

/**
 * Checks repository dependency graph against architectural layer boundaries (`C-3`).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options={}]
 * @param {object} [options.config] - Optional inline architecture config (`{ rules: [...] }`)
 * @param {object} [options.graph] - Precomputed `buildRepoGraph` result
 */
export function checkArchitectureDrift(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const config = loadArchitectureConfig(absRoot, options.config);
  const rules = Array.isArray(config.rules) ? config.rules : [];
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });

  const violations = [];
  const seen = new Set();
  let checkedEdges = 0;

  const allEdges = [
    ...(graph.edges || []).map((e) => ({
      from: e.from,
      to: e.to,
      type: 'import',
      line: 1,
    })),
    ...(graph.callEdges || []).map((ce) => ({
      from: ce.from,
      to: ce.to,
      type: 'call',
      line: ce.callerLine || 1,
    })),
  ];

  for (const edge of allEdges) {
    if (!edge || !edge.from || !edge.to) continue;
    const sourceFile = String(edge.from).replace(/^file:/, '');
    const targetFile = String(edge.to).replace(/^file:/, '');
    if (!sourceFile || !targetFile || sourceFile === targetFile) continue;
    checkedEdges += 1;

    for (const rule of rules) {
      const ruleId = rule.id || 'ARCH-LAYER-VIOLATION';
      const fromPattern = rule.from || rule.source;
      const forbiddenPattern = rule.cannotImport || rule.forbidden || rule.to;
      if (!fromPattern || !forbiddenPattern) continue;

      if (matchesPattern(sourceFile, fromPattern) && matchesPattern(targetFile, forbiddenPattern)) {
        const dedupeKey = `${ruleId}:${sourceFile}->${targetFile}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        violations.push({
          ruleId,
          severity: rule.severity === 'warning' ? 'warning' : 'error',
          description:
            rule.description ||
            `Layer violation: ${sourceFile} is not allowed to depend on ${targetFile}`,
          sourceFile,
          targetFile,
          edgeType: edge.type || 'import',
          line: Number(edge.line) || 1,
        });
      }
    }
  }

  return {
    passed: violations.every((v) => v.severity !== 'error'),
    ruleCount: rules.length,
    checkedEdges,
    violations,
  };
}
