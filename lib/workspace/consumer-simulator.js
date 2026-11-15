/**
 * Simulates downstream consumer impact when provider API response fields are
 * removed or renamed (F10-3).
 *
 * @param {object} options
 * @param {string[]} [options.removedFields=[]]
 * @param {Record<string, string>} [options.renamedFields={}]
 * @param {Array<{path: string, content: string}>} [options.consumerFiles=[]]
 * @returns {{
 *   breaking: boolean,
 *   impactedConsumers: Array<{
 *     file: string,
 *     line: number,
 *     field: string,
 *     changeType: 'removed' | 'renamed',
 *     replacementField: string | null,
 *     snippet: string
 *   }>,
 *   summary: {
 *     scannedConsumers: number,
 *     impactedFileCount: number,
 *     totalBreakages: number
 *   }
 * }}
 */
export function simulateConsumerContractImpact(options = {}) {
  const { removedFields = [], renamedFields = {}, consumerFiles = [] } = options;
  const impactedConsumers = [];
  const impactedFiles = new Set();

  const watchedFields = [
    ...removedFields.map((f) => ({
      field: String(f).trim(),
      changeType: 'removed',
      replacement: null,
    })),
    ...Object.entries(renamedFields).map(([oldName, newName]) => ({
      field: String(oldName).trim(),
      changeType: 'renamed',
      replacement: String(newName).trim(),
    })),
  ].filter((w) => w.field.length > 0);

  for (const fileObj of consumerFiles) {
    const file = String(fileObj.path || '').replace(/\\/g, '/');
    const content = String(fileObj.content || '');
    if (!file || !content) continue;

    const lines = content.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx];
      const trimmed = lineText.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;

      for (const watch of watchedFields) {
        const escaped = watch.field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Matches property access `.field`, optional chaining `?.field`, or destructuring `{ field }`
        const propAccessRegex = new RegExp(
          `(?:\\.|\\?\\.)\\b${escaped}\\b|\\{[^{}]*\\b${escaped}\\b[^{}]*\\}`
        );
        if (propAccessRegex.test(trimmed)) {
          impactedFiles.add(file);
          impactedConsumers.push({
            file,
            line: idx + 1,
            field: watch.field,
            changeType: /** @type {'removed'|'renamed'} */ (watch.changeType),
            replacementField: watch.replacement,
            snippet: trimmed,
          });
        }
      }
    }
  }

  return {
    breaking: impactedConsumers.length > 0,
    impactedConsumers,
    summary: {
      scannedConsumers: consumerFiles.length,
      impactedFileCount: impactedFiles.size,
      totalBreakages: impactedConsumers.length,
    },
  };
}
