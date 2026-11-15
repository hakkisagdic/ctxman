const CRITICAL_DOMAIN_REGEX = /(?:security|auth|billing|payment|crypto|migration|policy|acl)/i;

/**
 * Faz 17 (F17-4): PR Review Cognitive Load & Time Estimator.
 * Estimates reviewer cognitive load score and review duration in minutes from file dispersion, AST/branch density, and domain switches.
 */
export function estimatePrReviewCognitiveLoad(options = {}) {
  const { changes = [], maxRecommendedMinutes = 30 } = options;

  let totalAdditions = 0;
  let totalDeletions = 0;
  let branchingTokens = 0;
  let criticalFilesCount = 0;
  const subsystems = new Set();
  const fileBreakdown = [];

  for (const change of changes) {
    const filePath = String(change.path || 'unknown').replace(/\\/g, '/');
    const patch = String(change.patch || '');
    const additions =
      typeof change.additions === 'number'
        ? change.additions
        : (patch.match(/^\+[^+]/gm) || []).length;
    const deletions =
      typeof change.deletions === 'number'
        ? change.deletions
        : (patch.match(/^-[^-]/gm) || []).length;

    totalAdditions += additions;
    totalDeletions += deletions;

    const parts = filePath.split('/').filter(Boolean);
    const subsystem = parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0] || 'root';
    subsystems.add(subsystem);

    const branchMatches =
      patch.match(/\b(if|else\s+if|for|while|switch|case|catch|await)\b|&&|\|\||\?/g) || [];
    branchingTokens += branchMatches.length;

    const isCritical = CRITICAL_DOMAIN_REGEX.test(filePath);
    if (isCritical) criticalFilesCount += 1;

    const fileLines = additions + deletions;
    const fileMinutes = Math.max(
      0.5,
      Number((fileLines * 0.06 + branchMatches.length * 0.35 + (isCritical ? 2.5 : 0)).toFixed(1))
    );

    fileBreakdown.push({
      path: filePath,
      subsystem,
      linesChanged: fileLines,
      branchingCount: branchMatches.length,
      isCriticalDomain: isCritical,
      estimatedMinutes: fileMinutes,
    });
  }

  const totalLinesChanged = totalAdditions + totalDeletions;
  const contextSwitches = Math.max(0, subsystems.size - 1);

  const rawMinutes =
    changes.length === 0
      ? 0
      : Math.ceil(
          2 +
            totalLinesChanged * 0.05 +
            branchingTokens * 0.35 +
            contextSwitches * 2.5 +
            criticalFilesCount * 3
        );

  const cognitiveLoadScore = Math.min(
    100,
    Math.round(
      totalLinesChanged * 0.08 +
        branchingTokens * 1.2 +
        contextSwitches * 8 +
        criticalFilesCount * 10
    )
  );

  let status = 'manageable';
  if (rawMinutes > maxRecommendedMinutes * 1.5 || cognitiveLoadScore >= 75) {
    status = 'overload';
  } else if (rawMinutes > maxRecommendedMinutes || cognitiveLoadScore >= 50) {
    status = 'high-cognitive-load';
  }

  return {
    status,
    cognitiveLoadScore,
    estimatedReviewMinutes: rawMinutes,
    maxRecommendedMinutes,
    totalFiles: changes.length,
    totalLinesChanged,
    contextSwitches,
    criticalFilesCount,
    recommendSplit: status !== 'manageable',
    breakdown: fileBreakdown,
    summary:
      status === 'manageable'
        ? `PR cognitive load is manageable (${cognitiveLoadScore}/100, ~${rawMinutes} min across ${changes.length} file(s)).`
        : `PR cognitive load is ${status} (${cognitiveLoadScore}/100, ~${rawMinutes} min > ${maxRecommendedMinutes} min threshold); consider splitting into atomic PRs.`,
  };
}
