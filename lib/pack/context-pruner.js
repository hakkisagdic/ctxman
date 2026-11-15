import TokenUtils from '../utils/token-utils.js';

/**
 * Calculate lexical entropy / information density score for a code block.
 *
 * @param {string} text
 * @returns {number}
 */
function scoreBlockEntropy(text) {
  const raw = String(text || '').trim();
  if (!raw) return 0;
  const words = raw.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
  if (words.length === 0) return 0;
  const uniqueRatio = new Set(words.map((w) => w.toLowerCase())).size / words.length;
  const hasExportOrSignature = /\b(export|function|class|interface|type|async|return|throw)\b/.test(
    raw
  );
  return Number((uniqueRatio * 0.7 + (hasExportOrSignature ? 0.3 : 0)).toFixed(4));
}

/**
 * Strip block comments, JSDoc banners, and multi-line import boilerplate while
 * preserving declarations and executable logic.
 *
 * @param {string} content
 * @param {object} [options]
 * @param {boolean} [options.collapseMethodBodies=false]
 * @returns {{ prunedText: string, removedComments: number, collapsedBodies: number }}
 */
function pruneFileSource(content, options = {}) {
  let text = String(content || '');
  let removedComments = 0;
  let collapsedBodies = 0;

  // 1. Remove multi-line block comments (/* ... */)
  text = text.replace(/\/\*[\s\S]*?\*\//g, () => {
    removedComments += 1;
    return '';
  });

  // 2. Remove standalone full-line // comments (except directives like // @ts-expect-error or eslint)
  text = text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('//') &&
        !trimmed.startsWith('// @ts-') &&
        !trimmed.startsWith('// eslint-')
      ) {
        removedComments += 1;
        return false;
      }
      return true;
    })
    .join('\n');

  // 3. Collapse consecutive blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  // 4. Optionally collapse non-exported helper function bodies into single-line signatures
  if (options.collapseMethodBodies) {
    text = text.replace(
      /(^(?!\s*export\b)\s*(?:async\s+)?function\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\([^)]*\)\s*)\{[\s\S]*?\n\}/gm,
      (_, sig) => {
        collapsedBodies += 1;
        return `${sig.trimEnd()} { /* ... pruned low-entropy body ... */ }`;
      }
    );
  }

  return { prunedText: text, removedComments, collapsedBodies };
}

/**
 * Dynamically prune a set of context files or code blocks to fit within a strict token
 * budget while preserving high-entropy signatures, exported contracts, and priority files
 * (`F5-1`: Dynamic Context Pruner).
 *
 * @param {Array<{path: string, content: string, priority?: number}>} files
 * @param {object} [options]
 * @param {number} [options.budget=4000] - Target token budget
 * @returns {object}
 */
export function pruneContextToBudget(files = [], options = {}) {
  const budget = Math.max(50, Number(options.budget) || 4000);
  const entries = (Array.isArray(files) ? files : []).map((f, index) => {
    const content = String(f?.content || '');
    const originalTokens = TokenUtils.calculate(content, f?.path || 'file.js');
    const entropy = scoreBlockEntropy(content);
    const priority = typeof f?.priority === 'number' ? f.priority : 1;
    return {
      path: f?.path || `file-${index}.js`,
      content,
      originalTokens,
      tokens: originalTokens,
      entropy,
      priority,
      stage: 'intact',
      removedComments: 0,
      collapsedBodies: 0,
    };
  });

  const originalTotalTokens = entries.reduce((sum, e) => sum + e.originalTokens, 0);

  // Order from lowest importance (prune first) to highest importance (prune last)
  const pruneOrder = [...entries].sort(
    (a, b) => a.priority * a.entropy - b.priority * b.entropy || b.originalTokens - a.originalTokens
  );

  let currentTotal = originalTotalTokens;

  // Pass 1: Strip comments & blank lines on lowest-priority files until within budget
  for (const item of pruneOrder) {
    if (currentTotal <= budget) break;
    const pass1 = pruneFileSource(item.content, { collapseMethodBodies: false });
    const newTokens = TokenUtils.calculate(pass1.prunedText, item.path);
    if (newTokens < item.tokens) {
      currentTotal -= item.tokens - newTokens;
      item.content = pass1.prunedText;
      item.tokens = newTokens;
      item.removedComments += pass1.removedComments;
      item.stage = 'comments_stripped';
    }
  }

  // Pass 2: Collapse non-exported helper bodies on lowest-priority files if still over budget
  for (const item of pruneOrder) {
    if (currentTotal <= budget) break;
    const pass2 = pruneFileSource(item.content, { collapseMethodBodies: true });
    const newTokens = TokenUtils.calculate(pass2.prunedText, item.path);
    if (newTokens < item.tokens) {
      currentTotal -= item.tokens - newTokens;
      item.content = pass2.prunedText;
      item.tokens = newTokens;
      item.collapsedBodies += pass2.collapsedBodies;
      item.stage = 'bodies_collapsed';
    }
  }

  // Pass 3: Drop lowest-priority files only if still exceeding budget
  const omitted = [];
  for (const item of pruneOrder) {
    if (currentTotal <= budget) break;
    currentTotal -= item.tokens;
    item.stage = 'omitted';
    omitted.push({ path: item.path, originalTokens: item.originalTokens });
  }

  const keptFiles = entries
    .filter((e) => e.stage !== 'omitted')
    .map((e) => ({
      path: e.path,
      content: e.content,
      originalTokens: e.originalTokens,
      tokens: e.tokens,
      entropy: e.entropy,
      stage: e.stage,
      removedComments: e.removedComments,
      collapsedBodies: e.collapsedBodies,
    }));

  const savedTokens = Math.max(0, originalTotalTokens - currentTotal);
  const savingsPct =
    originalTotalTokens > 0 ? Number(((savedTokens / originalTotalTokens) * 100).toFixed(1)) : 0;

  return {
    budget,
    fitsBudget: currentTotal <= budget,
    originalTokens: originalTotalTokens,
    prunedTokens: currentTotal,
    savedTokens,
    savingsPct,
    files: keptFiles,
    omitted,
  };
}
