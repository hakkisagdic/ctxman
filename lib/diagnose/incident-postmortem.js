/**
 * F12-1: Incident Post-Mortem & Root-Cause Context Pack Builder
 * Correlates production error timelines, recent commits, and SLO metrics into a blameless post-mortem report.
 */

function parseMinutesDiff(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}

/**
 * Build a structured Incident Post-Mortem & Root-Cause Context Pack.
 *
 * @param {object} options
 * @param {string} [options.incidentId='INC-0001']
 * @param {string} [options.title='Production Degradation Incident']
 * @param {'SEV-1'|'SEV-2'|'SEV-3'|'SEV-4'} [options.severity='SEV-2']
 * @param {string} [options.detectedAt]
 * @param {string} [options.mitigatedAt]
 * @param {string} [options.resolvedAt]
 * @param {Array<{timestamp?: string, service?: string, message: string, file?: string, line?: number}>} [options.errorEvents]
 * @param {Array<{sha: string, subject: string, author?: string, files?: string[]}>} [options.recentCommits]
 * @param {string[]} [options.actionItems]
 * @returns {object}
 */
export function buildIncidentPostmortemPack(options = {}) {
  const incidentId = options.incidentId || 'INC-0001';
  const title = options.title || 'Production Degradation Incident';
  const severity = options.severity || 'SEV-2';
  const errorEvents = Array.isArray(options.errorEvents) ? options.errorEvents : [];
  const recentCommits = Array.isArray(options.recentCommits) ? options.recentCommits : [];

  const timeToMitigateMinutes = parseMinutesDiff(options.detectedAt, options.mitigatedAt);
  const timeToResolveMinutes = parseMinutesDiff(options.detectedAt, options.resolvedAt);

  const errorFiles = new Set(
    errorEvents.map((e) => e.file).filter((f) => typeof f === 'string' && f.length > 0)
  );
  const affectedServices = [
    ...new Set(errorEvents.map((e) => e.service || 'core').filter(Boolean)),
  ];

  const suspectCommits = recentCommits
    .map((commit) => {
      const files = Array.isArray(commit.files) ? commit.files : [];
      const matchingFiles = files.filter((f) => errorFiles.has(f));
      const score =
        matchingFiles.length * 45 +
        (/refactor|feat|migration|config/i.test(commit.subject || '') ? 15 : 5);
      return {
        sha: commit.sha,
        subject: commit.subject,
        author: commit.author || 'unknown',
        matchingFiles,
        suspicionScore: Math.min(100, score),
      };
    })
    .sort((a, b) => b.suspicionScore - a.suspicionScore);

  const topSuspect = suspectCommits[0] || null;
  const actionItems =
    Array.isArray(options.actionItems) && options.actionItems.length > 0
      ? options.actionItems
      : [
          topSuspect
            ? `Add regression test covering ${topSuspect.matchingFiles.join(', ') || 'affected module'} from commit ${topSuspect.sha}.`
            : 'Add automated synthetic alert and regression test for the failing code path.',
          'Enforce pre-deploy SLO error budget gate (`evaluateDeployFreezeGate`) in CI/CD.',
        ];

  const markdown = [
    `# Post-Mortem Report: ${incidentId} — ${title}`,
    '',
    `- **Severity:** ${severity}`,
    `- **Affected Services:** ${affectedServices.join(', ') || 'n/a'}`,
    `- **Time to Mitigate (TTM):** ${timeToMitigateMinutes !== null ? `${timeToMitigateMinutes} min` : 'n/a'}`,
    `- **Time to Resolve (TTR):** ${timeToResolveMinutes !== null ? `${timeToResolveMinutes} min` : 'n/a'}`,
    '',
    '## Timeline & Error Signals',
    '',
    ...(errorEvents.length > 0
      ? errorEvents.map(
          (e) =>
            `- \`${e.timestamp || 't0'}\` [${e.service || 'core'}] ${e.message}${e.file ? ` (\`${e.file}${e.line ? `:${e.line}` : ''}\`)` : ''}`
        )
      : ['- No structured error events recorded.']),
    '',
    '## Root-Cause Suspect Commits',
    '',
    ...(suspectCommits.length > 0
      ? suspectCommits.map(
          (c) =>
            `- **\`${c.sha}\`** (score: ${c.suspicionScore}) — ${c.subject}${c.matchingFiles.length > 0 ? ` [touched: \`${c.matchingFiles.join('`, `')}\`]` : ''}`
        )
      : ['- No recent commits supplied.']),
    '',
    '## Preventative Action Items',
    '',
    ...actionItems.map((item) => `- [ ] ${item}`),
    '',
  ].join('\n');

  return {
    incidentId,
    title,
    severity,
    affectedServices,
    metrics: {
      timeToMitigateMinutes,
      timeToResolveMinutes,
      errorEventCount: errorEvents.length,
    },
    suspectCommits,
    topSuspect,
    actionItems,
    markdown,
  };
}
