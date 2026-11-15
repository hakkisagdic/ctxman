/**
 * F11-2: Agent MCP Tool-Call Loop & Cost Guard
 * Detects repetitive identical tool calls, A<->B ping-pong oscillations, and error retry storms.
 */

function normalizeArgs(args) {
  if (args === null || args === undefined) return '';
  if (typeof args !== 'object') return String(args);
  const sortedKeys = Object.keys(args).sort();
  const normalized = {};
  for (const k of sortedKeys) {
    normalized[k] = args[k];
  }
  return JSON.stringify(normalized);
}

/**
 * Analyze a trace of agent MCP/tool invocations for infinite loops and token waste.
 *
 * @param {object} options
 * @param {Array<{tool: string, args?: any, tokensUsed?: number, durationMs?: number, status?: 'ok'|'error'}>} [options.toolCalls]
 * @param {number} [options.maxIdenticalCalls=3]
 * @param {number} [options.maxConsecutiveErrors=3]
 * @returns {object}
 */
export function analyzeAgentToolLoop(options = {}) {
  const toolCalls = Array.isArray(options.toolCalls) ? options.toolCalls : [];
  const maxIdenticalCalls = Number(options.maxIdenticalCalls ?? 3);
  const maxConsecutiveErrors = Number(options.maxConsecutiveErrors ?? 3);

  const signatureCounts = new Map();
  const signatureTokens = new Map();
  const loops = [];
  const cacheRecommendations = [];

  for (let i = 0; i < toolCalls.length; i++) {
    const call = toolCalls[i];
    const sig = `${call.tool}::${normalizeArgs(call.args)}`;
    const prevCount = signatureCounts.get(sig) || 0;
    const nextCount = prevCount + 1;
    signatureCounts.set(sig, nextCount);

    const tokens = Number(call.tokensUsed || 250);
    if (prevCount >= 1) {
      signatureTokens.set(sig, (signatureTokens.get(sig) || 0) + tokens);
    }
  }

  let wastedTokens = 0;
  for (const [sig, count] of signatureCounts.entries()) {
    const [tool, rawArgs] = sig.split('::');
    const duplicateTokens = signatureTokens.get(sig) || 0;
    if (count >= 2) {
      wastedTokens += duplicateTokens;
      cacheRecommendations.push({
        tool,
        argsSignature: rawArgs,
        callCount: count,
        DuplicateTokensSaved: duplicateTokens,
      });
    }
    if (count >= maxIdenticalCalls) {
      loops.push({
        pattern: 'exact-repeat-loop',
        severity: 'critical',
        tool,
        occurrences: count,
        description: `Tool '${tool}' was invoked ${count} times with identical arguments.`,
      });
    }
  }

  // Detect A -> B -> A -> B ping-pong oscillation
  if (toolCalls.length >= 4) {
    for (let i = 0; i <= toolCalls.length - 4; i++) {
      const a1 = `${toolCalls[i].tool}::${normalizeArgs(toolCalls[i].args)}`;
      const b1 = `${toolCalls[i + 1].tool}::${normalizeArgs(toolCalls[i + 1].args)}`;
      const a2 = `${toolCalls[i + 2].tool}::${normalizeArgs(toolCalls[i + 2].args)}`;
      const b2 = `${toolCalls[i + 3].tool}::${normalizeArgs(toolCalls[i + 3].args)}`;
      if (a1 !== b1 && a1 === a2 && b1 === b2) {
        loops.push({
          pattern: 'ping-pong-oscillation',
          severity: 'high',
          tool: `${toolCalls[i].tool} <-> ${toolCalls[i + 1].tool}`,
          occurrences: 4,
          description: `Alternating oscillation detected between '${toolCalls[i].tool}' and '${toolCalls[i + 1].tool}'.`,
        });
        break;
      }
    }
  }

  // Detect consecutive error retry storm
  let errorStreak = 0;
  let lastErrorTool = null;
  for (const call of toolCalls) {
    if (call.status === 'error') {
      if (call.tool === lastErrorTool) {
        errorStreak += 1;
      } else {
        lastErrorTool = call.tool;
        errorStreak = 1;
      }
      if (errorStreak === maxConsecutiveErrors) {
        loops.push({
          pattern: 'error-retry-storm',
          severity: 'high',
          tool: call.tool,
          occurrences: errorStreak,
          description: `Tool '${call.tool}' failed ${errorStreak} times consecutively without argument recovery.`,
        });
      }
    } else {
      errorStreak = 0;
      lastErrorTool = null;
    }
  }

  const loopDetected = loops.length > 0;
  const action = loopDetected
    ? 'halt_and_replan'
    : cacheRecommendations.length > 0
      ? 'serve_cached_result'
      : 'continue';

  return {
    loopDetected,
    action,
    loops,
    wastedTokens,
    cacheRecommendations,
    summary: {
      totalCalls: toolCalls.length,
      uniqueCalls: signatureCounts.size,
      loopCount: loops.length,
      wastedTokens,
    },
  };
}
