import fs from 'node:fs';
import path from 'node:path';
import { buildRepoGraph, normalizeSymbolName } from '../map/index.js';

const BUILTIN_IDENTIFIERS = new Set([
  'Array',
  'Boolean',
  'Buffer',
  'Date',
  'Error',
  'EvalError',
  'Function',
  'Infinity',
  'Intl',
  'JSON',
  'Map',
  'Math',
  'NaN',
  'Number',
  'Object',
  'Promise',
  'Proxy',
  'RangeError',
  'ReferenceError',
  'Reflect',
  'RegExp',
  'Set',
  'String',
  'Symbol',
  'SyntaxError',
  'TypeError',
  'URIError',
  'URL',
  'URLSearchParams',
  'WeakMap',
  'WeakSet',
  'atob',
  'btoa',
  'clearInterval',
  'clearTimeout',
  'console',
  'crypto',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'escape',
  'eval',
  'fetch',
  'global',
  'globalThis',
  'isFinite',
  'isNaN',
  'parseFloat',
  'parseInt',
  'performance',
  'process',
  'queueMicrotask',
  'require',
  'setImmediate',
  'setInterval',
  'setTimeout',
  'structuredClone',
  'TextDecoder',
  'TextEncoder',
  'undefined',
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'typeof',
  'instanceof',
  'new',
  'await',
  'async',
  'function',
  'super',
  'this',
]);

/**
 * Extract added code lines from a unified diff or return raw source code.
 *
 * @param {string} patchOrCode
 * @returns {{ code: string, targetFile: string | null }}
 */
function extractAddedCode(patchOrCode) {
  const text = String(patchOrCode || '');
  const lines = text.split('\n');
  const isDiff = lines.some(
    (l) => l.startsWith('+++ ') || l.startsWith('@@ ') || l.startsWith('diff --git ')
  );
  if (!isDiff) {
    return { code: text, targetFile: null };
  }

  let targetFile = null;
  const added = [];
  for (const line of lines) {
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim();
      if (raw !== '/dev/null') {
        targetFile = raw.replace(/^b\//, '');
      }
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added.push(line.slice(1));
    }
  }
  return { code: added.join('\n'), targetFile };
}

/**
 * Resolve a relative specifier against a base directory in the repo.
 *
 * @param {string} absRoot
 * @param {string} baseDir
 * @param {string} specifier
 * @param {Set<string>} knownFiles
 * @returns {string | null}
 */
function resolveRelativeImport(absRoot, baseDir, specifier, knownFiles) {
  const candidateAbs = path.resolve(baseDir, specifier);
  const relBase = path.relative(absRoot, candidateAbs).replace(/\\/g, '/');
  const candidates = [
    relBase,
    `${relBase}.js`,
    `${relBase}.ts`,
    `${relBase}.tsx`,
    `${relBase}.jsx`,
    `${relBase}.mjs`,
    `${relBase}/index.js`,
    `${relBase}/index.ts`,
  ];

  for (const candidate of candidates) {
    if (knownFiles.has(candidate) || fs.existsSync(path.join(absRoot, candidate))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Verify that an LLM-generated patch or code snippet is grounded in the repository's
 * actual file graph and symbol table (`F4-1`: LLM Patch Grounding & Hallucination Verifier).
 *
 * Detects:
 *  - `hallucinatedImports`: relative imports pointing to non-existent repository files
 *  - `hallucinatedSymbols`: named imports not defined in the target module, or standalone
 *    function calls that exist neither in local scope, built-ins, nor the repository symbol graph
 *
 * @param {string} root - Repository root directory
 * @param {string} patchOrCode - Unified diff or source code snippet
 * @param {object} [options]
 * @param {string} [options.targetFile] - Relative path of the file being patched
 * @param {boolean} [options.checkSymbolCalls=true] - Verify function calls against known repo symbols
 * @param {object} [options.graph] - Prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function verifyPatchGrounding(root, patchOrCode, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });
  const extracted = extractAddedCode(patchOrCode);
  const code = extracted.code;
  const targetFile = (options.targetFile || extracted.targetFile || 'index.js').replace(/\\/g, '/');
  const baseDir = path.dirname(path.join(absRoot, targetFile));

  const knownFiles = new Set();
  const repoSymbols = new Map();
  const fileSymbolMap = new Map();

  const nodeList = Array.isArray(graph.nodes)
    ? graph.nodes
    : graph.nodes instanceof Map
      ? [...graph.nodes.entries()].map(([p, n]) => ({ path: p, ...n }))
      : [];

  for (const node of nodeList) {
    if (!node || !node.path) continue;
    const relPath = node.path;
    knownFiles.add(relPath);
    const syms = new Set();
    const methods = node.methods || node.symbols || [];
    for (const m of methods) {
      const rawName = typeof m === 'string' ? m : m?.name;
      if (!rawName) continue;
      const norm = normalizeSymbolName(rawName);
      for (const candidate of [rawName, norm]) {
        if (!candidate) continue;
        syms.add(candidate);
        if (!repoSymbols.has(candidate)) repoSymbols.set(candidate, []);
        repoSymbols.get(candidate).push(relPath);
      }
    }
    // Also scan exported const/class/function identifiers directly from file if present on disk
    try {
      const fullPath = path.join(absRoot, relPath);
      if (fs.existsSync(fullPath)) {
        const src = fs.readFileSync(fullPath, 'utf8');
        const exportRe =
          /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)|export\s*\{([^}]+)\}/g;
        let em;
        while ((em = exportRe.exec(src)) !== null) {
          if (em[1]) {
            syms.add(em[1]);
            if (!repoSymbols.has(em[1])) repoSymbols.set(em[1], []);
            repoSymbols.get(em[1]).push(relPath);
          } else if (em[2]) {
            for (const part of em[2].split(',')) {
              const pieces = part.trim().split(/\s+as\s+/i);
              const exported = (pieces[1] || pieces[0] || '').trim();
              if (exported) {
                syms.add(exported);
                if (!repoSymbols.has(exported)) repoSymbols.set(exported, []);
                repoSymbols.get(exported).push(relPath);
              }
            }
          }
        }
      }
    } catch {
      // ignore read errors
    }
    fileSymbolMap.set(relPath, syms);
  }

  // Also include local symbols defined inside the snippet itself
  const localDefinedSymbols = new Set();
  const localDefRegex =
    /\b(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)|([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/g;
  let match;
  while ((match = localDefRegex.exec(code)) !== null) {
    const sym = match[1] || match[2];
    if (sym) localDefinedSymbols.add(sym);
  }

  // Parse ES module imports & CommonJS require statements
  const importRegex =
    /import\s+(?:(\{[^}]+\})|([A-Za-z_$][A-Za-z0-9_$]*)|\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?\s*(?:,\s*(\{[^}]+\}))?\s*from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;

  const checkedImports = [];
  const hallucinatedImports = [];
  const hallucinatedSymbols = [];
  const importedLocalIdentifiers = new Set();

  while ((match = importRegex.exec(code)) !== null) {
    const namedPart = match[1] || match[4] || '';
    const defaultImport = match[2] || match[3] || '';
    const specifier = match[5] || match[6];
    if (!specifier) continue;

    if (defaultImport) {
      importedLocalIdentifiers.add(defaultImport.trim());
    }

    const namedSymbols = [];
    if (namedPart) {
      const inner = namedPart.replace(/^\{|\}$/g, '');
      for (const piece of inner.split(',')) {
        const trimmed = piece.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+as\s+/i);
        const exportedName = parts[0].trim();
        const localAlias = (parts[1] || parts[0]).trim();
        if (exportedName) namedSymbols.push({ exportedName, localAlias });
        if (localAlias) importedLocalIdentifiers.add(localAlias);
      }
    }

    if (specifier.startsWith('.')) {
      const resolved = resolveRelativeImport(absRoot, baseDir, specifier, knownFiles);
      checkedImports.push({
        specifier,
        resolved,
        namedSymbols: namedSymbols.map((n) => n.exportedName),
      });
      if (!resolved) {
        hallucinatedImports.push({
          specifier,
          reason: `Relative import '${specifier}' does not resolve to any file in the repository`,
        });
      } else {
        const targetSyms = fileSymbolMap.get(resolved) || new Set();
        for (const { exportedName } of namedSymbols) {
          if (targetSyms.size > 0 && !targetSyms.has(exportedName)) {
            hallucinatedSymbols.push({
              symbol: exportedName,
              sourceFile: resolved,
              reason: `Symbol '${exportedName}' is imported from '${resolved}' but not defined in that module`,
            });
          }
        }
      }
    } else {
      checkedImports.push({
        specifier,
        resolved: 'external',
        namedSymbols: namedSymbols.map((n) => n.exportedName),
      });
    }
  }

  // Optionally check standalone function calls that are neither built-in, locally defined, nor in repoSymbols
  if (options.checkSymbolCalls !== false) {
    const callRegex = /(?<!\.)\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
    const seenCalls = new Set();
    while ((match = callRegex.exec(code)) !== null) {
      const fnName = match[1];
      if (!fnName || seenCalls.has(fnName)) continue;
      seenCalls.add(fnName);

      if (
        BUILTIN_IDENTIFIERS.has(fnName) ||
        localDefinedSymbols.has(fnName) ||
        importedLocalIdentifiers.has(fnName) ||
        repoSymbols.has(fnName)
      ) {
        continue;
      }

      hallucinatedSymbols.push({
        symbol: fnName,
        sourceFile: null,
        reason: `Function '${fnName}()' is called in patch but does not exist in repository symbol graph or local scope`,
      });
    }
  }

  const totalIssues = hallucinatedImports.length + hallucinatedSymbols.length;
  const grounded = totalIssues === 0;
  const confidenceScore = Math.max(
    0,
    Math.min(100, 100 - hallucinatedImports.length * 35 - hallucinatedSymbols.length * 20)
  );

  return {
    grounded,
    targetFile,
    confidenceScore,
    checkedImports,
    hallucinatedImports,
    hallucinatedSymbols,
  };
}
