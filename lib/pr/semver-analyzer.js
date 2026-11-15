/**
 * Extract exported functions, classes, and constants with required parameter counts
 * from a JavaScript/TypeScript source string.
 *
 * @param {string} sourceText
 * @returns {Map<string, { kind: string, requiredParams: number, totalParams: number }>}
 */
function parseExportedSignatures(sourceText) {
  const exportsMap = new Map();
  const src = String(sourceText || '');

  // 1. Direct `export [async] function name(params)`
  const fnRe = /export\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)/g;
  let m;
  while ((m = fnRe.exec(src)) !== null) {
    const name = m[1];
    const rawParams = (m[2] || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const requiredParams = rawParams.filter(
      (p) => !p.includes('=') && !p.startsWith('...') && !p.endsWith('?')
    ).length;
    exportsMap.set(name, {
      kind: 'function',
      requiredParams,
      totalParams: rawParams.length,
    });
  }

  // 2. Direct `export class Name` or `export const/let/var Name`
  const declRe = /export\s+(class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((m = declRe.exec(src)) !== null) {
    const kind = m[1] === 'class' ? 'class' : 'const';
    const name = m[2];
    if (!exportsMap.has(name)) {
      exportsMap.set(name, { kind, requiredParams: 0, totalParams: 0 });
    }
  }

  return exportsMap;
}

/**
 * Compare exported symbol contracts between a baseline source and a current source to
 * detect breaking API changes and recommend the next Semantic Version bump (`F6-3`).
 *
 * @param {string} beforeSource - Previous revision source code
 * @param {string} afterSource - Current revision source code
 * @param {object} [options]
 * @param {string} [options.currentVersion='1.0.0']
 * @returns {object}
 */
export function analyzeSemverBreakage(beforeSource, afterSource, options = {}) {
  const currentVersion = String(options.currentVersion || '1.0.0').replace(/^v/, '');
  const [maj = 1, min = 0, pat = 0] = currentVersion.split('.').map((n) => Number(n) || 0);

  const beforeMap = parseExportedSignatures(beforeSource);
  const afterMap = parseExportedSignatures(afterSource);

  const breakingChanges = [];
  const additiveChanges = [];

  for (const [name, oldSig] of beforeMap.entries()) {
    if (!afterMap.has(name)) {
      breakingChanges.push({
        symbol: name,
        reason: 'removed_export',
        message: `Exported ${oldSig.kind} '${name}' was removed`,
      });
      continue;
    }

    const newSig = afterMap.get(name);
    if (oldSig.kind !== newSig.kind) {
      breakingChanges.push({
        symbol: name,
        reason: 'changed_kind',
        message: `Export '${name}' changed kind from '${oldSig.kind}' to '${newSig.kind}'`,
      });
    } else if (oldSig.kind === 'function' && newSig.requiredParams > oldSig.requiredParams) {
      breakingChanges.push({
        symbol: name,
        reason: 'increased_required_params',
        message: `Function '${name}' required parameter count increased from ${oldSig.requiredParams} to ${newSig.requiredParams}`,
      });
    }
  }

  for (const [name, newSig] of afterMap.entries()) {
    if (!beforeMap.has(name)) {
      additiveChanges.push({
        symbol: name,
        kind: newSig.kind,
        message: `New exported ${newSig.kind} '${name}' added`,
      });
    }
  }

  let recommendedBump = 'patch';
  let nextVersion = `${maj}.${min}.${pat + 1}`;
  if (breakingChanges.length > 0) {
    recommendedBump = 'major';
    nextVersion = `${maj + 1}.0.0`;
  } else if (additiveChanges.length > 0) {
    recommendedBump = 'minor';
    nextVersion = `${maj}.${min + 1}.0`;
  }

  return {
    currentVersion,
    recommendedBump,
    nextVersion,
    breakingCount: breakingChanges.length,
    additiveCount: additiveChanges.length,
    breakingChanges,
    additiveChanges,
  };
}
