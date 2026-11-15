/**
 * Prompt Cache Optimizer & Deterministic Prefix Pinning (`C-1`)
 *
 * Optimizes packed repository context for Anthropic Prompt Caching (`cache_control: { type: "ephemeral" }`,
 * up to 4 breakpoints, 90% cost discount on cached tokens) and OpenAI Prompt Caching (automatic 50%-75%
 * discount on static prefixes >= 1024 tokens in 128-token increments).
 *
 * Strategy:
 *   1. Deterministic 3-tier file ordering:
 *      - Tier 1 (`static_core`): Configs, schemas, types, core libraries with low recent churn
 *      - Tier 2 (`semi_stable`): Standard application & library modules
 *      - Tier 3 (`volatile_tail`): Recently modified files, tests, and task-specific instructions
 *   2. Exact token offset calculation and Anthropic/OpenAI cache breakpoint generation.
 *   3. Ready-to-send Anthropic `system` content blocks array with `cache_control: { type: "ephemeral" }`
 *      plus estimated cost/token savings across multi-turn agent sessions.
 */

export const OPENAI_MIN_CACHE_TOKENS = 1024;
export const ANTHROPIC_MIN_CACHE_TOKENS = 1024;
export const MAX_ANTHROPIC_BREAKPOINTS = 4;

const STATIC_CORE_PATTERNS = [
  /(?:^|\/)package\.json$/i,
  /(?:^|\/)tsconfig(?:\.[a-z0-9_-]+)?\.json$/i,
  /\.d\.ts$/i,
  /(?:^|\/)(?:schema|schemas|types|constants|config|policy|plans)\.[a-z0-9]+$/i,
  /(?:^|\/)(?:core|utils|shared|common|lib\/core|lib\/utils)\//i,
];

const VOLATILE_TAIL_PATTERNS = [
  /(?:^|\/)(?:test|tests|__tests__|spec|specs)(?:\/|$)/i,
  /\.(?:test|spec)\.[a-z0-9]+$/i,
  /(?:^|\/)(?:CHANGELOG|TODO|ROADMAP|DURUM)\.md$/i,
];

/**
 * Classify a file entry into one of 3 prompt-cache stability tiers:
 *   1 = `static_core` (most stable, placed first in prefix)
 *   2 = `semi_stable` (standard code modules, placed in middle)
 *   3 = `volatile_tail` (tests & recently modified files, placed at tail)
 *
 * @param {{ path: string, modified?: number }} entry
 * @param {number} [medianModified=0]
 * @returns {{ tier: 1|2|3, tierName: 'static_core'|'semi_stable'|'volatile_tail' }}
 */
export function classifyCacheTier(entry, medianModified = 0) {
  const filePath = String(entry?.path || '');

  for (const pattern of VOLATILE_TAIL_PATTERNS) {
    if (pattern.test(filePath)) {
      return { tier: 3, tierName: 'volatile_tail' };
    }
  }

  for (const pattern of STATIC_CORE_PATTERNS) {
    if (pattern.test(filePath)) {
      return { tier: 1, tierName: 'static_core' };
    }
  }

  if (
    medianModified > 0 &&
    typeof entry?.modified === 'number' &&
    entry.modified > medianModified
  ) {
    return { tier: 2, tierName: 'semi_stable' };
  }

  return { tier: 2, tierName: 'semi_stable' };
}

/**
 * Order file entries deterministically to maximize prefix stability across agent turns.
 * Within each stability tier, entries are ordered lexically by path so small mtime shifts
 * do not scramble the prefix order unless a file enters the volatile tail.
 *
 * @param {Array<object>} entries
 * @returns {Array<object>}
 */
export function orderEntriesForPromptCache(entries) {
  if (!Array.isArray(entries) || entries.length <= 1) return entries ? [...entries] : [];

  const mtimes = entries
    .map((e) => (typeof e.modified === 'number' ? e.modified : 0))
    .filter((m) => m > 0)
    .sort((a, b) => a - b);
  const medianModified = mtimes.length > 0 ? mtimes[Math.floor(mtimes.length / 2)] : 0;

  return [...entries]
    .map((entry) => {
      const { tier, tierName } = classifyCacheTier(entry, medianModified);
      return {
        ...entry,
        cacheTier: tierName,
        _tierRank: tier,
      };
    })
    .sort((a, b) => {
      if (a._tierRank !== b._tierRank) return a._tierRank - b._tierRank;
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    })
    .map(({ _tierRank, ...rest }) => rest);
}

/**
 * Build a complete Prompt Cache optimization plan, Anthropic `cache_control` breakpoints,
 * OpenAI 1024-token prefix alignment metrics, and multi-turn cost savings estimate.
 *
 * @param {object} params
 * @param {Array<{path: string, tokens: number, content?: string, cacheTier?: string}>} params.entries
 * @param {number} params.totalTokens
 * @param {string|null} [params.header]
 * @param {string|null} [params.tree]
 * @param {Array<object>} [params.rules]
 * @param {string|null} [params.instructions]
 * @param {(text: string) => number} params.count
 * @param {boolean|string} [params.cacheControl='universal']
 * @returns {object}
 */
export function buildPromptCachePlan({
  entries = [],
  totalTokens = 0,
  header = null,
  tree = null,
  rules = [],
  instructions = null,
  count = (t) => Math.ceil(String(t || '').length / 4),
  cacheControl = 'universal',
}) {
  const provider =
    typeof cacheControl === 'string' && ['anthropic', 'openai', 'universal'].includes(cacheControl)
      ? cacheControl
      : 'universal';

  const rulesText = Array.isArray(rules) ? rules.map((r) => r.content || '').join('\n\n') : '';
  const preambleTokens =
    (header ? count(header) : 0) + (tree ? count(tree) : 0) + (rulesText ? count(rulesText) : 0);
  const instructionsTokens = instructions ? count(instructions) : 0;

  const tier1Files = [];
  const tier2Files = [];
  const tier3Files = [];

  for (const entry of entries) {
    const tierName = entry.cacheTier || classifyCacheTier(entry).tierName;
    if (tierName === 'static_core') tier1Files.push(entry);
    else if (tierName === 'volatile_tail') tier3Files.push(entry);
    else tier2Files.push(entry);
  }

  const sumTokens = (list) => list.reduce((sum, item) => sum + (item.tokens || 0), 0);
  const tier1Tokens = sumTokens(tier1Files);
  const tier2Tokens = sumTokens(tier2Files);
  const tier3Tokens = sumTokens(tier3Files);

  const rawStaticTokens = preambleTokens + tier1Tokens + tier2Tokens;
  const rawVolatileTokens = tier3Tokens + instructionsTokens;
  const rawTotal = Math.max(1, rawStaticTokens + rawVolatileTokens);
  const effectiveTotal = Math.max(totalTokens, rawTotal, 1);

  // Attribute document wrapper overhead proportionally between static prefix and volatile tail
  const wrapperOverhead = Math.max(0, effectiveTotal - (rawStaticTokens + rawVolatileTokens));
  const staticWrapperShare = Math.round(wrapperOverhead * (rawStaticTokens / rawTotal));
  const staticPrefixTokens = rawStaticTokens + staticWrapperShare;
  const volatileTailTokens = Math.max(0, effectiveTotal - staticPrefixTokens);
  const cacheableRatio = Number(
    Math.min(1, Math.max(0, staticPrefixTokens / effectiveTotal)).toFixed(4)
  );

  // Build up to 4 Anthropic ephemeral cache breakpoints
  const breakpoints = [];
  let runningOffset = 0;

  if (preambleTokens > 0) {
    runningOffset += preambleTokens;
    breakpoints.push({
      id: 'bp_preamble_and_tree',
      stage: 'preamble',
      cumulativeTokens: runningOffset,
      filesIncluded: 0,
      cacheControl: { type: 'ephemeral' },
    });
  }

  if (tier1Files.length > 0) {
    runningOffset += tier1Tokens;
    breakpoints.push({
      id: 'bp_static_core',
      stage: 'static_core',
      cumulativeTokens: runningOffset,
      filesIncluded: tier1Files.length,
      lastFile: tier1Files[tier1Files.length - 1].path,
      cacheControl: { type: 'ephemeral' },
    });
  }

  if (tier2Files.length > 0) {
    runningOffset = staticPrefixTokens;
    breakpoints.push({
      id: 'bp_semi_stable',
      stage: 'semi_stable',
      cumulativeTokens: runningOffset,
      filesIncluded: tier2Files.length,
      lastFile: tier2Files[tier2Files.length - 1].path,
      cacheControl: { type: 'ephemeral' },
    });
  }

  if (tier3Files.length > 0 || instructionsTokens > 0) {
    runningOffset = effectiveTotal;
    if (breakpoints.length < MAX_ANTHROPIC_BREAKPOINTS) {
      breakpoints.push({
        id: 'bp_volatile_tail',
        stage: 'volatile_tail',
        cumulativeTokens: runningOffset,
        filesIncluded: tier3Files.length,
        lastFile: tier3Files.length > 0 ? tier3Files[tier3Files.length - 1].path : null,
        cacheControl: null,
      });
    }
  }

  const openaiEligible = staticPrefixTokens >= OPENAI_MIN_CACHE_TOKENS;
  const openaiAlignedPrefixTokens = openaiEligible ? Math.floor(staticPrefixTokens / 128) * 128 : 0;

  // Multi-turn savings model (10-turn agent session)
  const turns = 10;
  const hitTurns = turns - 1;
  const uncachedTenTurnTokens = effectiveTotal * turns;
  // Anthropic: 1.25x write on turn 1, 0.10x read (90% discount) on turns 2..10 for static prefix
  const anthropicEffectiveTokens = Math.round(
    staticPrefixTokens * 1.25 + staticPrefixTokens * 0.1 * hitTurns + volatileTailTokens * turns
  );
  // OpenAI: 1.0x write on turn 1, 0.50x read (50% discount) on turns 2..10 for aligned prefix
  const openaiEffectiveTokens = Math.round(
    effectiveTotal + (effectiveTotal - openaiAlignedPrefixTokens * 0.5) * hitTurns
  );

  const anthropicSavedPct = Number(
    Math.max(
      0,
      ((uncachedTenTurnTokens - anthropicEffectiveTokens) / uncachedTenTurnTokens) * 100
    ).toFixed(1)
  );
  const openaiSavedPct = Number(
    Math.max(
      0,
      ((uncachedTenTurnTokens - openaiEffectiveTokens) / uncachedTenTurnTokens) * 100
    ).toFixed(1)
  );

  // Ready-to-use Anthropic system block layout with `cache_control: { type: 'ephemeral' }`
  const anthropicSystemBlocks = [];
  if (header || tree || rulesText) {
    const preambleParts = [header, rulesText, tree ? `Directory Structure:\n${tree}` : null].filter(
      Boolean
    );
    anthropicSystemBlocks.push({
      type: 'text',
      text: preambleParts.join('\n\n'),
      cache_control: { type: 'ephemeral' },
    });
  }
  if (tier1Files.length > 0 || tier2Files.length > 0) {
    const stableFiles = [...tier1Files, ...tier2Files];
    anthropicSystemBlocks.push({
      type: 'text',
      text: stableFiles
        .map(
          (f) =>
            `<file path="${f.path}" tier="${f.cacheTier || 'semi_stable'}">\n${f.content || ''}\n</file>`
        )
        .join('\n\n'),
      cache_control: { type: 'ephemeral' },
    });
  }
  if (tier3Files.length > 0 || instructions) {
    const tailParts = [
      ...tier3Files.map(
        (f) => `<file path="${f.path}" tier="volatile_tail">\n${f.content || ''}\n</file>`
      ),
      instructions ? `<instructions>\n${instructions}\n</instructions>` : null,
    ].filter(Boolean);
    anthropicSystemBlocks.push({
      type: 'text',
      text: tailParts.join('\n\n'),
    });
  }

  return {
    provider,
    staticPrefixTokens,
    volatileTailTokens,
    cacheableRatio,
    tiers: {
      staticCore: {
        files: tier1Files.length,
        tokens: tier1Tokens,
        paths: tier1Files.map((f) => f.path),
      },
      semiStable: {
        files: tier2Files.length,
        tokens: tier2Tokens,
        paths: tier2Files.map((f) => f.path),
      },
      volatileTail: {
        files: tier3Files.length,
        tokens: tier3Tokens,
        paths: tier3Files.map((f) => f.path),
      },
    },
    openai: {
      eligible: openaiEligible,
      minRequiredTokens: OPENAI_MIN_CACHE_TOKENS,
      alignedPrefixTokens: openaiAlignedPrefixTokens,
    },
    anthropic: {
      eligible: staticPrefixTokens >= ANTHROPIC_MIN_CACHE_TOKENS,
      minRequiredTokens: ANTHROPIC_MIN_CACHE_TOKENS,
      breakpoints: breakpoints.slice(0, MAX_ANTHROPIC_BREAKPOINTS),
      systemBlocks: anthropicSystemBlocks,
    },
    estimatedSavings: {
      assumedTurns: turns,
      uncachedSessionTokens: uncachedTenTurnTokens,
      anthropicEffectiveTokens,
      anthropicSavingsPct: anthropicSavedPct,
      openaiEffectiveTokens,
      openaiSavingsPct: openaiSavedPct,
    },
  };
}
