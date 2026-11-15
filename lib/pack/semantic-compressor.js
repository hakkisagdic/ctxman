/**
 * F16-2: Semantic Prompt Compression & Symbol Legend Engine
 * Compresses repetitive boilerplate, long identifiers, and redundant whitespace while emitting a reversible legend.
 */

/**
 * Semantically compress a prompt or code context block while preserving a reversible symbol legend.
 *
 * @param {object} options
 * @param {string} options.text
 * @param {number} [options.minIdentifierLength=14]
 * @param {number} [options.minOccurrences=3]
 * @returns {object}
 */
export function compressPromptSemantically(options = {}) {
  const originalText = String(options.text || '');
  const minIdentifierLength = Number(options.minIdentifierLength ?? 14);
  const minOccurrences = Number(options.minOccurrences ?? 3);

  // Strip multi-line banner comments and collapse redundant blank lines
  let working = originalText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Count long identifiers that repeat frequently
  const idRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  const counts = new Map();
  let match;
  while ((match = idRegex.exec(working)) !== null) {
    const token = match[1];
    if (token.length >= minIdentifierLength) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  const candidates = [...counts.entries()]
    .filter(([, count]) => count >= minOccurrences)
    .sort((a, b) => b[1] * b[0].length - a[1] * a[0].length)
    .slice(0, 20);

  const legend = {};
  candidates.forEach(([identifier], idx) => {
    const alias = `$S${idx + 1}`;
    legend[alias] = identifier;
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    working = working.replace(new RegExp(`\\b${escaped}\\b`, 'g'), alias);
  });

  const legendHeader =
    Object.keys(legend).length > 0
      ? `[SYMBOL_LEGEND: ${Object.entries(legend)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}]\n`
      : '';

  const compressedText = `${legendHeader}${working}`;
  const originalTokens = Math.max(1, Math.ceil(originalText.length / 4));
  const compressedTokens = Math.max(1, Math.ceil(compressedText.length / 4));
  const savedTokens = Math.max(0, originalTokens - compressedTokens);

  return {
    compressedText,
    legend,
    originalTokens,
    compressedTokens,
    savedTokens,
    savingsPct: Math.round((savedTokens / originalTokens) * 100),
  };
}
