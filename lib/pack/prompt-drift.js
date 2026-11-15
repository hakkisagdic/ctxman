/**
 * F12-3: Prompt Template Regression & Variable Drift Checker
 * Detects missing template placeholders, unused variables, and output schema drift across prompt versions.
 */

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g;

function extractPlaceholders(templateText) {
  const vars = new Set();
  const text = String(templateText || '');
  let match;
  PLACEHOLDER_REGEX.lastIndex = 0;
  while ((match = PLACEHOLDER_REGEX.exec(text)) !== null) {
    vars.add(match[1] || match[2]);
  }
  return [...vars].sort();
}

/**
 * Check prompt templates against provided variables and baseline prompt contracts.
 *
 * @param {object} options
 * @param {string} options.template - Current prompt template string
 * @param {string} [options.baselineTemplate] - Previous version of the prompt template
 * @param {string[]|Record<string, unknown>} [options.providedVars] - Variables supplied by caller code
 * @param {string[]} [options.requiredOutputTags] - XML/JSON tags expected in output instructions
 * @returns {object}
 */
export function checkPromptTemplateDrift(options = {}) {
  const template = String(options.template || '');
  const baselineTemplate = options.baselineTemplate ? String(options.baselineTemplate) : null;

  const templateVars = extractPlaceholders(template);
  const baselineVars = baselineTemplate ? extractPlaceholders(baselineTemplate) : [];

  const providedList = Array.isArray(options.providedVars)
    ? options.providedVars
    : options.providedVars && typeof options.providedVars === 'object'
      ? Object.keys(options.providedVars)
      : [];
  const providedSet = new Set(providedList);

  const missingVars = templateVars.filter((v) => !providedSet.has(v));
  const unusedVars = providedList.filter((v) => !templateVars.includes(v));
  const removedBaselineVars = baselineVars.filter((v) => !templateVars.includes(v));

  const requiredOutputTags = Array.isArray(options.requiredOutputTags)
    ? options.requiredOutputTags
    : [];
  const missingOutputTags = requiredOutputTags.filter((tag) => !template.includes(tag));

  const inSync =
    missingVars.length === 0 && removedBaselineVars.length === 0 && missingOutputTags.length === 0;

  return {
    inSync,
    templateVars,
    missingVars,
    unusedVars,
    removedBaselineVars,
    missingOutputTags,
    summary: {
      templateVarCount: templateVars.length,
      missingVarCount: missingVars.length,
      unusedVarCount: unusedVars.length,
      removedBaselineVarCount: removedBaselineVars.length,
      missingOutputTagCount: missingOutputTags.length,
    },
  };
}
