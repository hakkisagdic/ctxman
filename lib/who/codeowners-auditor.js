function globRuleToRegex(pattern) {
  const cleaned = String(pattern || '')
    .trim()
    .replace(/^\/+/, '');
  if (cleaned === '*') return /^.+$/;
  const escaped = cleaned
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  if (cleaned.endsWith('/')) {
    return new RegExp(`^${escaped}.*$`);
  }
  return new RegExp(`^${escaped}(?:$|/.*$)`);
}

/**
 * Faz 19 (F19-4): Git Monorepo CODEOWNERS Coverage & Orphan Directory Auditor.
 * Audits repository files against CODEOWNERS rules to find unowned files, orphan critical directories, and invalid owner handles.
 */
export function auditCodeownersCoverage(options = {}) {
  const { codeownersContent = '', files = [], validOwners = null } = options;
  const rules = [];
  const invalidOwnerRules = [];
  const validOwnerSet = Array.isArray(validOwners) ? new Set(validOwners) : null;

  const lines = String(codeownersContent || '').split(/\r?\n/);
  lines.forEach((rawLine, idx) => {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) return;
    const parts = line.split(/\s+/);
    const pattern = parts[0];
    const owners = parts.slice(1);
    if (owners.length === 0) {
      invalidOwnerRules.push({
        line: idx + 1,
        pattern,
        reason: `Rule "${pattern}" specifies no owners.`,
      });
      return;
    }
    if (validOwnerSet) {
      for (const owner of owners) {
        if (!validOwnerSet.has(owner)) {
          invalidOwnerRules.push({
            line: idx + 1,
            pattern,
            owner,
            reason: `Owner "${owner}" on rule "${pattern}" does not exist in validOwners directory.`,
          });
        }
      }
    }
    rules.push({
      line: idx + 1,
      pattern,
      owners,
      regex: globRuleToRegex(pattern),
    });
  });

  const unownedFiles = [];
  const criticalUnownedFiles = [];

  for (const item of files) {
    const filePath = String(typeof item === 'string' ? item : item.path || '').replace(/^\/+/, '');
    if (!filePath) continue;

    let matchedRule = null;
    for (const rule of rules) {
      if (rule.regex.test(filePath)) {
        matchedRule = rule;
      }
    }

    if (!matchedRule) {
      unownedFiles.push(filePath);
      if (/(?:security|billing|policy|auth|migration|core)/i.test(filePath)) {
        criticalUnownedFiles.push(filePath);
      }
    }
  }

  const totalFiles = files.length;
  const ownedFilesCount = totalFiles - unownedFiles.length;
  const coveragePct =
    totalFiles === 0 ? 100 : Number(((ownedFilesCount / totalFiles) * 100).toFixed(2));
  const status =
    unownedFiles.length === 0 && invalidOwnerRules.length === 0 ? 'covered' : 'coverage-gaps';

  return {
    status,
    totalFiles,
    ownedFilesCount,
    unownedFilesCount: unownedFiles.length,
    coveragePct,
    unownedFiles,
    criticalUnownedFiles,
    invalidOwnerRules,
    summary:
      status === 'covered'
        ? `CODEOWNERS coverage is ${coveragePct}% across ${totalFiles} file(s) with 0 invalid owner rules.`
        : `CODEOWNERS coverage is ${coveragePct}% (${unownedFiles.length} unowned file(s), ${invalidOwnerRules.length} invalid rule(s)).`,
  };
}
