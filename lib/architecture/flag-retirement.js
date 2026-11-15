/**
 * Plans zero-downtime retirement and code cleanup for permanently launched or
 * deprecated feature flags (F10-1).
 *
 * @param {object} options
 * @param {string} [options.flagName]
 * @param {boolean} [options.keepEnabledBranch=true]
 * @param {Array<{path: string, content: string}>} [options.files=[]]
 * @returns {{
 *   flagName: string,
 *   keepEnabledBranch: boolean,
 *   cleanupEdits: Array<{
 *     file: string,
 *     line: number,
 *     originalSnippet: string,
 *     simplifiedSnippet: string,
 *     action: 'inline-true-branch' | 'inline-false-branch' | 'remove-flag-guard'
 *   }>,
 *   summary: {
 *     scannedFiles: number,
 *     affectedFileCount: number,
 *     totalEdits: number
 *   }
 * }}
 */
export function planFeatureFlagRetirement(options = {}) {
  const { flagName = '', keepEnabledBranch = true, files = [] } = options;
  const targetFlag = String(flagName || '').trim();
  const cleanupEdits = [];
  const affectedFiles = new Set();

  if (!targetFlag) {
    return {
      flagName: '',
      keepEnabledBranch,
      cleanupEdits: [],
      summary: { scannedFiles: files.length, affectedFileCount: 0, totalEdits: 0 },
    };
  }

  const escapedFlag = targetFlag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Matches: if (isFeatureEnabled('flag')) { return 'new'; } else { return 'old'; }
  // or ternary: flags.flag ? newCall() : oldCall()
  // or simple guard: if (isFeatureEnabled('flag')) { ... }
  const ternaryRegex = new RegExp(
    `(?:isFeatureEnabled\\(\\s*['"\`]${escapedFlag}['"\`]\\s*\\)|flags\\.${escapedFlag})\\s*\\?\\s*([^:]+?)\\s*:\\s*([^;\\n]+)`
  );
  const ifSingleLineRegex = new RegExp(
    `if\\s*\\(\\s*(!?)\\s*(?:isFeatureEnabled\\(\\s*['"\`]${escapedFlag}['"\`]\\s*\\)|flags\\.${escapedFlag})\\s*\\)\\s*\\{\\s*([^}]+?)\\s*\\}(?:\\s*else\\s*\\{\\s*([^}]+?)\\s*\\})?`
  );

  for (const fileObj of files) {
    const file = String(fileObj.path || '').replace(/\\/g, '/');
    const content = String(fileObj.content || '');
    if (!file || !content || !content.includes(targetFlag)) continue;

    const lines = content.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx];
      const trimmed = lineText.trim();
      if (!trimmed.includes(targetFlag)) continue;

      const ifMatch = trimmed.match(ifSingleLineRegex);
      if (ifMatch) {
        const isNegated = ifMatch[1] === '!';
        const consequent = ifMatch[2].trim();
        const alternate = ifMatch[3] ? ifMatch[3].trim() : '';
        const effectiveKeepConsequent = isNegated ? !keepEnabledBranch : keepEnabledBranch;
        const simplifiedSnippet = effectiveKeepConsequent
          ? consequent
          : alternate || '// [feature-flag-retired: dead branch removed]';

        affectedFiles.add(file);
        cleanupEdits.push({
          file,
          line: idx + 1,
          originalSnippet: trimmed,
          simplifiedSnippet,
          action: effectiveKeepConsequent ? 'inline-true-branch' : 'inline-false-branch',
        });
        continue;
      }

      const ternMatch = trimmed.match(ternaryRegex);
      if (ternMatch) {
        const truthyExpr = ternMatch[1].trim();
        const falsyExpr = ternMatch[2].trim();
        const replacement = keepEnabledBranch ? truthyExpr : falsyExpr;
        const simplifiedSnippet = trimmed.replace(ternaryRegex, replacement);

        affectedFiles.add(file);
        cleanupEdits.push({
          file,
          line: idx + 1,
          originalSnippet: trimmed,
          simplifiedSnippet,
          action: keepEnabledBranch ? 'inline-true-branch' : 'inline-false-branch',
        });
        continue;
      }

      affectedFiles.add(file);
      cleanupEdits.push({
        file,
        line: idx + 1,
        originalSnippet: trimmed,
        simplifiedSnippet: `// Retire flag '${targetFlag}' (keepEnabled=${keepEnabledBranch})`,
        action: 'remove-flag-guard',
      });
    }
  }

  return {
    flagName: targetFlag,
    keepEnabledBranch,
    cleanupEdits,
    summary: {
      scannedFiles: files.length,
      affectedFileCount: affectedFiles.size,
      totalEdits: cleanupEdits.length,
    },
  };
}
