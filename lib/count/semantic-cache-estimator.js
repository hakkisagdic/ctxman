function tokenizeQuery(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9ğüşöçı_]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function jaccardSimilarity(tokensA, tokensB) {
  if (tokensA.length === 0 && tokensB.length === 0) return 1;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Faz 18 (F18-5): LLM Semantic Response Cache Hit-Rate & ROI Estimator.
 * Clusters historical/sampled agent queries by token Jaccard similarity to estimate semantic cache hit rate, token savings, and USD savings.
 */
export function estimateSemanticCacheHitRate(options = {}) {
  const {
    queries = [],
    similarityThreshold = 0.75,
    avgInputTokens = 2500,
    avgOutputTokens = 600,
    inputCostPerMillionUsd = 3.0,
    outputCostPerMillionUsd = 15.0,
  } = options;

  const clusters = [];
  let cacheHits = 0;
  let savedInputTokens = 0;
  let savedOutputTokens = 0;

  for (const item of queries) {
    const text = typeof item === 'string' ? item : item.prompt || item.query || '';
    const inTokens =
      typeof item === 'object' && typeof item.inputTokens === 'number'
        ? item.inputTokens
        : avgInputTokens;
    const outTokens =
      typeof item === 'object' && typeof item.outputTokens === 'number'
        ? item.outputTokens
        : avgOutputTokens;
    const tokens = tokenizeQuery(text);

    let matchedCluster = null;
    for (const cluster of clusters) {
      const sim = jaccardSimilarity(tokens, cluster.canonicalTokens);
      if (sim >= similarityThreshold) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.hitCount += 1;
      matchedCluster.queries.push(text);
      cacheHits += 1;
      savedInputTokens += inTokens;
      savedOutputTokens += outTokens;
    } else {
      clusters.push({
        canonicalQuery: text,
        canonicalTokens: tokens,
        hitCount: 0,
        queries: [text],
      });
    }
  }

  const totalQueries = queries.length;
  const hitRatePct = totalQueries === 0 ? 0 : Number(((cacheHits / totalQueries) * 100).toFixed(2));
  const estimatedSavedUsd = Number(
    (
      (savedInputTokens / 1_000_000) * inputCostPerMillionUsd +
      (savedOutputTokens / 1_000_000) * outputCostPerMillionUsd
    ).toFixed(4)
  );

  return {
    totalQueries,
    uniqueClustersCount: clusters.length,
    cacheHits,
    hitRatePct,
    similarityThreshold,
    savedInputTokens,
    savedOutputTokens,
    estimatedSavedUsd,
    topClusters: clusters
      .map((c) => ({
        canonicalQuery: c.canonicalQuery,
        totalOccurrences: c.queries.length,
        cacheHits: c.hitCount,
      }))
      .sort((a, b) => b.cacheHits - a.cacheHits)
      .slice(0, 5),
    summary: `Semantic cache hit rate is ${hitRatePct}% (${cacheHits}/${totalQueries} queries across ${clusters.length} cluster(s)), saving ${savedInputTokens + savedOutputTokens} tokens (~$${estimatedSavedUsd}).`,
  };
}
