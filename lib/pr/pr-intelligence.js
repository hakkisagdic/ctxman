/**
 * PR Intelligence (P1-2)
 *
 * Provides deterministic PR risk & confidence scoring (Greptile-style 1-5 confidence
 * and 0-100 risk score), scoped rule evaluation (.ctxman/rules.json or options.rules),
 * and automatic Mermaid flowchart generation (CodeRabbit-style walkthrough diagram).
 */

import fs from 'fs';
import path from 'path';
import { isTestFile } from './related-tests.js';

export const SENSITIVE_PATH_REGEX =
  /(^|\/)(auth|billing|security|policy|migration|migrations|crypto|secret|secrets|payment|payments|permissions|rbac|iam)(\/|$|-|_|\.)/i;

/**
 * Convert a glob pattern (*, **, ?) into a RegExp.
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  if (!glob || glob === '*' || glob === '**') return /^.*$/;
  const normalized = String(glob).trim().replace(/\\/g, '/');
  let regexStr = '^';
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        if (normalized[i + 2] === '/') {
          regexStr += '(?:.*/)?';
          i += 2;
        } else {
          regexStr += '.*';
          i += 1;
        }
      } else {
        regexStr += '[^/]*';
      }
    } else if (ch === '?') {
      regexStr += '[^/]';
    } else if ('+^$()[]{}|.\\'.includes(ch)) {
      regexStr += '\\' + ch;
    } else {
      regexStr += ch;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr);
}

/**
 * Load scoped PR review rules from options.rules or `<rootPath>/.ctxman/rules.json`.
 * @param {string} rootPath
 * @param {Array<object>|object|null} [explicitRules]
 * @returns {Array<object>}
 */
export function loadProjectPrRules(rootPath, explicitRules = null) {
  if (Array.isArray(explicitRules)) return explicitRules;
  if (explicitRules && Array.isArray(explicitRules.rules)) return explicitRules.rules;

  if (!rootPath) return [];
  const rulesPath = path.join(rootPath, '.ctxman', 'rules.json');
  if (!fs.existsSync(rulesPath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.rules)) return parsed.rules;
  } catch {
    // Ignore malformed optional rules file unless caller validates explicitly
  }
  return [];
}

/**
 * Extract added lines (with 1-based new-file line numbers when available) from a unified diff block.
 * @param {string} diffText
 * @returns {Array<{line: number, text: string}>}
 */
function extractAddedLinesFromDiff(diffText) {
  if (!diffText || typeof diffText !== 'string') return [];
  const added = [];
  let currentNewLine = 0;
  for (const rawLine of diffText.split('\n')) {
    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine);
    if (hunkMatch) {
      currentNewLine = Number(hunkMatch[1]);
      continue;
    }
    if (rawLine.startsWith('+++') || rawLine.startsWith('---') || rawLine.startsWith('diff ')) {
      continue;
    }
    if (rawLine.startsWith('+')) {
      added.push({
        line: currentNewLine > 0 ? currentNewLine : 1,
        text: rawLine.slice(1),
      });
      if (currentNewLine > 0) currentNewLine++;
    } else if (rawLine.startsWith(' ')) {
      if (currentNewLine > 0) currentNewLine++;
    }
  }
  return added;
}

/**
 * Evaluate scoped PR rules against changed files, diffs, and related tests.
 * Supported rule keys:
 * - id / name: identifier for the rule
 * - severity: 'error' | 'warning' | 'info' (default 'warning')
 * - pathPattern: glob matching changed file paths (default '**')
 * - forbidPattern: regex string or substring forbidden in added diff lines
 * - requireTest: boolean requiring a changed test file or changed related test when matching code changes
 * - maxFileAdditions: max added lines allowed in a single matching file
 *
 * @param {string} rootPath
 * @param {object} context
 * @returns {Array<object>}
 */
export function evaluatePrRules(
  rootPath,
  { files = [], diffs = [], tests = [], rules = null } = {}
) {
  const activeRules = loadProjectPrRules(rootPath, rules);
  if (activeRules.length === 0) return [];

  const diffByPath = new Map();
  for (const d of diffs) {
    if (d && d.path) diffByPath.set(d.path, d.text || '');
  }
  for (const f of files) {
    if (f && f.path && f.block?.text && !diffByPath.has(f.path)) {
      diffByPath.set(f.path, f.block.text);
    }
  }

  const anyChangedTestInPr = files.some((f) => f.status !== 'D' && isTestFile(f.path));
  const violations = [];

  for (let idx = 0; idx < activeRules.length; idx++) {
    const rule = activeRules[idx];
    if (!rule || typeof rule !== 'object') continue;
    const ruleId = rule.id || rule.name || `rule-${idx + 1}`;
    const severity = rule.severity || 'warning';
    const pathMatcher = globToRegExp(rule.pathPattern || '**');
    const matchingFiles = files.filter((f) => f.status !== 'D' && pathMatcher.test(f.path));

    if (matchingFiles.length === 0) continue;

    // 1. forbidPattern check on added diff lines
    if (typeof rule.forbidPattern === 'string' && rule.forbidPattern.length > 0) {
      let forbidRegex;
      try {
        forbidRegex = new RegExp(rule.forbidPattern);
      } catch {
        forbidRegex = new RegExp(rule.forbidPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }
      for (const file of matchingFiles) {
        const diffText = diffByPath.get(file.path) || '';
        const addedLines = extractAddedLinesFromDiff(diffText);
        for (const added of addedLines) {
          if (forbidRegex.test(added.text)) {
            violations.push({
              ruleId,
              severity,
              type: 'forbidPattern',
              file: file.path,
              line: added.line,
              message:
                rule.message ||
                `Forbidden pattern "${rule.forbidPattern}" matched in ${file.path}:${added.line}`,
            });
            break;
          }
        }
      }
    }

    // 2. maxFileAdditions check
    if (
      typeof rule.maxFileAdditions === 'number' &&
      Number.isFinite(rule.maxFileAdditions) &&
      rule.maxFileAdditions >= 0
    ) {
      for (const file of matchingFiles) {
        if ((file.additions || 0) > rule.maxFileAdditions) {
          violations.push({
            ruleId,
            severity,
            type: 'maxFileAdditions',
            file: file.path,
            line: 1,
            additions: file.additions,
            limit: rule.maxFileAdditions,
            message:
              rule.message ||
              `File ${file.path} adds ${file.additions} lines, exceeding maxFileAdditions (${rule.maxFileAdditions})`,
          });
        }
      }
    }

    // 3. requireTest check
    if (rule.requireTest === true) {
      const codeFiles = matchingFiles.filter((f) => !isTestFile(f.path));
      for (const file of codeFiles) {
        const hasUpdatedRelatedTest = tests.some(
          (t) =>
            t.changed &&
            Array.isArray(t.reasons) &&
            t.reasons.some((r) => r.includes(file.path) || r.includes(path.basename(file.path)))
        );
        if (!anyChangedTestInPr && !hasUpdatedRelatedTest) {
          violations.push({
            ruleId,
            severity,
            type: 'requireTest',
            file: file.path,
            line: 1,
            message:
              rule.message ||
              `Changes to ${file.path} require corresponding test updates (rule "${ruleId}")`,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Calculate deterministic PR riskScore (0-100), confidenceScore (1-5), and riskFactors.
 * @param {object} params
 * @returns {{riskScore: number, confidenceScore: number, riskFactors: string[]}}
 */
export function calculatePrRiskAndConfidence({
  files = [],
  methods = [],
  deletedMethods = [],
  tests = [],
  stats = {},
  ruleViolations = [],
} = {}) {
  let score = 0;
  const riskFactors = [];

  const fileCount = files.length;
  const additions = stats.additions ?? files.reduce((s, f) => s + (f.additions || 0), 0);
  const deletions = stats.deletions ?? files.reduce((s, f) => s + (f.deletions || 0), 0);
  const totalLines = additions + deletions;

  // 1. Sensitive directories / paths
  const sensitiveFiles = files.filter((f) => SENSITIVE_PATH_REGEX.test(f.path));
  if (sensitiveFiles.length > 0) {
    const pts = Math.min(30, 20 + (sensitiveFiles.length - 1) * 5);
    score += pts;
    riskFactors.push(
      `Sensitive module(s) touched (${sensitiveFiles
        .map((f) => f.path)
        .slice(0, 3)
        .join(', ')})`
    );
  }

  // 2. Changed file breadth
  if (fileCount >= 10) {
    score += 15;
    riskFactors.push(`Broad change surface (${fileCount} files modified)`);
  } else if (fileCount >= 5) {
    score += 8;
    riskFactors.push(`Moderate file surface (${fileCount} files modified)`);
  } else if (fileCount >= 1) {
    score += 3;
  }

  // 3. Line churn volume
  if (totalLines > 500) {
    score += 20;
    riskFactors.push(`High line churn (+${additions} -${deletions} lines)`);
  } else if (totalLines > 200) {
    score += 12;
    riskFactors.push(`Medium line churn (+${additions} -${deletions} lines)`);
  } else if (totalLines > 50) {
    score += 5;
  }

  // 4. Changed & deleted methods / call graph surface
  if (deletedMethods.length > 0) {
    const pts = Math.min(18, deletedMethods.length * 6);
    score += pts;
    riskFactors.push(
      `${deletedMethods.length} deleted method(s) (${deletedMethods
        .map((m) => m.name)
        .slice(0, 3)
        .join(', ')}) may impact callers`
    );
  }
  if (methods.length >= 4) {
    score += 10;
    riskFactors.push(`${methods.length} method definitions modified or added`);
  } else if (methods.length > 0) {
    score += 4;
  }

  // 5. Missing test coverage / test updates
  const changedCodeFiles = files.filter(
    (f) =>
      f.status !== 'D' &&
      !f.binary &&
      !isTestFile(f.path) &&
      !/\.(md|txt|json|ya?ml)$/i.test(f.path)
  );
  const changedTestFiles = files.filter((f) => f.status !== 'D' && isTestFile(f.path));
  if (changedCodeFiles.length > 0) {
    if (tests.length === 0 && changedTestFiles.length === 0) {
      score += 20;
      riskFactors.push(
        `No related tests or test updates found for ${changedCodeFiles.length} code file(s)`
      );
    } else if (changedTestFiles.length === 0) {
      score += 8;
      riskFactors.push(
        `${tests.length} related test(s) identified, but no test files were modified in this PR`
      );
    }
  }

  // 6. Scoped rule violations
  if (ruleViolations.length > 0) {
    const pts = Math.min(25, ruleViolations.length * 10);
    score += pts;
    riskFactors.push(`${ruleViolations.length} project rule violation(s) triggered`);
  }

  const riskScore = Math.max(0, Math.min(100, Math.round(score)));
  let confidenceScore = 5;
  if (riskScore > 75) confidenceScore = 1;
  else if (riskScore > 55) confidenceScore = 2;
  else if (riskScore > 35) confidenceScore = 3;
  else if (riskScore > 15) confidenceScore = 4;

  if (riskFactors.length === 0) {
    riskFactors.push('Small, low-risk change surface');
  }

  return {
    riskScore,
    confidenceScore,
    riskFactors,
  };
}

/**
 * Sanitize a label for safe inclusion inside a quoted Mermaid node `["..."]`.
 * @param {string} text
 * @returns {string}
 */
function sanitizeMermaidLabel(text) {
  return String(text || '')
    .replace(/"/g, "'")
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Generate a compact Mermaid `flowchart LR` impact diagram for the PR.
 * Connects changed files to their touched/deleted methods and related tests.
 *
 * @param {object} params
 * @returns {string}
 */
export function buildPrMermaidDiagram({
  files = [],
  methods = [],
  deletedMethods = [],
  tests = [],
} = {}) {
  const lines = ['flowchart LR'];
  if (files.length === 0) {
    lines.push('  Empty["No changed files"]');
    return lines.join('\n');
  }

  const fileNodeMap = new Map();
  const shownFiles = files.slice(0, 8);
  shownFiles.forEach((f, idx) => {
    const id = `F${idx}`;
    fileNodeMap.set(f.path, id);
    if (f.oldPath) fileNodeMap.set(f.oldPath, id);
    const label = sanitizeMermaidLabel(f.path);
    lines.push(`  ${id}["${label}"]`);
  });

  const shownMethods = methods.slice(0, 8);
  shownMethods.forEach((m, idx) => {
    const fId = fileNodeMap.get(m.file);
    if (!fId) return;
    const mId = `M${idx}`;
    const label = sanitizeMermaidLabel(`${m.name}()`);
    lines.push(`  ${fId} --> ${mId}["${label}"]`);
  });

  const shownDeleted = deletedMethods.slice(0, 4);
  shownDeleted.forEach((m, idx) => {
    const fId = fileNodeMap.get(m.file);
    if (!fId) return;
    const dId = `D${idx}`;
    const label = sanitizeMermaidLabel(`-${m.name}()`);
    lines.push(`  ${fId} -.-> ${dId}["${label}"]`);
  });

  const shownTests = tests.slice(0, 6);
  shownTests.forEach((t, idx) => {
    const tId = `T${idx}`;
    const tLabel = sanitizeMermaidLabel(t.path);
    let linked = false;
    for (const [fPath, fId] of fileNodeMap.entries()) {
      const base = path.basename(fPath);
      if (
        Array.isArray(t.reasons) &&
        t.reasons.some((r) => r.includes(fPath) || r.includes(base))
      ) {
        lines.push(`  ${fId} -.-> ${tId}["${tLabel}"]`);
        linked = true;
        break;
      }
    }
    if (!linked && shownFiles.length > 0) {
      lines.push(`  F0 -.-> ${tId}["${tLabel}"]`);
    }
  });

  return lines.join('\n');
}

/**
 * Compute all P1-2 intelligence fields for a PR model.
 * @param {string} rootPath
 * @param {object} params
 * @returns {{riskScore: number, confidenceScore: number, riskFactors: string[], ruleViolations: Array<object>, mermaidDiagram: string}}
 */
export function analyzePrIntelligence(
  rootPath,
  {
    files = [],
    methods = [],
    deletedMethods = [],
    diffs = [],
    tests = [],
    stats = {},
    rules = null,
  } = {}
) {
  const ruleViolations = evaluatePrRules(rootPath, { files, diffs, tests, rules });
  const { riskScore, confidenceScore, riskFactors } = calculatePrRiskAndConfidence({
    files,
    methods,
    deletedMethods,
    tests,
    stats,
    ruleViolations,
  });
  const mermaidDiagram = buildPrMermaidDiagram({
    files,
    methods,
    deletedMethods,
    tests,
  });

  return {
    riskScore,
    confidenceScore,
    riskFactors,
    ruleViolations,
    mermaidDiagram,
  };
}
