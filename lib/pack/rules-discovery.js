/**
 * Project Rules & AI Agent Instructions Auto-Discovery (P0-3)
 *
 * Discovers standard agent instruction files across single or multi-repository workspaces:
 * - `AGENTS.md`
 * - `CLAUDE.md`
 * - `.cursorrules`
 * - `.cursor/rules/*.mdc` / `.cursor/rules/*.md`
 * - `.github/copilot-instructions.md`
 * - `.windsurfrules`
 * - `.ctxman/rules.md`
 */

import fs from 'node:fs';
import path from 'node:path';
import TokenUtils from '../utils/token-utils.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import { loadPolicy } from '../policy/index.js';
import { resolveWorkspaceRepos } from '../workspace/index.js';

export const STATIC_RULE_CANDIDATES = Object.freeze([
  { path: 'AGENTS.md', kind: 'agents' },
  { path: 'CLAUDE.md', kind: 'claude' },
  { path: '.cursorrules', kind: 'cursorrules' },
  { path: '.github/copilot-instructions.md', kind: 'copilot-instructions' },
  { path: '.windsurfrules', kind: 'windsurfrules' },
  { path: '.ctxman/rules.md', kind: 'ctxman-rules' },
]);

function discoverInSingleRepo(
  repoRoot,
  { alias = null, policy = null, redact = true, redactPII = false } = {}
) {
  const absRoot = path.resolve(repoRoot);
  const effectivePolicy = policy || loadPolicy(absRoot);
  const effectiveRedactPII = redactPII || Boolean(effectivePolicy?.redactPII);

  const candidates = [...STATIC_RULE_CANDIDATES];

  // Check .cursor/rules/*.mdc and *.md
  const cursorRulesDir = path.join(absRoot, '.cursor', 'rules');
  if (fs.existsSync(cursorRulesDir) && fs.statSync(cursorRulesDir).isDirectory()) {
    const entries = fs.readdirSync(cursorRulesDir).sort();
    for (const name of entries) {
      if (name.endsWith('.mdc') || name.endsWith('.md')) {
        candidates.push({
          path: `.cursor/rules/${name}`,
          kind: 'cursor-mdc',
        });
      }
    }
  }

  const rules = [];
  const findings = [];

  for (const item of candidates) {
    const relPosix = item.path;
    if (effectivePolicy?.active && effectivePolicy.isDenied(relPosix)) {
      continue;
    }

    const absFile = path.join(absRoot, relPosix);
    if (!fs.existsSync(absFile)) continue;
    let stat;
    try {
      stat = fs.statSync(absFile);
    } catch (_err) {
      continue;
    }
    if (!stat.isFile()) continue;

    let content;
    try {
      content = fs.readFileSync(absFile, 'utf8');
    } catch (_err) {
      continue;
    }
    if (!content.trim()) continue;

    let fileFindings = [];
    if (redact || effectiveRedactPII) {
      const red = redactSecrets(content, { redactPII: effectiveRedactPII });
      content = red.text;
      fileFindings = red.findings;
      findings.push(...red.findings);
    }

    const displayPath = alias ? `${alias}/${relPosix}` : relPosix;
    const tokens = TokenUtils.calculate(content, displayPath);

    rules.push({
      path: displayPath,
      relativePath: relPosix,
      ...(alias ? { repo: alias } : {}),
      kind: item.kind,
      tokens,
      bytes: Buffer.byteLength(content, 'utf8'),
      content: content.trimEnd(),
      findings: fileFindings,
    });
  }

  return { rules, findings };
}

/**
 * Format discovered project rules for inclusion in a Markdown, XML, or plain document
 * @param {Array<{path: string, kind: string, tokens: number, content: string}>|{rules: Array}} rulesInput
 * @param {'markdown'|'xml'|'plain'} [style='markdown']
 * @returns {string}
 */
export function formatProjectRulesSection(rulesInput, style = 'markdown') {
  const rules = Array.isArray(rulesInput)
    ? rulesInput
    : Array.isArray(rulesInput?.rules)
      ? rulesInput.rules
      : [];
  if (rules.length === 0) return '';

  if (style === 'xml') {
    const lines = ['<project_rules>'];
    for (const r of rules) {
      lines.push(`  <rule path="${r.path}" kind="${r.kind}" tokens="${r.tokens}">`);
      lines.push(r.content);
      lines.push('  </rule>');
    }
    lines.push('</project_rules>');
    return lines.join('\n');
  }

  const lines = ['# Project Rules & Agent Instructions', ''];
  for (const r of rules) {
    lines.push(`## ${r.path} (${r.kind})`, '');
    lines.push(r.content, '');
  }
  return lines.join('\n').trimEnd();
}

/**
 * Discover AI agent instruction and project rule files in one or more repositories.
 * Returns an Array of rule descriptors augmented with `.rules`, `.totalTokens`, `.redactions`, `.markdown`, `.xml`.
 *
 * @param {string} root - Primary repository root
 * @param {object} [options]
 * @param {string[]} [options.repos] - Additional repository roots
 * @param {boolean} [options.redact=true] - Redact secrets
 * @param {boolean} [options.redactPII=false] - Redact KVKK/BDDK PII
 */
export function discoverProjectRules(root = process.cwd(), options = {}) {
  const extraRepos = Array.isArray(options.repos) ? options.repos.filter(Boolean) : [];
  const redact = options.redact !== false;
  const redactPII = Boolean(options.redactPII);

  let allRules = [];
  let allFindings = [];

  if (extraRepos.length > 0) {
    const resolved = resolveWorkspaceRepos([root, ...extraRepos]);
    for (const repo of resolved) {
      const { rules, findings } = discoverInSingleRepo(repo.root, {
        alias: repo.alias,
        policy: repo.policy,
        redact,
        redactPII,
      });
      allRules.push(...rules);
      allFindings.push(...findings);
    }
  } else {
    const { rules, findings } = discoverInSingleRepo(root, {
      policy: options.policy || null,
      redact,
      redactPII,
    });
    allRules = rules;
    allFindings = findings;
  }

  const byType = {};
  for (const t of allFindings) byType[t] = (byType[t] || 0) + 1;
  const totalTokens = allRules.reduce((sum, r) => sum + r.tokens, 0);

  return Object.assign(allRules, {
    rules: allRules,
    totalTokens,
    redactions: {
      total: allFindings.length,
      byType,
    },
    markdown: formatProjectRulesSection(allRules, 'markdown'),
    xml: formatProjectRulesSection(allRules, 'xml'),
  });
}

export default discoverProjectRules;
