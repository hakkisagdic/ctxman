import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildRepoGraph } from '../map/index.js';

const JS_KEYWORDS = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'null',
  'of',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'yield',
]);

/**
 * Extract the brace-delimited body of a method starting around `startLine` (1-based).
 *
 * @param {string[]} lines
 * @param {number} startLine
 * @returns {{ body: string, lineCount: number }}
 */
function extractMethodSlice(lines, startLine) {
  const startIdx = Math.max(0, (Number(startLine) || 1) - 1);
  let depth = 0;
  let seenOpen = false;
  const collected = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    collected.push(line);
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '{') {
        depth += 1;
        seenOpen = true;
      } else if (ch === '}') {
        depth -= 1;
        if (seenOpen && depth <= 0) {
          return { body: collected.join('\n'), lineCount: collected.length };
        }
      }
    }
    if (collected.length > 250) break;
  }

  return { body: collected.join('\n'), lineCount: collected.length };
}

/**
 * Normalize a function snippet into a structural token skeleton so alpha-renamed
 * variables and literals produce identical or near-identical token streams.
 *
 * @param {string} rawCode
 * @returns {{ skeleton: string, shingles: Set<string>, tokenCount: number }}
 */
function buildStructuralSkeleton(rawCode) {
  // Strip comments and string/number literals
  const stripped = String(rawCode || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '$STR')
    .replace(/\b\d+(?:\.\d+)?\b/g, '$NUM');

  // Remove the outer function declaration header up to the parameter list's opening brace
  const bodyStart = stripped.indexOf('{');
  const inner = bodyStart >= 0 ? stripped.slice(bodyStart) : stripped;

  const rawTokens = inner.match(/[A-Za-z_$][A-Za-z0-9_$]*|[{}()[\].,:;+-/*%=<>!&|?]+/g) || [];
  const idMap = new Map();
  let nextId = 1;

  const normTokens = rawTokens.map((tok) => {
    if (!/^[A-Za-z_$]/.test(tok)) return tok;
    if (tok === '$STR' || tok === '$NUM' || JS_KEYWORDS.has(tok)) return tok;
    if (!idMap.has(tok)) {
      idMap.set(tok, `ID_${nextId++}`);
    }
    return idMap.get(tok);
  });

  const skeleton = normTokens.join(' ');
  const shingles = new Set();
  for (let i = 0; i <= normTokens.length - 3; i++) {
    shingles.add(`${normTokens[i]} ${normTokens[i + 1]} ${normTokens[i + 2]}`);
  }

  return { skeleton, shingles, tokenCount: normTokens.length };
}

/**
 * Compute Jaccard similarity between two shingle sets.
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number}
 */
function jaccardSimilarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? Number((intersection / union).toFixed(3)) : 0;
}

/**
 * Detect structural code clones and duplicate method logic across the repository (`F5-2`).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options]
 * @param {number} [options.minTokens=12] - Minimum structural tokens for a method to be considered
 * @param {number} [options.similarityThreshold=0.8] - Jaccard similarity threshold (0..1)
 * @param {object} [options.graph] - Optional prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function findSemanticClones(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const minTokens = Number(options.minTokens) || 12;
  const threshold = Number(options.similarityThreshold) || 0.8;
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });

  const candidates = [];

  for (const node of graph.nodes || []) {
    if (!node || !node.path) continue;
    const fullPath = path.join(absRoot, node.path);
    if (!fs.existsSync(fullPath)) continue;

    let lines = [];
    try {
      lines = fs.readFileSync(fullPath, 'utf8').split('\n');
    } catch {
      continue;
    }

    for (const m of node.methods || []) {
      if (!m || !m.name) continue;
      const slice = extractMethodSlice(lines, m.line || 1);
      const { skeleton, shingles, tokenCount } = buildStructuralSkeleton(slice.body);
      if (tokenCount < minTokens) continue;

      const hash = crypto.createHash('sha256').update(skeleton).digest('hex').slice(0, 16);
      candidates.push({
        file: node.path,
        method: m.name,
        line: m.line || 1,
        lineCount: slice.lineCount,
        tokenCount,
        hash,
        shingles,
      });
    }
  }

  const cloneClusters = [];
  const pairedKeys = new Set();

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.file === b.file && a.method === b.method && a.line === b.line) continue;

      const exactMatch = a.hash === b.hash;
      const similarity = exactMatch ? 1 : jaccardSimilarity(a.shingles, b.shingles);
      if (similarity < threshold) continue;

      const pairKey = `${a.file}:${a.method}->${b.file}:${b.method}`;
      if (pairedKeys.has(pairKey)) continue;
      pairedKeys.add(pairKey);

      cloneClusters.push({
        id: `CLONE-${String(cloneClusters.length + 1).padStart(2, '0')}`,
        cloneType: exactMatch ? 'exact_structural_clone' : 'near_miss_clone',
        similarity,
        instances: [
          { file: a.file, method: a.method, line: a.line, lineCount: a.lineCount },
          { file: b.file, method: b.method, line: b.line, lineCount: b.lineCount },
        ],
        suggestion: `Extract shared logic between '${a.file}:${a.method}' and '${b.file}:${b.method}' (${Math.round(similarity * 100)}% structural match) into a reusable helper module.`,
      });
    }
  }

  cloneClusters.sort((a, b) => b.similarity - a.similarity);

  return {
    root: absRoot,
    scannedMethods: candidates.length,
    cloneCount: cloneClusters.length,
    clones: cloneClusters,
  };
}
