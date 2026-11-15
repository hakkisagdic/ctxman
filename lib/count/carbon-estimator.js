/**
 * F16-5: GreenOps & LLM/CI Carbon Footprint Estimator
 * Estimates energy consumption (Wh) and CO2e emissions (grams) for LLM token inference and CI minutes, plus savings from prompt caching.
 */

/**
 * Estimate energy (Wh) and carbon footprint (gCO2e) for LLM token usage and CI/CD runs.
 *
 * @param {object} options
 * @param {number} [options.inputTokens=0]
 * @param {number} [options.outputTokens=0]
 * @param {number} [options.cachedInputTokens=0]
 * @param {number} [options.ciMinutes=0]
 * @param {number} [options.gridCarbonIntensityGPerKwh=400]
 * @returns {object}
 */
export function estimateCarbonFootprint(options = {}) {
  const inputTokens = Math.max(0, Number(options.inputTokens ?? 0));
  const outputTokens = Math.max(0, Number(options.outputTokens ?? 0));
  const cachedInputTokens = Math.max(
    0,
    Math.min(inputTokens, Number(options.cachedInputTokens ?? 0))
  );
  const ciMinutes = Math.max(0, Number(options.ciMinutes ?? 0));
  const gridIntensity = Math.max(10, Number(options.gridCarbonIntensityGPerKwh ?? 400));

  const uncachedInputTokens = inputTokens - cachedInputTokens;
  // Energy factors: ~0.0003 Wh per 1k uncached input tokens, ~0.00005 Wh per 1k cached tokens, ~0.0012 Wh per 1k output tokens, ~1.5 Wh per CI runner minute
  const uncachedBaselineWh =
    (inputTokens / 1000) * 0.0003 + (outputTokens / 1000) * 0.0012 + ciMinutes * 1.5;

  const actualEnergyWh =
    (uncachedInputTokens / 1000) * 0.0003 +
    (cachedInputTokens / 1000) * 0.00005 +
    (outputTokens / 1000) * 0.0012 +
    ciMinutes * 1.5;

  const savedEnergyWh = Math.max(0, uncachedBaselineWh - actualEnergyWh);
  const co2Grams = Number(((actualEnergyWh / 1000) * gridIntensity).toFixed(4));
  const savedCo2Grams = Number(((savedEnergyWh / 1000) * gridIntensity).toFixed(4));

  return {
    energyWh: Number(actualEnergyWh.toFixed(4)),
    savedEnergyWh: Number(savedEnergyWh.toFixed(4)),
    co2Grams,
    savedCo2Grams,
    summary: {
      inputTokens,
      cachedInputTokens,
      outputTokens,
      ciMinutes,
      gridCarbonIntensityGPerKwh: gridIntensity,
    },
  };
}
