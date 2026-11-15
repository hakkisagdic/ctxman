/**
 * F15-2: Multi-Agent Consensus & Patch Judge Evaluator
 * Reconciles competing agent/model patch proposals or review verdicts using weighted confidence and test/grounding scores.
 */

/**
 * Evaluate multi-agent proposals and select a consensus winner or flag a tie-breaker escalation.
 *
 * @param {object} options
 * @param {Array<{agentId: string, decision?: 'approve'|'reject'|'request_changes', confidence?: number, testsPassed?: boolean, grounded?: boolean, riskDelta?: number, patchId?: string}>} [options.proposals]
 * @param {number} [options.quorumRatio=0.6]
 * @returns {object}
 */
export function evaluateMultiAgentConsensus(options = {}) {
  const proposals = Array.isArray(options.proposals) ? options.proposals : [];
  const quorumRatio = Number(options.quorumRatio ?? 0.6);

  const scoredProposals = proposals
    .map((p) => {
      const confidence = Math.max(0, Math.min(1, Number(p.confidence ?? 0.7)));
      const testsBonus = p.testsPassed !== false ? 30 : -40;
      const groundedBonus = p.grounded !== false ? 25 : -35;
      const riskBonus = -Number(p.riskDelta ?? 0) * 0.5;
      const weightScore = Math.max(
        0,
        Math.round(confidence * 45 + testsBonus + groundedBonus + riskBonus)
      );

      return {
        agentId: p.agentId,
        decision: p.decision || 'approve',
        patchId: p.patchId || p.agentId,
        confidence,
        testsPassed: p.testsPassed !== false,
        grounded: p.grounded !== false,
        weightScore,
      };
    })
    .sort((a, b) => b.weightScore - a.weightScore);

  const decisionWeights = new Map();
  let totalWeight = 0;
  for (const sp of scoredProposals) {
    const w = Math.max(1, sp.weightScore);
    totalWeight += w;
    decisionWeights.set(sp.decision, (decisionWeights.get(sp.decision) || 0) + w);
  }

  let winningDecision = 'request_changes';
  let topDecisionWeight = 0;
  for (const [dec, weight] of decisionWeights.entries()) {
    if (weight > topDecisionWeight) {
      topDecisionWeight = weight;
      winningDecision = dec;
    }
  }

  const agreementRatio = totalWeight > 0 ? Number((topDecisionWeight / totalWeight).toFixed(2)) : 0;
  const consensusReached = agreementRatio >= quorumRatio && scoredProposals.length > 0;
  const winningProposal = scoredProposals[0] || null;
  const dissentingAgents = scoredProposals
    .filter((p) => p.decision !== winningDecision)
    .map((p) => p.agentId);

  return {
    consensusReached,
    winningDecision,
    agreementRatio,
    winningProposal,
    dissentingAgents,
    rankedProposals: scoredProposals,
    summary: {
      agentCount: scoredProposals.length,
      agreementRatio,
      dissentCount: dissentingAgents.length,
    },
  };
}
