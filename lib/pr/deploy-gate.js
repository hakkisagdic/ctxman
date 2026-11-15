/**
 * F11-1: SLO / Error Budget & PR Risk Deployment Gate
 * Combines service error-budget health with PR blast/risk metrics to decide deployment safety.
 */

/**
 * Evaluate whether a pull request or release should be deployed, require manual approval, or be frozen.
 *
 * @param {object} options
 * @param {number} [options.prRiskScore=20] - PR risk score (0..100)
 * @param {number} [options.errorBudgetRemainingPct=100] - Remaining SLO error budget percentage (0..100)
 * @param {number} [options.burnRate=1] - Current SLO error budget burn rate (1.0 = normal)
 * @param {boolean} [options.freezeWindowActive=false] - Whether a change-freeze window is active
 * @param {'none'|'low'|'medium'|'high'|'critical'} [options.activeIncidentSeverity='none']
 * @param {boolean} [options.isHotfix=false] - Emergency hotfix bypass candidate
 * @param {boolean} [options.hasRollbackPlan=false] - Verified rollback plan attached
 * @returns {object}
 */
export function evaluateDeployFreezeGate(options = {}) {
  const prRiskScore = Math.max(0, Math.min(100, Number(options.prRiskScore ?? 20)));
  const errorBudgetRemainingPct = Math.max(
    0,
    Math.min(100, Number(options.errorBudgetRemainingPct ?? 100))
  );
  const burnRate = Math.max(0, Number(options.burnRate ?? 1));
  const freezeWindowActive = Boolean(options.freezeWindowActive);
  const activeIncidentSeverity = options.activeIncidentSeverity || 'none';
  const isHotfix = Boolean(options.isHotfix);
  const hasRollbackPlan = Boolean(options.hasRollbackPlan);

  const reasons = [];
  const requiredApprovers = new Set();

  const budgetPenalty = Math.round((100 - errorBudgetRemainingPct) * 0.5);
  const burnPenalty = burnRate > 2 ? Math.min(35, Math.round((burnRate - 1) * 10)) : 0;
  const incidentPenalty =
    activeIncidentSeverity === 'critical'
      ? 40
      : activeIncidentSeverity === 'high'
        ? 25
        : activeIncidentSeverity === 'medium'
          ? 10
          : 0;

  const compositeRiskScore = Math.min(
    100,
    Math.round(prRiskScore * 0.5 + budgetPenalty + burnPenalty + incidentPenalty)
  );

  let decision = 'allow';

  if (activeIncidentSeverity === 'critical' || activeIncidentSeverity === 'high') {
    reasons.push(`Active ${activeIncidentSeverity} production incident in progress.`);
    if (isHotfix && hasRollbackPlan) {
      decision = 'require_approval';
      requiredApprovers.add('incident-commander');
      requiredApprovers.add('sre-oncall');
      reasons.push('Hotfix with verified rollback plan downgraded from freeze to manual approval.');
    } else {
      decision = 'freeze';
    }
  }

  if (errorBudgetRemainingPct <= 0) {
    reasons.push('Service SLO error budget is exhausted (0% remaining).');
    if (isHotfix && hasRollbackPlan && decision !== 'freeze') {
      decision = 'require_approval';
      requiredApprovers.add('sre-oncall');
    } else {
      decision = 'freeze';
    }
  } else if (errorBudgetRemainingPct < 20 && prRiskScore >= 50) {
    reasons.push(
      `Low SLO error budget (${errorBudgetRemainingPct}%) combined with high PR risk (${prRiskScore}).`
    );
    if (decision !== 'freeze') {
      decision = hasRollbackPlan ? 'require_approval' : 'freeze';
      requiredApprovers.add('sre-oncall');
    }
  }

  if (burnRate >= 5) {
    reasons.push(`Fast SLO burn rate detected (${burnRate}x > 5x threshold).`);
    if (decision !== 'freeze') {
      decision = isHotfix && hasRollbackPlan ? 'require_approval' : 'freeze';
      requiredApprovers.add('sre-oncall');
    }
  }

  if (freezeWindowActive) {
    reasons.push('Scheduled change-freeze window is currently active.');
    if (decision !== 'freeze') {
      decision = isHotfix && hasRollbackPlan ? 'require_approval' : 'freeze';
      requiredApprovers.add('release-manager');
    }
  }

  if (decision === 'allow' && (compositeRiskScore >= 55 || prRiskScore >= 70)) {
    decision = 'require_approval';
    requiredApprovers.add('tech-lead');
    reasons.push(`Composite deployment risk score (${compositeRiskScore}) requires peer approval.`);
  }

  return {
    allowed: decision === 'allow',
    decision,
    compositeRiskScore,
    reasons,
    requiredApprovers: [...requiredApprovers],
    summary: {
      prRiskScore,
      errorBudgetRemainingPct,
      burnRate,
      freezeWindowActive,
      activeIncidentSeverity,
      isHotfix,
      hasRollbackPlan,
    },
  };
}
