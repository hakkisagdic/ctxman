/**
 * F11-4: Automated Architecture Decision Record (ADR) Draft Generator
 * Generates standardized Markdown ADR documents from structural PR changes and dependency shifts.
 */

function inferLayer(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts[0] === 'lib' && parts.length >= 2) return `lib/${parts[1]}`;
  if (parts[0] === 'src' && parts.length >= 2) return `src/${parts[1]}`;
  return parts[0] || 'root';
}

function slugify(title) {
  return String(title || 'architecture-decision')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate an MADR/Nygard-formatted Architecture Decision Record draft.
 *
 * @param {object} options
 * @param {number|string} [options.id=1]
 * @param {string} options.title
 * @param {'Proposed'|'Accepted'|'Superseded'|'Deprecated'} [options.status='Proposed']
 * @param {string} [options.context]
 * @param {string} [options.decision]
 * @param {string[]} [options.changedFiles]
 * @param {string[]} [options.addedDependencies]
 * @param {string[]} [options.removedDependencies]
 * @param {string[]} [options.alternatives]
 * @param {string[]} [options.consequences]
 * @returns {object}
 */
export function generateAdrDraft(options = {}) {
  const numId = String(options.id ?? 1).padStart(4, '0');
  const adrId = `ADR-${numId}`;
  const title = options.title || 'Structural Architecture Update';
  const status = options.status || 'Proposed';
  const changedFiles = Array.isArray(options.changedFiles) ? options.changedFiles : [];
  const addedDependencies = Array.isArray(options.addedDependencies)
    ? options.addedDependencies
    : [];
  const removedDependencies = Array.isArray(options.removedDependencies)
    ? options.removedDependencies
    : [];

  const affectedLayers = [...new Set(changedFiles.map(inferLayer))].sort();
  const suggestedPath = `docs/adr/${numId}-${slugify(title)}.md`;

  const contextText =
    options.context ||
    `This change touches ${changedFiles.length} file(s) across ${affectedLayers.length || 1} architectural layer(s) (${affectedLayers.join(', ') || 'root'}).`;

  const decisionText =
    options.decision ||
    [
      `Adopt the updated module boundaries across ${affectedLayers.join(', ') || 'core modules'}.`,
      addedDependencies.length > 0
        ? `Introduce dependencies: ${addedDependencies.join(', ')}.`
        : '',
      removedDependencies.length > 0
        ? `Retire dependencies: ${removedDependencies.join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

  const alternatives =
    Array.isArray(options.alternatives) && options.alternatives.length > 0
      ? options.alternatives
      : [
          'Keep existing module structure without boundary separation',
          'Defer refactoring to a later release',
        ];

  const consequences =
    Array.isArray(options.consequences) && options.consequences.length > 0
      ? options.consequences
      : [
          `Affected subsystems (${affectedLayers.join(', ') || 'root'}) gain explicit contract boundaries.`,
          'Downstream callers and tests must stay aligned with the updated exports.',
        ];

  const markdown = [
    `# ${adrId}: ${title}`,
    '',
    `- **Status:** ${status}`,
    `- **Affected Layers:** ${affectedLayers.join(', ') || 'root'}`,
    '',
    '## Context',
    '',
    contextText,
    '',
    '## Decision',
    '',
    decisionText,
    '',
    '## Considered Alternatives',
    '',
    ...alternatives.map((alt) => `- ${alt}`),
    '',
    '## Consequences',
    '',
    ...consequences.map((c) => `- ${c}`),
    '',
  ].join('\n');

  return {
    adrId,
    suggestedPath,
    title,
    status,
    affectedLayers,
    addedDependencies,
    removedDependencies,
    markdown,
  };
}
