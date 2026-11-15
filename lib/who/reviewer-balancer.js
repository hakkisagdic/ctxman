/**
 * F13-4: Load-Balanced PR Reviewer Router & Burnout Guard
 * Combines file ownership expertise with active open-PR review queue depth to assign optimal reviewers.
 */

/**
 * Assign balanced code reviewers for a PR without overloading senior maintainers.
 *
 * @param {object} options
 * @param {Array<{name: string, ownedFiles?: string[], expertiseScore?: number, activeReviews?: number, maxReviews?: number, unavailable?: boolean}>} [options.candidates]
 * @param {string[]} [options.changedFiles]
 * @param {string} [options.prAuthor]
 * @param {number} [options.reviewerCount=2]
 * @returns {object}
 */
export function assignBalancedReviewers(options = {}) {
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const changedFiles = new Set(Array.isArray(options.changedFiles) ? options.changedFiles : []);
  const prAuthor = options.prAuthor || '';
  const reviewerCount = Number(options.reviewerCount ?? 2);

  const scored = [];
  const overloadedSkipped = [];

  for (const c of candidates) {
    if (!c || c.name === prAuthor || c.unavailable) continue;
    const activeReviews = Number(c.activeReviews ?? 0);
    const maxReviews = Number(c.maxReviews ?? 5);

    if (activeReviews >= maxReviews) {
      overloadedSkipped.push({
        name: c.name,
        activeReviews,
        maxReviews,
      });
      continue;
    }

    const owned = Array.isArray(c.ownedFiles) ? c.ownedFiles : [];
    const matchingFiles = owned.filter((f) => changedFiles.has(f)).length;
    const baseExpertise = Number(c.expertiseScore ?? 50) + matchingFiles * 25;
    const loadPenalty = activeReviews * 15;
    const balancedScore = Math.max(0, baseExpertise - loadPenalty);

    scored.push({
      name: c.name,
      balancedScore,
      expertiseScore: baseExpertise,
      activeReviews,
      matchingFiles,
    });
  }

  scored.sort((a, b) => b.balancedScore - a.balancedScore || a.name.localeCompare(b.name));
  const selectedReviewers = scored.slice(0, reviewerCount);

  return {
    selectedReviewers,
    overloadedSkipped,
    allCandidatesRanked: scored,
    summary: {
      requestedCount: reviewerCount,
      assignedCount: selectedReviewers.length,
      overloadedCount: overloadedSkipped.length,
    },
  };
}
