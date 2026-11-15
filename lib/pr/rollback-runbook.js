/**
 * F14-3: Automated Rollback & Emergency Mitigation Runbook Generator
 * Synthesizes an ordered emergency rollback runbook from release commits, feature flags, and DB migrations.
 */

/**
 * Generate a step-by-step emergency rollback and mitigation runbook for a release or PR.
 *
 * @param {object} options
 * @param {string} [options.releaseVersion='v1.0.0']
 * @param {string} [options.previousStableTag='v0.9.9']
 * @param {string} [options.mergeCommitSha='HEAD']
 * @param {string[]} [options.featureFlags]
 * @param {string[]} [options.migrations]
 * @param {string[]} [options.services]
 * @returns {object}
 */
export function generateRollbackRunbook(options = {}) {
  const releaseVersion = options.releaseVersion || 'v1.0.0';
  const previousStableTag = options.previousStableTag || 'v0.9.9';
  const mergeCommitSha = options.mergeCommitSha || 'HEAD';
  const featureFlags = Array.isArray(options.featureFlags) ? options.featureFlags : [];
  const migrations = Array.isArray(options.migrations) ? options.migrations : [];
  const services =
    Array.isArray(options.services) && options.services.length > 0
      ? options.services
      : ['core-api'];

  const steps = [];

  // Phase 1: Immediate feature flag kill-switches (fastest mitigation < 1 min)
  for (const flag of featureFlags) {
    steps.push({
      order: steps.length + 1,
      phase: 'feature-flag-killswitch',
      title: `Disable feature flag '${flag}'`,
      command: `ctxman flags disable ${flag}`,
      estimatedMinutes: 1,
    });
  }

  // Phase 2: Application container / git revert
  steps.push({
    order: steps.length + 1,
    phase: 'application-rollback',
    title: `Revert release ${releaseVersion} (${mergeCommitSha}) to ${previousStableTag}`,
    command: `git revert --no-edit ${mergeCommitSha} && deploy --service ${services.join(',')} --tag ${previousStableTag}`,
    estimatedMinutes: 4,
  });

  // Phase 3: Database migration down scripts (reverse chronological order)
  for (const mig of [...migrations].reverse()) {
    steps.push({
      order: steps.length + 1,
      phase: 'database-migration-down',
      title: `Roll back database migration '${mig}'`,
      command: `npm run migrate:down -- --file ${mig}`,
      estimatedMinutes: 3,
    });
  }

  // Phase 4: Post-rollback verification
  steps.push({
    order: steps.length + 1,
    phase: 'smoke-verification',
    title: 'Verify service health and SLO error budget recovery',
    command: `curl -fsS http://127.0.0.1:3000/api/v1/health`,
    estimatedMinutes: 2,
  });

  const estimatedRecoveryMinutes = steps.reduce((sum, s) => sum + s.estimatedMinutes, 0);

  const markdown = [
    `# Emergency Rollback Runbook: ${releaseVersion} -> ${previousStableTag}`,
    '',
    `- **Target Services:** ${services.join(', ')}`,
    `- **Estimated Recovery Time (RTO):** ~${estimatedRecoveryMinutes} minutes`,
    '',
    '## Ordered Mitigation Steps',
    '',
    ...steps.map(
      (s) =>
        `${s.order}. **[${s.phase}] ${s.title}** (~${s.estimatedMinutes}m)\n   \`\`\`bash\n   ${s.command}\n   \`\`\``
    ),
    '',
  ].join('\n');

  return {
    releaseVersion,
    previousStableTag,
    estimatedRecoveryMinutes,
    steps,
    markdown,
  };
}
