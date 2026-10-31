/**
 * Expert Finder (`ctxman who <target-or-topic>`)
 *
 * Answers "Who knows about this?" by combining:
 *  1. Surviving line ownership (`git blame -w`, honoring `.git-blame-ignore-revs`)
 *  2. Historical commit & line-churn depth with exponential recency decay
 *  3. Declared stewardship from `CODEOWNERS` (`.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`)
 *  4. Automatic BM25 topic-to-file resolution when `<target>` is a concept/query rather than a path
 */

import fs from 'node:fs';
import path from 'node:path';
import { findRepositoryRoot, tryGit, utcDate } from '../why/git.js';
import { collectOwnership } from '../why/ownership.js';
import { parseTargetSpec, resolveSymbol } from '../why/target.js';
import { searchProject } from '../search/bm25.js';

export const DEFAULT_WHO_LIMIT = 5;
export const DEFAULT_COMMIT_WINDOW = 200;
export const DEFAULT_HALF_LIFE_DAYS = 90;
const DAY_SECONDS = 86400;

export class WhoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WhoError';
  }
}

/**
 * Convert a CODEOWNERS pattern into a RegExp matching repo-relative forward-slash paths.
 */
function codeownersPatternToRegex(pattern) {
  let clean = pattern.trim();
  const anchored = clean.startsWith('/');
  if (anchored) clean = clean.slice(1);
  const dirOnly = clean.endsWith('/');
  if (dirOnly) clean = clean.slice(0, -1);

  const escaped = clean
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '.*');

  if (dirOnly) {
    return anchored ? new RegExp(`^${escaped}(?:/.*)?$`) : new RegExp(`(?:^|/)${escaped}(?:/.*)?$`);
  }
  const hasSlash = clean.includes('/');
  if (anchored || hasSlash) {
    return new RegExp(`^${escaped}(?:/.*)?$`);
  }
  return new RegExp(`(?:^|/)${escaped}(?:/.*)?$`);
}

/**
 * Parse CODEOWNERS file if present in standard locations.
 */
export function loadCodeowners(repoRoot) {
  const candidates = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS', '.gitlab/CODEOWNERS'];
  for (const rel of candidates) {
    const full = path.join(repoRoot, rel);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    const content = fs.readFileSync(full, 'utf8');
    const rules = [];
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const [pattern, ...owners] = parts;
      rules.push({
        pattern,
        regex: codeownersPatternToRegex(pattern),
        owners,
      });
    }
    return { file: rel, rules };
  }
  return { file: null, rules: [] };
}

/**
 * Resolve CODEOWNERS for a list of repo-relative forward-slash file paths (last matching rule wins).
 */
export function matchCodeowners(codeowners, relFiles) {
  if (!codeowners.rules.length) return [];
  const owners = new Set();
  for (const file of relFiles) {
    let matched = null;
    for (const rule of codeowners.rules) {
      if (rule.regex.test(file)) matched = rule.owners;
    }
    if (matched) {
      for (const o of matched) owners.add(o);
    }
  }
  return [...owners];
}

/**
 * Resolve user target (file, file:symbol, file#L1-L10, directory, or natural-language topic) into repo-relative files.
 */
function resolveTargetFiles(repoRoot, cwd, rawTarget, maxFiles = 8) {
  const trimmed = String(rawTarget ?? '').trim();
  if (!trimmed) {
    throw new WhoError('A file, directory, symbol target, or topic query is required.');
  }

  const realRepoRoot = fs.existsSync(repoRoot) ? fs.realpathSync(repoRoot) : repoRoot;
  const realCwd = fs.existsSync(cwd) ? fs.realpathSync(cwd) : cwd;

  // 1. Check if rawTarget is an existing directory or file directly
  const rawCandidate = path.resolve(realCwd, trimmed);
  const directCandidate = fs.existsSync(rawCandidate)
    ? fs.realpathSync(rawCandidate)
    : rawCandidate;
  if (
    (directCandidate === realRepoRoot || directCandidate.startsWith(realRepoRoot + path.sep)) &&
    fs.existsSync(directCandidate)
  ) {
    const stat = fs.statSync(directCandidate);
    const rel = path.relative(realRepoRoot, directCandidate).split(path.sep).join('/');
    if (stat.isFile()) {
      return {
        mode: 'file',
        label: rel,
        files: [rel],
        lineRange: null,
      };
    }
    if (stat.isDirectory()) {
      const tracked = tryGit(realRepoRoot, ['ls-files', '--', ...(rel ? [rel] : [])]);
      const list = (tracked ?? '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        mode: 'directory',
        label: rel || '.',
        files: list.slice(0, Math.max(maxFiles, 25)),
        blameFiles: list.slice(0, maxFiles),
        lineRange: null,
      };
    }
  }

  // 2. Try `ctxman why` target syntax (`file:symbol` or `file#L10-L40`)
  try {
    const existsInCwd = (f) => {
      const p = path.resolve(realCwd, f);
      return fs.existsSync(p) && fs.statSync(p).isFile();
    };
    const spec = parseTargetSpec(trimmed, existsInCwd);
    const specFull = path.resolve(realCwd, spec.file);
    if (
      fs.existsSync(specFull) &&
      fs.statSync(specFull).isFile() &&
      fs.realpathSync(specFull).startsWith(realRepoRoot + path.sep)
    ) {
      const rel = path.relative(realRepoRoot, fs.realpathSync(specFull)).split(path.sep).join('/');
      let lineRange =
        spec.startLine && spec.endLine
          ? { startLine: spec.startLine, endLine: spec.endLine }
          : null;
      if (spec.symbol) {
        const content = fs.readFileSync(specFull, 'utf8');
        const sym = resolveSymbol(content, rel, spec.symbol);
        if (sym && sym.startLine && sym.endLine) {
          lineRange = { startLine: sym.startLine, endLine: sym.endLine };
        }
      }
      return {
        mode: spec.symbol ? 'symbol' : lineRange ? 'lines' : 'file',
        label: spec.symbol
          ? `${rel}:${spec.symbol}`
          : lineRange
            ? `${rel}#L${lineRange.startLine}-L${lineRange.endLine}`
            : rel,
        files: [rel],
        lineRange,
      };
    }
  } catch {
    // Fall through to topic search when target is a natural-language topic rather than a path
  }

  // 3. Natural-language topic resolution via BM25 code search
  const searchResult = searchProject(realRepoRoot, trimmed, {
    limit: maxFiles * 2,
    maxTokens: 4000,
  });
  const seen = new Set();
  const topicFiles = [];
  for (const hit of searchResult.results ?? []) {
    const rel = String(hit.file ?? '')
      .split(path.sep)
      .join('/');
    if (rel && !seen.has(rel)) {
      seen.add(rel);
      topicFiles.push(rel);
      if (topicFiles.length >= maxFiles) break;
    }
  }

  if (topicFiles.length === 0) {
    throw new WhoError(`No matching files or symbols found for "${trimmed}".`);
  }

  return {
    mode: 'topic',
    label: trimmed,
    files: topicFiles,
    lineRange: null,
  };
}

/**
 * Collect git commit & numstat history across target files.
 */
function collectCommitSignals(repoRoot, files, { commitWindow, since, nowSec, halfLifeDays }) {
  if (!files.length) return new Map();
  const args = [
    'log',
    '--no-merges',
    '-n',
    String(commitWindow),
    '--numstat',
    '--format=COMMIT\t%H\t%an\t%ae\t%at\t%s',
  ];
  if (since) args.push(`--since=${since}`);
  args.push('--', ...files);

  const out = tryGit(repoRoot, args);
  if (!out) return new Map();

  const byAuthor = new Map();
  let current = null;
  const decayLambda = Math.LN2 / (Math.max(1, halfLifeDays) * DAY_SECONDS);

  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('COMMIT\t')) {
      const [, sha, rawName, rawEmail, rawTs, subject] = line.split('\t');
      const name = (rawName || '(unknown)').trim();
      const email = (rawEmail || '').trim();
      const ts = Number(rawTs) || 0;
      const ageSec = Math.max(0, nowSec - ts);
      const decay = ts > 0 ? Math.exp(-decayLambda * ageSec) : 0.1;

      const entry = byAuthor.get(name) ?? {
        name,
        emails: new Set(),
        commits: 0,
        decayedCommits: 0,
        additions: 0,
        deletions: 0,
        lastCommitTs: 0,
        recentSubjects: [],
        filesTouched: new Set(),
      };
      if (email) entry.emails.add(email);
      entry.commits += 1;
      entry.decayedCommits += decay;
      if (ts > entry.lastCommitTs) entry.lastCommitTs = ts;
      if (subject && entry.recentSubjects.length < 3) {
        entry.recentSubjects.push({ sha: sha.slice(0, 7), date: utcDate(ts), subject });
      }
      byAuthor.set(name, entry);
      current = entry;
      continue;
    }

    if (current && line.trim()) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const add = Number(parts[0]);
        const del = Number(parts[1]);
        const file = parts[2];
        if (Number.isFinite(add)) current.additions += add;
        if (Number.isFinite(del)) current.deletions += del;
        if (file) current.filesTouched.add(file);
      }
    }
  }

  return byAuthor;
}

/**
 * Check if an author's name or email matches any CODEOWNERS handle/email.
 */
function authorMatchesCodeowners(name, emails, codeOwners) {
  if (!codeOwners.length) return [];
  const lowerName = name.toLowerCase().replace(/\s+/g, '');
  const emailList = [...emails].map((e) => e.toLowerCase());
  const matched = [];
  for (const owner of codeOwners) {
    const clean = owner.toLowerCase().replace(/^@/, '');
    const handle = clean.includes('/') ? clean.split('/').pop() : clean;
    if (
      emailList.includes(clean) ||
      emailList.some((e) => e.split('@')[0] === handle) ||
      lowerName === handle ||
      lowerName.includes(handle)
    ) {
      matched.push(owner);
    }
  }
  return matched;
}

/**
 * Render Expert Finder result in markdown, xml, or json.
 */
export function renderExperts(data, style = 'markdown') {
  if (style === 'json') {
    return `${JSON.stringify(data, null, 2)}\n`;
  }

  if (style === 'xml') {
    const lines = [
      `<experts target="${escapeXml(data.target.label)}" mode="${data.target.mode}">`,
      `  <files count="${data.target.files.length}">`,
      ...data.target.files.map((f) => `    <file>${escapeXml(f)}</file>`),
      `  </files>`,
    ];
    if (data.codeOwners.owners.length > 0) {
      lines.push(
        `  <codeowners source="${escapeXml(data.codeOwners.file ?? '')}">${data.codeOwners.owners.map(escapeXml).join(' ')}</codeowners>`
      );
    }
    lines.push('  <ranked_experts>');
    for (const exp of data.experts) {
      lines.push(
        `    <expert name="${escapeXml(exp.name)}" email="${escapeXml(exp.email ?? '')}" score="${exp.score}" blame_share="${exp.blameShare}" commits="${exp.commits}" last_active="${exp.lastActive ?? ''}" codeowner="${exp.isCodeOwner}">`
      );
      for (const c of exp.recentCommits) {
        lines.push(
          `      <commit sha="${c.sha}" date="${c.date ?? ''}">${escapeXml(c.subject)}</commit>`
        );
      }
      lines.push('    </expert>');
    }
    lines.push('  </ranked_experts>', '</experts>\n');
    return lines.join('\n');
  }

  const out = [];
  out.push(`# Experts for \`${data.target.label}\` (${data.target.mode})`);
  out.push('');
  out.push(
    `**Analyzed files (${data.target.files.length}):** ${data.target.files
      .slice(0, 8)
      .map((f) => `\`${f}\``)
      .join(', ')}${data.target.files.length > 8 ? ` (+${data.target.files.length - 8} more)` : ''}`
  );
  if (data.codeOwners.owners.length > 0) {
    out.push(
      `**Declared CODEOWNERS (${data.codeOwners.file}):** ${data.codeOwners.owners.map((o) => `\`${o}\``).join(', ')}`
    );
  }
  out.push('');

  if (data.experts.length === 0) {
    out.push('_No git authorship history found for the selected target._');
    return `${out.join('\n')}\n`;
  }

  out.push('| Rank | Expert | Score | Blame Share | Commits | Churn (+/-) | Last Active | Role |');
  out.push('| ---: | :--- | ---: | ---: | ---: | ---: | :--- | :--- |');
  data.experts.forEach((exp, idx) => {
    const badge = exp.isCodeOwner
      ? 'CODEOWNER'
      : exp.blameShare >= 0.4
        ? 'Primary Author'
        : exp.recencyShare >= 0.35
          ? 'Active Maintainer'
          : 'Contributor';
    const label = exp.email ? `${exp.name} <${exp.email}>` : exp.name;
    out.push(
      `| ${idx + 1} | ${label} | ${(exp.score * 100).toFixed(1)}% | ${(exp.blameShare * 100).toFixed(1)}% | ${exp.commits} | +${exp.additions}/-${exp.deletions} | ${exp.lastActive ?? 'n/a'} | ${badge} |`
    );
  });

  out.push('');
  out.push('## Key Recent Context by Expert');
  for (const exp of data.experts.slice(0, 3)) {
    if (!exp.recentCommits.length) continue;
    out.push(`- **${exp.name}**:`);
    for (const c of exp.recentCommits) {
      out.push(`  - \`${c.sha}\` (${c.date ?? 'unknown'}): ${c.subject}`);
    }
  }

  return `${out.join('\n')}\n`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Find ranked code/domain experts for a file, symbol, directory, or natural-language topic.
 */
export async function findExperts(projectDir, target, options = {}) {
  const cwd = path.resolve(projectDir || process.cwd());
  let repoRoot;
  try {
    repoRoot = findRepositoryRoot(cwd);
  } catch {
    throw new WhoError(`"${cwd}" is not inside a git repository.`);
  }
  if (!repoRoot) {
    throw new WhoError(`"${cwd}" is not inside a git repository.`);
  }

  const limit = Math.max(1, Number(options.limit) || DEFAULT_WHO_LIMIT);
  const commitWindow = Math.max(1, Number(options.commitWindow) || DEFAULT_COMMIT_WINDOW);
  const halfLifeDays = Math.max(1, Number(options.halfLifeDays) || DEFAULT_HALF_LIFE_DAYS);
  const style = options.style || 'markdown';
  const nowSec = Math.floor((options.nowMs ?? Date.now()) / 1000);

  const resolved = resolveTargetFiles(repoRoot, cwd, target);
  const blameTargets = resolved.blameFiles ?? resolved.files.slice(0, 8);

  const blameByAuthor = new Map();
  let totalBlamedLines = 0;
  for (const relFile of blameTargets) {
    const ownership = collectOwnership(repoRoot, {
      path: relFile,
      startLine: resolved.lineRange?.startLine,
      endLine: resolved.lineRange?.endLine,
    });
    if (!ownership) continue;
    for (const a of ownership.authors) {
      if (a.name === '(uncommitted)') continue;
      totalBlamedLines += a.lines;
      const cur = blameByAuthor.get(a.name) ?? { lines: 0, lastTouched: null };
      cur.lines += a.lines;
      if (a.lastTouched && (!cur.lastTouched || a.lastTouched > cur.lastTouched)) {
        cur.lastTouched = a.lastTouched;
      }
      blameByAuthor.set(a.name, cur);
    }
  }

  const commitSignals = collectCommitSignals(repoRoot, resolved.files, {
    commitWindow,
    since: options.since,
    nowSec,
    halfLifeDays,
  });

  const codeowners = loadCodeowners(repoRoot);
  const matchedCodeOwners = matchCodeowners(codeowners, resolved.files);

  const allNames = new Set([...blameByAuthor.keys(), ...commitSignals.keys()]);
  let totalDecayedCommits = 0;
  let totalCommits = 0;
  for (const entry of commitSignals.values()) {
    totalDecayedCommits += entry.decayedCommits;
    totalCommits += entry.commits;
  }

  const ranked = [];
  for (const name of allNames) {
    const blame = blameByAuthor.get(name) ?? { lines: 0, lastTouched: null };
    const hist = commitSignals.get(name) ?? {
      emails: new Set(),
      commits: 0,
      decayedCommits: 0,
      additions: 0,
      deletions: 0,
      lastCommitTs: 0,
      recentSubjects: [],
      filesTouched: new Set(),
    };

    const blameShare = totalBlamedLines > 0 ? blame.lines / totalBlamedLines : 0;
    const recencyShare = totalDecayedCommits > 0 ? hist.decayedCommits / totalDecayedCommits : 0;
    const commitShare = totalCommits > 0 ? hist.commits / totalCommits : 0;
    const ownerHandles = authorMatchesCodeowners(name, hist.emails, matchedCodeOwners);
    const isCodeOwner = ownerHandles.length > 0;

    const baseScore =
      totalBlamedLines > 0 && totalCommits > 0
        ? 0.45 * blameShare + 0.35 * recencyShare + 0.2 * commitShare
        : totalBlamedLines > 0
          ? blameShare
          : 0.65 * recencyShare + 0.35 * commitShare;
    const score = Math.min(1, Math.round((baseScore + (isCodeOwner ? 0.15 : 0)) * 1000) / 1000);

    const email = [...hist.emails][0] ?? null;
    const lastActive = utcDate(hist.lastCommitTs) ?? blame.lastTouched ?? null;

    ranked.push({
      name,
      email,
      score,
      blameLines: blame.lines,
      blameShare: Math.round(blameShare * 1000) / 1000,
      commits: hist.commits,
      commitShare: Math.round(commitShare * 1000) / 1000,
      recencyShare: Math.round(recencyShare * 1000) / 1000,
      additions: hist.additions,
      deletions: hist.deletions,
      lastActive,
      isCodeOwner,
      codeOwnerHandles: ownerHandles,
      filesTouched: hist.filesTouched.size || (blame.lines > 0 ? 1 : 0),
      recentCommits: hist.recentSubjects,
    });
  }

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.commits - a.commits ||
      b.blameLines - a.blameLines ||
      a.name.localeCompare(b.name)
  );

  const data = {
    target: {
      query: String(target),
      mode: resolved.mode,
      label: resolved.label,
      files: resolved.files,
    },
    codeOwners: {
      file: codeowners.file,
      owners: matchedCodeOwners,
    },
    totalAuthors: ranked.length,
    experts: ranked.slice(0, limit),
  };

  return {
    data,
    experts: data.experts,
    text: renderExperts(data, style),
  };
}
