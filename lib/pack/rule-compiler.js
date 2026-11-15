import fs from 'node:fs';
import path from 'node:path';

/**
 * Compile a unified `.ctxman/rules.json` (or rule object) into formatted agent instruction
 * files for Claude Code (`CLAUDE.md`), OpenAI Codex / Universal Agents (`AGENTS.md`),
 * Cursor (`.cursorrules`), and GitHub Copilot (`.github/copilot-instructions.md`) (`F5-5`).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options]
 * @param {object} [options.config] - Optional explicit rules configuration
 * @param {boolean} [options.write=false] - Whether to write the compiled files to disk
 * @returns {object}
 */
export function compileAgentRules(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  let config = options.config || null;

  if (!config) {
    const rulesPath = path.join(absRoot, '.ctxman', 'rules.json');
    if (fs.existsSync(rulesPath)) {
      try {
        config = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
      } catch {
        config = {};
      }
    } else {
      config = {};
    }
  }

  const projectName = config.project || path.basename(absRoot);
  const codingStandards = Array.isArray(config.codingStandards) ? config.codingStandards : [];
  const forbiddenPatterns = Array.isArray(config.forbiddenPatterns) ? config.forbiddenPatterns : [];
  const requiredChecks = Array.isArray(config.requiredChecks) ? config.requiredChecks : [];
  const rules = Array.isArray(config.rules) ? config.rules : [];

  const bulletSection = (title, items) => {
    if (!items || items.length === 0) return '';
    return `## ${title}\n\n${items.map((item) => `- ${item}`).join('\n')}\n\n`;
  };

  const ruleTableLines = rules.map((r) => {
    const id = r.id || 'rule';
    const sev = r.severity || 'error';
    const msg = r.message || r.description || '';
    return `- **[${sev.toUpperCase()}] \`${id}\`**: ${msg}`;
  });

  const coreBody = [
    bulletSection('Coding Standards & Conventions', codingStandards),
    bulletSection('Policy & Architectural Rules', ruleTableLines),
    bulletSection('Forbidden Patterns', forbiddenPatterns),
    bulletSection('Required Pre-Commit & Verification Checks', requiredChecks),
  ]
    .filter(Boolean)
    .join('');

  const artifacts = {
    'CLAUDE.md': `# ${projectName} — Claude Code Instructions\n\n${coreBody}`.trim() + '\n',
    'AGENTS.md': `# ${projectName} — Autonomous Agent Guidelines\n\n${coreBody}`.trim() + '\n',
    '.cursorrules': `# ${projectName} — Cursor Rules\n\n${coreBody}`.trim() + '\n',
    '.github/copilot-instructions.md':
      `# ${projectName} — GitHub Copilot Instructions\n\n${coreBody}`.trim() + '\n',
  };

  const writtenFiles = [];
  if (options.write) {
    for (const [relFile, content] of Object.entries(artifacts)) {
      const targetPath = path.join(absRoot, relFile);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content, 'utf8');
      writtenFiles.push(relFile);
    }
  }

  return {
    root: absRoot,
    project: projectName,
    ruleCount:
      codingStandards.length + forbiddenPatterns.length + requiredChecks.length + rules.length,
    targets: Object.keys(artifacts),
    writtenFiles,
    artifacts,
  };
}
