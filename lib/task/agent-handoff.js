import crypto from 'node:crypto';

/**
 * Builds a compact, deterministic handoff context pack for transferring state,
 * architectural decisions, modified files, and remaining subtasks between coding agents (F10-2).
 *
 * @param {object} options
 * @param {string} [options.fromAgent='agent-primary']
 * @param {string} [options.toAgent='agent-secondary']
 * @param {string} [options.goal='']
 * @param {string[]} [options.completedSteps=[]]
 * @param {string[]} [options.pendingSteps=[]]
 * @param {Array<{decision: string, rationale?: string}>} [options.decisions=[]]
 * @param {string[]} [options.modifiedFiles=[]]
 * @param {string[]} [options.blockers=[]]
 * @param {number} [options.tokenBudget=2000]
 * @returns {{
 *   handoffId: string,
 *   fromAgent: string,
 *   toAgent: string,
 *   goal: string,
 *   stateDigestSha256: string,
 *   estimatedTokens: number,
 *   withinBudget: boolean,
 *   markdown: string,
 *   summary: {
 *     completedCount: number,
 *     pendingCount: number,
 *     decisionCount: number,
 *     modifiedFileCount: number,
 *     blockerCount: number
 *   }
 * }}
 */
export function buildAgentHandoffPack(options = {}) {
  const {
    fromAgent = 'agent-primary',
    toAgent = 'agent-secondary',
    goal = '',
    completedSteps = [],
    pendingSteps = [],
    decisions = [],
    modifiedFiles = [],
    blockers = [],
    tokenBudget = 2000,
  } = options;

  const normalizedFiles = [...new Set(modifiedFiles.map((f) => String(f).replace(/\\/g, '/')))];
  const statePayload = JSON.stringify({
    fromAgent,
    toAgent,
    goal,
    completedSteps,
    pendingSteps,
    decisions,
    modifiedFiles: normalizedFiles,
    blockers,
  });
  const stateDigestSha256 = crypto.createHash('sha256').update(statePayload).digest('hex');
  const handoffId = `handoff-${stateDigestSha256.slice(0, 10)}`;

  const lines = [
    `# Agent Session Handoff Pack (\`${handoffId}\`)`,
    '',
    `- **From Agent:** \`${fromAgent}\``,
    `- **To Agent:** \`${toAgent}\``,
    `- **Goal:** ${goal || 'Continue implementation'}`,
    `- **State Digest (SHA-256):** \`${stateDigestSha256}\``,
    '',
    '## 1. Completed Work',
    ...(completedSteps.length > 0 ? completedSteps.map((s) => `- [x] ${s}`) : ['- None recorded']),
    '',
    '## 2. Pending Next Steps',
    ...(pendingSteps.length > 0
      ? pendingSteps.map((s) => `- [ ] ${s}`)
      : ['- All planned steps completed']),
    '',
    '## 3. Settled Architectural Decisions',
    ...(decisions.length > 0
      ? decisions.map((d) =>
          d.rationale ? `- **${d.decision}** — _${d.rationale}_` : `- **${d.decision}**`
        )
      : ['- No special overrides']),
    '',
    '## 4. Modified Files in Current Session',
    ...(normalizedFiles.length > 0
      ? normalizedFiles.map((f) => `- \`${f}\``)
      : ['- Working tree clean']),
  ];

  if (blockers.length > 0) {
    lines.push('', '## 5. Open Blockers / Risks', ...blockers.map((b) => `- ⚠️ ${b}`));
  }

  const maxChars = Math.max(400, tokenBudget * 4);
  const markdown = lines.join('\n').slice(0, maxChars);
  const estimatedTokens = Math.ceil(markdown.length / 4);

  return {
    handoffId,
    fromAgent,
    toAgent,
    goal,
    stateDigestSha256,
    estimatedTokens,
    withinBudget: estimatedTokens <= tokenBudget,
    markdown,
    summary: {
      completedCount: completedSteps.length,
      pendingCount: pendingSteps.length,
      decisionCount: decisions.length,
      modifiedFileCount: normalizedFiles.length,
      blockerCount: blockers.length,
    },
  };
}
