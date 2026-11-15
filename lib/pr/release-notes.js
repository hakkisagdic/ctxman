import path from 'node:path';
import { execFileSync } from 'node:child_process';

function runGit(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Generate a categorized customer-facing changelog and release notes from Conventional
 * Commits and affected module scopes (`F7-2`: Semantic Release Notes Generator).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options]
 * @param {string} [options.fromRev] - Starting git tag/revision
 * @param {string} [options.toRev='HEAD'] - Ending git revision
 * @param {string} [options.version='vNext'] - Target version title
 * @param {Array<{sha?: string, subject: string, body?: string, author?: string}>} [options.commits]
 * @returns {object}
 */
export function generateSemanticReleaseNotes(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const version = options.version || 'vNext';
  const toRev = options.toRev || 'HEAD';

  let commits = [];
  if (Array.isArray(options.commits)) {
    commits = options.commits;
  } else {
    const range = options.fromRev ? `${options.fromRev}..${toRev}` : `-n 30 ${toRev}`;
    const args = options.fromRev
      ? ['log', '--no-merges', '--pretty=format:%h%x09%an%x09%s', range]
      : ['log', '--no-merges', '-n', '25', '--pretty=format:%h%x09%an%x09%s', toRev];
    const out = runGit(absRoot, args);
    if (out) {
      commits = out.split('\n').map((line) => {
        const [sha, author, subject] = line.split('\t');
        return { sha, author, subject };
      });
    }
  }

  const sections = {
    breaking: [],
    features: [],
    fixes: [],
    performance: [],
    security: [],
    other: [],
  };
  const contributors = new Set();

  for (const c of commits) {
    if (!c || !c.subject) continue;
    if (c.author) contributors.add(c.author);

    const subj = String(c.subject).trim();
    const isBreaking =
      /^[a-z]+(?:\([^)]+\))?!:/i.test(subj) || /BREAKING CHANGE/i.test(String(c.body || ''));
    const m = subj.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/i);

    const type = m ? m[1].toLowerCase() : 'other';
    const scope = m && m[2] ? m[2] : null;
    const description = m ? m[3] : subj;
    const entry = {
      sha: c.sha || null,
      type,
      scope,
      description,
      breaking: isBreaking,
    };

    if (isBreaking) sections.breaking.push(entry);
    if (type === 'feat' || type === 'feature') sections.features.push(entry);
    else if (type === 'fix' || type === 'bugfix') sections.fixes.push(entry);
    else if (type === 'perf') sections.performance.push(entry);
    else if (type === 'sec' || type === 'security' || /cve-|taint|pii|sarif/i.test(subj)) {
      sections.security.push(entry);
    } else {
      sections.other.push(entry);
    }
  }

  const formatList = (title, items) => {
    if (items.length === 0) return '';
    const bullets = items.map(
      (i) =>
        `- ${i.scope ? `**${i.scope}:** ` : ''}${i.description}${i.sha ? ` (\`${i.sha}\`)` : ''}`
    );
    return `### ${title}\n\n${bullets.join('\n')}\n\n`;
  };

  const markdown = [
    `## ${version}`,
    '',
    formatList('Breaking Changes', sections.breaking),
    formatList('New Features', sections.features),
    formatList('Bug Fixes', sections.fixes),
    formatList('Security & Compliance', sections.security),
    formatList('Performance Improvements', sections.performance),
  ]
    .filter(Boolean)
    .join('\n')
    .trim();

  return {
    version,
    totalCommits: commits.length,
    contributors: [...contributors],
    sections,
    markdown,
  };
}
